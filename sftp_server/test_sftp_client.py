import os
import json
import time
import random
import unittest
from sftp_client import SFTPClient

class TestSFTPClient(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        """Set up test fixtures."""
        # Create a test directory locally
        os.makedirs("test_files", exist_ok=True)
        
        # Create test files of different sizes
        cls.create_test_file("test_files/small_file.txt", 1024)  # 1KB
        cls.create_test_file("test_files/medium_file.bin", 1024 * 1024)  # 1MB
        cls.create_test_file("test_files/large_file.bin", 10 * 1024 * 1024)  # 10MB
        
        # Connect to SFTP server
        cls.client = SFTPClient()
        cls.client.connect()
        
    @classmethod
    def tearDownClass(cls):
        """Tear down test fixtures."""
        # Clean up remote files
        try:
            cls.client.remove_directory("test_directory", recursive=True)
        except:
            pass
        
        try:
            cls.client.remove_directory("nested", recursive=True)
        except:
            pass
        
        # Clean up local files
        for file in ["downloaded_small.txt", "downloaded_medium.bin", "downloaded_large.bin"]:
            if os.path.exists(file):
                os.remove(file)
        
        # Disconnect from SFTP server
        cls.client.disconnect()
    
    @staticmethod
    def create_test_file(filename, size):
        """Create a test file with random data."""
        with open(filename, 'wb') as f:
            f.write(os.urandom(size))
    
    def test_01_create_directory(self):
        """Test creating a directory."""
        result = self.client.create_directory("test_directory")
        self.assertTrue(result["created"])
        self.assertTrue(self.client.file_exists("test_directory"))
    
    def test_02_create_nested_directory(self):
        """Test creating nested directories."""
        result = self.client.create_directory("nested/dir1/dir2")
        self.assertTrue(result["created"])
        self.assertTrue(self.client.file_exists("nested/dir1/dir2"))
    
    def test_03_upload_small_file(self):
        """Test uploading a small file."""
        result = self.client.upload_file("test_files/small_file.txt", "test_directory/small_file.txt")
        self.assertEqual(result["path"], "test_directory/small_file.txt")
        self.assertEqual(result["size"], 1024)
        self.assertTrue(self.client.file_exists("test_directory/small_file.txt"))
        print(f"Small file upload speed: {result['speed'] / 1024:.2f} KB/s")
    
    def test_04_upload_medium_file(self):
        """Test uploading a medium file."""
        result = self.client.upload_file("test_files/medium_file.bin", "test_directory/medium_file.bin")
        self.assertEqual(result["path"], "test_directory/medium_file.bin")
        self.assertEqual(result["size"], 1024 * 1024)
        self.assertTrue(self.client.file_exists("test_directory/medium_file.bin"))
        print(f"Medium file upload speed: {result['speed'] / 1024 / 1024:.2f} MB/s")
    
    def test_05_upload_large_file(self):
        """Test uploading a large file."""
        result = self.client.upload_file("test_files/large_file.bin", "test_directory/large_file.bin")
        self.assertEqual(result["path"], "test_directory/large_file.bin")
        self.assertEqual(result["size"], 10 * 1024 * 1024)
        self.assertTrue(self.client.file_exists("test_directory/large_file.bin"))
        print(f"Large file upload speed: {result['speed'] / 1024 / 1024:.2f} MB/s")
    
    def test_06_list_directory(self):
        """Test listing directory contents."""
        files = self.client.list_directory("test_directory")
        self.assertIsInstance(files, list)
        self.assertEqual(len(files), 3)
        
        file_names = [f["name"] for f in files]
        self.assertIn("small_file.txt", file_names)
        self.assertIn("medium_file.bin", file_names)
        self.assertIn("large_file.bin", file_names)
        
        # Print directory listing as JSON
        print(json.dumps(files, indent=2))
    
    def test_07_get_file_info(self):
        """Test getting file information."""
        info = self.client.get_file_info("test_directory/small_file.txt")
        self.assertTrue(info["exists"])
        self.assertEqual(info["size"], 1024)
        self.assertFalse(info["is_directory"])
        print(json.dumps(info, indent=2))
    
    def test_08_download_files(self):
        """Test downloading files."""
        # Small file
        result = self.client.download_file("test_directory/small_file.txt", "downloaded_small.txt")
        self.assertEqual(result["size"], 1024)
        self.assertTrue(os.path.exists("downloaded_small.txt"))
        print(f"Small file download speed: {result['speed'] / 1024:.2f} KB/s")
        
        # Medium file
        result = self.client.download_file("test_directory/medium_file.bin", "downloaded_medium.bin")
        self.assertEqual(result["size"], 1024 * 1024)
        self.assertTrue(os.path.exists("downloaded_medium.bin"))
        print(f"Medium file download speed: {result['speed'] / 1024 / 1024:.2f} MB/s")
        
        # Large file
        result = self.client.download_file("test_directory/large_file.bin", "downloaded_large.bin")
        self.assertEqual(result["size"], 10 * 1024 * 1024)
        self.assertTrue(os.path.exists("downloaded_large.bin"))
        print(f"Large file download speed: {result['speed'] / 1024 / 1024:.2f} MB/s")
    
    def test_09_verify_downloads(self):
        """Verify that downloaded files match the originals."""
        with open("test_files/small_file.txt", "rb") as f1, open("downloaded_small.txt", "rb") as f2:
            self.assertEqual(f1.read(), f2.read())
        
        with open("test_files/medium_file.bin", "rb") as f1, open("downloaded_medium.bin", "rb") as f2:
            self.assertEqual(f1.read(), f2.read())
        
        with open("test_files/large_file.bin", "rb") as f1, open("downloaded_large.bin", "rb") as f2:
            self.assertEqual(f1.read(), f2.read())
    
    def test_10_remove_files(self):
        """Test removing files."""
        result = self.client.remove_file("test_directory/small_file.txt")
        self.assertTrue(result["removed"])
        self.assertFalse(self.client.file_exists("test_directory/small_file.txt"))
    
    def test_11_remove_directory(self):
        """Test removing directories."""
        # Non-recursive should fail (directory not empty)
        result = self.client.remove_directory("test_directory", recursive=False)
        self.assertFalse(result["removed"])
        
        # Recursive should succeed
        result = self.client.remove_directory("test_directory", recursive=True)
        self.assertTrue(result["removed"])
        self.assertFalse(self.client.file_exists("test_directory"))

if __name__ == '__main__':
    unittest.main()