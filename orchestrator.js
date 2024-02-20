const {EC2} = require('@aws-sdk/client-ec2');
const {IAM} = require('@aws-sdk/client-iam');
const {SSM} = require('@aws-sdk/client-ssm');

// const program = require('commander');

// Configure command-line options
// program
//   .option('-o, --output', 'Output "Hello" content in console')
//   .parse(process.argv);

const awsRegion = 'eu-north-1';

const iam = new IAM({
    region: awsRegion
});
const ssm = new SSM({
    region: awsRegion
});
const ec2 = new EC2({
    region: awsRegion
});

async function createSSMRole() {
    try {
        // Create IAM role for SSM access
        const roleParams = {
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {Service: 'ec2.amazonaws.com'},
                    Action: 'sts:AssumeRole'
                }]
            }),
            RoleName: 'ChildRole'
        };
        const roleData = await iam.createRole(roleParams);

        // Attach policy granting SSM permissions to the role
        const policyParams = {
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: 'ssm:PutParameter',
                    Resource: '*'
                }]
            }),
            PolicyName: 'SSMPermissionsPolicy'
        };
        await iam.putRolePolicy({
            ...policyParams,
            RoleName: roleParams.RoleName
        });

        console.log('SSM Role created successfully:', roleData.Role.RoleName);

        // Create an IAM Instance Profile
        const instanceProfileParams = {
            InstanceProfileName: 'ChildInstanceProfile' // Specify a valid Instance Profile name
        };
        await iam.createInstanceProfile(instanceProfileParams);

        // Add the IAM Role to the Instance Profile
        const addRoleParams = {
            InstanceProfileName: instanceProfileParams.InstanceProfileName,
            RoleName: roleParams.RoleName
        };
        await iam.addRoleToInstanceProfile(addRoleParams);

        console.log('IAM Instance Profile created:', instanceProfileParams.InstanceProfileName);

        return instanceProfileParams.InstanceProfileName;
    } catch (error) {
        console.error('Error creating SSM role:', error);
        throw error;
    }
}

async function startChildInstance(instanceProfileName) {
    const userDataScript = `#!/bin/bash
echo "Hello" > child-parameter.txt
aws ssm put-parameter --name "/child/parameter20" --value "parameter20" --type "String" --overwrite`;
    const params = {
        MaxCount: 1,
        MinCount: 1,
        ImageId: 'ami-087c4d241dd19276d',
        InstanceType: 't3.micro',
        KeyName: 'key-pair_default',
        IamInstanceProfile: {
            Name: instanceProfileName
        },
        SecurityGroupIds: ['sg-0a6c4c517135364fb'],
        UserData: Buffer.from(userDataScript).toString('base64'),
        TagSpecifications: [
            {
                ResourceType: 'instance',
                Tags: [{Key: 'Name', Value: 'child-ec2-instance7'}]
            }
        ]
    };
    const data = await ec2.runInstances(params);
    return data.Instances[0].InstanceId;
}

async function waitForParameter(parameterName) {
    while (true) {
        try {
            const params = {
                Name: parameterName,
                WithDecryption: false
            };
            const data = await ssm.getParameter(params);
            return data.Parameter.Value;
        } catch (error) {
            console.log('Parameter not yet set by child instance:', parameterName);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
        }
    }
}

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

    // const outputs = response.Stacks[0].Outputs;
    // const instanceIdOutput = outputs.find(output => output.OutputKey === "MyEC2InstanceId");
    // return instanceIdOutput ? instanceIdOutput.OutputValue : null;
    return null;
}

async function run() {
    try {
        // const instanceProfileName = await createSSMRole();
        // const instanceId = await startChildInstance(instanceProfileName);

        // const instanceId = await startChildInstance('orchestrator');
        // console.log('Child EC2 instance started:', instanceId);

        const instanceId = await launchStack();
        console.log('Child EC2 instance started:', instanceId);

        const parameterValue = await waitForParameter('/child/parameter20');
        // if (program.output) {
        console.log('Result:', parameterValue);
        // } else {
        //   console.log('Goodbye:', parameterValue);
        // }
    } catch (error) {
        console.error('Error:', error);
    }
}

run();