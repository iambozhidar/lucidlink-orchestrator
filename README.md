# [LucidLink] Orchestrator Task - Bozhidar Stoyanov

This project provides solution to the problem presented in `Development experience assignment.pdf`. 
Namely, an orchestrator that automates a series of file operations across several virtual machines in an AWS environment.
The execution time of these operations are measured and the orchestrator reports results for each VM.

<!---
Example docs:
https://github.com/aws-solutions/mlops-workload-orchestrator
https://pandao.github.io/editor.md/en.html
https://dillinger.io/
-->

## High-level overview

The solution is implemented using the following technologies and AWS services:

- ***Node.js*** for implementing the orchestrator app, deployed on the _parent_ instance
- ***Bash*** for implementing the payload script that performs file operations, deployed on _child_ instances
- ***AWS SSM Parameter Store*** for storing/retrieving the execution time of operations on child instances
- ***AWS EC2*** as VM instances
- ***AWS EC2 Auto Scaling*** for launching a fixed number of child instances (3 by default) across multiple AZs/subnets, granting availability
- ***CloudFormation (YAML)*** for deploying and managing AWS resource stacks in an automated and reliable manner

<img src="images/architecture_diagram.jpg" alt="Architecture Diagram" width="600"/>

The high-level execution flow is as follows:
1. The orchestrator/parent instance creates a CloudFormation stack that will launch child instances, then waits for its completion.
2. The child instances are launched in an Auto Scaling group to benefit from its infrastructural reliability and availability (across multiple AZs). 
3. The bash script that performs the file operations is distributed to child instances via the `UserData` option (ran upon booting).
4. Inside the bash script, after the operations are done, child instances upload time measurements as a comma-delimited string to SSM Parameter Store under their unique instance id.
5. The orchestrator has been waiting for the SSM parameters to be created, and reads them.
6. The orchestrator deletes the CloudFormation stack. It also deletes the SSM parameters.
7. The orchestrator prints the results (in either human-readable or JSON format)

## File Structure?

## Implementation details
NodeJS:
- the .sh script for child instances is stored in a separate file and is inserted in the .yaml template dynamically
- simple **unit tests** for the 'retry' logic since it's hard to test manually
- .env for configuration
- explicit subnet ids can be configured, if not, it gets all available subnets in the VPC automatically

Bash:
- time measurements are taken via the `time` command - the _real_ or _wall clock_ time in milliseconds, meaning the full actual time including IO-blockage time.
- child instances **.sh script logs stdout and stderr** in a local .log file (/var/log/child_boot.log) to enable investigation in case problems occur.
- this way, Errors in the NodeJS app will be visible in the console when executed, and problems on child instances will be visible in a local .log file
---
 
## Configuration

Configured for eu-north-1. You can configure via .env.

Describe .env

_Important_: the solution is configured by default to run in the _eu-north-1_ region, but you can change configurations as you wish.

---
## Running the solution

Use CloudFormation and the provided `orchestrator.yaml` template file (at the project's root) to run the solution in your AWS environment. 
This will automatically launch the orchestrator instance and configure the solution so that you can then simply connect to the machine and run the script.

### Launch the Orchestrator instance
1. Go to the CloudFormation console in your AWS environment > "Create stack".
2. Upload the `orchestrator.yaml` template.
3. Set stack name. Optionally, change the default values for AMIId and InstanceType.
4. Go until the end of the wizard screens and 'Submit' the stack.
5. Wait for the stack to be created. It can take a few minutes.

Alternatively, you can also run the `orchestrator.yaml` template via 

### Run the script
After the stack is successfully created, go to the EC2 console and:
1. Connect to the newly created "Orchestrator" instance via "Instance Connect"
2. Check with `ls` if there is an "orchestrator" folder in the user space. If not, you may need to wait a bit while the solution is being downloaded (by the user data script)
3. Once it's done, go inside the folder with `cd orchestrator`
4. Then simply start the solution via one of the following commands: 
   1. `npm start` or `node orchestrator.js` for human-readable output
   2. `npm start -- --json` or `node orchestrator.js --json` for json output
5. Wait for results. It can take a few minutes.

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

## Tests
There is a small unit test suite implemented to cover some util functionality that is hard to test otherwise.

You can run the test from the project's root:
```shell
npm test
```

## Possible Improvements

- CloudWatch Logs for child instances instead of a local file (installing CloudWatch agent and make the bash script write errors to CloudWatch)
- Spot instances for cost optimisations
- Step Functions for orchestration
