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

# Fix ownership and permissions
chown root:root /home/sftp_user
chmod 755 /home/sftp_user

# Start SSH daemon
exec /usr/sbin/sshd -D -e