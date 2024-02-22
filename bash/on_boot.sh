#!/bin/bash -e

## The value will be in the format "instance-id: i-1234567890abcdef0"
## So, we use cut to extract the second part (the actual instance ID)
#instance_id=$(ec2-metadata -i | cut -d " " -f 2)
#aws ssm put-parameter --name $instance_id --value "320,1000,3000" --type "String" --overwrite


# Create source and destination directories
mkdir -p source destination

# Generate 1,000 files in source directory
echo "Creating 1,000 files in source directory..."
create_output=$( { time (for ((i=1; i<=1000; i++)); do touch "source/file$i.txt"; done;) ; } 2>&1 )
create_real=$(echo "$create_output" | grep real | cut -d' ' -f2)

# Copy files from source to destination
echo "Copying files from source to destination..."
copy_output=$( { time (cp -r source/* destination/;) ; } 2>&1 )
copy_real=$(echo "$copy_output" | grep real | cut -d' ' -f2)

# Delete files from source
echo "Deleting files from source..."
delete_output=$( { time (rm -rf source/*;) ; } 2>&1 )
delete_real=$(echo "$delete_output" | grep real | cut -d' ' -f2)

# Print real time for each operation
echo "Time to create files (real): $create_real"
echo "Time to copy files (real): $copy_real"
echo "Time to delete files (real): $delete_real"