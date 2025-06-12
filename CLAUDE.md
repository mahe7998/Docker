# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a collection of specialized Docker containers for development and production environments, with a focus on machine learning, web applications, and file transfer services. The most sophisticated component is the SFTP server with a comprehensive Python client library.

## Common Commands

### SFTP Server (Primary Active Component)
```bash
# Navigate to SFTP server directory
cd sftp_server

# Set required environment variable
export SFTP_PASSWORD=your_secure_password

# Build and run with Docker Compose
docker-compose up -d

# Run tests
python test_sftp_client.py

# Install dependencies
pip install -r requirements.txt

# Use sample application
python sample_app.py ls
```

### General Docker Operations
```bash
# Build any container
docker build -t container-name .

# Build containers with build arguments (common pattern)
docker build --build-arg SFTP_PASSWORD=password -t sftp-server .

# Run with volume mounting (common pattern)
docker run -d -p host_port:container_port -v $(pwd)/data:/container/path image-name
```

### MediaWiki Service
```bash
cd mediawiki
export MYSQL_ROOT_PASSWORD=your_password
docker-compose up -d
```

## Architecture

### Container Categories
- **ML/AI Stack**: cuda-conda (base), cuda-conda-dev, cuda-conda-pytorch, cuda-conda-tensorflow, opencv
- **GUI Applications**: chrome, firefox  
- **Web Services**: mediawiki, sftp_server
- **Development**: ubuntu_dev, gstreamer

### SFTP Server Architecture
The SFTP server is the most developed component with:
- **Security**: SSH key authentication, environment variable passwords
- **Python Client Library**: Full-featured API with context managers (`SFTPClient`)
- **Docker Integration**: Automatic SSH key generation via compose
- **Testing**: Comprehensive unit tests and performance benchmarks

Key files:
- `sftp_client.py`: Main client library with all SFTP operations
- `sample_app.py`: CLI application for testing operations
- `test_sftp_client.py`: Test suite
- `docker-compose.yml`: Multi-service setup with key generation

### Common Patterns
- **Security**: Non-root users (uid/gid 1000), environment variables for secrets
- **Build Strategy**: Layered containers (base → specialized variants)
- **Volume Management**: Host directory mounting for persistent data
- **Multi-service**: Docker Compose for complex setups

## Development Notes

### SFTP Server Development
- Always set `SFTP_PASSWORD` environment variable before testing
- SSH keys are auto-generated in `ssh_keys/` directory
- Client library uses context managers - always use `with SFTPClient():`
- Performance tests available via `sample_app.py perftest`

### ML Container Development  
- CUDA containers use conda environments for framework isolation
- Base `cuda-conda` serves as foundation for specialized variants
- Timezone set to America/Los_Angeles across containers

### Security Considerations
- Never hardcode passwords in Dockerfiles
- Use environment variables for all secrets
- SSH key authentication preferred over passwords
- Recent focus has been on improving security practices