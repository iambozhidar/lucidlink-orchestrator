// load .env variables
require('dotenv').config();

const {
    createAndWaitForStackCompletion,
    hasStackFailed,
    getInstanceIDsFromStack,
    deleteStack
} = require('./child-stack-formation');
const {waitForChildResults, cleanupChildResults} = require('./child-results');

async function main() {
    try {
        console.log('Creating the CloudFormation stack with child instances...');
        const childStackName = `ChildStack-${Date.now()}`;
        const childStack = await createAndWaitForStackCompletion(childStackName);
        if (hasStackFailed(childStack)) {
            throw new Error(`Stack creation failed: ${childStack}`);
        }
        const childInstanceIds = await getInstanceIDsFromStack(childStack);

        console.log('Child instances created with ids: ', childInstanceIds);
        console.log('Waiting for results... ');
        const childResults = await waitForChildResults(childInstanceIds);

        console.log('Got results. Shutting down instances and deleting resources...');
        // Initiate result cleanup without waiting
        cleanupChildResults(childInstanceIds); //TODO: handle them somehow? what if they fail? how will we know if deletion fails?
        await deleteStack(childStackName);
        console.log('Cleanup done.');

        // print results
        const jsonOutput = process.argv.includes('--json');
        if (jsonOutput) {
            console.log('Printing results in JSON format:');
            console.log(JSON.stringify(childResults, null, 2));
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