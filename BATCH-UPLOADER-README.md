# MMS Batch File Uploader

PowerShell-based batch file uploader for the Merchant Management System (MMS). Uploads files in batches of 5 with automatic chunking for large files, queue status monitoring, and API key authentication.

## Features

- ✅ **API Key Authentication** - Secure API key-based authentication
- ✅ **Batch Upload** - Uploads files in configurable batches (default: 5 files)
- ✅ **Automatic Chunking** - Handles large files (>25MB) with automatic chunking
- ✅ **Queue Management** - Polls server status and waits for capacity
- ✅ **Retry Logic** - Automatic retry on failure (configurable)
- ✅ **Progress Tracking** - Real-time upload progress and status
- ✅ **Connectivity Testing** - Ping and status check commands
- ✅ **Upload Reports** - Generates JSON reports for each batch upload session

## Prerequisites

- Windows PowerShell 5.1 or PowerShell 7+
- Active MMS API key (generated from TDDF API Data page)
- Network access to your MMS instance

## Quick Start

### 1. Get Your API Key

1. Log in to MMS web interface
2. Navigate to **TDDF API Data** page
3. Click on **API Keys** tab
4. Click **Create API Key**
5. Enter a key name (e.g., "PowerShell Batch Uploader")
6. Set permissions to include upload access
7. Copy the generated API key (save it securely - it won't be shown again)

### 2. Configure the Script

1. Copy `config.example.json` to `config.json`
2. Edit `config.json` with your settings:

```json
{
  "apiKey": "tddf_1234567890abcdef",
  "serverUrl": "https://your-app.replit.app",
  "uploadDirectory": "C:\\Users\\YourName\\Documents\\TDDF_Files",
  "batchSize": 5,
  "pollingInterval": 10,
  "maxRetries": 3,
  "chunkSize": 26214400
}
```

**Configuration Options:**

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `apiKey` | Yes | - | Your MMS API key from TDDF API Keys tab |
| `serverUrl` | Yes | - | Your MMS server URL (without trailing slash) |
| `uploadDirectory` | Yes* | - | Directory containing files to upload (*required for upload mode) |
| `batchSize` | No | 5 | Number of files to upload per batch |
| `pollingInterval` | No | 10 | Seconds to wait between status checks |
| `maxRetries` | No | 3 | Number of retry attempts for failed uploads |
| `chunkSize` | No | 26214400 | Chunk size in bytes (25MB default) |

### 3. Test Connection

Test connectivity before uploading:

```powershell
.\batch-uploader.ps1 -Mode ping
```

Expected output:
```
=== MMS Server Ping ===
Server: https://your-app.replit.app

Status: OK
Version: 1.0.0
Environment: development
Auth Method: api_key
Message: MMS Batch Uploader API is operational
Timestamp: 2025-11-05T08:30:15.123Z

✓ Connection successful!
```

### 4. Check Queue Status

View current upload queue status:

```powershell
.\batch-uploader.ps1 -Mode status
```

Expected output:
```
=== Upload Queue Status ===
Ready for Upload: YES

Queue Metrics:
  Processing: 2
  Queued: 1
  Completed: 45
  Errors: 0
  Total (24h): 48

Capacity:
  Available: 7 / 10
  Timestamp: 2025-11-05T08:30:15.123Z
```

### 5. Upload Files

Start batch upload:

```powershell
.\batch-uploader.ps1 -Mode upload
```

Or use a custom config file:

```powershell
.\batch-uploader.ps1 -Mode upload -ConfigFile "C:\path\to\custom-config.json"
```

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
