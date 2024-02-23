// load .env variables
require('dotenv').config();

const {SSMClient, GetParameterCommand, DeleteParameterCommand} = require("@aws-sdk/client-ssm");
const {AutoScalingClient, DescribeAutoScalingGroupsCommand} = require("@aws-sdk/client-auto-scaling");

const {retryUntilDone} = require('./utils');
const {createAndGetStack, getAsgNameFromStack, deleteStack} = require('./child-stack-formation');

const awsRegion = process.env.AWS_REGION;
const ssmClient = new SSMClient({region: awsRegion});
const autoScalingClient = new AutoScalingClient({region: awsRegion});

async function waitForParameter(parameterName) {
    return await retryUntilDone(5000, async () => {
        const params = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: false
        });
        const {Parameter} = await ssmClient.send(params);
        return Parameter.Value;
    });
}

async function deleteParameter(parameterName) {
    return await retryUntilDone(5000, async () => {
        const deleteParams = {
            Name: parameterName
        };
        const deleteCommand = new DeleteParameterCommand(deleteParams);
        return await ssmClient.send(deleteCommand);
    });
}

async function getEC2InstanceIDsFromAsg(asgName) {
    // Get ASG details and map instance ids
    const {AutoScalingGroups} = await autoScalingClient.send(new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [asgName]
    }));
    return AutoScalingGroups[0].Instances.map(instance => instance.InstanceId);
}

function parseDelimitedStringToObject(delimitedString) {
    const values = delimitedString.split(',');
    const creationTimeMs = parseInt(values[0], 10);
    const copyTimeMs = parseInt(values[1], 10);
    const deletionTimeMs = parseInt(values[2], 10);
    return new MachineResults(creationTimeMs, copyTimeMs, deletionTimeMs);
}

class MachineResults {
    constructor(creationTimeMs, copyTimeMs, deletionTimeMs) {
        this.creationTimeMs = creationTimeMs;
        this.copyTimeMs = copyTimeMs;
        this.deletionTimeMs = deletionTimeMs;
    }
}

async function main() {
    try {
        console.log('Creating the CloudFormation stack with child instances...');
        const stackName = `ChildStack-${Date.now()}`;
        const stack = await createAndGetStack(stackName);
        const asgName = getAsgNameFromStack(stack);
        const childInstanceIds = await getEC2InstanceIDsFromAsg(asgName);

        console.log('Child EC2 instances created: ', childInstanceIds);
        console.log('Waiting for results... ');
        // Create a promise for each instance ID to wait for its parameter
        const parameterPromises = childInstanceIds.map(instanceId => waitForParameter(instanceId));
        // Wait for all parameters to be retrieved
        const parameterValues = await Promise.all(parameterPromises);
        // const parameterValues = ["100,200,300", "110,320,4200", "239,123,41243"];
        const parameterObjects = parameterValues.map(string => parseDelimitedStringToObject(string));

        console.log('Got results. Shutting down instances and deleting resources...');
        // Don't wait for result from deletion TODO: handle them somehow? what if they fail?
        childInstanceIds.map(instanceId => deleteParameter(instanceId));
        await deleteStack(stackName); //TODO: all try/catch handlers and console logs should be in main
        // TODO: await delete completion? how will we know if deletion fails?
        console.log('Cleanup done.');

        // print results
        const jsonOutput = process.argv.includes('--json');
        if (jsonOutput) {
            console.log('Printing results in JSON format:');
            console.log(JSON.stringify(parameterObjects, null, 2));
        } else {
            parameterObjects.forEach((results, index) => {
                console.log(
                    `Machine ${index + 1} Results:
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