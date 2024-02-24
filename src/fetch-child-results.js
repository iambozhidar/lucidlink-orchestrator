const {SSMClient, GetParameterCommand, DeleteParameterCommand} = require("@aws-sdk/client-ssm");
const {AWS_REGION, InstanceResults, retryUntilDone} = require("./common");

const ssmClient = new SSMClient({region: AWS_REGION});

async function waitForChildResults(instanceIds) {
    // Create a promise for each instance ID to wait for its parameter, then map to InstanceResults objects
    const parameterPromises = instanceIds.map(instanceId => waitForParameter(instanceId));
    const parameterValues = await Promise.all(parameterPromises);
    return parameterValues.map(value => parseParameterToResults(value));
}

async function waitForParameter(parameterName) {
    // await for parameter for up to 3 minutes
    return await retryUntilDone(3000, 60,
        `Fetching SSM parameter ${parameterName} failed.`,
        async () => {
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

async function cleanupChildResults(instanceIds) {
    const deletePromises = instanceIds.map(instanceId => deleteParameter(instanceId));
    await Promise.all(deletePromises);
}

async function deleteParameter(parameterName) {
    const deleteParams = {
        Name: parameterName
    };
    const deleteCommand = new DeleteParameterCommand(deleteParams);
    return await ssmClient.send(deleteCommand);
}

module.exports = {waitForChildResults, cleanupChildResults};