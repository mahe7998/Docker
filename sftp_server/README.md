# SFTP Server Docker Container

This Docker container sets up an SFTP server that uses a local directory as its root folder, with a Python client library for easy interaction.

## Features

- SFTP server using OpenSSH
- Pre-configured user (sftp_user) with password (welcome1234)
- Uses local computer's directory for file storage
- Configurable root folder via environment variable
- Python client library for file operations
- Command-line sample application

## Server Setup

### Security Notice
For security, the SFTP password is not hardcoded in the Docker image. You must provide it via an environment variable.

### Using Docker Compose

1. Clone this repository
2. Create the sftp_data directory (for instance /Users/jmahe/sftp_data)
3. Set the SFTP password environment variable:

```bash
export SFTP_PASSWORD=your_secure_password
```

4. Run docker-compose:

```bash
docker-compose up -d
```

To restart:
```bash
docker-compose restart
```

This will:
- Build the Docker image with your provided password
- Start the SFTP server on port 2222
- Mount the `/sftp_data` directory as the SFTP root folder

### Using Docker Directly

Build the image:

```bash
docker build --build-arg SFTP_PASSWORD=your_secure_password -t sftp-server .
```

Run the container:

```bash
docker run -d \
  -p 2222:22 \
  -e SFTP_ROOT_FOLDER=/data/sftp \
  -v $(pwd)/sftp_data:/data/sftp \
  sftp-server
```

## Python Client Library

The project includes a Python SFTP client library that provides functions for:

- Creating directories
- Uploading and downloading files
- Listing directories
- Removing files and directories
- Getting file information
- Performance testing

### Installation

Install the required dependencies:

```bash
pip install -r requirements.txt
```

### Using the Library

First, set the SFTP password either as an environment variable or provide it directly:

```bash
export SFTP_PASSWORD=your_secure_password
```

Then use the client in your Python code:

```python
from sftp_client import SFTPClient

# Connect to SFTP server
# Option 1: It will use the SFTP_PASSWORD environment variable
with SFTPClient(host='localhost', port=2222) as client:
    # Create a directory
    client.create_directory('test_dir')
    
# Option 2: Provide password directly
with SFTPClient(host='localhost', port=2222, password='your_secure_password') as client:
    # Upload a file
    client.upload_file('local_file.txt', 'test_dir/remote_file.txt')
    
    # List directory contents
    files = client.list_directory('test_dir')
    print(files)
    
    # Download a file
    client.download_file('test_dir/remote_file.txt', 'downloaded_file.txt')
    
    # Get file info
    info = client.get_file_info('test_dir/remote_file.txt')
    print(info)
    
    # Remove a file
    client.remove_file('test_dir/remote_file.txt')
    
    # Remove a directory
    client.remove_directory('test_dir', recursive=True)
```

## Sample Application

The project includes a command-line sample application for testing SFTP operations.

```bash
# Set the SFTP password
export SFTP_PASSWORD=your_secure_password

# Create a directory
python sample_app.py mkdir test_dir

# Upload a file
python sample_app.py upload local_file.txt test_dir/remote_file.txt

# List directory contents
python sample_app.py ls test_dir

# Download a file
python sample_app.py download test_dir/remote_file.txt downloaded_file.txt

# Get file info
python sample_app.py info test_dir/remote_file.txt

# Remove a file
python sample_app.py rm test_dir/remote_file.txt

# Remove a directory (recursive)
python sample_app.py rmdir -r test_dir

# Run performance tests
python sample_app.py perftest

# Alternatively, provide password directly
python sample_app.py --password your_secure_password ls
```

## Running Tests

To run the test suite:

```bash
python test_sftp_client.py
```

Tests include:
- Creating directories
- Uploading files of different sizes
- Listing directories
- Getting file information
- Downloading files
- Verifying file integrity
- Removing files and directories

## Configuration

You can customize the setup by modifying the following:

- **SFTP_ROOT_FOLDER**: Environment variable that points to the directory inside the container where files will be stored
- Port mapping: Change the host port (default 2222) as needed
- Volume mounting: Change the local directory path as needed

## Security Note

This container is configured with a default username and password for convenience. For production use, consider:

- Changing the default password
- Using SSH keys instead of password authentication
- Restricting access with firewall rules