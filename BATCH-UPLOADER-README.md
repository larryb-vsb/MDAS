# MMS Batch File Uploader

**Python and PowerShell-based batch file uploader** for the Merchant Management System (MMS). Uploads files in batches with automatic chunking for large files, queue status monitoring, and API key authentication.

## Features

- ✅ **API Key Authentication** - Secure API key-based authentication
- ✅ **Batch Upload** - Uploads files in configurable batches (default: 5 files)
- ✅ **Automatic Chunking** - Handles large files (>25MB) with automatic chunking
- ✅ **Queue Management** - Polls server status and waits for capacity
- ✅ **Retry Logic** - Automatic retry on failure (up to 3 retries)
- ✅ **Progress Tracking** - Real-time upload progress and status
- ✅ **Connectivity Testing** - Ping and status check commands
- ✅ **Upload Reports** - Generates JSON reports for each batch upload session
- ✅ **Flexible Configuration** - Command-line parameters or config file
- ✅ **Cross-Platform** - Python version works on Windows, Mac, and Linux

## Which Version Should I Use?

- **Python (`batch-uploader.py`)** - **RECOMMENDED**
  - ✅ More reliable and tested
  - ✅ Cross-platform (Windows, Mac, Linux)
  - ✅ Better error messages
  - ✅ Easier to test and debug
  
- **PowerShell (`batch-uploader.ps1`)** - Windows Only
  - ⚠️ Windows PowerShell only
  - ⚠️ May have compatibility issues

## Prerequisites

### Python Version (Recommended)
- Python 3.7 or higher
- `requests` library (install via `pip install requests`)
- Active MMS API key (generated from TDDF API Data page)
- Network access to your MMS instance

### PowerShell Version
- Windows PowerShell 5.1 or PowerShell 7+
- Active MMS API key (generated from TDDF API Data page)
- Network access to your MMS instance

## Quick Start (Python - Recommended)

### 1. Install Python Dependencies

```bash
pip install requests
```

### 2. Get Your API Key

1. Log in to MMS web interface
2. Navigate to **TDDF API Data** page
3. Click on **API Keys** tab
4. Click **Create API Key**
5. Enter a key name (e.g., "PowerShell Batch Uploader")
6. Set permissions to include upload access
7. **IMPORTANT:** Copy the API key from the green success card that appears
   - The key starts with `mms_` and is 40+ characters long (e.g., `mms_1762317589477_rd27o6dv8x`)
   - Click the copy button next to the key
   - **DO NOT use "undefined"** - if you see this, the key wasn't copied correctly
   - Save it securely - it won't be shown again!

### 3. Test Connection

**Python:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --key mms_xxxxx --ping
```

**PowerShell:**
```powershell
.\batch-uploader.ps1 -Url https://your-app.replit.dev -Key mms_xxxxx -Ping
```

Expected output:
```
=== MMS Server Ping ===
Server: https://your-app.replit.dev

Status: OK
Environment: development
Message: MMS Batch Uploader API is operational

✓ Connection successful!
```

### 4. Check Queue Status

**Python:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --key mms_xxxxx --status
```

**PowerShell:**
```powershell
.\batch-uploader.ps1 -Url https://your-app.replit.dev -Key mms_xxxxx -Status
```

Expected output:
```
=== Upload Queue Status ===
Server: https://your-app.replit.dev

Queue Metrics:
  Active: 2
  Waiting: 1
  Completed: 45
  Failed: 0

Capacity:
  Max Concurrent: 10
  Is Busy: False
```

### 5. Upload Files

**Python:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --key mms_xxxxx --folder /path/to/files --upload
```

**PowerShell:**
```powershell
.\batch-uploader.ps1 -Url https://your-app.replit.dev -Folder C:\support\upload -Key mms_xxxxx -Upload
```

## Usage Options

### Python - Command-Line Parameters (Recommended)

**Ping Server:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --key mms_xxxxx --ping
```

**Check Status:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --key mms_xxxxx --status
```

**Upload Files:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --folder /path/to/files --key mms_xxxxx --upload
```

**Custom Batch Size:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --folder /path/to/files --key mms_xxxxx --batch-size 10 --upload
```

**Custom Polling Interval:**
```bash
python batch-uploader.py --url https://your-app.replit.dev --folder /path/to/files --key mms_xxxxx --polling-interval 5 --upload
```

### Python - Config File (Optional)

For repeated use, create a config file:

**uploader-config.json:**
```json
{
  "url": "https://your-app.replit.dev",
  "key": "mms_your_api_key_here",
  "folder": "/path/to/upload/folder",
  "batchSize": 5,
  "pollingInterval": 10
}
```

Run commands using config file:

```bash
python batch-uploader.py --config uploader-config.json --ping
python batch-uploader.py --config uploader-config.json --status
python batch-uploader.py --config uploader-config.json --upload
```

**Note:** Command-line parameters override config file values:

```bash
# Use config but override the folder
python batch-uploader.py --config uploader-config.json --folder /different/path --upload
```

### Python - Command-Line Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--url` | Conditional | MMS server URL (required unless using --config) |
| `--key` | Conditional | API key (required unless using --config) |
| `--folder` | Conditional | Upload directory (required for --upload mode) |
| `--ping` | Mode | Test server connectivity |
| `--status` | Mode | Check upload queue status |
| `--upload` | Mode | Start batch upload |
| `--config` | Optional | Config file path (CLI params override config) |
| `--batch-size` | Optional | Files per batch (default: 5) |
| `--polling-interval` | Optional | Polling interval in seconds (default: 10) |

### PowerShell - Command-Line Parameters

**Ping Server:**
```powershell
.\batch-uploader.ps1 -Url https://your-app.replit.dev -Key mms_xxxxx -Ping
```

**Check Status:**
```powershell
.\batch-uploader.ps1 -Url https://your-app.replit.dev -Key mms_xxxxx -Status
```

**Upload Files:**
```powershell
.\batch-uploader.ps1 -Url https://your-app.replit.dev -Folder C:\support\\upload -Key mms_xxxxx -Upload
``

## Upload Process

The script follows this workflow:

1. **Scan Directory** - Finds all uploadable files (.csv, .tsv, .json, .txt, .TSYSO)
2. **Test Connection** - Verifies server connectivity
3. **Batch Processing** - For each batch of 5 files:
   - Check server queue status
   - Wait if system is busy
   - Upload files (with chunking for large files)
   - Track success/failure
4. **Generate Report** - Creates JSON report with upload results

### Supported File Types

- `.csv` - CSV files
- `.tsv` - TSV files  
- `.json` - JSON files
- `.txt` - Text files
- `.TSYSO` / `.tsyso` - TDDF files

### Large File Handling

Files larger than 25MB are automatically uploaded in chunks:

```
Uploading: large-file.TSYSO (128.45 MB)
  Creating upload session...
  Upload ID: uploader_1730800815123_abc123def
  Using chunked upload (6 chunks)
    Uploading chunk 1/6...
    Uploading chunk 2/6...
    ...
  ✓ Upload complete
```

## Example Output

```
╔═══════════════════════════════════════════════════════════╗
║         MMS BATCH FILE UPLOADER                           ║
╚═══════════════════════════════════════════════════════════╝

Configuration:
  Server: https://your-app.replit.app
  Directory: C:\TDDF_Files
  Batch Size: 5
  Polling Interval: 10 seconds

Testing connection...
✓ Connection successful!

Found 23 file(s) to upload

╔═══════════════════════════════════════════════════════════╗
║  BATCH 1 / 5 (5 file(s))
╚═══════════════════════════════════════════════════════════╝

Uploading: file1.TSYSO (12.3 MB)
  Creating upload session...
  Upload ID: uploader_1730800815123_abc123
  Uploading file content...
  ✓ Upload complete

Uploading: file2.csv (0.45 MB)
  Creating upload session...
  Upload ID: uploader_1730800816234_def456
  Uploading file content...
  ✓ Upload complete

...

╔═══════════════════════════════════════════════════════════╗
║  UPLOAD SUMMARY                                           ║
╚═══════════════════════════════════════════════════════════╝

Total Files: 23
Successful: 23
Failed: 0

Report saved to: C:\TDDF_Files\upload-report_20251105083015.json
```

## Troubleshooting

### Connection Failed

```
✗ Connection failed!
```

**Solutions:**
- Verify `serverUrl` in config.json
- Check internet connectivity
- Ensure API key is valid and active

### Authentication Error

```
API request failed: Authentication required (session or API key)
```

**Solutions:**
- Verify `apiKey` in config.json
- Check that API key is active in MMS (TDDF API Keys tab)
- Ensure API key has upload permissions

### Upload Failed

```
✗ Upload failed after 3 retries
```

**Solutions:**
- Check file permissions
- Verify file is not locked by another process
- Check available disk space on server
- Review server logs for detailed error

### Timeout Waiting for Ready

```
Timeout waiting for system to be ready after 30 minutes
```

**Solutions:**
- Server may be processing a large backlog
- Increase `pollingInterval` in config.json
- Check with system administrator about queue status

## Advanced Usage

### Custom Configuration File

Use multiple config files for different environments:

```powershell
# Development
.\batch-uploader.ps1 -Mode upload -ConfigFile "config-dev.json"

# Production
.\batch-uploader.ps1 -Mode upload -ConfigFile "config-prod.json"
```

### Scheduled Uploads

Create a Windows Task Scheduler task to run uploads automatically:

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., Daily at 2:00 AM)
4. Action: Start a program
5. Program: `powershell.exe`
6. Arguments: `-ExecutionPolicy Bypass -File "C:\path\to\batch-uploader.ps1" -Mode upload`

### Monitoring Upload Reports

Upload reports are saved as JSON files:

```json
{
  "Total": 23,
  "Successful": 23,
  "Failed": 0,
  "Uploads": [
    {
      "Success": true,
      "FileName": "file1.TSYSO",
      "FileSize": 12902400,
      "UploadId": "uploader_1730800815123_abc123"
    }
  ]
}
```

Parse reports with PowerShell:

```powershell
$report = Get-Content "upload-report_20251105083015.json" | ConvertFrom-Json
$report.Uploads | Where-Object { -not $_.Success }
```

## Security Best Practices

1. **Protect API Keys**
   - Never commit config.json with real API keys to version control
   - Add config.json to .gitignore
   - Use environment-specific config files

2. **File Permissions**
   - Store config.json with restricted permissions
   - Limit read access to administrators only

3. **API Key Rotation**
   - Rotate API keys periodically
   - Revoke unused or compromised keys immediately
   - Monitor API key usage in MMS (API Keys tab)

## Support

For issues or questions:
- Check server logs in MMS
- Review upload reports for error details
- Contact system administrator

## Version History

- **1.0.0** (2025-11-05)
  - Initial release
  - Ping, status, and batch upload modes
  - Automatic chunking for large files
  - Queue monitoring and retry logic
