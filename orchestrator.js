// load .env variables
require('dotenv').config();

const {createAndAwaitStackCompletion, getEC2InstanceIDsFromStack, deleteStack} = require('./child-stack-formation');
const {waitForChildResults, cleanupChildResults} = require('./child-results');

async function main() {
    try {
        console.log('Creating the CloudFormation stack with child instances...');
        const childStackName = `ChildStack-${Date.now()}`;
        const childStack = await createAndAwaitStackCompletion(childStackName);
        const childInstanceIds = await getEC2InstanceIDsFromStack(childStack);

        console.log('Child EC2 instances created: ', childInstanceIds);
        console.log('Waiting for results... ');
        const childResults = await waitForChildResults(childInstanceIds);

        console.log('Got results. Shutting down instances and deleting resources...');
        // Initiate result cleanup without waiting
        cleanupChildResults(childInstanceIds); //TODO: handle them somehow? what if they fail? how will we know if deletion fails?
        await deleteStack(childStackName); //TODO: all try/catch handlers and console logs should be in main
        console.log('Cleanup done.');

        // print results
        const jsonOutput = process.argv.includes('--json');
        if (jsonOutput) {
            console.log('Printing results in JSON format:');
            console.log(JSON.stringify(parameterObjects, null, 2));
        } else {
            childResults.forEach((results, index) => {
                console.log(
                    `Instance ${index + 1} results:
- Creation Time: ${results.creationTimeMs} ms
- Copy Time:     ${results.copyTimeMs} ms
- Deletion Time: ${results.deletionTimeMs} ms`
                );
            });
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main();