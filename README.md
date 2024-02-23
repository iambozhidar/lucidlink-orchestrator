# [LucidLink] Orchestrator Task - Bozhidar Stoyanov
This project provides solution to the assignment presented in `Development experience assignment.pdf`. An orchestrator that:
1. Launches 3 VMs
2.

<!---
Example docs:
https://github.com/aws-solutions/mlops-workload-orchestrator
-->

## Architecture
The solution is implemented on AWS by using the following technologies:
- **EC2** as VMs instances for
- **Auto Scaling Group**
- **NodeJS** for the *orchestrator* script ran on a *parent* EC2 instance
- **CloudFormation** for deploying and managing the stack of *child* EC2 instances in the Auto Scaling Group
- **Bash** for the payload script deployed on child instances that performs and measures file operations, then uploads results to SSM Parameter Store
- **SSM Parameter Store** for storing the results from child instances
- **CloudWatch** for monitoring logs in case of issues?

## File Structure?

## Configuration

## Running the Orchestrator

## Possible Improvements