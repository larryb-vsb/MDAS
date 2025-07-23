# TDDF Multi-Stream JSON Processor
# Processes TDDF files using parallel streams and JSON output for faster throughput

param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiEndpoint = "http://localhost:3000/api/tddf/bulk-insert",
    
    [Parameter(Mandatory=$false)]
    [int]$BatchSize = 1000,
    
    [Parameter(Mandatory=$false)]
    [int]$MaxParallelStreams = 4,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputMode = "API"  # API, FILE, or BOTH
)

# Helper function to extract fields from TDDF lines (same as before)
function Get-Field {
    param([string]$Line, [int]$StartPosition, [int]$Length)
    if ($Line.Length -lt ($StartPosition + $Length - 1)) { return "" }
    return $Line.Substring($StartPosition - 1, $Length).Trim()
}

# Helper function to parse TDDF amounts
function Parse-TddfAmount {
    param([string]$AmountString)
    if ([string]::IsNullOrWhiteSpace($AmountString)) { return 0 }
    try { return ([decimal]$AmountString) / 100 } catch { return 0 }
}

# Helper function to parse TDDF dates
function Parse-TddfDate {
    param([string]$DateString)
    if ($DateString.Length -ne 8) { return $null }
    
    $month = $DateString.Substring(0, 2)
    $day = $DateString.Substring(2, 2) 
    $century = $DateString.Substring(4, 2)
    $year = $DateString.Substring(6, 2)
    
    $fullYear = if ($century -eq "20") { "20$year" } else { "19$year" }
    
    try {
        return [DateTime]::ParseExact("$month/$day/$fullYear", "MM/dd/yyyy", $null)
    } catch {
        return $null
    }
}

# Function to convert TDDF line to JSON object
function ConvertTo-TddfJson {
    param([string]$Line, [int]$LineNumber)
    
    $assocNumber = Get-Field $Line 1 17
    $txnDateRaw = Get-Field $Line 85 8
    $txnDate = Parse-TddfDate $txnDateRaw
    
    # Create streamlined object for JSON transmission
    $record = @{
        # Core fields for API processing
        associationNumber = $assocNumber
        merchantAccount = Get-Field $Line 24 16
        transactionDate = if ($txnDate) { $txnDate.ToString("yyyy-MM-dd") } else { $txnDateRaw }
        transactionAmount = Parse-TddfAmount (Get-Field $Line 93 11)
        authAmount = Parse-TddfAmount (Get-Field $Line 104 11)
        creditDebitIndicator = Get-Field $Line 216 1
        reversalFlag = Get-Field $Line 217 1
        merchantName = Get-Field $Line 218 25
        mccCode = Get-Field $Line 273 4
        vNumber = Get-Field $Line 277 8
        cardholderAccount = Get-Field $Line 124 16
        cardType = Get-Field $Line 253 2
        referenceNumber = Get-Field $Line 737 50
        
        # Processing metadata
        lineNumber = $LineNumber
        rawLine = $Line
        recordType = "DT"
        processedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    return $record
}

# Function to send JSON batch via HTTP
function Send-JsonBatch {
    param([array]$Records, [string]$Endpoint, [int]$BatchNumber)
    
    try {
        $jsonPayload = $Records | ConvertTo-Json -Depth 2 -Compress
        
        $headers = @{
            'Content-Type' = 'application/json'
            'Accept' = 'application/json'
        }
        
        $response = Invoke-RestMethod -Uri $Endpoint -Method POST -Body $jsonPayload -Headers $headers -TimeoutSec 30
        
        Write-Host "✅ Batch $BatchNumber`: Sent $($Records.Count) records - Response: $($response.message)" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Warning "❌ Batch $BatchNumber failed: $($_.Exception.Message)"
        return $false
    }
}

# Function to process file chunk in parallel
function Process-FileChunk {
    param([array]$Lines, [int]$StartIndex, [int]$ChunkSize, [string]$Endpoint)
    
    $records = @()
    $batchNumber = [math]::Floor($StartIndex / $ChunkSize) + 1
    
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        $line = $Lines[$i]
        $lineNumber = $StartIndex + $i + 1
        
        # Only process DT records
        $recordType = Get-Field $line 18 2
        if ($recordType -eq "DT") {
            $records += ConvertTo-TddfJson $line $lineNumber
            
            # Send batch when full
            if ($records.Count -ge $global:BatchSize) {
                Send-JsonBatch $records $Endpoint $batchNumber | Out-Null
                $records = @()
                $batchNumber++
            }
        }
    }
    
    # Send remaining records
    if ($records.Count -gt 0) {
        Send-JsonBatch $records $Endpoint $batchNumber | Out-Null
    }
}

# Main processing function
function Start-ParallelTddfProcessing {
    param([string]$FilePath, [string]$Endpoint, [int]$Streams, [int]$BatchSize)
    
    Write-Host "🚀 Starting parallel TDDF processing..." -ForegroundColor Cyan
    Write-Host "   File: $FilePath" -ForegroundColor Yellow
    Write-Host "   Streams: $Streams" -ForegroundColor Yellow  
    Write-Host "   Batch Size: $BatchSize" -ForegroundColor Yellow
    Write-Host "   Endpoint: $Endpoint" -ForegroundColor Yellow
    
    # Read all lines
    $allLines = Get-Content $FilePath
    $totalLines = $allLines.Count
    
    # Filter DT records for accurate counts
    $dtLines = $allLines | Where-Object { (Get-Field $_ 18 2) -eq "DT" }
    $dtCount = $dtLines.Count
    
    Write-Host "📊 File Analysis:" -ForegroundColor Cyan
    Write-Host "   Total Lines: $totalLines" -ForegroundColor White
    Write-Host "   DT Records: $dtCount" -ForegroundColor White
    Write-Host "   Estimated Batches: $([math]::Ceiling($dtCount / $BatchSize))" -ForegroundColor White
    
    # Calculate chunk size per stream
    $chunkSize = [math]::Ceiling($dtCount / $Streams)
    
    # Create parallel jobs
    $jobs = @()
    
    for ($stream = 0; $stream -lt $Streams; $stream++) {
        $startIndex = $stream * $chunkSize
        $endIndex = [math]::Min($startIndex + $chunkSize - 1, $dtCount - 1)
        
        if ($startIndex -lt $dtCount) {
            $chunk = $dtLines[$startIndex..$endIndex]
            
            Write-Host "🔄 Stream $($stream + 1): Processing lines $($startIndex + 1) to $($endIndex + 1) ($($chunk.Count) records)" -ForegroundColor Magenta
            
            # Start parallel job
            $job = Start-Job -ScriptBlock {
                param($ChunkLines, $StartIdx, $ChunkSz, $EndpointUrl, $BatchSz)
                
                # Re-define functions in job scope
                function Get-Field {
                    param([string]$Line, [int]$StartPosition, [int]$Length)
                    if ($Line.Length -lt ($StartPosition + $Length - 1)) { return "" }
                    return $Line.Substring($StartPosition - 1, $Length).Trim()
                }
                
                function Parse-TddfAmount {
                    param([string]$AmountString)
                    if ([string]::IsNullOrWhiteSpace($AmountString)) { return 0 }
                    try { return ([decimal]$AmountString) / 100 } catch { return 0 }
                }
                
                function Parse-TddfDate {
                    param([string]$DateString)
                    if ($DateString.Length -ne 8) { return $null }
                    $month = $DateString.Substring(0, 2)
                    $day = $DateString.Substring(2, 2)
                    $century = $DateString.Substring(4, 2)
                    $year = $DateString.Substring(6, 2)
                    $fullYear = if ($century -eq "20") { "20$year" } else { "19$year" }
                    try { return [DateTime]::ParseExact("$month/$day/$fullYear", "MM/dd/yyyy", $null) } catch { return $null }
                }
                
                function ConvertTo-TddfJson {
                    param([string]$Line, [int]$LineNumber)
                    $assocNumber = Get-Field $Line 1 17
                    $txnDateRaw = Get-Field $Line 85 8
                    $txnDate = Parse-TddfDate $txnDateRaw
                    
                    return @{
                        associationNumber = $assocNumber
                        merchantAccount = Get-Field $Line 24 16
                        transactionDate = if ($txnDate) { $txnDate.ToString("yyyy-MM-dd") } else { $txnDateRaw }
                        transactionAmount = Parse-TddfAmount (Get-Field $Line 93 11)
                        authAmount = Parse-TddfAmount (Get-Field $Line 104 11)
                        creditDebitIndicator = Get-Field $Line 216 1
                        reversalFlag = Get-Field $Line 217 1
                        merchantName = Get-Field $Line 218 25
                        mccCode = Get-Field $Line 273 4
                        vNumber = Get-Field $Line 277 8
                        cardholderAccount = Get-Field $Line 124 16
                        cardType = Get-Field $Line 253 2
                        referenceNumber = Get-Field $Line 737 50
                        lineNumber = $LineNumber
                        rawLine = $Line
                        recordType = "DT"
                        processedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                    }
                }
                
                function Send-JsonBatch {
                    param([array]$Records, [string]$Endpoint, [int]$BatchNumber)
                    try {
                        $jsonPayload = $Records | ConvertTo-Json -Depth 2 -Compress
                        $headers = @{ 'Content-Type' = 'application/json'; 'Accept' = 'application/json' }
                        $response = Invoke-RestMethod -Uri $Endpoint -Method POST -Body $jsonPayload -Headers $headers -TimeoutSec 30
                        return @{ Success = $true; Message = "Batch $BatchNumber`: $($Records.Count) records sent" }
                    } catch {
                        return @{ Success = $false; Message = "Batch $BatchNumber failed: $($_.Exception.Message)" }
                    }
                }
                
                # Process chunk
                $records = @()
                $batchNumber = 1
                $successCount = 0
                $errorCount = 0
                
                for ($i = 0; $i -lt $ChunkLines.Count; $i++) {
                    $lineNumber = $StartIdx + $i + 1
                    $records += ConvertTo-TddfJson $ChunkLines[$i] $lineNumber
                    
                    if ($records.Count -ge $BatchSz) {
                        $result = Send-JsonBatch $records $EndpointUrl $batchNumber
                        if ($result.Success) { $successCount += $records.Count } else { $errorCount += $records.Count }
                        $records = @()
                        $batchNumber++
                    }
                }
                
                # Send remaining
                if ($records.Count -gt 0) {
                    $result = Send-JsonBatch $records $EndpointUrl $batchNumber
                    if ($result.Success) { $successCount += $records.Count } else { $errorCount += $records.Count }
                }
                
                return @{ ProcessedRecords = $ChunkLines.Count; SuccessCount = $successCount; ErrorCount = $errorCount }
                
            } -ArgumentList $chunk, $startIndex, $chunkSize, $Endpoint, $BatchSize
            
            $jobs += $job
        }
    }
    
    # Monitor job progress
    Write-Host "⏳ Monitoring parallel streams..." -ForegroundColor Cyan
    
    $completedJobs = 0
    $totalProcessed = 0
    $totalSuccess = 0
    $totalErrors = 0
    
    while ($completedJobs -lt $jobs.Count) {
        Start-Sleep -Seconds 2
        
        foreach ($job in $jobs) {
            if ($job.State -eq "Completed" -and $job.HasMoreData) {
                $result = Receive-Job $job
                $totalProcessed += $result.ProcessedRecords
                $totalSuccess += $result.SuccessCount
                $totalErrors += $result.ErrorCount
                $completedJobs++
                
                Write-Host "✅ Stream completed: $($result.ProcessedRecords) processed, $($result.SuccessCount) successful, $($result.ErrorCount) errors" -ForegroundColor Green
            }
            elseif ($job.State -eq "Failed") {
                Write-Warning "❌ Stream failed: $($job.StatusMessage)"
                $completedJobs++
            }
        }
    }
    
    # Cleanup jobs
    $jobs | Remove-Job -Force
    
    # Final summary
    Write-Host "`n📋 Processing Complete!" -ForegroundColor Cyan
    Write-Host "   Total Processed: $totalProcessed" -ForegroundColor White
    Write-Host "   Successful: $totalSuccess" -ForegroundColor Green
    Write-Host "   Errors: $totalErrors" -ForegroundColor Red
    Write-Host "   Success Rate: $([math]::Round(($totalSuccess / [math]::Max($totalProcessed, 1)) * 100, 2))%" -ForegroundColor Yellow
}

# Main execution
try {
    if (!(Test-Path $InputFile)) {
        throw "File not found: $InputFile"
    }
    
    # Set global variables for job scope
    $global:BatchSize = $BatchSize
    
    # Start parallel processing
    Start-ParallelTddfProcessing $InputFile $ApiEndpoint $MaxParallelStreams $BatchSize
    
} catch {
    Write-Error "Error: $($_.Exception.Message)"
    exit 1
}

# Usage Examples:
<#
# Process TDDF file with 4 parallel streams
.\tddf-stream-processor.ps1 -InputFile "large_file.TSYSO" -MaxParallelStreams 4 -BatchSize 1000

# Process with custom API endpoint
.\tddf-stream-processor.ps1 -InputFile "data.TSYSO" -ApiEndpoint "http://your-server:3000/api/tddf/bulk-insert" -BatchSize 500

# High-throughput processing
.\tddf-stream-processor.ps1 -InputFile "huge_file.TSYSO" -MaxParallelStreams 8 -BatchSize 2000
#>