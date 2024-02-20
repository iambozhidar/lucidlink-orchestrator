const {SSMClient, GetParameterCommand, DeleteParameterCommand} = require("@aws-sdk/client-ssm");
const {AutoScalingClient, DescribeAutoScalingGroupsCommand} = require("@aws-sdk/client-auto-scaling");
const {
    CloudFormationClient,
    CreateStackCommand,
    DeleteStackCommand,
    DescribeStacksCommand,
    DescribeStackResourcesCommand
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
        const response = await ssmClient.send(deleteCommand);
        console.log(`Parameter deleted successfully: ${parameterName}`, response);
        return response; // The response is usually empty for a successful delete operation
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
    console.log("Response:", response);
}

async function waitForStackCompletion() {
    let stackStatus = "CREATE_IN_PROGRESS";
    while (stackStatus === "CREATE_IN_PROGRESS") {
        const {Stacks} = await cloudFormationClient.send(new DescribeStacksCommand({StackName: stackName}));
        stackStatus = Stacks[0].StackStatus;
        if (stackStatus === "CREATE_COMPLETE") {
            console.log(`Stack ${stackName} creation complete.`);
            console.log('Stack object:', Stacks[0])
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
    const instanceIds = AutoScalingGroups[0].Instances.map(instance => instance.InstanceId);
    console.log("Instance IDs:", instanceIds);
    return instanceIds;
}

async function deleteStack() {
    const deleteCommand = new DeleteStackCommand({
        StackName: stackName,
    });

    try {
        const response = await cloudFormationClient.send(deleteCommand);
        console.log(`Stack deletion initiated for ${stackName}`, response);
        // Note: The response from DeleteStackCommand is usually empty, indicating the request was received.
    } catch (error) {
        console.error("Error deleting stack:", error);
    }
}

async function run() {
    try {
        await launchStack();
        const asgName = await waitForStackCompletion();
        const instanceIds = await getEC2InstanceIDFromStack(asgName);
        console.log('EC2 instance ids started:', instanceIds);

        // Create a promise for each instance ID to wait for its parameter
        const parameterPromises = instanceIds.map(instanceId => waitForParameter(instanceId));
        // Wait for all parameters to be retrieved
        const parameterValues = await Promise.all(parameterPromises);
        // Print all retrieved parameter values
        console.log('Parameter values from all instances:', parameterValues);

        // Assuming you want to delete all parameters after retrieval
        const deleteParameterPromises = instanceIds.map(instanceId => deleteParameter(instanceId));
        // Wait for all parameters to be deleted
        await Promise.all(deleteParameterPromises);

        await deleteStack();
        console.log('CloudFormation stack deleted');
    } catch (error) {
        console.error('Error:', error);
    }
}

run();