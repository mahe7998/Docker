import os
import json
import time
import paramiko
from stat import S_ISDIR
from datetime import datetime

class SFTPClient:
    def __init__(self, host="localhost", port=2222, username="sftp_user", password="welcome1234"):
        """Initialize SFTP client with connection parameters."""
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.transport = None
        self.sftp = None
        
    def connect(self):
        """Establish connection to SFTP server."""
        try:
            self.transport = paramiko.Transport((self.host, self.port))
            self.transport.connect(username=self.username, password=self.password)
            self.sftp = paramiko.SFTPClient.from_transport(self.transport)
            return True
        except Exception as e:
            print(f"Connection error: {str(e)}")
            return False
            
    def disconnect(self):
        """Close SFTP connection."""
        if self.sftp:
            self.sftp.close()
        if self.transport:
            self.transport.close()
        self.sftp = None
        self.transport = None
    
    def __enter__(self):
        """Context manager entry."""
        self.connect()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.disconnect()
    
    def ensure_directory(self, remote_path):
        """Recursively create remote directories if they don't exist."""
        if remote_path == '/' or remote_path == '':
            return
        
        try:
            self.sftp.stat(remote_path)
        except FileNotFoundError:
            parent = os.path.dirname(remote_path)
            self.ensure_directory(parent)
            self.sftp.mkdir(remote_path)
    
    def upload_file(self, local_path, remote_path=None):
        """
        Upload a file to the SFTP server.
        If remote_path is a directory, the file will be uploaded with its original name.
        If remote_path is not provided, the file will be uploaded to the root with its original name.
        """
        if not os.path.isfile(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")
        
        # If remote_path is not provided, use the filename from local_path
        if not remote_path:
            remote_path = os.path.basename(local_path)
        
        # If remote_path is a directory, append the filename from local_path
        try:
            remote_stat = self.sftp.stat(remote_path)
            is_dir = S_ISDIR(remote_stat.st_mode)
            if is_dir:
                remote_path = os.path.join(remote_path, os.path.basename(local_path))
        except FileNotFoundError:
            # If the remote path doesn't exist, ensure parent directories exist
            remote_dir = os.path.dirname(remote_path)
            if remote_dir:
                self.ensure_directory(remote_dir)
        
        start_time = time.time()
        self.sftp.put(local_path, remote_path)
        elapsed_time = time.time() - start_time
        file_size = os.path.getsize(local_path)
        
        return {
            "path": remote_path,
            "size": file_size,
            "time": elapsed_time,
            "speed": file_size / elapsed_time if elapsed_time > 0 else 0
        }
    
    def download_file(self, remote_path, local_path=None):
        """
        Download a file from the SFTP server.
        If local_path is a directory, the file will be downloaded with its original name.
        If local_path is not provided, the file will be downloaded to the current directory.
        """
        if not local_path:
            local_path = os.path.basename(remote_path)
        
        if os.path.isdir(local_path):
            local_path = os.path.join(local_path, os.path.basename(remote_path))
        
        # Create parent directories if they don't exist
        local_dir = os.path.dirname(local_path)
        if local_dir and not os.path.exists(local_dir):
            os.makedirs(local_dir)
        
        start_time = time.time()
        self.sftp.get(remote_path, local_path)
        elapsed_time = time.time() - start_time
        file_size = os.path.getsize(local_path)
        
        return {
            "path": local_path,
            "size": file_size,
            "time": elapsed_time,
            "speed": file_size / elapsed_time if elapsed_time > 0 else 0
        }
    
    def create_directory(self, remote_path):
        """Create a directory on the SFTP server."""
        self.ensure_directory(remote_path)
        return {"path": remote_path, "created": True}
    
    def remove_file(self, remote_path):
        """Remove a file from the SFTP server."""
        try:
            self.sftp.remove(remote_path)
            return {"path": remote_path, "removed": True}
        except Exception as e:
            return {"path": remote_path, "removed": False, "error": str(e)}
    
    def _rmdir_recursive(self, remote_path):
        """Recursively remove a directory and its contents."""
        file_list = self.sftp.listdir_attr(remote_path)
        
        for file_attr in file_list:
            filepath = os.path.join(remote_path, file_attr.filename)
            if S_ISDIR(file_attr.st_mode):
                self._rmdir_recursive(filepath)
            else:
                self.sftp.remove(filepath)
        
        self.sftp.rmdir(remote_path)
    
    def remove_directory(self, remote_path, recursive=False):
        """
        Remove a directory from the SFTP server.
        If recursive is True, all contents will be removed.
        """
        try:
            if recursive:
                self._rmdir_recursive(remote_path)
            else:
                self.sftp.rmdir(remote_path)
            return {"path": remote_path, "removed": True}
        except Exception as e:
            return {"path": remote_path, "removed": False, "error": str(e)}
    
    def list_directory(self, remote_path='.'):
        """
        List contents of a directory on the SFTP server.
        Returns a JSON structure with file information.
        """
        try:
            files = self.sftp.listdir_attr(remote_path)
            result = []
            
            for file_attr in files:
                is_directory = S_ISDIR(file_attr.st_mode)
                file_info = {
                    "name": file_attr.filename,
                    "path": os.path.join(remote_path, file_attr.filename),
                    "size": file_attr.st_size,
                    "is_directory": is_directory,
                    "modified": datetime.fromtimestamp(file_attr.st_mtime).isoformat(),
                    "accessed": datetime.fromtimestamp(file_attr.st_atime).isoformat()
                }
                result.append(file_info)
            
            return result
        except Exception as e:
            return {"error": str(e)}
    
    def file_exists(self, remote_path):
        """Check if a file exists on the SFTP server."""
        try:
            self.sftp.stat(remote_path)
            return True
        except FileNotFoundError:
            return False
    
    def get_file_info(self, remote_path):
        """Get detailed information about a file or directory."""
        try:
            file_attr = self.sftp.stat(remote_path)
            is_directory = S_ISDIR(file_attr.st_mode)
            info = {
                "path": remote_path,
                "name": os.path.basename(remote_path),
                "size": file_attr.st_size,
                "is_directory": is_directory,
                "modified": datetime.fromtimestamp(file_attr.st_mtime).isoformat(),
                "accessed": datetime.fromtimestamp(file_attr.st_atime).isoformat(),
                "exists": True
            }
            return info
        except FileNotFoundError:
            return {"path": remote_path, "exists": False}
        except Exception as e:
            return {"path": remote_path, "error": str(e)}