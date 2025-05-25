#!/bin/sh
set -e

# Check if SFTP_ROOT_FOLDER environment variable is set
if [ -z "$SFTP_ROOT_FOLDER" ]; then
  echo "Error: SFTP_ROOT_FOLDER environment variable is not set"
  exit 1
fi

# Create the directory if it doesn't exist
mkdir -p "$SFTP_ROOT_FOLDER"

# Set up symlink from /home/sftp_user to the mounted volume
rm -rf /home/sftp_user
ln -s "$SFTP_ROOT_FOLDER" /home/sftp_user

# Create a symlink from the root directory to the mounted volume
# This ensures files uploaded to the root directory also appear in the mounted volume
mkdir -p /sftp
ln -sf "$SFTP_ROOT_FOLDER" /sftp/data

# Fix ownership and permissions
chown root:root /home/sftp_user
chmod 755 /home/sftp_user

# Start SSH daemon
exec /usr/sbin/sshd -D -e
