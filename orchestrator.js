// load .env variables
require('dotenv').config();

const {
    createAndWaitForStackCompletion,
    hasStackFailed,
    getInstanceIDsFromStack,
    deleteStack
} = require('./src/form-child-stack');
const {waitForChildResults, cleanupChildResults} = require('./src/fetch-child-results');
const {EC2Client, DescribeSubnetsCommand} = require("@aws-sdk/client-ec2");
const {AWS_REGION} = require("./src/common");

async function getAvailableSubnetIds() {
    const ec2Client = new EC2Client({region: AWS_REGION});
    const describeSubnetsCommand = new DescribeSubnetsCommand({});
    const response = await ec2Client.send(describeSubnetsCommand);
    return response.Subnets.map(subnet => subnet.SubnetId);
}

let childSubnetIds = process.env.CHILD_SUBNET_IDS;
const childAmiId = process.env.CHILD_AMI_ID;
const childInstanceType = process.env.CHILD_INSTANCE_TYPE;
const numberOfChildInstances = parseInt(process.env.CHILD_NUMBER_OF_INSTANCES, 10);

async function main() {
    try {
        // if no explicit subnet ids are provided - fetch available ones dynamically
        if (!childSubnetIds || childSubnetIds.trim() === '') {
            console.log('Fetching available subnets...');
            const availableSubnetIds = await getAvailableSubnetIds();
            childSubnetIds = availableSubnetIds.join(',');
        }

        console.log('Creating the stack of child instances...');
        const childStackName = `ChildStack-${Date.now()}`; // add timestamp to name for uniqueness
        const childStack = await createAndWaitForStackCompletion(childStackName, childSubnetIds,
            childAmiId, childInstanceType, numberOfChildInstances);
        if (hasStackFailed(childStack)) {
            throw new Error(`Stack creation failed: ${childStack}`);
        }

        // instances successfully deployed, they will write results under their instance ID
        const childInstanceIds = await getInstanceIDsFromStack(childStack);
        console.log('Child instances created with ids: ', childInstanceIds);
        console.log('Waiting for results... ');
        const childResults = await waitForChildResults(childInstanceIds);

        console.log('Got results. Shutting down instances and deleting resources...');
        const deleteStackPromise = deleteStack(childStackName);
        const resultCleanupPromise = cleanupChildResults(childInstanceIds);
        await Promise.all([deleteStackPromise, resultCleanupPromise]);
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