#!/bin/bash -e

# Set 'time' command to output the real time value with a precision of 3 digits (e.g. 2.500)
TIMEFORMAT='%3R'

time_ms() {
    # Use 'time' to measure the real time in seconds ('time' writes in stderr, so redirect to stdout)
    local time_sec
    time_sec=$( { time eval "$1"; } 2>&1 )

    # Return the time, converted in milliseconds and rounded
    echo "$time_sec * 1000" | bc | xargs printf "%.0f\n"
}

main() {
    # Create source and destination directories
    mkdir -p source destination

    echo "Creating 1,000 files in source directory..."
    creation_time_ms=$(time_ms "for ((i=1; i<=1000; i++)); do touch \"source/file\$i.txt\"; done")

    echo "Copying files from source to destination..."
    copy_time_ms=$(time_ms "cp -r source/* destination/")

    echo "Deleting files from source..."
    deletion_time_ms=$(time_ms "{ rm -rf source/*; rm -rf destination/*; }")

    # Print time in milliseconds for each operation
    echo "Time to create files (ms): $creation_time_ms"
    echo "Time to copy files (ms): $copy_time_ms"
    echo "Time to delete files (ms): $deletion_time_ms"

    # Get instance id from metadata and write time results to SSM with the id as the parameter's name
    # The id value will be in the format "instance-id: i-1234567890abcdef0" so we 'cut' to the second part
    instance_id=$(ec2-metadata -i | cut -d " " -f 2)
    aws ssm put-parameter --name "$instance_id" --value "$creation_time_ms,$copy_time_ms,$deletion_time_ms" --type "String" --overwrite
}

main "$@" > /var/log/child_boot.log 2>&1