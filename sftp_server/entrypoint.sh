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
# But preserve .ssh directory for keys
if [ -d /home/sftp_user/.ssh ]; then
    cp -r /home/sftp_user/.ssh /tmp/ssh_backup
fi
rm -rf /home/sftp_user
ln -s "$SFTP_ROOT_FOLDER" /home/sftp_user
if [ -d /tmp/ssh_backup ]; then
    mkdir -p /home/sftp_user/.ssh
    if [ "$(ls -A /tmp/ssh_backup)" ]; then
        cp -r /tmp/ssh_backup/* /home/sftp_user/.ssh/
    fi
    rm -rf /tmp/ssh_backup
fi

# Create a symlink from the root directory to the mounted volume
# This ensures files uploaded to the root directory also appear in the mounted volume
mkdir -p /sftp
ln -sf "$SFTP_ROOT_FOLDER" /sftp/data

# Fix ownership and permissions
chown root:root /home/sftp_user
chmod 755 /home/sftp_user

# Copy and fix SSH key permissions if authorized_keys exists
if [ -f /tmp/authorized_keys ]; then
    cp /tmp/authorized_keys /home/sftp_user/.ssh/authorized_keys
    chown sftp_user:sftp_user /home/sftp_user/.ssh/authorized_keys
    chmod 600 /home/sftp_user/.ssh/authorized_keys
fi

# Start SSH daemon
exec /usr/sbin/sshd -D -e
