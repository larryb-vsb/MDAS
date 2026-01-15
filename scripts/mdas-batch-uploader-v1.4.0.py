#!/usr/bin/env python3
"""
================================================================================
MDAS Batch File Uploader (Python)
Version: 1.4.0
Last Updated: January 15, 2026
Status: PRODUCTION READY - TESTED
================================================================================

Automated batch file uploader with API key authentication and folder management.
Supports config files, command-line parameters, and three actions:
  - ping: Test server connectivity (NO API key required)
  - status: Check upload queue status (requires API key)
  - upload: Batch upload files from inbox folder (requires API key)

Features:
  - Automatic folder structure (inbox/logs/processed)
  - Files uploaded from 'inbox' folder automatically
  - Successfully uploaded files moved to 'processed' folder
  - Duplicate filename handling (appends (1), (2), etc.)
  - Host approval status display with color coding
  - Detailed connection logging to logs/mdas-uploader.log
  - Client fingerprint tracking with hostname
  - Automatic retry with exponential backoff
  - JSON upload reports saved to logs folder
  - Timestamp display on ping
  - Verbose mode (-v flag)
  - Optional API key for ping (validates if provided)
  - Version display in output and logs
  - Server wake-up loop before uploads (authenticated pings until server responds)

v1.4.0 Changes:
  - Added instance lock file to prevent concurrent uploads
  - Added stale lock detection (30 minute timeout)
  - Added file claim system (.uploading extension during upload)
  - Fixed duplicate file creation issue when multiple instances run

Folder Structure:
  <folder>/
    ├── inbox/          Files to upload (scans this folder)
    ├── logs/           Log files and upload reports
    └── processed/      Successfully uploaded files moved here
"""

import argparse
import json
import os
import sys
import time
import socket
import logging
import shutil
import atexit
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
import requests

# Constants
VERSION = "1.4.0"
CHUNK_SIZE = 25 * 1024 * 1024  # 25MB
DEFAULT_BATCH_SIZE = 5
DEFAULT_POLLING_INTERVAL = 10
MAX_RETRIES = 3
MAX_WAKEUP_ATTEMPTS = 30
WAKEUP_INTERVAL = 5
INBOX_FOLDER = "inbox"
LOGS_FOLDER = "logs"
PROCESSED_FOLDER = "processed"
LOCK_FILE = "uploader.lock"
LOCK_STALE_MINUTES = 30  # Consider lock stale after 30 minutes
UPLOADING_EXTENSION = ".uploading"


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


class InstanceLock:
    """Manages instance lock file to prevent concurrent uploads"""
    
    def __init__(self, lock_path: Path, hostname: str, stale_minutes: int = LOCK_STALE_MINUTES):
        self.lock_path = lock_path
        self.hostname = hostname
        self.stale_minutes = stale_minutes
        self.acquired = False
        self.pid = os.getpid()
    
    def _read_lock_info(self) -> Optional[Dict[str, Any]]:
        """Read lock file contents"""
        try:
            if self.lock_path.exists():
                with open(self.lock_path, 'r') as f:
                    return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
        return None
    
    def _write_lock_info(self):
        """Write current process info to lock file"""
        lock_info = {
            'pid': self.pid,
            'hostname': self.hostname,
            'started_at': datetime.now().isoformat(),
            'timestamp': time.time()
        }
        with open(self.lock_path, 'w') as f:
            json.dump(lock_info, f, indent=2)
    
    def _is_lock_stale(self, lock_info: Dict[str, Any]) -> bool:
        """Check if lock is stale (older than stale_minutes)"""
        try:
            lock_time = lock_info.get('timestamp', 0)
            age_seconds = time.time() - lock_time
            age_minutes = age_seconds / 60
            return age_minutes > self.stale_minutes
        except (TypeError, ValueError):
            return True
    
    def _is_process_running(self, pid: int) -> bool:
        """Check if a process with given PID is still running (Unix only)"""
        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False
        except Exception:
            # On Windows, this check may not work - assume running
            return True
    
    def acquire(self) -> tuple[bool, Optional[str]]:
        """
        Try to acquire the instance lock.
        Returns: (success, error_message)
        """
        existing_lock = self._read_lock_info()
        
        if existing_lock:
            lock_pid = existing_lock.get('pid', 'unknown')
            lock_host = existing_lock.get('hostname', 'unknown')
            lock_started = existing_lock.get('started_at', 'unknown')
            
            # Check if lock is stale
            if self._is_lock_stale(existing_lock):
                # Lock is stale, override it
                print(f"{Colors.YELLOW}⚠ Found stale lock from PID {lock_pid} ({lock_host}), started {lock_started}{Colors.RESET}")
                print(f"{Colors.YELLOW}  Lock is older than {self.stale_minutes} minutes, overriding...{Colors.RESET}")
            elif lock_host == self.hostname and isinstance(lock_pid, int):
                # Same host, check if process is still running
                if not self._is_process_running(lock_pid):
                    print(f"{Colors.YELLOW}⚠ Found orphaned lock from dead process (PID {lock_pid}){Colors.RESET}")
                    print(f"{Colors.YELLOW}  Process no longer running, overriding...{Colors.RESET}")
                else:
                    error = f"Another uploader instance is already running (PID {lock_pid}, started {lock_started})"
                    return False, error
            else:
                # Different host or can't check process
                error = f"Another uploader instance is running on {lock_host} (PID {lock_pid}, started {lock_started})"
                return False, error
        
        # Acquire the lock
        try:
            self._write_lock_info()
            self.acquired = True
            return True, None
        except IOError as e:
            return False, f"Failed to create lock file: {e}"
    
    def release(self):
        """Release the lock file"""
        if self.acquired and self.lock_path.exists():
            try:
                # Only remove if we own it
                lock_info = self._read_lock_info()
                if lock_info and lock_info.get('pid') == self.pid:
                    self.lock_path.unlink()
                    self.acquired = False
            except IOError:
                pass


class MDASUploader:
    """MDAS Batch File Uploader with Folder Management"""
    
    def __init__(self, url: str, api_key: Optional[str] = None, folder: Optional[str] = None,
                 batch_size: int = DEFAULT_BATCH_SIZE,
                 polling_interval: int = DEFAULT_POLLING_INTERVAL,
                 verbose: bool = False):
        self.url = url.rstrip('/')
        self.api_key = api_key
        self.base_folder = Path(folder) if folder else Path.cwd()
        self.batch_size = batch_size
        self.polling_interval = polling_interval
        self.verbose = verbose
        self.headers = {}
        if api_key:
            self.headers["X-API-Key"] = api_key
        self.hostname = socket.gethostname()
        self.user_agent = f"MDAS-BatchUploader/{VERSION} (Python; {self.hostname})"
        self.headers["User-Agent"] = self.user_agent
        
        # Instance lock
        self.instance_lock: Optional[InstanceLock] = None
        
        # Setup folder structure
        self._ensure_folder_structure()
        
        # Setup logging (after folder structure is created)
        self._setup_logging()
    
    def _ensure_folder_structure(self):
        """Create inbox, logs, and processed folders if they don't exist"""
        self.inbox_folder = self.base_folder / INBOX_FOLDER
        self.logs_folder = self.base_folder / LOGS_FOLDER
        self.processed_folder = self.base_folder / PROCESSED_FOLDER
        
        # Create folders if they don't exist
        for folder_path, folder_name in [
            (self.inbox_folder, "inbox"),
            (self.logs_folder, "logs"),
            (self.processed_folder, "processed")
        ]:
            if not folder_path.exists():
                folder_path.mkdir(parents=True, exist_ok=True)
                print(f"{Colors.GREEN}✓ Created folder: {folder_path}{Colors.RESET}")
    
    def _setup_logging(self):
        """Setup logging to logs folder"""
        log_file = self.logs_folder / "mdas-uploader.log"
        
        self.logger = logging.getLogger('MDAS-Uploader')
        self.logger.setLevel(logging.DEBUG if self.verbose else logging.INFO)
        
        # Clear existing handlers to prevent duplicate log entries
        if self.logger.hasHandlers():
            self.logger.handlers.clear()
        
        # File handler (logs to logs folder) with UTF-8 encoding
        fh = logging.FileHandler(log_file, encoding='utf-8')
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
        
        # Log version and folder structure when logger is initialized
        self.logger.info(f"=== MDAS Batch Uploader v{VERSION} Started ===")
        self.logger.info(f"Hostname: {self.hostname}")
        self.logger.info(f"Base folder: {self.base_folder}")
        self.logger.info(f"Inbox folder: {self.inbox_folder}")
        self.logger.info(f"Logs folder: {self.logs_folder}")
        self.logger.info(f"Processed folder: {self.processed_folder}")
    
    def _acquire_instance_lock(self) -> bool:
        """Acquire instance lock to prevent concurrent uploads"""
        lock_path = self.logs_folder / LOCK_FILE
        self.instance_lock = InstanceLock(lock_path, self.hostname)
        
        success, error = self.instance_lock.acquire()
        
        if not success:
            self._print_colored(f"\n{Colors.RED}✗ LOCK CONFLICT: {error}{Colors.RESET}", Colors.RED)
            self._print_colored(f"{Colors.YELLOW}  Only one uploader instance can run at a time.{Colors.RESET}", Colors.YELLOW)
            self._print_colored(f"{Colors.GRAY}  If the other instance crashed, wait {LOCK_STALE_MINUTES} minutes or delete:{Colors.RESET}", Colors.GRAY)
            self._print_colored(f"{Colors.GRAY}    {lock_path}{Colors.RESET}", Colors.GRAY)
            self.logger.error(f"Lock conflict: {error}")
            return False
        
        self.logger.info(f"Instance lock acquired (PID {os.getpid()})")
        self._print_colored(f"{Colors.GREEN}✓ Instance lock acquired{Colors.RESET}", Colors.GREEN)
        
        # Register cleanup on exit
        atexit.register(self._release_instance_lock)
        
        return True
    
    def _release_instance_lock(self):
        """Release instance lock on exit"""
        if self.instance_lock:
            self.instance_lock.release()
            self.logger.info("Instance lock released")
    
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
    
    def _claim_file(self, file_path: Path) -> Optional[Path]:
        """
        Claim a file for upload by renaming it with .uploading extension.
        Returns the new path if successful, None if file was already claimed or doesn't exist.
        """
        if not file_path.exists():
            self.logger.warning(f"File no longer exists (already processed?): {file_path.name}")
            return None
        
        claimed_path = file_path.with_suffix(file_path.suffix + UPLOADING_EXTENSION)
        
        try:
            # Atomic rename - will fail if file doesn't exist or is locked
            file_path.rename(claimed_path)
            self.logger.info(f"Claimed file: {file_path.name} → {claimed_path.name}")
            return claimed_path
        except (FileNotFoundError, PermissionError) as e:
            self.logger.warning(f"Could not claim file {file_path.name}: {e}")
            return None
    
    def _unclaim_file(self, claimed_path: Path) -> Path:
        """
        Remove the .uploading extension from a claimed file.
        Returns the original path.
        """
        original_name = claimed_path.name.replace(UPLOADING_EXTENSION, '')
        original_path = claimed_path.parent / original_name
        
        try:
            claimed_path.rename(original_path)
            return original_path
        except Exception as e:
            self.logger.error(f"Failed to unclaim file {claimed_path.name}: {e}")
            return claimed_path
    
    def _get_unique_filename(self, destination_folder: Path, filename: str) -> Path:
        """Get unique filename in destination folder by appending (1), (2), etc. if needed"""
        # Remove .uploading extension if present
        if filename.endswith(UPLOADING_EXTENSION):
            filename = filename[:-len(UPLOADING_EXTENSION)]
        
        base_path = destination_folder / filename
        
        if not base_path.exists():
            return base_path
        
        # File exists, find unique name
        name_stem = Path(filename).stem
        name_suffix = Path(filename).suffix
        counter = 1
        
        while True:
            new_filename = f"{name_stem} ({counter}){name_suffix}"
            new_path = destination_folder / new_filename
            if not new_path.exists():
                self.logger.info(f"Duplicate detected: {filename} → {new_filename}")
                return new_path
            counter += 1
    
    def _move_to_processed(self, file_path: Path) -> bool:
        """Move successfully uploaded file to processed folder"""
        try:
            # Get original filename (remove .uploading if present)
            original_name = file_path.name
            if original_name.endswith(UPLOADING_EXTENSION):
                original_name = original_name[:-len(UPLOADING_EXTENSION)]
            
            destination_path = self._get_unique_filename(self.processed_folder, original_name)
            shutil.move(str(file_path), str(destination_path))
            
            self.logger.info(f"Moved to processed: {original_name} → {destination_path.name}")
            self._print_colored(f"  ↳ Moved to processed: {destination_path.name}", Colors.GRAY)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to move {file_path.name} to processed: {e}")
            self._print_colored(f"  ⚠ Warning: Could not move file to processed: {str(e)}", Colors.YELLOW)
            return False
    
    def _wakeup_ping(self, silent: bool = False) -> bool:
        """Send a single authenticated ping to check if server is awake.
        Returns True if server responds with valid authentication."""
        try:
            endpoint = f"{self.url}/api/uploader/ping"
            start_time = time.time()
            
            response = requests.get(
                endpoint,
                headers=self.headers,
                timeout=15
            )
            
            elapsed = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                key_status = data.get('keyStatus', 'not_provided')
                service_status = data.get('serviceStatus', 'unknown')
                
                # Store ping data for later checks
                self._last_ping_data = data
                
                # Check if server is running AND API key is explicitly validated
                if service_status == 'running' and key_status == 'valid':
                    if not silent:
                        self.logger.info(f"Wake-up ping successful: {elapsed:.2f}s, API key validated")
                    return True
                elif service_status == 'running':
                    if not silent:
                        self.logger.info(f"Wake-up ping: server running, key status: {key_status} (waiting for 'valid')")
                    return False
            
            if not silent:
                self.logger.warning(f"Wake-up ping failed: HTTP {response.status_code}")
            return False
            
        except requests.exceptions.Timeout:
            if not silent:
                self.logger.warning("Wake-up ping timeout - server may be starting up")
            return False
        except requests.exceptions.ConnectionError:
            if not silent:
                self.logger.warning("Wake-up ping connection error - server may be starting up")
            return False
        except Exception as e:
            if not silent:
                self.logger.warning(f"Wake-up ping error: {type(e).__name__}")
            return False
    
    def _wakeup_server(self) -> bool:
        """Wake up the server by sending authenticated pings until it responds."""
        
        self._print_colored("\n" + "═" * 61, Colors.YELLOW)
        self._print_colored("  WAKING UP SERVER", Colors.YELLOW)
        self._print_colored("═" * 61, Colors.YELLOW)
        
        self._print_colored(f"\nServer: {self.url}", Colors.GRAY)
        self._print_colored(f"API Key: {self.api_key[:20]}..." if self.api_key else "API Key: Not provided", Colors.GRAY)
        self._print_colored(f"Max attempts: {MAX_WAKEUP_ATTEMPTS}", Colors.GRAY)
        self._print_colored(f"Retry interval: {WAKEUP_INTERVAL}s", Colors.GRAY)
        
        self.logger.info("Starting server wake-up sequence")
        self.logger.info(f"Max attempts: {MAX_WAKEUP_ATTEMPTS}, interval: {WAKEUP_INTERVAL}s")
        
        attempt = 0
        while attempt < MAX_WAKEUP_ATTEMPTS:
            attempt += 1
            current_time = datetime.now().strftime("%H:%M:%S")
            
            self._print_colored(f"\n  [{current_time}] Wake-up ping {attempt}/{MAX_WAKEUP_ATTEMPTS}...", Colors.CYAN)
            self.logger.info(f"Wake-up attempt {attempt}/{MAX_WAKEUP_ATTEMPTS}")
            
            if self._wakeup_ping():
                self._print_colored(f"  ✓ Server is AWAKE and authenticated!", Colors.GREEN)
                self.logger.info("Server wake-up successful - authenticated and ready")
                
                # Show confirmation details
                if hasattr(self, '_last_ping_data'):
                    data = self._last_ping_data
                    self._print_colored(f"\n  Service Status: {data.get('serviceStatus', 'Unknown')}", Colors.GREEN)
                    self._print_colored(f"  Environment: {data.get('environment', 'Unknown')}", Colors.GRAY)
                    self._print_colored(f"  API Key: ✓ VALID", Colors.GREEN)
                    if data.get('keyUser'):
                        self._print_colored(f"  Key User: {data.get('keyUser')}", Colors.CYAN)
                
                self._print_colored("\n" + "═" * 61, Colors.GREEN)
                self._print_colored("  SERVER READY - PROCEEDING WITH UPLOAD", Colors.GREEN)
                self._print_colored("═" * 61, Colors.GREEN)
                
                return True
            else:
                self._print_colored(f"  ⏳ Server not ready, waiting {WAKEUP_INTERVAL}s...", Colors.YELLOW)
                time.sleep(WAKEUP_INTERVAL)
        
        # Max attempts reached
        self._print_colored(f"\n{Colors.RED}✗ Server did not respond after {MAX_WAKEUP_ATTEMPTS} attempts{Colors.RESET}", Colors.RED)
        self.logger.error(f"Server wake-up failed after {MAX_WAKEUP_ATTEMPTS} attempts")
        return False
    
    def ping(self) -> bool:
        """Send ping to server to test connectivity"""
        self._print_colored("\n" + "═" * 61, Colors.CYAN)
        self._print_colored("  MDAS UPLOADER - PING TEST", Colors.CYAN)
        self._print_colored("═" * 61, Colors.CYAN)
        
        self._print_colored(f"\n  Version: {VERSION}", Colors.GRAY)
        self._print_colored(f"  Server: {self.url}", Colors.GRAY)
        self._print_colored(f"  Client: {self.hostname}", Colors.GRAY)
        self._print_colored(f"  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", Colors.GRAY)
        
        try:
            endpoint = f"{self.url}/api/uploader/ping"
            self._print_colored(f"\n  Connecting to: {endpoint}", Colors.GRAY)
            
            start_time = time.time()
            response = requests.get(
                endpoint,
                headers=self.headers,
                timeout=30
            )
            elapsed = time.time() - start_time
            
            self._print_colored(f"\n  Response Time: {elapsed:.2f}s", Colors.GRAY)
            self._print_colored(f"  HTTP Status: {response.status_code}", Colors.GRAY)
            
            if response.status_code == 200:
                data = response.json()
                
                self._print_colored("\n" + "═" * 61, Colors.GREEN)
                self._print_colored("  ✓ SERVER ONLINE", Colors.GREEN)
                self._print_colored("═" * 61, Colors.GREEN)
                
                self._print_colored(f"\n  Service Status: {data.get('serviceStatus', 'Unknown')}", Colors.GREEN)
                self._print_colored(f"  Environment: {data.get('environment', 'Unknown')}", Colors.GRAY)
                self._print_colored(f"  Server Time: {data.get('timestamp', 'Unknown')}", Colors.GRAY)
                
                # API Key status
                key_status = data.get('keyStatus', 'not_provided')
                if key_status == 'valid':
                    self._print_colored(f"\n  API Key: ✓ VALID", Colors.GREEN)
                    if data.get('keyUser'):
                        self._print_colored(f"  Key User: {data.get('keyUser')}", Colors.CYAN)
                elif key_status == 'invalid':
                    self._print_colored(f"\n  API Key: ✗ INVALID", Colors.RED)
                else:
                    self._print_colored(f"\n  API Key: Not provided (optional for ping)", Colors.GRAY)
                
                # Host status
                host_status = data.get('hostStatus', {})
                if host_status:
                    self._print_colored(f"\n  Host: {host_status.get('hostname', 'Unknown')}", Colors.GRAY)
                    is_approved = host_status.get('isApproved', False)
                    if is_approved:
                        self._print_colored(f"  Host Status: ✓ APPROVED", Colors.GREEN)
                    else:
                        self._print_colored(f"  Host Status: ⚠ PENDING APPROVAL", Colors.YELLOW)
                
                self.logger.info(f"Ping successful: {elapsed:.2f}s, status={data.get('serviceStatus')}")
                return True
            else:
                self._print_colored(f"\n{Colors.RED}✗ Server returned error: HTTP {response.status_code}{Colors.RESET}", Colors.RED)
                self.logger.error(f"Ping failed: HTTP {response.status_code}")
                return False
                
        except requests.exceptions.Timeout:
            self._print_colored(f"\n{Colors.RED}✗ Connection timed out{Colors.RESET}", Colors.RED)
            self.logger.error("Ping failed: timeout")
            return False
        except requests.exceptions.ConnectionError:
            self._print_colored(f"\n{Colors.RED}✗ Connection failed - server unreachable{Colors.RESET}", Colors.RED)
            self.logger.error("Ping failed: connection error")
            return False
        except Exception as e:
            self._print_colored(f"\n{Colors.RED}✗ Error: {str(e)}{Colors.RESET}", Colors.RED)
            self.logger.error(f"Ping failed: {e}")
            return False
    
    def get_status(self) -> Optional[Dict[str, Any]]:
        """Get upload queue status from server"""
        self._print_colored("\n" + "═" * 61, Colors.CYAN)
        self._print_colored("  MDAS UPLOADER - QUEUE STATUS", Colors.CYAN)
        self._print_colored("═" * 61, Colors.CYAN)
        
        try:
            endpoint = f"{self.url}/api/uploader/status"
            response = requests.get(
                endpoint,
                headers=self.headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                
                self._print_colored(f"\n  Pending: {data.get('pending', 0)}", Colors.YELLOW)
                self._print_colored(f"  Processing: {data.get('processing', 0)}", Colors.CYAN)
                self._print_colored(f"  Completed: {data.get('completed', 0)}", Colors.GREEN)
                self._print_colored(f"  Failed: {data.get('failed', 0)}", Colors.RED)
                
                self.logger.info(f"Status: pending={data.get('pending')}, processing={data.get('processing')}")
                return data
            else:
                self._print_colored(f"\n{Colors.RED}✗ Failed to get status: HTTP {response.status_code}{Colors.RESET}", Colors.RED)
                self.logger.error(f"Status failed: HTTP {response.status_code}")
                return None
                
        except Exception as e:
            self._print_colored(f"\n{Colors.RED}✗ Error: {str(e)}{Colors.RESET}", Colors.RED)
            self.logger.error(f"Status failed: {e}")
            return None
    
    def _upload_single_file(self, file_path: Path, file_index: int, total_files: int) -> bool:
        """Upload a single file with retry logic"""
        file_name = file_path.name
        # Remove .uploading extension for display
        display_name = file_name.replace(UPLOADING_EXTENSION, '') if file_name.endswith(UPLOADING_EXTENSION) else file_name
        file_size = file_path.stat().st_size
        
        self._print_colored(f"\n  [{file_index}/{total_files}] {display_name}", Colors.CYAN)
        self._print_colored(f"      Size: {self._format_size(file_size)}", Colors.GRAY)
        
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                endpoint = f"{self.url}/api/uploader/upload"
                
                with open(file_path, 'rb') as f:
                    # Use original filename (without .uploading) for the upload
                    files = {'file': (display_name, f, 'application/octet-stream')}
                    
                    start_time = time.time()
                    response = requests.post(
                        endpoint,
                        headers=self.headers,
                        files=files,
                        timeout=300  # 5 minute timeout for large files
                    )
                    elapsed = time.time() - start_time
                
                if response.status_code == 200:
                    data = response.json()
                    self._print_colored(f"      ✓ Uploaded in {elapsed:.2f}s", Colors.GREEN)
                    self.logger.info(f"Uploaded: {display_name} ({self._format_size(file_size)}) in {elapsed:.2f}s")
                    return True
                elif response.status_code == 409:
                    # Duplicate file - server already has it
                    self._print_colored(f"      ⚠ Already exists on server (skipped)", Colors.YELLOW)
                    self.logger.info(f"Duplicate skipped: {display_name}")
                    return True  # Count as success since file is on server
                else:
                    self._print_colored(f"      ✗ Failed: HTTP {response.status_code}", Colors.RED)
                    self.logger.warning(f"Upload failed: {display_name}, HTTP {response.status_code}, attempt {attempt}")
                    
            except requests.exceptions.Timeout:
                self._print_colored(f"      ✗ Timeout (attempt {attempt}/{MAX_RETRIES})", Colors.RED)
                self.logger.warning(f"Upload timeout: {display_name}, attempt {attempt}")
            except Exception as e:
                self._print_colored(f"      ✗ Error: {str(e)} (attempt {attempt}/{MAX_RETRIES})", Colors.RED)
                self.logger.warning(f"Upload error: {display_name}, {e}, attempt {attempt}")
            
            if attempt < MAX_RETRIES:
                wait_time = 2 ** attempt  # Exponential backoff
                self._print_colored(f"      Retrying in {wait_time}s...", Colors.YELLOW)
                time.sleep(wait_time)
        
        self.logger.error(f"Upload failed after {MAX_RETRIES} attempts: {display_name}")
        return False
    
    def upload_batch(self) -> Dict[str, Any]:
        """Upload all files from inbox folder"""
        
        self._print_colored("\n" + "═" * 61, Colors.CYAN)
        self._print_colored(f"  MDAS BATCH UPLOADER v{VERSION}", Colors.CYAN)
        self._print_colored("═" * 61, Colors.CYAN)
        
        # Acquire instance lock first
        if not self._acquire_instance_lock():
            return {'successful': 0, 'failed': 0, 'skipped': 0, 'error': 'Lock conflict'}
        
        # Scan inbox for files (exclude .uploading files - already being processed)
        files = [
            f for f in self.inbox_folder.iterdir() 
            if f.is_file() and not f.name.startswith('.') and not f.name.endswith(UPLOADING_EXTENSION)
        ]
        
        if not files:
            self._print_colored(f"\n  No files in inbox folder: {self.inbox_folder}", Colors.YELLOW)
            self.logger.info("No files in inbox folder to upload")
            return {'successful': 0, 'failed': 0, 'skipped': 0}
        
        self._print_colored(f"\n  Found {len(files)} file(s) in inbox", Colors.GREEN)
        self._print_colored(f"  Inbox: {self.inbox_folder}", Colors.GRAY)
        
        # Wake up server before starting uploads
        if not self._wakeup_server():
            self._print_colored(f"\n{Colors.RED}✗ Cannot proceed - server not responding{Colors.RESET}", Colors.RED)
            return {'successful': 0, 'failed': len(files), 'skipped': 0, 'error': 'Server unavailable'}
        
        # Process files
        results = {
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'files': []
        }
        
        self._print_colored(f"\n  Processing {len(files)} files...", Colors.CYAN)
        
        for i, file_path in enumerate(files, 1):
            original_name = file_path.name
            
            # Claim the file
            claimed_path = self._claim_file(file_path)
            if claimed_path is None:
                self._print_colored(f"\n  [{i}/{len(files)}] {original_name}", Colors.YELLOW)
                self._print_colored(f"      ⚠ Skipped (already being processed)", Colors.YELLOW)
                results['skipped'] += 1
                results['files'].append({'name': original_name, 'status': 'skipped'})
                continue
            
            # Upload the claimed file
            success = self._upload_single_file(claimed_path, i, len(files))
            
            if success:
                # Move to processed folder
                self._move_to_processed(claimed_path)
                results['successful'] += 1
                results['files'].append({'name': original_name, 'status': 'success'})
            else:
                # Unclaim the file so it can be retried later
                self._unclaim_file(claimed_path)
                results['failed'] += 1
                results['files'].append({'name': original_name, 'status': 'failed'})
        
        # Summary
        self._print_colored("\n" + "═" * 61, Colors.CYAN)
        self._print_colored("  UPLOAD SUMMARY", Colors.CYAN)
        self._print_colored("═" * 61, Colors.CYAN)
        
        self._print_colored(f"\n  ✓ Successful: {results['successful']}", Colors.GREEN)
        if results['skipped'] > 0:
            self._print_colored(f"  ⚠ Skipped: {results['skipped']}", Colors.YELLOW)
        if results['failed'] > 0:
            self._print_colored(f"  ✗ Failed: {results['failed']}", Colors.RED)
        
        # Save report
        report_file = self.logs_folder / f"upload-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
        with open(report_file, 'w') as f:
            json.dump(results, f, indent=2)
        self._print_colored(f"\n  Report saved: {report_file}", Colors.GRAY)
        
        self.logger.info(f"Upload complete: {results['successful']} successful, {results['failed']} failed, {results['skipped']} skipped")
        
        return results


def load_config(config_path: Path) -> Dict[str, Any]:
    """Load configuration from JSON file"""
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"{Colors.RED}Error loading config: {e}{Colors.RESET}")
        return {}


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description=f"MDAS Batch File Uploader v{VERSION}",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --ping --url https://mms.example.com
  %(prog)s --status --url https://mms.example.com --key YOUR_API_KEY
  %(prog)s --upload --config config.json
  %(prog)s --upload --url https://mms.example.com --key YOUR_API_KEY --folder /path/to/files
        """
    )
    
    # Actions
    action_group = parser.add_mutually_exclusive_group()
    action_group.add_argument('--ping', action='store_true', help='Test server connectivity')
    action_group.add_argument('--status', action='store_true', help='Check upload queue status')
    action_group.add_argument('--upload', action='store_true', help='Upload files from inbox folder')
    
    # Connection settings
    parser.add_argument('--url', type=str, help='Server URL')
    parser.add_argument('--key', type=str, help='API key')
    parser.add_argument('--folder', type=str, help='Base folder for inbox/logs/processed')
    
    # Config file
    parser.add_argument('--config', type=str, help='Path to JSON config file')
    
    # Options
    parser.add_argument('--batch-size', type=int, default=DEFAULT_BATCH_SIZE, help='Number of files per batch')
    parser.add_argument('--polling-interval', type=int, default=DEFAULT_POLLING_INTERVAL, help='Seconds between status checks')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    parser.add_argument('--version', action='version', version=f'MDAS Batch Uploader v{VERSION}')
    
    args = parser.parse_args()
    
    # Load config file if specified
    config = {}
    if args.config:
        config_path = Path(args.config)
        if config_path.exists():
            config = load_config(config_path)
        else:
            print(f"{Colors.RED}Config file not found: {args.config}{Colors.RESET}")
            sys.exit(1)
    
    # Merge command-line args with config (command-line takes precedence)
    url = args.url or config.get('url')
    api_key = args.key or config.get('key')
    folder = args.folder or config.get('folder')
    batch_size = args.batch_size if args.batch_size != DEFAULT_BATCH_SIZE else config.get('batch_size', DEFAULT_BATCH_SIZE)
    polling_interval = args.polling_interval if args.polling_interval != DEFAULT_POLLING_INTERVAL else config.get('polling_interval', DEFAULT_POLLING_INTERVAL)
    
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
    uploader = MDASUploader(
        url=url,
        api_key=api_key,
        folder=folder,
        batch_size=batch_size,
        polling_interval=polling_interval,
        verbose=args.verbose
    )
    
    # Log startup
    uploader.logger.info("=" * 60)
    uploader.logger.info(f"MDAS Batch Uploader v{VERSION} Started")
    uploader.logger.info(f"Server: {url}")
    uploader.logger.info(f"Hostname: {uploader.hostname}")
    uploader.logger.info(f"Log file: {uploader.logs_folder / 'mdas-uploader.log'}")
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
