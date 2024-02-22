#!/bin/bash -e

# Function to convert time format to total seconds
convert_time_str_to_ms() {
    # Split input based on 'm' and 's' and remove 's' suffix
    local time_str=$1
    local minutes=$(echo $time_str | cut -d'm' -f1)
    local seconds=$(echo $time_str | cut -d'm' -f2 | sed 's/s//')

    # Convert to total milliseconds (1 minute = 60000 milliseconds, 1 second = 1000 milliseconds)
    # Then format the output as an integer to remove trailing zeros
    local total_milliseconds=$(echo "($minutes * 60 + $seconds) * 1000" | bc)
    printf "%.0f" "$total_milliseconds" # This will format the floating point number to an integer
}

# Create source and destination directories
mkdir -p source destination

# Generate 1,000 files in source directory
echo "Creating 1,000 files in source directory..."
create_output=$( { time (for ((i=1; i<=1000; i++)); do touch "source/file$i.txt"; done;) ; } 2>&1 )
create_real=$(echo "$create_output" | grep real | awk '{print $2}')
# Convert create_real to total seconds
creation_time_ms=$(convert_time_str_to_ms $create_real)

# Copy files from source to destination
echo "Copying files from source to destination..."
copy_output=$( { time (cp -r source/* destination/;) ; } 2>&1 )
copy_real=$(echo "$copy_output" | grep real | awk '{print $2}')
# Convert copy_real to total seconds
copy_time_ms=$(convert_time_str_to_ms $copy_real)

# Delete files from source
echo "Deleting files from source..."
delete_output=$( { time (rm -rf source/*;) ; } 2>&1 )
delete_real=$(echo "$delete_output" | grep real | awk '{print $2}')
# Convert delete_real to total seconds
deletion_time_ms=$(convert_time_str_to_ms $delete_real)

# Print real time for each operation in seconds
echo "Time to create files (ms): $creation_time_ms"
echo "Time to copy files (ms): $copy_time_ms"
echo "Time to delete files (ms): $deletion_time_ms"

# The value will be in the format "instance-id: i-1234567890abcdef0"
# So, we use cut to extract the second part (the actual instance ID)
instance_id=$(ec2-metadata -i | cut -d " " -f 2)
aws ssm put-parameter --name $instance_id --value "$creation_time_ms,$copy_time_ms,$deletion_time_ms" --type "String" --overwrite