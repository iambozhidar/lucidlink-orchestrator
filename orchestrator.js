const {SSMClient, GetParameterCommand, DeleteParameterCommand} = require("@aws-sdk/client-ssm");
const {AutoScalingClient, DescribeAutoScalingGroupsCommand} = require("@aws-sdk/client-auto-scaling");
const {
    CloudFormationClient,
    CreateStackCommand,
    DeleteStackCommand,
    DescribeStacksCommand
} = require("@aws-sdk/client-cloudformation");

const fs = require("fs");
const path = require("path");
// load .env variables
require('dotenv').config();

const awsRegion = process.env.AWS_REGION;
const childSubnetIds = process.env.CHILD_SUBNET_IDS;
const childAmiId = process.env.CHILD_AMI_ID;
const childInstanceType = process.env.CHILD_INSTANCE_TYPE;
const numberOfChildInstances = parseInt(process.env.CHILD_NUMBER_OF_INSTANCES, 10);

const ssmClient = new SSMClient({region: awsRegion});
const cloudFormationClient = new CloudFormationClient({region: awsRegion});
const autoScalingClient = new AutoScalingClient({region: awsRegion});

const stackName = `ChildStack-${Date.now()}`;

function sleep(ms) { //TODO: rework this to 'retry' and include try/catch logic
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries the async execute function until it succeeds.
 * @param {number} intervalMs - The interval in milliseconds to wait between retries.
 * @param {Function} execute - An async function that returns a Promise.
 * @returns {Promise<*>} The resolved value of the execute function.
 */
async function retryUntilDone(intervalMs, execute) {
    while (true) {
        try {
            return await execute();
        } catch (error) {
            //TODO: when does this end and we consider it as a fatal error?
            await sleep(5000);
        }
    }
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

async function deleteParameter(parameterName) {
    return await retryUntilDone(5000, async () => {
        const deleteParams = {
            Name: parameterName
        };
        const deleteCommand = new DeleteParameterCommand(deleteParams);
        await ssmClient.send(deleteCommand);
    });
}

async function launchStack() {
    const templateFilePath = path.join(__dirname, "child_stack.yaml");
    let templateContent = fs.readFileSync(templateFilePath, "utf8");

    const bootScriptFilePath = path.join(__dirname, 'bash', 'on_boot.sh');
    const bootScriptContent = fs.readFileSync(bootScriptFilePath, { encoding: 'utf-8' });
    const indentedBootScript = bootScriptContent.split('\n').map(line => `          ${line}`).join('\n');
    const templateContentWithScript = templateContent.replace('${BootScriptContent}', indentedBootScript);

    // Create the CloudFormation stack
    const createStackCommand = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateContentWithScript,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"], // Required for creating IAM resources and named IAM resources
        OnFailure: "DELETE",
        Parameters: [
            {
                ParameterKey: 'SubnetIds',
                ParameterValue: childSubnetIds
            },
            {
                ParameterKey: "AMIId",
                ParameterValue: childAmiId
            },
            {
                ParameterKey: "InstanceType",
                ParameterValue: childInstanceType
            },
            {
                ParameterKey: "NumberOfInstances",
                ParameterValue: numberOfChildInstances
            }
        ]
    });

    //TODO: make try/catch clauses consistent -> should all functions have them or should the parent call handle them?

    const response = await cloudFormationClient.send(createStackCommand);
    console.log("CloudFormation Stack creation initiated. Stack ID:", response.StackId);
}

async function waitForStackCompletion() {
    let stackStatus = "CREATE_IN_PROGRESS";
    while (stackStatus === "CREATE_IN_PROGRESS") {
        const {Stacks} = await cloudFormationClient.send(new DescribeStacksCommand({StackName: stackName}));
        stackStatus = Stacks[0].StackStatus;
        if (stackStatus === "CREATE_COMPLETE") {
            console.log(`Stack ${stackName} creation complete.`);
            return Stacks[0].Outputs.find(output => output.OutputKey === "ChildASGName").OutputValue;
        } else if (stackStatus.endsWith("_FAILED") || stackStatus === "ROLLBACK_COMPLETE") {
            throw new Error(`Stack creation failed: ${stackStatus}`);
        }
        await sleep(5000); // TODO: isn't there a better way to wait for 5 secs? also, export this in a reusable function?
    }
}

async function getEC2InstanceIDFromStack(asgName) {
    // Retrieve all the stack resources
    const {AutoScalingGroups} = await autoScalingClient.send(new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [asgName],
    }));
    return AutoScalingGroups[0].Instances.map(instance => instance.InstanceId);
}

async function deleteStack() {
    const deleteCommand = new DeleteStackCommand({
        StackName: stackName,
    });

    try {
        await cloudFormationClient.send(deleteCommand);
    } catch (error) {
        console.error("Error deleting stack:", error);
    }
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

async function run() {
    try {
        await launchStack();
        console.log('Waiting for stack completion...');
        const asgName = await waitForStackCompletion();
        const instanceIds = await getEC2InstanceIDFromStack(asgName);

        console.log('Waiting for results from EC2 instances... ', instanceIds);
        // Create a promise for each instance ID to wait for its parameter
        const parameterPromises = instanceIds.map(instanceId => waitForParameter(instanceId));
        // Wait for all parameters to be retrieved
        const parameterValues = await Promise.all(parameterPromises);
        // const parameterValues = ["100,200,300", "110,320,4200", "239,123,41243"];
        const parameterObjects = parameterValues.map(string => parseDelimitedStringToObject(string));

        console.log('Got results. Shutting down VMs and deleting resources...');
        // Assuming you want to delete all parameters after retrieval
        const deleteParameterPromises = instanceIds.map(instanceId => deleteParameter(instanceId));
        // Wait for all parameters to be deleted
        await Promise.all(deleteParameterPromises);

        await deleteStack();
        // TODO: await delete completion?
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

run();