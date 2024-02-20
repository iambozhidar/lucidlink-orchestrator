const {SSMClient, GetParameterCommand, DeleteParameterCommand} = require("@aws-sdk/client-ssm");
const {CloudFormationClient, CreateStackCommand, DeleteStackCommand} = require("@aws-sdk/client-cloudformation");
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

const templateFilePath = path.join(__dirname, "vm_stack.yaml"); // Replace with your actual file path
const stackName = "ChildStack";
const parameterName = '/child/parameter20';

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
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
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
    // Read the CloudFormation template
    const templateBody = fs.readFileSync(templateFilePath, "utf8");

    // Create the CloudFormation stack
    const createStackCommand = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateBody,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"], // Required for creating IAM resources and named IAM resources
        OnFailure: "DELETE", // Specifies what action to take if stack creation fails
    });

    const response = await cloudFormationClient.send(createStackCommand);
    console.log("CloudFormation Stack creation initiated. Stack ID:", response.StackId);
    console.log("Response:", response);

    // const outputs = response.Stacks[0].Outputs;
    // const instanceIdOutput = outputs.find(output => output.OutputKey === "MyEC2InstanceId");
    // return instanceIdOutput ? instanceIdOutput.OutputValue : null;
    return null;
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
        const instanceId = await launchStack();
        console.log('Child EC2 instance started:', instanceId);

        const parameterValue = await waitForParameter(parameterName);
        // if (program.output) {
        console.log('Result:', parameterValue);
        // } else {
        //   console.log('Goodbye:', parameterValue);
        // }

        await deleteParameter(parameterName);
        console.log('SSM parameter deleted');

        await deleteStack();
        console.log('CloudFormation stack deleted');
    } catch (error) {
        console.error('Error:', error);
    }
}

run();