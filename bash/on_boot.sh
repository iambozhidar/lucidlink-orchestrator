#!/bin/bash

# Run the ec2-metadata command to get the instance ID
# The output will be in the format "instance-id: i-1234567890abcdef0"
# So, we use cut to extract the second part (the actual instance ID)
INSTANCE_ID=$(ec2-metadata -i | cut -d " " -f 2)

# Print the instance ID
echo "Instance ID: $INSTANCE_ID"