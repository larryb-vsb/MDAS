<#
.SYNOPSIS
    MMS Batch File Uploader - Automated batch upload with API key authentication
.DESCRIPTION
    Uploads files from a directory to MMS in batches, with automatic chunking for large files
    Polls server for queue status between batches to avoid overwhelming the system
.PARAMETER Url
    MMS server URL (e.g., https://myapp.replit.dev)
.PARAMETER Key
    API key for authentication
.PARAMETER Folder
    Directory containing files to upload (required for -Upload mode)
.PARAMETER Ping
    Test server connectivity
.PARAMETER Status
    Check upload queue status
.PARAMETER Upload
    Start batch upload
.PARAMETER Config
    Optional config file path (command-line params override config values)
.PARAMETER BatchSize
    Number of files per batch (default: 5)
.PARAMETER Polling
    Polling interval in seconds (default: 10)
.EXAMPLE
    .\batch-uploader.ps1 -Url https://myapp.replit.dev -Key xxxxx -Ping
.EXAMPLE
    .\batch-uploader.ps1 -Url https://myapp.replit.dev -Key xxxxx -Status
.EXAMPLE
    .\batch-uploader.ps1 -Url https://myapp.replit.dev -Folder C:\support\upload -Key xxxxx -Upload
.EXAMPLE
    .\batch-uploader.ps1 -Config config.json -Upload
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Url,
    
    [Parameter(Mandatory=$false)]
    [string]$Key,
    
    [Parameter(Mandatory=$false)]
    [string]$Folder,
    
    [Parameter(Mandatory=$false)]
    [switch]$Ping,
    
    [Parameter(Mandatory=$false)]
    [switch]$Status,
    
    [Parameter(Mandatory=$false)]
    [switch]$Upload,
    
    [Parameter(Mandatory=$false)]
    [string]$Config,
    
    [Parameter(Mandatory=$false)]
    [int]$BatchSize = 5,
    
    [Parameter(Mandatory=$false)]
    [int]$Polling = 10,
    
    [Parameter(Mandatory=$false)]
    [int]$MaxRetries = 3,
    
    [Parameter(Mandatory=$false)]
    [int]$ChunkSizeMB = 25
)

# Script configuration
$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

# Determine operation mode
$mode = $null
if ($Ping) { $mode = "ping" }
elseif ($Status) { $mode = "status" }
elseif ($Upload) { $mode = "upload" }

# Load configuration from file if specified
$configData = $null
if ($Config -and (Test-Path $Config)) {
    try {
        $configData = Get-Content $Config -Raw | ConvertFrom-Json
        Write-Host "Loaded configuration from: $Config" -ForegroundColor Gray
    }
    catch {
        Write-Warning "Failed to load config file: $_"
    }
}

# Build final configuration (command-line overrides config file)
$script:ServerUrl = if ($Url) { $Url } elseif ($configData.serverUrl) { $configData.serverUrl } else { $null }
$script:ApiKey = if ($Key) { $Key } elseif ($configData.apiKey) { $configData.apiKey } else { $null }
$script:UploadFolder = if ($Folder) { $Folder } elseif ($configData.uploadDirectory) { $configData.uploadDirectory } else { $null }
$script:BatchSize = if ($BatchSize -ne 5) { $BatchSize } elseif ($configData.batchSize) { $configData.batchSize } else { 5 }
$script:PollingInterval = if ($Polling -ne 10) { $Polling } elseif ($configData.pollingInterval) { $configData.pollingInterval } else { 10 }
$script:MaxRetries = if ($MaxRetries -ne 3) { $MaxRetries } elseif ($configData.maxRetries) { $configData.maxRetries } else { 3 }
$script:ChunkSize = if ($ChunkSizeMB -ne 25) { $ChunkSizeMB * 1MB } elseif ($configData.chunkSize) { $configData.chunkSize } else { 26214400 }

# Validate required parameters
if (-not $mode) {
    Write-Host "ERROR: Operation mode required" -ForegroundColor Red
    Write-Host "`nUsage:" -ForegroundColor Yellow
    Write-Host "  .\batch-uploader.ps1 -Url <url> -Key <api-key> -Ping" -ForegroundColor White
    Write-Host "  .\batch-uploader.ps1 -Url <url> -Key <api-key> -Status" -ForegroundColor White
    Write-Host "  .\batch-uploader.ps1 -Url <url> -Folder <path> -Key <api-key> -Upload" -ForegroundColor White
    Write-Host "`nOr use config file:" -ForegroundColor Yellow
    Write-Host "  .\batch-uploader.ps1 -Config config.json -Upload" -ForegroundColor White
    exit 1
}

if (-not $script:ServerUrl) {
    Write-Error "Server URL required (-Url or config file)"
    exit 1
}

if (-not $script:ApiKey) {
    Write-Error "API key required (-Key or config file)"
    exit 1
}

if ($mode -eq "upload" -and -not $script:UploadFolder) {
    Write-Error "Upload folder required for -Upload mode (-Folder or config file)"
    exit 1
}

# Normalize URL (remove trailing slash and /mmsuploader if present)
$script:ServerUrl = $script:ServerUrl.TrimEnd('/')
if ($script:ServerUrl -match '/mmsuploader$') {
    $script:ServerUrl = $script:ServerUrl -replace '/mmsuploader$', ''
}

# Make HTTP request with API key
function Invoke-ApiRequest {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [string]$ContentType = "application/json"
    )
    
    $Headers["X-API-Key"] = $script:ApiKey
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            ContentType = $ContentType
        }
        
        if ($Body) {
            if ($ContentType -eq "application/json") {
                $params.Body = $Body | ConvertTo-Json -Depth 10
            } else {
                $params.Body = $Body
            }
        }
        
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Error "API request failed: $($_.Exception.Message)"
        if ($_.ErrorDetails.Message) {
            Write-Error "Details: $($_.ErrorDetails.Message)"
        }
        throw
    }
}

# Ping server
function Test-Connection {
    Write-Host "`n=== MMS Server Ping ===" -ForegroundColor Cyan
    Write-Host "Server: $($script:ServerUrl)" -ForegroundColor Gray
    
    try {
        $url = "$($script:ServerUrl)/api/uploader/ping"
        $response = Invoke-ApiRequest -Url $url -Method GET
        
        Write-Host "`nStatus: " -NoNewline -ForegroundColor Green
        Write-Host $response.status.ToUpper() -ForegroundColor White
        Write-Host "Version: $($response.version)" -ForegroundColor Gray
        Write-Host "Environment: $($response.environment)" -ForegroundColor Gray
        Write-Host "Auth Method: $($response.authMethod)" -ForegroundColor Gray
        Write-Host "Message: $($response.message)" -ForegroundColor Gray
        Write-Host "Timestamp: $($response.timestamp)" -ForegroundColor Gray
        
        Write-Host "`n✓ Connection successful!" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "`n✗ Connection failed!" -ForegroundColor Red
        return $false
    }
}

# Get batch status
function Get-BatchStatus {
    param([bool]$DisplayOutput = $true)
    
    try {
        $url = "$($script:ServerUrl)/api/uploader/batch-status"
        $response = Invoke-ApiRequest -Url $url -Method GET
        
        if ($DisplayOutput) {
            Write-Host "`n=== Upload Queue Status ===" -ForegroundColor Cyan
            Write-Host "Ready for Upload: " -NoNewline
            if ($response.ready) {
                Write-Host "YES" -ForegroundColor Green
            } else {
                Write-Host "NO (system busy)" -ForegroundColor Yellow
            }
            Write-Host "`nQueue Metrics:" -ForegroundColor Gray
            Write-Host "  Processing: $($response.processing_count)" -ForegroundColor White
            Write-Host "  Queued: $($response.queued_count)" -ForegroundColor White
            Write-Host "  Completed: $($response.completed_count)" -ForegroundColor White
            Write-Host "  Errors: $($response.error_count)" -ForegroundColor $(if ($response.error_count -gt 0) { "Red" } else { "White" })
            Write-Host "  Total (24h): $($response.total_count)" -ForegroundColor Gray
            Write-Host "`nCapacity:" -ForegroundColor Gray
            Write-Host "  Available: $($response.capacity_available) / $($response.capacity_limit)" -ForegroundColor White
            Write-Host "  Timestamp: $($response.timestamp)" -ForegroundColor Gray
        }
        
        return $response
    }
    catch {
        if ($DisplayOutput) {
            Write-Host "`n✗ Failed to get batch status" -ForegroundColor Red
        }
        throw
    }
}

# Wait for system ready
function Wait-ForReady {
    param([int]$MaxWaitMinutes = 30)
    
    $startTime = Get-Date
    $maxWaitSeconds = $MaxWaitMinutes * 60
    
    while ($true) {
        try {
            $status = Get-BatchStatus -DisplayOutput $false
            if ($status.ready) {
                return $true
            }
            
            $elapsed = ((Get-Date) - $startTime).TotalSeconds
            if ($elapsed -gt $maxWaitSeconds) {
                Write-Warning "Timeout waiting for system to be ready after $MaxWaitMinutes minutes"
                return $false
            }
            
            Write-Host "System busy (Processing: $($status.processing_count), Queued: $($status.queued_count)). Waiting $($script:PollingInterval) seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds $script:PollingInterval
        }
        catch {
            Write-Warning "Failed to check status: $($_.Exception.Message)"
            Start-Sleep -Seconds $script:PollingInterval
        }
    }
}

# Start upload session
function Start-UploadSession {
    param(
        [string]$FileName,
        [long]$FileSize
    )
    
    $url = "$($script:ServerUrl)/api/uploader/start"
    $body = @{
        filename = $FileName
        fileSize = $FileSize
        sessionId = "powershell_$(Get-Date -Format 'yyyyMMddHHmmss')"
        keep = $false
    }
    
    $response = Invoke-ApiRequest -Url $url -Method POST -Body $body
    return $response
}

# Upload file (small files)
function Send-FileContent {
    param(
        [string]$UploadId,
        [string]$FilePath
    )
    
    $url = "$($script:ServerUrl)/api/uploader/$UploadId/upload"
    
    # Create multipart form data
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $fileName = [System.IO.Path]::GetFileName($FilePath)
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"",
        "Content-Type: application/octet-stream",
        "",
        [System.Text.Encoding]::GetEncoding("ISO-8859-1").GetString($fileBytes),
        "--$boundary--"
    ) -join "`r`n"
    
    $headers = @{
        "X-API-Key" = $script:ApiKey
    }
    
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers `
        -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary"
    
    return $response
}

# Upload file chunk
function Send-FileChunk {
    param(
        [string]$UploadId,
        [byte[]]$ChunkData,
        [int]$ChunkIndex,
        [int]$TotalChunks
    )
    
    $url = "$($script:ServerUrl)/api/uploader/$UploadId/upload-chunk"
    
    $boundary = [System.Guid]::NewGuid().ToString()
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"chunk`"; filename=`"chunk_$ChunkIndex`"",
        "Content-Type: application/octet-stream",
        "",
        [System.Text.Encoding]::GetEncoding("ISO-8859-1").GetString($ChunkData),
        "--$boundary",
        "Content-Disposition: form-data; name=`"chunkIndex`"",
        "",
        "$ChunkIndex",
        "--$boundary",
        "Content-Disposition: form-data; name=`"totalChunks`"",
        "",
        "$TotalChunks",
        "--$boundary--"
    ) -join "`r`n"
    
    $headers = @{
        "X-API-Key" = $script:ApiKey
    }
    
    $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers `
        -Body $bodyLines -ContentType "multipart/form-data; boundary=$boundary"
    
    return $response
}

# Upload single file with chunking support
function Upload-File {
    param(
        [string]$FilePath,
        [int]$RetryCount = 0
    )
    
    $fileName = [System.IO.Path]::GetFileName($FilePath)
    $fileSize = (Get-Item $FilePath).Length
    $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
    
    Write-Host "`nUploading: $fileName ($($fileSizeMB) MB)" -ForegroundColor Cyan
    
    try {
        # Start upload session
        Write-Host "  Creating upload session..." -ForegroundColor Gray
        $session = Start-UploadSession -FileName $fileName -FileSize $fileSize
        $uploadId = $session.id
        Write-Host "  Upload ID: $uploadId" -ForegroundColor Gray
        
        # Determine if chunking is needed
        if ($fileSize -gt $script:ChunkSize) {
            # Chunked upload
            $totalChunks = [math]::Ceiling($fileSize / $script:ChunkSize)
            Write-Host "  Using chunked upload ($($totalChunks) chunks)" -ForegroundColor Yellow
            
            $fileStream = [System.IO.File]::OpenRead($FilePath)
            try {
                for ($i = 0; $i -lt $totalChunks; $i++) {
                    $chunkSize = [math]::Min($script:ChunkSize, $fileSize - ($i * $script:ChunkSize))
                    $chunk = New-Object byte[] $chunkSize
                    $bytesRead = $fileStream.Read($chunk, 0, $chunkSize)
                    
                    Write-Host "    Uploading chunk $($i + 1)/$totalChunks..." -ForegroundColor Gray
                    $null = Send-FileChunk -UploadId $uploadId -ChunkData $chunk `
                        -ChunkIndex $i -TotalChunks $totalChunks
                }
            }
            finally {
                $fileStream.Close()
            }
        }
        else {
            # Single upload
            Write-Host "  Uploading file content..." -ForegroundColor Gray
            $null = Send-FileContent -UploadId $uploadId -FilePath $FilePath
        }
        
        Write-Host "  ✓ Upload complete" -ForegroundColor Green
        return @{
            Success = $true
            FileName = $fileName
            FileSize = $fileSize
            UploadId = $uploadId
        }
    }
    catch {
        if ($RetryCount -lt $script:MaxRetries) {
            Write-Host "  ✗ Upload failed, retrying ($($RetryCount + 1)/$($script:MaxRetries))..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
            return Upload-File -FilePath $FilePath -RetryCount ($RetryCount + 1)
        }
        else {
            Write-Host "  ✗ Upload failed after $($script:MaxRetries) retries" -ForegroundColor Red
            return @{
                Success = $false
                FileName = $fileName
                Error = $_.Exception.Message
            }
        }
    }
}

# Main batch upload function
function Start-BatchUpload {
    if (-not (Test-Path $script:UploadFolder)) {
        Write-Error "Upload folder not found: $($script:UploadFolder)"
        exit 1
    }
    
    Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║         MMS BATCH FILE UPLOADER                           ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    
    Write-Host "`nConfiguration:" -ForegroundColor Yellow
    Write-Host "  Server: $($script:ServerUrl)" -ForegroundColor White
    Write-Host "  Folder: $($script:UploadFolder)" -ForegroundColor White
    Write-Host "  Batch Size: $($script:BatchSize)" -ForegroundColor White
    Write-Host "  Polling Interval: $($script:PollingInterval) seconds" -ForegroundColor White
    
    # Test connection first
    Write-Host "`nTesting connection..." -ForegroundColor Yellow
    if (-not (Test-Connection)) {
        Write-Error "Cannot connect to server. Please check configuration."
        exit 1
    }
    
    # Get list of files
    $files = Get-ChildItem -Path $script:UploadFolder -File | Where-Object {
        $_.Extension -in @('.csv', '.tsv', '.json', '.txt', '.TSYSO', '.tsyso')
    }
    
    if ($files.Count -eq 0) {
        Write-Host "`nNo files found to upload." -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "`nFound $($files.Count) file(s) to upload" -ForegroundColor Green
    
    # Upload tracking
    $results = @{
        Total = $files.Count
        Successful = 0
        Failed = 0
        Uploads = @()
    }
    
    $batchNumber = 0
    $totalBatches = [math]::Ceiling($files.Count / $script:BatchSize)
    
    # Process files in batches
    for ($i = 0; $i -lt $files.Count; $i += $script:BatchSize) {
        $batchNumber++
        $batch = $files[$i..([math]::Min($i + $script:BatchSize - 1, $files.Count - 1))]
        
        Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
        Write-Host "║  BATCH $batchNumber / $totalBatches ($($batch.Count) file(s))" -ForegroundColor Magenta
        Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
        
        # Wait for system to be ready
        if ($batchNumber -gt 1) {
            Write-Host "`nWaiting for system to be ready..." -ForegroundColor Yellow
            if (-not (Wait-ForReady)) {
                Write-Warning "Stopping batch upload due to timeout"
                break
            }
        }
        
        # Upload batch files
        foreach ($file in $batch) {
            $result = Upload-File -FilePath $file.FullName
            $results.Uploads += $result
            
            if ($result.Success) {
                $results.Successful++
            } else {
                $results.Failed++
            }
        }
    }
    
    # Display summary
    Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  UPLOAD SUMMARY                                           ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host "`nTotal Files: $($results.Total)" -ForegroundColor White
    Write-Host "Successful: $($results.Successful)" -ForegroundColor Green
    Write-Host "Failed: $($results.Failed)" -ForegroundColor $(if ($results.Failed -gt 0) { "Red" } else { "White" })
    
    if ($results.Failed -gt 0) {
        Write-Host "`nFailed Uploads:" -ForegroundColor Red
        $results.Uploads | Where-Object { -not $_.Success } | ForEach-Object {
            Write-Host "  - $($_.FileName): $($_.Error)" -ForegroundColor Red
        }
    }
    
    # Save report
    $reportPath = Join-Path $script:UploadFolder "upload-report_$(Get-Date -Format 'yyyyMMddHHmmss').json"
    $results | ConvertTo-Json -Depth 10 | Set-Content $reportPath
    Write-Host "`nReport saved to: $reportPath" -ForegroundColor Gray
}

# Main entry point
switch ($mode) {
    "ping" {
        Test-Connection
    }
    "status" {
        Get-BatchStatus
    }
    "upload" {
        Start-BatchUpload
    }
}
