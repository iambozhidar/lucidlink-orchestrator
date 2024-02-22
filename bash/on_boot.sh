#!/bin/bash -e

## The value will be in the format "instance-id: i-1234567890abcdef0"
## So, we use cut to extract the second part (the actual instance ID)
#instance_id=$(ec2-metadata -i | cut -d " " -f 2)
#aws ssm put-parameter --name $instance_id --value "320,1000,3000" --type "String" --overwrite


# Function to convert time format to total seconds
convert_to_seconds() {
    # Split input based on 'm' and 's' and remove 's' suffix
    local time_str=$1
    local minutes=$(echo $time_str | cut -d'm' -f1)
    local seconds=$(echo $time_str | cut -d'm' -f2 | sed 's/s//')

    # Convert to total seconds
    echo "$minutes * 60 + $seconds" | bc
}

# Create source and destination directories
mkdir -p source destination

# Generate 1,000 files in source directory
echo "Creating 1,000 files in source directory..."
create_output=$( { time (for ((i=1; i<=1000; i++)); do touch "source/file$i.txt"; done;) ; } 2>&1 )
create_real=$(echo "$create_output" | grep real | awk '{print $2}')

# Convert create_real to total seconds
create_seconds=$(convert_to_seconds $create_real)

# Copy files from source to destination
echo "Copying files from source to destination..."
copy_output=$( { time (cp -r source/* destination/;) ; } 2>&1 )
copy_real=$(echo "$copy_output" | grep real | awk '{print $2}')

# Convert copy_real to total seconds
copy_seconds=$(convert_to_seconds $copy_real)

# Delete files from source
echo "Deleting files from source..."
delete_output=$( { time (rm -rf source/*;) ; } 2>&1 )
delete_real=$(echo "$delete_output" | grep real | awk '{print $2}')

# Convert delete_real to total seconds
delete_seconds=$(convert_to_seconds $delete_real)

# Print real time for each operation in seconds
echo "Time to create files (seconds): $create_seconds"
echo "Time to copy files (seconds): $copy_seconds"
echo "Time to delete files (seconds): $delete_seconds"