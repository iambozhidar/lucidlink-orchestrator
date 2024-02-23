const {SSMClient, GetParameterCommand, DeleteParameterCommand} = require("@aws-sdk/client-ssm");
const {InstanceResults, retryUntilDone} = require("./common");

const ssmClient = new SSMClient({region: process.env.AWS_REGION});

async function waitForChildResults(instanceIds) {
    // Create a promise for each instance ID to wait for its parameter, then map to InstanceResults objects
    const parameterPromises = instanceIds.map(instanceId => waitForParameter(instanceId));
    const parameterValues = await Promise.all(parameterPromises);
    return parameterValues.map(value => parseParameterToResults(value));
}

function cleanupChildResults(instanceIds) {
    instanceIds.map(instanceId => deleteParameter(instanceId));
}

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

function parseParameterToResults(parameterValue) {
    const measurements = parameterValue.split(',');
    const creationTimeMs = parseInt(measurements[0], 10);
    const copyTimeMs = parseInt(measurements[1], 10);
    const deletionTimeMs = parseInt(measurements[2], 10);
    return new InstanceResults(creationTimeMs, copyTimeMs, deletionTimeMs);
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

module.exports = {waitForChildResults, cleanupChildResults};