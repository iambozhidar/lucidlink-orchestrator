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

// const program = require('commander');

// Configure command-line options
// program
//   .option('-o, --output', 'Output "Hello" content in console')
//   .parse(process.argv);

const awsRegion = 'eu-north-1';
const ssmClient = new SSMClient({region: awsRegion});
const cloudFormationClient = new CloudFormationClient({region: awsRegion});
const autoScalingClient = new AutoScalingClient({region: awsRegion});

const templateFilePath = path.join(__dirname, "vm_stack.yaml"); // Replace with your actual file path
const stackName = "ChildStack";
const parameterName = '/child/parameter20';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForParameter(parameterName) {
    while (true) {
        const params = new GetParameterCommand({
            Name: parameterName,
            WithDecryption: false
        });
        try {
            const {Parameter} = await ssmClient.send(params);
            return Parameter.Value;
        } catch (error) {
            console.log('Parameter not yet set by child instance:', parameterName);
            await sleep(5000); // Wait for 5 seconds before checking again
        }
    }
}

async function deleteParameter(parameterName) {
    const deleteParams = {
        Name: parameterName
    };

    try {
        const deleteCommand = new DeleteParameterCommand(deleteParams);
        return await ssmClient.send(deleteCommand); // The response is usually empty for a successful delete operation
    } catch (error) {
        console.error(`Error deleting parameter: ${parameterName}`, error);
        throw error; // Rethrow or handle the error based on your application's needs
    }
}

async function launchStack() {
    // Create the CloudFormation stack
    const createStackCommand = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: fs.readFileSync(templateFilePath, "utf8"),
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"], // Required for creating IAM resources and named IAM resources
        OnFailure: "DELETE",
        Parameters: [
            {
                ParameterKey: 'SubnetIds',
                ParameterValue: 'subnet-0452da87538fae7c7,subnet-0cf3f0a9576ebfa01,subnet-0da8959263bb945b7' //TODO get subnets from CLI param
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
            return Stacks[0].Outputs.find(output => output.OutputKey === "AutoScalingGroupName").OutputValue;
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
        const asgName = await waitForStackCompletion();
        const instanceIds = await getEC2InstanceIDFromStack(asgName);
        console.log('EC2 instances with the following ids:', instanceIds);

        // Create a promise for each instance ID to wait for its parameter
        const parameterPromises = instanceIds.map(instanceId => waitForParameter(instanceId));
        // Wait for all parameters to be retrieved
        const parameterValues = await Promise.all(parameterPromises);
        // const parameterValues = ["100,200,300", "110,320,4200", "239,123,41243"];
        const parameterObjects = parameterValues.map(string => parseDelimitedStringToObject(string));

        // print results
        const jsonOutput = process.argv.includes('--json');
        if (jsonOutput) {
            console.log('Printing results in JSON format:');
            console.log(JSON.stringify(parameterObjects, null, 2));
        } else {
            console.log('Printing results in human-readable format:');
            parameterObjects.forEach((results, index) => {
                console.log(
                    `Machine ${index + 1} Results:
- Creation Time: ${results.creationTimeMs} ms
- Copy Time:     ${results.copyTimeMs} ms
- Deletion Time: ${results.deletionTimeMs} ms`
                );
            });
        }

        // Assuming you want to delete all parameters after retrieval
        const deleteParameterPromises = instanceIds.map(instanceId => deleteParameter(instanceId));
        // Wait for all parameters to be deleted
        await Promise.all(deleteParameterPromises);

        await deleteStack();
        console.log('Cleanup done');
    } catch (error) {
        console.error('Error:', error);
    }
}

run();