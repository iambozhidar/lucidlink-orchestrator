#!/bin/bash -e

# Set 'time' command to output the real time value with a precision of 3 digits (e.g. 2.500)
TIMEFORMAT='%3R'

time_ms() {
    # Use the 'time' command to measure the real time in seconds; redirect stderr to stdout
    local time_sec
    time_sec=$( { time eval "$1"; } 2>&1 )

    # return the time, converted to milliseconds and rounded
    echo "$time_sec * 1000" | bc | xargs printf "%.0f\n"
}

# Create source and destination directories
mkdir -p source destination

echo "Creating 1,000 files in source directory..."
creation_time_ms=$(time_ms "for ((i=1; i<=1000; i++)); do touch \"source/file\$i.txt\"; done")

echo "Copying files from source to destination..."
copy_time_ms=$(time_ms "cp -r source/* destination/")

echo "Deleting files from source..."
deletion_time_ms=$(time_ms "rm -rf source/*")

# Print real time for each operation in milliseconds
echo "Time to create files (ms): $creation_time_ms"
echo "Time to copy files (ms): $copy_time_ms"
echo "Time to delete files (ms): $deletion_time_ms"

# Get instance id from metadata and write results to SSM parameter with the id as its name
# The value will be in the format "instance-id: i-1234567890abcdef0" so we 'cut' the second part
instance_id=$(ec2-metadata -i | cut -d " " -f 2)
aws ssm put-parameter --name "$instance_id" --value "$creation_time_ms,$copy_time_ms,$deletion_time_ms" --type "String" --overwrite