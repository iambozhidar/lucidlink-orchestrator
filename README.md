# [LucidLink] Orchestrator Task - Bozhidar Stoyanov

This project provides solution to the problem presented in `Development experience assignment.pdf`.
Namely, an orchestrator that automates a series of file operations across several virtual machines in an AWS
environment. The execution time of these operations are measured and transferred to the orchestrator
which then reports results for each VM.

---

## High-level overview

The solution is implemented using the following technologies and AWS services:

- ***Node.js*** for implementing the orchestrator app, deployed on the _parent_ instance
- ***Bash*** for implementing the payload script that performs file operations, deployed on _child_ instances
- ***AWS SSM Parameter Store*** for storing/retrieving the execution time of operations on child instances
- ***AWS EC2*** as VM instances
- ***AWS EC2 Auto Scaling*** for launching a fixed number of child instances (3 by default) across multiple AZs/subnets,
  granting availability
- ***CloudFormation (YAML)*** for deploying and managing AWS resource stacks in an automated and reliable manner

<img src="images/architecture_diagram.jpg" alt="Architecture Diagram" width="700"/>

The high-level execution flow is as follows:

1. The orchestrator/parent instance creates a CloudFormation stack that will launch child instances, then waits for its
   completion.
2. The child instances are launched in an Auto Scaling group to benefit from its infrastructural reliability and
   availability (across multiple AZs).
3. The bash script that performs the file operations is distributed to child instances via the `UserData` option (ran
   upon booting).
4. Inside the bash script, after the operations are done, child instances upload time measurements as a comma-delimited
   string to SSM Parameter Store under their unique instance id.
5. The orchestrator has been waiting for the SSM parameters to be created, and reads them.
6. The orchestrator deletes the CloudFormation stack. It also deletes the SSM parameters.
7. The orchestrator prints the results (in either human-readable or JSON format)

---

## File Structure

After cloning the repository, you will see the following file structure:

```
├── Development experience assignment.pdf
├── README.md
├── .env
├── __tests__
│   └── common.test.js
├── images
│   └── architecture_diagram.jpg
├── orchestrator.js
├── orchestrator.yaml
├── package-lock.json
├── package.json
└── src
    ├── child_boot.sh
    ├── child_stack.yaml
    ├── common.js
    ├── fetch-child-results.js
    └── form-child-stack.js
```

Most importantly, the main `orchestrator.js` file and `orchestrator.yaml` template can be found in the root folder.
Other `.js` files, as well as the children's `.sh` boot script and their `.yaml` template sit inside `/src`.

---

## Configuration

The Orchestrator script (`orchestrator.js`) allows AWS configurations to be set through environment variables.

By default, those configurations are set via a root-level `.env` file as follows:

```dotenv
AWS_REGION=eu-north-1
CHILD_AMI_ID=ami-02d0a1cbe2c3e5ae4
CHILD_INSTANCE_TYPE=t3.micro
CHILD_NUMBER_OF_INSTANCES=3
CHILD_SUBNET_IDS=#Leave blank for automatic distribution across all available subnets
```

- `AWS_REGION` - the region in which the solution will run (`eu-north-1` by default)
- `CHILD_AMI_ID` - the AMI id for the image to be used for child EC2 instances
  (by default, Amazon Linux 2023 AMI specific to `eu-north-1`)
- `CHILD_INSTANCE_TYPE` - the EC2 instance type to be used for child instances (`t3.micro` by default)
- `CHILD_NUMBER_OF_INSTANCES` - the number of child instances to be launched (`3` by default)
- `CHILD_SUBNET_IDS` - the id of the subnets across which the child instances should be allocated.
  Can be left blank (which is by default), in which case the script will automatically
  detect all available subnets in the current VPC and use them for the Auto Scaling group.

**<ins>Important: default configurations work only for the `eu-north-1` region!<ins>**

If you want to run the solution in a different region, it would require you to modify
at the very minimum `AWS_REGION` and `CHILD_AMI_ID` as they are region-specific.
So are `CHILD_SUBNET_IDS` if you want to explicitly set them.
`CHILD_INSTANCE_TYPE` can also be region-specific, as `t3-micro` is not available in all regions.

You can configure AWS variables by modifying the `.env` file (root folder) and setting them to your desired values.

---

## Running the solution

Use CloudFormation and the provided `orchestrator.yaml` template file (at the project's root) to run the solution in
your AWS environment.
This will automatically launch the orchestrator instance and configure the solution so that you can then simply connect
to the machine and run the script.

### Launch the Orchestrator instance

1. Go to the CloudFormation console in your AWS environment > "Create stack".
2. Upload the `orchestrator.yaml` template.
3. Set stack name. Optionally, change the default values for AMIId and InstanceType.
4. Go until the end of the wizard screens and 'Submit' the stack.
5. Wait for the stack to be created. It can take a few minutes.

Alternatively, you can also run the `orchestrator.yaml` template via the~~~~ AWS CLI.

### Run the script

After the stack has been successfully created, go to the EC2 console and:

1. Connect to the newly created "Orchestrator" instance via "Instance Connect"
2. Check with `ls` if there is an "orchestrator" folder in the user space. If not, you may need to wait a bit while the
   solution is being downloaded (by the user data script)
3. Once it's done, go inside the folder with `cd orchestrator`
4. (optional) Modify `.env` if you want custom AWS configurations
5. Start the solution via one of the following commands:
    1. `npm start` or `node orchestrator.js` for human-readable output
    2. `npm start -- --json` or `node orchestrator.js --json` for json output
6. Wait for results. It can take a few minutes.

### Output

The output will be in the following format for the human-readable version:

```shell
[ec2-user@ip-172-31-37-219 orchestrator]$ npm start

> lucidlink-orchestrator@1.0.0 start
> node orchestrator.js

Fetching available subnets...
Creating the stack of child instances...
Child instances created with ids:  [ 'i-028fdb82facc7ea66', 'i-048f3a3fc7b510a0b', 'i-051c71d778b29d5a9' ]
Waiting for results... 
Got results. Shutting down instances and deleting resources...
Cleanup done.
Instance 1 results:
- Creation Time: 1854 ms
- Copy Time:     85 ms
- Deletion Time: 64 ms
Instance 2 results:
- Creation Time: 1750 ms
- Copy Time:     58 ms
- Deletion Time: 65 ms
Instance 3 results:
- Creation Time: 1820 ms
- Copy Time:     58 ms
- Deletion Time: 57 ms
```

And if the `--json` option is used:

```shell
[ec2-user@ip-172-31-37-219 orchestrator]$ npm start

> lucidlink-orchestrator@1.0.0 start
> node orchestrator.js

Fetching available subnets...
Creating the stack of child instances...
Child instances created with ids:  [ 'i-03e13706448459c89', 'i-06f36b2b173035f4c', 'i-0fc83e2a8abd6a681' ]
Waiting for results... 
Got results. Shutting down instances and deleting resources...
Cleanup done.
Printing results in JSON format:
[
  {
    "creationTimeMs": 1776,
    "copyTimeMs": 68,
    "deletionTimeMs": 60
  },
  {
    "creationTimeMs": 1835,
    "copyTimeMs": 72,
    "deletionTimeMs": 63
  },
  {
    "creationTimeMs": 2220,
    "copyTimeMs": 60,
    "deletionTimeMs": 73
  }
]
```

---

## Implementation details

This section presents a few details of the implementation that can bring further clarity about the solution.

### Orchestrator script (`orchestrator.js`)

The `.sh` boot script for the child instances is stored in a separate file and is dynamically inserted into the `yaml`
template at runtime.
This allows the boot logic to be managed and evolved separately from the CloudFormation logic.

There is a small unit test suite implemented to cover some util functionality that is hard to test otherwise.
You can run the test from the project's root via `npm test`.

If no subnet ids are configured through `.env` as an environment variable, the script will
automatically fetch all available subnet ids of the current VPC. The default `.env` configuration
with blank subnet ids enable out-of-the-box experience for running the solution.

### Child script (`child_boot.sh`)

Time measurements are taken via the `time` command, more specifically its _real_ or _wall clock_ time in milliseconds -
this gives the actual time it takes for the file operations to complete including IO wait times.

The `stdout` and `stderr` streams are logged in a local file on the child instances to enable
investigations in case problems occur. This provides good overall detectability, since errors on the parent machine
will be visible in the console when executed, and problems on child instances will be visible in the local .log file.
Note: child instances won't be stopped by the parent in case they fail to report results.

---

## Possible Improvements

This section includes brief ideas for possible improvements that can be applied to the solution:

- Spot EC2 instances can be considered for child machines, for cost optimisation purposes.
  AWS can reclaim such instances within a two-minute warning period
  but this is fine considering the fast operations and short lives of child instances.
- Currently, child EC2 instances write logs in a local file for enabling issue investigations.
  A possible improvement can be to make them log into CloudWatch via a CloudWatch agent,
  which can bring enhanced monitoring and alerting capabilities in a centralized way.
- Step Functions can potentially be used to implement the orchestration logic for a more robust and flexible serverless
  solution.