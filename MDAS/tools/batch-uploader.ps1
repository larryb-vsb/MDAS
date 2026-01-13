<#
MMS Batch File Uploader
Version: 1.0.0
Last Updated: 2025-11-05 14:45 CST

Synopsis:
  Automated batch upload with API key authentication.

Modes:
  -Ping     : test connectivity
  -Status   : check queue status
  -Upload   : upload files in batches
#>

param(
  [Parameter(Mandatory=$false)][string]$Url,
  [Parameter(Mandatory=$false)][string]$Key,
  [Parameter(Mandatory=$false)][string]$Folder,
  [Parameter(Mandatory=$false)][switch]$Ping,
  [Parameter(Mandatory=$false)][switch]$Status,
  [Parameter(Mandatory=$false)][switch]$Upload,
  [Parameter(Mandatory=$false)][string]$Config,
  [Parameter(Mandatory=$false)][int]$BatchSize = 5,
  [Parameter(Mandatory=$false)][int]$Polling = 10,
  [Parameter(Mandatory=$false)][int]$MaxRetries = 3,
  [Parameter(Mandatory=$false)][int]$ChunkSizeMB = 25
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

# Decide mode
$mode = $null
if ($Ping)   { $mode = 'ping' }
elseif ($Status) { $mode = 'status' }
elseif ($Upload) { $mode = 'upload' }

# Load config (optional)
$configData = $null
if ($Config -and (Test-Path -LiteralPath $Config)) {
  try {
    $configData = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
    Write-Host "Loaded configuration from: $Config" -ForegroundColor Gray
  } catch {
    Write-Warning "Failed to load config file: $($_.Exception.Message)"
  }
}

# Resolve settings (CLI overrides config; ASCII-safe)
function Resolve-Setting {
  param([string]$Name,[object]$ConfigValue,[object]$Default)
  if ($PSBoundParameters.ContainsKey($Name)) {
    return (Get-Variable -Name $Name -Scope 1).Value
  } elseif ($null -ne $ConfigValue -and $ConfigValue -ne '') {
    return $ConfigValue
  } else {
    return $Default
  }
}

$script:ServerUrl       = Resolve-Setting -Name 'Url'        -ConfigValue $configData.serverUrl        -Default $null
$script:ApiKey          = Resolve-Setting -Name 'Key'        -ConfigValue $configData.apiKey           -Default $null
$script:UploadFolder    = Resolve-Setting -Name 'Folder'     -ConfigValue $configData.uploadDirectory  -Default $null
$script:BatchSize       = [int](Resolve-Setting -Name 'BatchSize' -ConfigValue $configData.batchSize        -Default 5)
$script:PollingInterval = [int](Resolve-Setting -Name 'Polling'   -ConfigValue $configData.pollingInterval  -Default 10)
$script:MaxRetries      = [int](Resolve-Setting -Name 'MaxRetries' -ConfigValue $configData.maxRetries     -Default 3)

# Chunk size: prefer ChunkSizeMB (CLI or config.chunkSizeMB). Fallback to config.chunkSize (bytes). Default 25MB.
$resolvedChunkMB = $null
if ($PSBoundParameters.ContainsKey('ChunkSizeMB')) { $resolvedChunkMB = $ChunkSizeMB }
elseif ($null -ne $configData.chunkSizeMB) { $resolvedChunkMB = [int]$configData.chunkSizeMB }

if ($null -ne $resolvedChunkMB) {
  $script:ChunkSize = [int64]$resolvedChunkMB * 1MB
} else {
  $script:ChunkSize = if ($null -ne $configData.chunkSize) { [int64]$configData.chunkSize } else { 25MB }
}

# Validate basics
if (-not $mode) {
  Write-Host "ERROR: Operation mode required" -ForegroundColor Red
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  .\batch-uploader.ps1 -Url <url> -Key <api-key> -Ping"
  Write-Host "  .\batch-uploader.ps1 -Url <url> -Key <api-key> -Status"
  Write-Host "  .\batch-uploader.ps1 -Url <url> -Folder <path> -Key <api-key> -Upload"
  Write-Host ""
  Write-Host "Or use config file:"
  Write-Host "  .\batch-uploader.ps1 -Config config.json -Upload"
  exit 1
}
if (-not $script:ServerUrl) { Write-Error 'Server URL required (-Url or config file)'; exit 1 }
if (-not $script:ApiKey)    { Write-Error 'API key required (-Key or config file)';   exit 1 }
if ($mode -eq 'upload' -and -not $script:UploadFolder) { Write-Error 'Upload folder required for -Upload mode'; exit 1 }

# Normalize URL
$script:ServerUrl = $script:ServerUrl.TrimEnd('/')
if ($script:ServerUrl -match '/mmsuploader$') {
  $script:ServerUrl = $script:ServerUrl -replace '/mmsuploader$',''
}

# Simple JSON API helper
function Invoke-ApiRequest {
  param(
    [string]$Url,
    [string]$Method = 'GET',
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [string]$ContentType = 'application/json'
  )
  $Headers['X-API-Key'] = $script:ApiKey
  $p = @{
    Uri         = $Url
    Method      = $Method
    Headers     = $Headers
    ContentType = $ContentType
  }
  if ($Body) {
    if ($ContentType -eq 'application/json') { $p.Body = ($Body | ConvertTo-Json -Depth 10) }
    else { $p.Body = $Body }
  }
  try {
    return Invoke-RestMethod @p
  } catch {
    Write-Error ("API request failed: {0}" -f $_.Exception.Message)
    if ($_.ErrorDetails.Message) { Write-Error ("Details: {0}" -f $_.ErrorDetails.Message) }
    throw
  }
}

# Ping (renamed to avoid clobbering built-in Test-Connection)
function Test-MmsConnection {
  Write-Host ""
  Write-Host "=== MMS Server Ping ==="
  Write-Host ("Server: {0}" -f $script:ServerUrl)
  try {
    $url = "$($script:ServerUrl)/api/uploader/ping"
    $r = Invoke-ApiRequest -Url $url -Method GET
    Write-Host ""
    Write-Host ("Status: {0}" -f ($r.status).ToUpper())
    Write-Host ("Version: {0}" -f $r.version)
    Write-Host ("Environment: {0}" -f $r.environment)
    Write-Host ("Auth Method: {0}" -f $r.authMethod)
    Write-Host ("Message: {0}" -f $r.message)
    Write-Host ("Timestamp: {0}" -f $r.timestamp)
    Write-Host ""
    Write-Host "OK: Connection successful"
    return $true
  } catch {
    Write-Host ""
    Write-Host "FAIL: Connection failed"
    return $false
  }
}

# Status
function Get-BatchStatus {
  param([bool]$DisplayOutput = $true)
  $url = "$($script:ServerUrl)/api/uploader/batch-status"
  $r = Invoke-ApiRequest -Url $url -Method GET
  if ($DisplayOutput) {
    Write-Host ""
    Write-Host "=== Upload Queue Status ==="
    $readyText = if ($r.ready) { 'YES' } else { 'NO (system busy)' }
    Write-Host ("Ready for Upload: {0}" -f $readyText)
    Write-Host "Queue Metrics:"
    Write-Host ("  Processing: {0}" -f $r.processing_count)
    Write-Host ("  Queued: {0}" -f $r.queued_count)
    Write-Host ("  Completed: {0}" -f $r.completed_count)
    Write-Host ("  Errors: {0}" -f $r.error_count)
    Write-Host ("  Total (24h): {0}" -f $r.total_count)
    Write-Host "Capacity:"
    Write-Host ("  Available: {0} / {1}" -f $r.capacity_available, $r.capacity_limit)
    Write-Host ("  Timestamp: {0}" -f $r.timestamp)
  }
  return $r
}

# Wait until system is ready
function Wait-ForReady {
  param([int]$MaxWaitMinutes = 30)
  $start = Get-Date
  $deadline = $start.AddMinutes($MaxWaitMinutes)
  while ($true) {
    try {
      $s = Get-BatchStatus -DisplayOutput:$false
      if ($s.ready) { return $true }
      if (Get-Date -gt $deadline) {
        Write-Warning ("Timeout waiting for system to be ready after {0} minutes" -f $MaxWaitMinutes)
        return $false
      }
      Write-Host ("System busy (Processing: {0}, Queued: {1}). Waiting {2}s..." -f $s.processing_count, $s.queued_count, $script:PollingInterval)
      Start-Sleep -Seconds $script:PollingInterval
    } catch {
      Write-Warning ("Failed to check status: {0}" -f $_.Exception.Message)
      Start-Sleep -Seconds $script:PollingInterval
    }
  }
}

# Start upload session
function Start-UploadSession {
  param([string]$FileName,[long]$FileSize)
  $url = "$($script:ServerUrl)/api/uploader/start"
  $body = @{
    filename = $FileName
    fileSize = $FileSize
    sessionId = ("powershell_{0}" -f (Get-Date -Format 'yyyyMMddHHmmss'))
    keep = $false
  }
  return Invoke-ApiRequest -Url $url -Method POST -Body $body
}

# Small file upload (safe multipart)
function Send-FileContent {
  param([string]$UploadId,[string]$FilePath)
  $url = "$($script:ServerUrl)/api/uploader/$UploadId/upload"
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client  = New-Object System.Net.Http.HttpClient($handler)
  $client.DefaultRequestHeaders.Add('X-API-Key', $script:ApiKey)
  $content = New-Object System.Net.Http.MultipartFormDataContent
  $fs = [System.IO.File]::OpenRead($FilePath)
  try {
    $fileContent = New-Object System.Net.Http.StreamContent($fs)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/octet-stream')
    $name = [System.IO.Path]::GetFileName($FilePath)
    $null = $content.Add($fileContent,'file',$name)
    $resp = $client.PostAsync($url,$content).Result
    $resp.EnsureSuccessStatusCode() | Out-Null
    return $true
  } finally {
    $fs.Dispose(); $content.Dispose(); $client.Dispose(); $handler.Dispose()
  }
}

# Chunk upload (safe multipart, honors bytesRead)
function Send-FileChunk {
  param(
    [string]$UploadId,
    [byte[]]$ChunkData,
    [int]$ChunkIndex,
    [int]$TotalChunks,
    [int]$BytesValid
  )
  $url = "$($script:ServerUrl)/api/uploader/$UploadId/upload-chunk"
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client  = New-Object System.Net.Http.HttpClient($handler)
  $client.DefaultRequestHeaders.Add('X-API-Key', $script:ApiKey)
  $content = New-Object System.Net.Http.MultipartFormDataContent
  try {
    $effective = if ($BytesValid -lt $ChunkData.Length) {
      $tmp = New-Object byte[] $BytesValid
      [Array]::Copy($ChunkData,0,$tmp,0,$BytesValid)
      $tmp
    } else { $ChunkData }
    $chunkContent = New-Object System.Net.Http.ByteArrayContent($effective)
    $chunkContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/octet-stream')
    $null = $content.Add($chunkContent,'chunk',("chunk_{0}" -f $ChunkIndex))
    $null = $content.Add((New-Object System.Net.Http.StringContent($ChunkIndex.ToString())),'chunkIndex')
    $null = $content.Add((New-Object System.Net.Http.StringContent($TotalChunks.ToString())),'totalChunks')
    $resp = $client.PostAsync($url,$content).Result
    $resp.EnsureSuccessStatusCode() | Out-Null
    return $true
  } finally {
    $content.Dispose(); $client.Dispose(); $handler.Dispose()
  }
}

# Upload one file (with chunking if needed)
function Upload-File {
  param([string]$FilePath,[int]$RetryCount = 0)
  $name = [System.IO.Path]::GetFileName($FilePath)
  $size = (Get-Item -LiteralPath $FilePath).Length
  $sizeMB = [math]::Round($size / 1MB,2)
  Write-Host ""
  Write-Host ("Uploading: {0} - {1} MB" -f $name,$sizeMB)
  try {
    Write-Host "  Creating upload session..."
    $session = Start-UploadSession -FileName $name -FileSize $size
    $uploadId = $session.id
    Write-Host ("  Upload ID: {0}" -f $uploadId)
    if ($size -gt $script:ChunkSize) {
      $totalChunks = [math]::Ceiling($size / $script:ChunkSize)
      Write-Host ("  Using chunked upload - {0} chunks" -f $totalChunks)
      $fs = [System.IO.File]::OpenRead($FilePath)
      try {
        for ($i=0; $i -lt $totalChunks; $i++) {
          $toRead = [math]::Min($script:ChunkSize, $size - ($i * $script:ChunkSize))
          $buf = New-Object byte[] $toRead
          $bytesRead = $fs.Read($buf,0,$toRead)
          if ($bytesRead -le 0) { break }
          Write-Host ("    Uploading chunk {0}/{1}..." -f ($i+1),$totalChunks)
          $null = Send-FileChunk -UploadId $uploadId -ChunkData $buf -ChunkIndex $i -TotalChunks $totalChunks -BytesValid $bytesRead
        }
      } finally { $fs.Close() }
    } else {
      Write-Host "  Uploading file content..."
      $null = Send-FileContent -UploadId $uploadId -FilePath $FilePath
    }
    Write-Host "  OK: Upload complete"
    return @{ Success=$true; FileName=$name; FileSize=$size; UploadId=$uploadId }
  } catch {
    if ($RetryCount -lt $script:MaxRetries) {
      Write-Host ("  Retry {0}/{1} after failure: {2}" -f ($RetryCount+1),$script:MaxRetries,$_.Exception.Message)
      Start-Sleep -Seconds (5 * [math]::Pow(2,$RetryCount))
      return Upload-File -FilePath $FilePath -RetryCount ($RetryCount+1)
    } else {
      Write-Host ("  Failed after {0} retries" -f $script:MaxRetries)
      return @{ Success=$false; FileName=$name; Error=$_.Exception.Message }
    }
  }
}

# Batch upload
function Start-BatchUpload {
  if (-not (Test-Path -LiteralPath $script:UploadFolder)) { Write-Error ("Upload folder not found: {0}" -f $script:UploadFolder); exit 1 }
  Write-Host ""
  Write-Host "MMS BATCH FILE UPLOADER"
  Write-Host "Configuration:"
  Write-Host ("  Server: {0}" -f $script:ServerUrl)
  Write-Host ("  Folder: {0}" -f $script:UploadFolder)
  Write-Host ("  Batch Size: {0}" -f $script:BatchSize)
  Write-Host ("  Polling Interval: {0} seconds" -f $script:PollingInterval)

  Write-Host ""
  Write-Host "Testing connection..."
  if (-not (Test-MmsConnection)) { Write-Error 'Cannot connect to server. Check configuration.'; exit 1 }

  $files = Get-ChildItem -LiteralPath $script:UploadFolder -File | Where-Object {
    $_.Extension -in @('.csv','.tsv','.json','.txt','.TSYSO','.tsyso')
  }
  if ($files.Count -eq 0) { Write-Host 'No files found to upload.'; exit 0 }

  Write-Host ("Found {0} file(s) to upload" -f $files.Count)

  $results = @{ Total=$files.Count; Successful=0; Failed=0; Uploads=@() }
  $batchNumber = 0
  $totalBatches = [math]::Ceiling($files.Count / $script:BatchSize)

  for ($i=0; $i -lt $files.Count; $i += $script:BatchSize) {
    $batchNumber++
    $startIdx = $i
    $endIdx = [math]::Min($i + $script:BatchSize - 1, $files.Count - 1)
    $batch = $files[$startIdx..$endIdx]

    if ($batchNumber -gt 1) {
      Write-Host ""
      Write-Host "Waiting for system to be ready..."
      if (-not (Wait-ForReady)) { Write-Warning 'Stopping batch upload due to timeout'; break }
    }

    foreach ($f in $batch) {
      $r = Upload-File -FilePath $f.FullName
      $results.Uploads += $r
      if ($r.Success) { $results.Successful++ } else { $results.Failed++ }
    }
  }

  Write-Host ""
  Write-Host "UPLOAD SUMMARY"
  Write-Host ("Total Files: {0}" -f $results.Total)
  Write-Host ("Successful:  {0}" -f $results.Successful)
  Write-Host ("Failed:      {0}" -f $results.Failed)
  if ($results.Failed -gt 0) {
    Write-Host "Failed Uploads:"
    $results.Uploads | Where-Object { -not $_.Success } | ForEach-Object {
      Write-Host ("  - {0}: {1}" -f $_.FileName,$_.Error)
    }
  }

  $reportPath = Join-Path $script:UploadFolder ("upload-report_{0}.json" -f (Get-Date -Format 'yyyyMMddHHmmss'))
  $results | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath
  Write-Host ("Report saved to: {0}" -f $reportPath)
}

# Main entry point (ASCII-safe, no switch)
if ($mode -eq 'ping')      { Test-MmsConnection; exit 0 }
elseif ($mode -eq 'status'){ Get-BatchStatus;     exit 0 }
elseif ($mode -eq 'upload'){ Start-BatchUpload;   exit 0 }
else { Write-Error ('Unknown mode: {0}' -f $mode); exit 1 }
