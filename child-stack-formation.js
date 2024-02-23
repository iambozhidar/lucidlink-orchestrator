const {
    CloudFormationClient,
    CreateStackCommand,
    DeleteStackCommand,
    DescribeStacksCommand
} = require("@aws-sdk/client-cloudformation");
const path = require("path");
const fs = require("fs");
const {sleep} = require('./utils');

const cloudFormationClient = new CloudFormationClient({region: process.env.AWS_REGION});

const childSubnetIds = process.env.CHILD_SUBNET_IDS;
const childAmiId = process.env.CHILD_AMI_ID;
const childInstanceType = process.env.CHILD_INSTANCE_TYPE;
const numberOfChildInstances = parseInt(process.env.CHILD_NUMBER_OF_INSTANCES, 10);

async function createAndGetStack(stackName) {
    const templateFilePath = path.join(__dirname, "child_stack.yaml");
    const templateContent = fs.readFileSync(templateFilePath, "utf8");

    const bootScriptFilePath = path.join(__dirname, 'child_boot.sh');
    const bootScriptContent = fs.readFileSync(bootScriptFilePath, {encoding: 'utf-8'});
    // IMPORTANT: indent the script so that it matches the .yaml template requirements
    const indentedBootScript = bootScriptContent.split('\n').map(line => `          ${line}`).join('\n');
    const templateContentWithScript = templateContent.replace('${BootScriptContent}', indentedBootScript);

    // Create the CloudFormation stack
    const createStackCommand = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: templateContentWithScript,
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"], // Required for creating named IAM resources
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
    await cloudFormationClient.send(createStackCommand);

    // await for stack completion and return the stack or throw error if failed
    let stackStatus = "CREATE_IN_PROGRESS";
    while (stackStatus === "CREATE_IN_PROGRESS") {
        const {Stacks} = await cloudFormationClient.send(new DescribeStacksCommand({StackName: stackName}));
        stackStatus = Stacks[0].StackStatus;
        if (stackStatus === "CREATE_COMPLETE") {
            return Stacks[0];
        } else if (stackStatus.endsWith("_FAILED") || stackStatus === "ROLLBACK_COMPLETE") {
            throw new Error(`Stack creation failed: ${stackStatus}`);
        }
        await sleep(5000);
    }
}

function getAsgNameFromStack(stack) {
    return stack.Outputs.find(output => output.OutputKey === "ChildASGName").OutputValue
}

async function deleteStack(stackName) {
    const deleteCommand = new DeleteStackCommand({StackName: stackName});
    await cloudFormationClient.send(deleteCommand);
}

module.exports = {createAndGetStack, getAsgNameFromStack, deleteStack};