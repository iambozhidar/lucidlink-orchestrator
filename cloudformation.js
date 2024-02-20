const fs = require("fs");
const path = require("path");
const {CloudFormationClient, CreateStackCommand} = require("@aws-sdk/client-cloudformation");

async function launchStack() {
    const templateFilePath = path.join(__dirname, "vm_stack.yaml"); // Replace with your actual file path
    const stackName = "YourUniqueStackName";

    const cloudFormationClient = new CloudFormationClient({region: awsRegion});
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

    const outputs = response.Stacks[0].Outputs;
    const instanceIdOutput = outputs.find(output => output.OutputKey === "MyEC2InstanceId");
    return instanceIdOutput ? instanceIdOutput.OutputValue : null;
}