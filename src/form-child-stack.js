const {
    CloudFormationClient,
    CreateStackCommand,
    DeleteStackCommand,
    DescribeStacksCommand
} = require("@aws-sdk/client-cloudformation");
const {AutoScalingClient, DescribeAutoScalingGroupsCommand} = require("@aws-sdk/client-auto-scaling");

const path = require("path");
const fs = require("fs");

const {retryUntilDone} = require("./common");

const awsRegion = process.env.AWS_REGION;
const cloudFormationClient = new CloudFormationClient({region: awsRegion});
const autoScalingClient = new AutoScalingClient({region: awsRegion});

async function createAndWaitForStackCompletion(childStackName, childSubnetIds, childAmiId, childInstanceType, numberOfChildInstances) {
    const templateFilePath = path.join(__dirname, "child_stack.yaml");
    const templateContent = fs.readFileSync(templateFilePath, "utf8");

    const bootScriptFilePath = path.join(__dirname, 'child_boot.sh');
    const bootScriptContent = fs.readFileSync(bootScriptFilePath, {encoding: 'utf-8'});
    // IMPORTANT: indent the script so that it matches the .yaml template requirements
    const indentedBootScript = bootScriptContent.split('\n').map(line => `          ${line}`).join('\n');
    const templateContentWithScript = templateContent.replace('${BootScriptContent}', indentedBootScript);

    // Create the CloudFormation stack
    const createStackCommand = new CreateStackCommand({
        StackName: childStackName,
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

    // await for stack completion for up to ~8 minutes
    return await retryUntilDone(5000, 100,
        `Waiting for completion of stack ${childStackName} failed.`,
        async () => {
            const {Stacks} = await cloudFormationClient.send(new DescribeStacksCommand({StackName: childStackName}));
            const stack = Stacks[0];
            const stackStatus = stack.StackStatus;
            // return the stack when creation either succeeded or failed.
            if (stackStatus === "CREATE_COMPLETE" || hasStackFailed(stack)) {
                return stack;
            } else {
                throw new Error(`Still waiting for stack completion: ${stackStatus}`)
            }
        });
}

function hasStackFailed(stack) {
    const stackStatus = stack.StackStatus;
    return stackStatus.endsWith("_FAILED") || stackStatus === "ROLLBACK_COMPLETE";
}

async function getInstanceIDsFromStack(childStack) {
    const asgName = childStack.Outputs.find(output => output.OutputKey === "ChildASGName").OutputValue;
    // Get ASG details and map instance ids
    const {AutoScalingGroups} = await autoScalingClient.send(new DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [asgName]
    }));
    return AutoScalingGroups[0].Instances.map(instance => instance.InstanceId);
}

async function deleteStack(stackName) {
    const deleteCommand = new DeleteStackCommand({StackName: stackName});
    await cloudFormationClient.send(deleteCommand);
}

module.exports = {createAndWaitForStackCompletion, hasStackFailed, getInstanceIDsFromStack, deleteStack};