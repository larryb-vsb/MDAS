#!/usr/bin/env python3
"""
================================================================================
MMS Batch File Uploader (Python)
Version: 1.1.5
Last Updated: November 05, 2025 - 7:10 PM CST
Status: PRODUCTION READY - TESTED
================================================================================

Automated batch file uploader with API key authentication.
Supports config files, command-line parameters, and three actions:
  - ping: Test server connectivity (NO API key required)
  - status: Check upload queue status (requires API key)
  - upload: Batch upload files from a directory (requires API key)

Features:
  - Host approval status display with color coding
  - Detailed connection logging to mms-uploader.log
  - Client fingerprint tracking with hostname
  - Automatic retry with exponential backoff
  - JSON upload reports
  - Timestamp display on ping
  - Verbose mode (-v flag)
  - Optional API key for ping (validates if provided)
  - Version display in output and logs
"""

import argparse
import json
import os
import sys
import time
import socket
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import requests

# Constants
VERSION = "1.1.5"
CHUNK_SIZE = 25 * 1024 * 1024  # 25MB
DEFAULT_BATCH_SIZE = 5
DEFAULT_POLLING_INTERVAL = 10
MAX_RETRIES = 3
LOG_FILE = "mms-uploader.log"


class Colors:
    """ANSI color codes for terminal output"""
    RESET = "\033[0m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    GRAY = "\033[90m"
    WHITE = "\033[97m"


class MMSUploader:
    """MMS Batch File Uploader"""
    
    def __init__(self, url: str, api_key: Optional[str] = None, folder: Optional[str] = None,
                 batch_size: int = DEFAULT_BATCH_SIZE,
                 polling_interval: int = DEFAULT_POLLING_INTERVAL,
                 verbose: bool = False):
        self.url = url.rstrip('/')
        self.api_key = api_key
        self.folder = folder
        self.batch_size = batch_size
        self.polling_interval = polling_interval
        self.verbose = verbose
        self.headers = {}
        if api_key:
            self.headers["X-API-Key"] = api_key
        self.hostname = socket.gethostname()
        self.user_agent = f"MMS-BatchUploader/{VERSION} (Python; {self.hostname})"
        self.headers["User-Agent"] = self.user_agent
        
        # Setup logging
        self._setup_logging()
    
    def _setup_logging(self):
        """Setup logging to file and console"""
        self.logger = logging.getLogger('MMS-Uploader')
        self.logger.setLevel(logging.DEBUG if self.verbose else logging.INFO)
        
        # File handler
        fh = logging.FileHandler(LOG_FILE)
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
        self.logger.addHandler(fh)
        
        # Console handler (only for errors if not verbose)
        if self.verbose:
            ch = logging.StreamHandler()
            ch.setLevel(logging.DEBUG)
            ch.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
            self.logger.addHandler(ch)
        
        # Log version when logger is initialized
        self.logger.info(f"=== MMS Batch Uploader v{VERSION} Started ===")
        self.logger.info(f"Hostname: {self.hostname}")
    
    def _print_colored(self, message: str, color: str = Colors.WHITE):
        """Print colored output to terminal"""
        print(f"{color}{message}{Colors.RESET}")
    
    def _format_size(self, size_bytes: float) -> str:
        """Format bytes to human-readable size"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.2f} TB"
    
    def ping(self) -> bool:
        """Test server connectivity with detailed client info"""
        # Show current timestamp
        from datetime import datetime
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        self._print_colored(f"\n{'='*70}", Colors.CYAN)
        self._print_colored(f"  MMS Batch Uploader v{VERSION}", Colors.CYAN)
        self._print_colored(f"  Server Ping - {current_time}", Colors.CYAN)
        self._print_colored(f"{'='*70}", Colors.CYAN)
        self._print_colored(f"Server: {self.url}", Colors.GRAY)
        
        # Log connection attempt
        self.logger.info(f"Attempting connection to {self.url}")
        self.logger.info(f"Client: {self.hostname}")
        self.logger.info(f"User-Agent: {self.user_agent}")
        if self.api_key:
            self.logger.info(f"API Key: {self.api_key[:20]}...")
        else:
            self.logger.info("API Key: Not provided")
        
        try:
            # Make request
            endpoint = f"{self.url}/api/uploader/ping"
            self.logger.debug(f"GET {endpoint}")
            start_time = time.time()
            
            response = requests.get(
                endpoint,
                headers=self.headers,
                timeout=10
            )
            
            elapsed = time.time() - start_time
            self.logger.info(f"Response received in {elapsed:.2f}s - Status: {response.status_code}")
            
            response.raise_for_status()
            data = response.json()
            
            # Store ping data for later checks
            self._last_ping_data = data
            
            # Log response details
            self.logger.info(f"Service status: {data.get('serviceStatus', 'Unknown')}")
            self.logger.info(f"Environment: {data.get('environment', 'Unknown')}")
            self.logger.info(f"Key status: {data.get('keyStatus', 'not_provided')}")
            self.logger.info(f"Auth method: {data.get('authMethod', 'Unknown')}")
            self.logger.info(f"Version: {data.get('version', 'Unknown')}")
            if data.get('keyUser'):
                self.logger.info(f"Key user: {data.get('keyUser')}")
            
            # Log host approval status
            host_approval = data.get('hostApproval')
            detected_hostname = data.get('hostname')
            if host_approval:
                self.logger.info(f"Host approval status: {host_approval}")
                self.logger.info(f"Detected hostname: {detected_hostname}")
            
            # Display to console
            self._print_colored("\nClient Information:", Colors.YELLOW)
            self._print_colored(f"  Hostname: {self.hostname}", Colors.WHITE)
            self._print_colored(f"  User-Agent: {self.user_agent}", Colors.GRAY)
            if self.api_key:
                self._print_colored(f"  API Key: {self.api_key[:20]}...", Colors.GRAY)
            else:
                self._print_colored(f"  API Key: Not provided", Colors.GRAY)
            
            # Display server info
            client_info = data.get('client', {})
            self._print_colored("\nServer Response:", Colors.YELLOW)
            self._print_colored(f"  Service Status: {data.get('serviceStatus', 'Unknown')}", 
                              Colors.GREEN if data.get('serviceStatus') == 'running' else Colors.RED)
            self._print_colored(f"  Environment: {data.get('environment', 'Unknown')}", Colors.GRAY)
            self._print_colored(f"  Version: {data.get('version', 'Unknown')}", Colors.GRAY)
            self._print_colored(f"  Server IP: {client_info.get('ip', 'Unknown')}", Colors.GRAY)
            
            # Key validation status
            key_status = data.get('keyStatus', 'not_provided')
            self._print_colored("\nAPI Key Validation:", Colors.YELLOW)
            if key_status == 'valid':
                self._print_colored(f"  Status: ✓ VALID", Colors.GREEN)
                self._print_colored(f"  Key User: {data.get('keyUser', 'Unknown')}", Colors.CYAN)
            elif key_status == 'invalid':
                self._print_colored(f"  Status: ✗ INVALID", Colors.RED)
                self._print_colored(f"  Issue: API key not recognized", Colors.RED)
            elif key_status == 'inactive':
                self._print_colored(f"  Status: ✗ INACTIVE", Colors.YELLOW)
                self._print_colored(f"  Issue: API key is disabled", Colors.YELLOW)
            elif key_status == 'not_provided':
                self._print_colored(f"  Status: Not provided", Colors.GRAY)
            elif key_status == 'session_auth':
                self._print_colored(f"  Status: Session authenticated", Colors.CYAN)
            
            # Host approval status
            host_approval = data.get('hostApproval')
            detected_hostname = data.get('hostname')
            
            if host_approval is not None:
                self._print_colored("\nHost Approval Status:", Colors.YELLOW)
                self._print_colored(f"  Hostname: {detected_hostname}", Colors.GRAY)
                
                if host_approval == 'approved':
                    self._print_colored(f"  Status: ✓ APPROVED", Colors.GREEN)
                    self._print_colored(f"  Access: Ready to upload files", Colors.GREEN)
                elif host_approval == 'pending':
                    self._print_colored(f"  Status: ⏳ PENDING", Colors.YELLOW)
                    self._print_colored(f"  Access: Awaiting administrator approval", Colors.YELLOW)
                    self._print_colored(f"  Action: Contact administrator to approve this host", Colors.CYAN)
                elif host_approval == 'denied':
                    self._print_colored(f"  Status: ✗ DENIED", Colors.RED)
                    self._print_colored(f"  Access: Upload blocked by administrator", Colors.RED)
                    self._print_colored(f"  Action: Contact administrator for access", Colors.CYAN)
                else:
                    self._print_colored(f"  Status: {host_approval}", Colors.GRAY)
            elif self.api_key:
                self._print_colored("\nHost Approval Status:", Colors.YELLOW)
                self._print_colored(f"  Status: Not registered yet", Colors.GRAY)
                self._print_colored(f"  Note: First connection will create approval request", Colors.GRAY)
            
            self._print_colored(f"\n  Response Time: {elapsed:.2f}s", Colors.GRAY)
            self._print_colored(f"  Message: {data.get('message', 'No message')}", Colors.GRAY)
            
            # Summary
            if key_status == 'valid':
                self._print_colored("\n✓ Connection successful! API key is valid and active.", Colors.GREEN)
            elif data.get('serviceStatus') == 'running':
                if key_status == 'invalid':
                    self._print_colored("\n⚠ Service is running but API key is INVALID.", Colors.YELLOW)
                elif key_status == 'inactive':
                    self._print_colored("\n⚠ Service is running but API key is INACTIVE.", Colors.YELLOW)
                else:
                    self._print_colored("\n✓ Service is running. (No API key provided)", Colors.YELLOW)
            
            self.logger.info("Ping successful")
            return True
            
        except requests.exceptions.HTTPError as e:
            self.logger.error(f"HTTP Error {e.response.status_code}: {e}")
            if e.response.status_code == 401:
                self._print_colored("\n✗ Authentication failed!", Colors.RED)
                self._print_colored("Please check your API key.", Colors.YELLOW)
                self.logger.error("Authentication failed - invalid API key")
            else:
                self._print_colored(f"\n✗ HTTP Error: {e.response.status_code}", Colors.RED)
                self._print_colored(str(e), Colors.RED)
            return False
            
        except requests.exceptions.ConnectionError as e:
            self.logger.error(f"Connection error: {e}")
            self._print_colored("\n✗ Connection failed!", Colors.RED)
            self._print_colored("Could not connect to the server. Check the URL.", Colors.YELLOW)
            return False
            
        except requests.exceptions.Timeout as e:
            self.logger.error(f"Timeout error: {e}")
            self._print_colored("\n✗ Connection timeout!", Colors.RED)
            self._print_colored("Server did not respond in time.", Colors.YELLOW)
            return False
            
        except Exception as e:
            self.logger.error(f"Unexpected error: {type(e).__name__} - {e}")
            self._print_colored(f"\n✗ Unexpected error: {type(e).__name__}", Colors.RED)
            self._print_colored(str(e), Colors.RED)
            return False
    
    def get_status(self) -> Optional[Dict[str, Any]]:
        """Get upload queue status"""
        self._print_colored(f"\n=== MMS Batch Uploader v{VERSION} - Queue Status ===", Colors.CYAN)
        self.logger.info("Requesting batch status")
        try:
            endpoint = f"{self.url}/api/uploader/batch-status"
            self.logger.debug(f"GET {endpoint}")
            
            response = requests.get(
                endpoint,
                headers=self.headers,
                timeout=10
            )
            
            self.logger.info(f"Status response: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            
            self.logger.debug(f"Queue data: {json.dumps(data, indent=2)}")
            
            self._print_colored("\n=== Upload Queue Status ===", Colors.CYAN)
            self._print_colored(f"Server: {self.url}", Colors.GRAY)
            
            queue = data.get('queue', {})
            self._print_colored("\nQueue Metrics:", Colors.GRAY)
            self._print_colored(f"  Active: {queue.get('active', 0)}", Colors.WHITE)
            self._print_colored(f"  Waiting: {queue.get('waiting', 0)}", Colors.WHITE)
            self._print_colored(f"  Completed: {queue.get('completed', 0)}", Colors.WHITE)
            self._print_colored(f"  Failed: {queue.get('failed', 0)}", Colors.RED if queue.get('failed', 0) > 0 else Colors.WHITE)
            
            self._print_colored("\nCapacity:", Colors.GRAY)
            self._print_colored(f"  Max Concurrent: {data.get('maxConcurrent', 'Unknown')}", Colors.WHITE)
            self._print_colored(f"  Is Busy: {data.get('isBusy', False)}", Colors.YELLOW if data.get('isBusy') else Colors.GREEN)
            
            return data
            
        except requests.exceptions.HTTPError as e:
            self.logger.error(f"HTTP error getting status: {e}")
            if e.response.status_code == 401:
                self._print_colored("\n✗ Authentication failed!", Colors.RED)
            else:
                self._print_colored(f"\n✗ Failed to get batch status (HTTP {e.response.status_code})", Colors.RED)
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting status: {e}")
            self._print_colored(f"\n✗ Error getting status: {str(e)}", Colors.RED)
            return None
    
    def _start_upload_session(self, filename: str, file_size: int) -> Optional[str]:
        """Start an upload session and return upload ID"""
        try:
            response = requests.post(
                f"{self.url}/api/uploader/start",
                headers=self.headers,
                json={"filename": filename, "fileSize": file_size},
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            return data.get('id')
            
        except Exception as e:
            self._print_colored(f"  ✗ Failed to start upload session: {str(e)}", Colors.RED)
            return None
    
    def _upload_file_content(self, upload_id: str, file_path: Path) -> bool:
        """Upload file content (non-chunked)"""
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (file_path.name, f, 'application/octet-stream')}
                response = requests.post(
                    f"{self.url}/api/uploader/{upload_id}/upload",
                    headers=self.headers,
                    files=files,
                    timeout=300
                )
                response.raise_for_status()
            return True
            
        except Exception as e:
            self._print_colored(f"  ✗ Upload failed: {str(e)}", Colors.RED)
            return False
    
    def _upload_file_chunk(self, upload_id: str, chunk_data: bytes,
                          chunk_index: int, total_chunks: int) -> bool:
        """Upload a single file chunk"""
        try:
            files = {
                'chunk': ('chunk', chunk_data, 'application/octet-stream')
            }
            data = {
                'chunkIndex': str(chunk_index),
                'totalChunks': str(total_chunks)
            }
            
            response = requests.post(
                f"{self.url}/api/uploader/{upload_id}/upload-chunk",
                headers=self.headers,
                files=files,
                data=data,
                timeout=300
            )
            response.raise_for_status()
            return True
            
        except Exception as e:
            self._print_colored(f"  ✗ Chunk {chunk_index + 1} failed: {str(e)}", Colors.RED)
            return False
    
    def _upload_file(self, file_path: Path, retry_count: int = 0) -> bool:
        """Upload a single file with automatic chunking"""
        file_size = file_path.stat().st_size
        filename = file_path.name
        
        self._print_colored(f"\nUploading: {filename} - {self._format_size(file_size)}", Colors.CYAN)
        
        try:
            # Start upload session
            self._print_colored("  Creating upload session...", Colors.GRAY)
            upload_id = self._start_upload_session(filename, file_size)
            if not upload_id:
                return False
            
            self._print_colored(f"  Upload ID: {upload_id}", Colors.GRAY)
            
            # Determine if chunking is needed
            if file_size > CHUNK_SIZE:
                # Chunked upload
                total_chunks = (file_size + CHUNK_SIZE - 1) // CHUNK_SIZE
                self._print_colored(f"  Using chunked upload - {total_chunks} chunks", Colors.YELLOW)
                
                with open(file_path, 'rb') as f:
                    for i in range(total_chunks):
                        chunk_data = f.read(CHUNK_SIZE)
                        self._print_colored(f"    Uploading chunk {i + 1}/{total_chunks}...", Colors.GRAY)
                        
                        if not self._upload_file_chunk(upload_id, chunk_data, i, total_chunks):
                            raise Exception(f"Chunk {i + 1} upload failed")
            else:
                # Single upload
                self._print_colored("  Uploading file content...", Colors.GRAY)
                if not self._upload_file_content(upload_id, file_path):
                    raise Exception("File upload failed")
            
            self._print_colored(f"  ✓ {filename} uploaded successfully", Colors.GREEN)
            return True
            
        except Exception as e:
            if retry_count < MAX_RETRIES:
                self._print_colored(f"  ⚠ Retrying ({retry_count + 1}/{MAX_RETRIES})...", Colors.YELLOW)
                time.sleep(2 ** retry_count)  # Exponential backoff
                return self._upload_file(file_path, retry_count + 1)
            else:
                self._print_colored(f"  ✗ Failed after {MAX_RETRIES} retries: {str(e)}", Colors.RED)
                return False
    
    def upload_batch(self) -> Dict[str, Any]:
        """Upload files in batches"""
        self._print_colored(f"\n=== MMS Batch Uploader v{VERSION} - Batch Upload ===", Colors.CYAN)
        if not self.folder:
            self._print_colored("Error: No folder specified for upload", Colors.RED)
            return {"total": 0, "successful": 0, "failed": 0, "uploads": []}
        
        folder_path = Path(self.folder)
        if not folder_path.exists():
            self._print_colored(f"Error: Folder not found: {self.folder}", Colors.RED)
            return {"total": 0, "successful": 0, "failed": 0, "uploads": []}
        
        # Find all files
        files = [f for f in folder_path.iterdir() if f.is_file()]
        
        if not files:
            self._print_colored("\nNo files found to upload.", Colors.YELLOW)
            return {"total": 0, "successful": 0, "failed": 0, "uploads": []}
        
        # Display header
        self._print_colored("\n" + "═" * 61, Colors.CYAN)
        self._print_colored("  BATCH UPLOAD", Colors.CYAN)
        self._print_colored("═" * 61, Colors.CYAN)
        
        self._print_colored("\nConfiguration:", Colors.YELLOW)
        self._print_colored(f"  Server: {self.url}", Colors.WHITE)
        self._print_colored(f"  Folder: {self.folder}", Colors.WHITE)
        self._print_colored(f"  Batch Size: {self.batch_size}", Colors.WHITE)
        self._print_colored(f"  Polling Interval: {self.polling_interval}s", Colors.WHITE)
        
        # Test connection and check host approval
        self._print_colored("\nTesting connection...", Colors.YELLOW)
        ping_result = self.ping()
        if not ping_result:
            self._print_colored("\nConnection test failed. Aborting upload.", Colors.RED)
            return {"total": 0, "successful": 0, "failed": 0, "uploads": []}
        
        # Check host approval status (if using API key)
        if self.api_key and hasattr(self, '_last_ping_data'):
            host_approval = self._last_ping_data.get('hostApproval')
            if host_approval == 'pending':
                self._print_colored("\n✗ Upload blocked: Host approval is PENDING", Colors.RED)
                self._print_colored("Your hostname + API key combination is awaiting administrator approval.", Colors.YELLOW)
                self._print_colored("Contact your administrator to approve this host for uploads.", Colors.CYAN)
                return {"total": 0, "successful": 0, "failed": 0, "uploads": []}
            elif host_approval == 'denied':
                self._print_colored("\n✗ Upload blocked: Host approval is DENIED", Colors.RED)
                self._print_colored("Your hostname + API key combination has been denied access.", Colors.YELLOW)
                self._print_colored("Contact your administrator for access approval.", Colors.CYAN)
                return {"total": 0, "successful": 0, "failed": 0, "uploads": []}
            elif host_approval == 'approved':
                self._print_colored("\n✓ Host approval verified: Upload authorized", Colors.GREEN)
        
        self._print_colored(f"\nFound {len(files)} file(s) to upload", Colors.GREEN)
        
        # Process files in batches
        results = {
            "total": len(files),
            "successful": 0,
            "failed": 0,
            "uploads": []
        }
        
        for i in range(0, len(files), self.batch_size):
            batch = files[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            total_batches = (len(files) + self.batch_size - 1) // self.batch_size
            
            self._print_colored(f"\n{'═' * 61}", Colors.MAGENTA)
            self._print_colored(f"  BATCH {batch_num}/{total_batches}", Colors.MAGENTA)
            self._print_colored(f"{'═' * 61}", Colors.MAGENTA)
            
            # Check if system is ready (except for first batch)
            if i > 0:
                self._print_colored("\nWaiting for system to be ready...", Colors.YELLOW)
                while True:
                    status = self.get_status()
                    if status and not status.get('isBusy', False):
                        self._print_colored("System ready, proceeding...", Colors.GREEN)
                        break
                    self._print_colored(f"System busy, waiting {self.polling_interval}s...", Colors.YELLOW)
                    time.sleep(self.polling_interval)
            
            # Upload batch
            for file_path in batch:
                success = self._upload_file(file_path)
                results["uploads"].append({
                    "fileName": file_path.name,
                    "success": success,
                    "error": None if success else "Upload failed"
                })
                
                if success:
                    results["successful"] += 1
                else:
                    results["failed"] += 1
        
        # Display summary
        self._print_colored("\n" + "═" * 61, Colors.CYAN)
        self._print_colored("  UPLOAD SUMMARY", Colors.CYAN)
        self._print_colored("═" * 61, Colors.CYAN)
        
        self._print_colored(f"\nTotal Files: {results['total']}", Colors.WHITE)
        self._print_colored(f"Successful: {results['successful']}", Colors.GREEN)
        self._print_colored(f"Failed: {results['failed']}", Colors.RED if results['failed'] > 0 else Colors.WHITE)
        
        if results['failed'] > 0:
            self._print_colored("\nFailed Uploads:", Colors.RED)
            for upload in results['uploads']:
                if not upload['success']:
                    self._print_colored(f"  - {upload['fileName']}: {upload['error']}", Colors.RED)
        
        # Save report
        report_path = Path(self.folder) / f"upload-report_{int(time.time())}.json"
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2)
        self._print_colored(f"\nReport saved to: {report_path}", Colors.GRAY)
        
        return results


def load_config(config_path: str) -> Optional[Dict[str, Any]]:
    """Load configuration from JSON file"""
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"{Colors.RED}Error: Config file not found: {config_path}{Colors.RESET}")
        return None
    except json.JSONDecodeError as e:
        print(f"{Colors.RED}Error: Invalid JSON in config file: {str(e)}{Colors.RESET}")
        return None


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description="MMS Batch File Uploader - Automated file upload with API key authentication",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --url https://myapp.replit.dev --key xxxxx --ping
  %(prog)s --url https://myapp.replit.dev --key xxxxx --status
  %(prog)s --url https://myapp.replit.dev --key xxxxx --folder /path/to/files --upload
  %(prog)s --config config.json --upload

Configuration File (config.json):
  {
    "url": "https://myapp.replit.dev",
    "key": "mms_your_api_key_here",
    "folder": "/path/to/upload/folder",
    "batchSize": 5,
    "pollingInterval": 10
  }
        """
    )
    
    # Configuration
    parser.add_argument('--config', type=str, help='Path to config file (JSON)')
    parser.add_argument('--url', type=str, help='MMS server URL')
    parser.add_argument('--key', type=str, help='API key for authentication')
    parser.add_argument('--folder', type=str, help='Directory containing files to upload')
    parser.add_argument('--batch-size', type=int, help='Number of files per batch (default: 5)')
    parser.add_argument('--polling-interval', type=int, help='Polling interval in seconds (default: 10)')
    
    # Actions
    parser.add_argument('--ping', action='store_true', help='Test server connectivity')
    parser.add_argument('--status', action='store_true', help='Check upload queue status')
    parser.add_argument('--upload', action='store_true', help='Start batch upload')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    parser.add_argument('--version', action='version', version=f'%(prog)s {VERSION}')
    
    args = parser.parse_args()
    
    # Load config file if specified
    config = {}
    if args.config:
        loaded_config = load_config(args.config)
        if loaded_config is None:
            sys.exit(1)
        config = loaded_config
    
    # Override config with command-line arguments
    url = args.url or config.get('url')
    api_key = args.key or config.get('key')
    folder = args.folder or config.get('folder')
    batch_size = args.batch_size or config.get('batchSize', DEFAULT_BATCH_SIZE)
    polling_interval = args.polling_interval or config.get('pollingInterval', DEFAULT_POLLING_INTERVAL)
    
    # Validate required parameters
    if not url:
        print(f"{Colors.RED}Error: --url or config file with 'url' is required{Colors.RESET}")
        parser.print_help()
        sys.exit(1)
    
    # API key is only required for upload and status, not for ping
    if not api_key and (args.status or args.upload):
        print(f"{Colors.RED}Error: --key or config file with 'key' is required for --status and --upload{Colors.RESET}")
        parser.print_help()
        sys.exit(1)
    
    # Determine action
    if not (args.ping or args.status or args.upload):
        print(f"{Colors.YELLOW}No action specified. Use --ping, --status, or --upload{Colors.RESET}")
        parser.print_help()
        sys.exit(1)
    
    # Create uploader instance
    uploader = MMSUploader(
        url=url,
        api_key=api_key,
        folder=folder,
        batch_size=batch_size,
        polling_interval=polling_interval,
        verbose=args.verbose
    )
    
    # Log startup
    uploader.logger.info("=" * 60)
    uploader.logger.info(f"MMS Batch Uploader v{VERSION} Started")
    uploader.logger.info(f"Server: {url}")
    uploader.logger.info(f"Hostname: {uploader.hostname}")
    uploader.logger.info(f"Log file: {LOG_FILE}")
    uploader.logger.info("=" * 60)
    
    # Execute action
    if args.ping:
        success = uploader.ping()
        sys.exit(0 if success else 1)
    
    elif args.status:
        status = uploader.get_status()
        sys.exit(0 if status else 1)
    
    elif args.upload:
        if not folder:
            print(f"{Colors.RED}Error: --folder or config file with 'folder' is required for upload{Colors.RESET}")
            sys.exit(1)
        results = uploader.upload_batch()
        sys.exit(0 if results['failed'] == 0 else 1)


if __name__ == "__main__":
    main()
