#!/bin/bash -xe

# The value will be in the format "instance-id: i-1234567890abcdef0"
# So, we use cut to extract the second part (the actual instance ID)
instance_id=$(ec2-metadata -i | cut -d " " -f 2)
aws ssm put-parameter --name $instance_id --value "320,1000,3000" --type "String" --overwrite