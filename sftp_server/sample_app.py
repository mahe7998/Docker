import os
import json
import time
import argparse
from sftp_client import SFTPClient

def print_result(result):
    """Pretty print result dictionary."""
    print(json.dumps(result, indent=2))

def create_directory(client, path):
    """Create a directory on the SFTP server."""
    print(f"Creating directory: {path}")
    result = client.create_directory(path)
    print_result(result)

def upload_file(client, local_path, remote_path=None):
    """Upload a file to the SFTP server."""
    print(f"Uploading {local_path} to {remote_path or 'root'}")
    result = client.upload_file(local_path, remote_path)
    print_result(result)
    
    # Print speed information
    size_kb = result["size"] / 1024
    speed_mb = result["speed"] / (1024 * 1024)
    print(f"Uploaded {size_kb:.2f} KB at {speed_mb:.2f} MB/s")

def download_file(client, remote_path, local_path=None):
    """Download a file from the SFTP server."""
    print(f"Downloading {remote_path} to {local_path or 'current directory'}")
    result = client.download_file(remote_path, local_path)
    print_result(result)
    
    # Print speed information
    size_kb = result["size"] / 1024
    speed_mb = result["speed"] / (1024 * 1024)
    print(f"Downloaded {size_kb:.2f} KB at {speed_mb:.2f} MB/s")

def list_directory(client, path='.'):
    """List contents of a directory on the SFTP server."""
    print(f"Listing directory: {path}")
    result = client.list_directory(path)
    print_result(result)

def remove_file(client, path):
    """Remove a file from the SFTP server."""
    print(f"Removing file: {path}")
    result = client.remove_file(path)
    print_result(result)

def remove_directory(client, path, recursive=False):
    """Remove a directory from the SFTP server."""
    print(f"Removing directory: {path} (recursive: {recursive})")
    result = client.remove_directory(path, recursive)
    print_result(result)

def get_file_info(client, path):
    """Get information about a file or directory."""
    print(f"Getting info for: {path}")
    result = client.get_file_info(path)
    print_result(result)

def create_test_file(filename, size):
    """Create a test file with random data."""
    with open(filename, 'wb') as f:
        f.write(os.urandom(size))
    return os.path.getsize(filename)

def run_performance_test(client):
    """Run performance tests with files of various sizes."""
    print("\n=== Running Performance Tests ===\n")
    
    # Create test directory
    os.makedirs("perf_test", exist_ok=True)
    client.create_directory("perf_test")
    
    # Test different file sizes
    sizes = [
        (1024, "1KB"),
        (1024 * 10, "10KB"),
        (1024 * 100, "100KB"),
        (1024 * 1024, "1MB"),
        (1024 * 1024 * 10, "10MB"),
    ]
    
    results = []
    
    for size_bytes, size_name in sizes:
        local_path = f"perf_test/test_{size_name}.bin"
        remote_path = f"perf_test/test_{size_name}.bin"
        
        # Create test file
        print(f"Creating test file: {size_name}")
        actual_size = create_test_file(local_path, size_bytes)
        
        # Upload test
        print(f"Upload test: {size_name}")
        start_time = time.time()
        client.upload_file(local_path, remote_path)
        upload_time = time.time() - start_time
        upload_speed = actual_size / upload_time if upload_time > 0 else 0
        
        # Download test
        print(f"Download test: {size_name}")
        local_download = f"perf_test/download_{size_name}.bin"
        start_time = time.time()
        client.download_file(remote_path, local_download)
        download_time = time.time() - start_time
        download_speed = actual_size / download_time if download_time > 0 else 0
        
        # Verify file integrity
        with open(local_path, "rb") as f1, open(local_download, "rb") as f2:
            match = f1.read() == f2.read()
        
        # Store results
        result = {
            "size_name": size_name,
            "size_bytes": actual_size,
            "upload_time": upload_time,
            "upload_speed_mb": upload_speed / (1024 * 1024),
            "download_time": download_time,
            "download_speed_mb": download_speed / (1024 * 1024),
            "integrity_check": "Pass" if match else "Fail"
        }
        results.append(result)
    
    # Print performance results as a table
    print("\n=== Performance Results ===\n")
    print(f"{'Size':<10} {'Upload Time':<15} {'Upload Speed':<15} {'Download Time':<15} {'Download Speed':<15} {'Integrity':<10}")
    print(f"{'-'*70}")
    
    for r in results:
        print(f"{r['size_name']:<10} {r['upload_time']:.4f}s {r['upload_speed_mb']:.2f} MB/s {r['download_time']:.4f}s {r['download_speed_mb']:.2f} MB/s {r['integrity_check']:<10}")
    
    # Clean up
    client.remove_directory("perf_test", recursive=True)
    
    return results

def main():
    """Main function to parse arguments and execute commands."""
    parser = argparse.ArgumentParser(description="SFTP Client Sample Application")
    parser.add_argument("--host", default="localhost", help="SFTP server hostname")
    parser.add_argument("--port", type=int, default=2222, help="SFTP server port")
    parser.add_argument("--username", default="sftp_user", help="SFTP username")
    parser.add_argument("--password", help="SFTP password (if not provided, SFTP_PASSWORD environment variable will be used)")
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # mkdir command
    mkdir_parser = subparsers.add_parser("mkdir", help="Create a directory")
    mkdir_parser.add_argument("path", help="Directory path to create")
    
    # upload command
    upload_parser = subparsers.add_parser("upload", help="Upload a file")
    upload_parser.add_argument("local_path", help="Local file path")
    upload_parser.add_argument("remote_path", nargs="?", help="Remote path (optional)")
    
    # download command
    download_parser = subparsers.add_parser("download", help="Download a file")
    download_parser.add_argument("remote_path", help="Remote file path")
    download_parser.add_argument("local_path", nargs="?", help="Local path (optional)")
    
    # ls command
    ls_parser = subparsers.add_parser("ls", help="List directory contents")
    ls_parser.add_argument("path", nargs="?", default=".", help="Directory path to list")
    
    # rm command
    rm_parser = subparsers.add_parser("rm", help="Remove a file")
    rm_parser.add_argument("path", help="File path to remove")
    
    # rmdir command
    rmdir_parser = subparsers.add_parser("rmdir", help="Remove a directory")
    rmdir_parser.add_argument("path", help="Directory path to remove")
    rmdir_parser.add_argument("-r", "--recursive", action="store_true", help="Remove recursively")
    
    # info command
    info_parser = subparsers.add_parser("info", help="Get file/directory info")
    info_parser.add_argument("path", help="Path to get info for")
    
    # performance test command
    perf_parser = subparsers.add_parser("perftest", help="Run performance tests")
    
    args = parser.parse_args()
    
    # Create and connect SFTP client
    client = SFTPClient(args.host, args.port, args.username, args.password)
    if not client.connect():
        print("Failed to connect to SFTP server")
        return 1
    
    try:
        # Execute the specified command
        if args.command == "mkdir":
            create_directory(client, args.path)
        elif args.command == "upload":
            upload_file(client, args.local_path, args.remote_path)
        elif args.command == "download":
            download_file(client, args.remote_path, args.local_path)
        elif args.command == "ls":
            list_directory(client, args.path)
        elif args.command == "rm":
            remove_file(client, args.path)
        elif args.command == "rmdir":
            remove_directory(client, args.path, args.recursive)
        elif args.command == "info":
            get_file_info(client, args.path)
        elif args.command == "perftest":
            run_performance_test(client)
        else:
            parser.print_help()
    finally:
        # Always disconnect when done
        client.disconnect()
    
    return 0

if __name__ == "__main__":
    exit(main())