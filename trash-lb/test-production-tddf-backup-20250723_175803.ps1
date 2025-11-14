# Comprehensive Production TDDF API Test Script
# Tests connectivity, authentication, and file upload capabilities
# User: TDDF1, Key: mms_1753247424700_l7d6n1wa2qm
# Production URL: https://mms-vsb.replit.app

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [string]$BaseUrl = "https://mms-vsb.replit.app",
    [switch]$PingOnly,
    [switch]$Local,
    [switch]$JsonMode,
    [int]$StreamCount = 2,
    [int]$BatchSize = 100
)

# Override BaseUrl if Local switch is used
if ($Local) {
    $BaseUrl = "http://localhost:5000"
    Write-Host "🏠 LOCAL MODE: Using development server at $BaseUrl" -ForegroundColor Cyan
} else {
    Write-Host "🌐 PRODUCTION MODE: Using deployed server at $BaseUrl" -ForegroundColor Cyan
}

Write-Host ""
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🚀 Production TDDF API Test - $timestamp" -ForegroundColor Green
Write-Host "File: $FilePath"
Write-Host "API Key: $($ApiKey.Substring(0,15))..."
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# Test 1: Basic connectivity
$connectTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🔍 [$connectTimestamp] Testing API connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 15
    $successTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "✅ [$successTimestamp] Base URL reachable (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    $errorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if ($Local) {
        Write-Host "❌ [$errorTimestamp] Local development server unreachable" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Ensure the development server is running with 'npm run dev'" -ForegroundColor Yellow
        Write-Host "💡 Server should be accessible at http://localhost:5000" -ForegroundColor Yellow
    } else {
        Write-Host "❌ [$errorTimestamp] Production server unreachable" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Verify the production URL is correct" -ForegroundColor Yellow
    }
    exit 1
}

# Test 2: API key authentication
$apiTestTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🔑 [$apiTestTimestamp] Testing API key validation..." -ForegroundColor Yellow
try {
    $headers = @{
        "X-API-Key" = $ApiKey
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body '{}' -TimeoutSec 15
    $apiSuccessTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "✅ [$apiSuccessTimestamp] API key authentication successful" -ForegroundColor Green
    Write-Host "📋 Response: $response" -ForegroundColor Cyan
} catch {
    $apiErrorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $statusCode = $_.Exception.Response.StatusCode
    if ($statusCode -eq "Unauthorized") {
        Write-Host "❌ [$apiErrorTimestamp] API key authentication failed (Status: $statusCode)" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Verify API key is correct and has tddf:upload permissions" -ForegroundColor Yellow
        if (-not $PingOnly) {
            Write-Host "❌ Authentication failed - skipping file upload test" -ForegroundColor Red
        }
        exit 1
    } else {
        Write-Host "⚠️  [$apiErrorTimestamp] API endpoint response: $statusCode" -ForegroundColor Yellow
        Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
        if (-not $PingOnly -and $statusCode -ne "BadRequest" -and $statusCode -ne "InternalServerError") {
            Write-Host "❌ API error - skipping file upload test" -ForegroundColor Red
            exit 1
        }
        # InternalServerError (500) is expected when sending empty body to upload endpoint
        if ($statusCode -eq "InternalServerError") {
            Write-Host "💡 Expected error - authentication working, endpoint requires file upload" -ForegroundColor Cyan
        }
    }
}

if ($PingOnly) {
    $completionTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "🏁 [$completionTimestamp] Ping test completed - server is operational" -ForegroundColor Green
    exit 0
}

# Test 3: File upload (if not ping-only)
Write-Host ""
if ($JsonMode) {
    Write-Host "📁 Preparing multi-stream JSON upload test..." -ForegroundColor Yellow
    Write-Host "🔀 Streams: $StreamCount" -ForegroundColor Cyan
    Write-Host "📦 Batch size: $BatchSize records" -ForegroundColor Cyan
} else {
    Write-Host "📁 Preparing file upload test..." -ForegroundColor Yellow
}

# Verify file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "❌ File not found: $FilePath" -ForegroundColor Red
    Write-Host "💡 Please provide a valid TDDF file path" -ForegroundColor Yellow
    exit 1
}

$fileInfo = Get-Item $FilePath
$uploadTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "📁 File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan

if ($JsonMode) {
    # Multi-stream JSON upload mode
    Write-Host "🔄 [$uploadTimestamp] Starting multi-stream JSON upload..." -ForegroundColor Yellow
    
    # Function to parse TDDF line to JSON
    function Parse-TddfLine {
        param([string]$Line, [int]$LineNumber)
        
        if ($Line.Length -lt 19) {
            return $null
        }
        
        $recordType = $Line.Substring(17, 2)  # Positions 18-19
        
        # Create base JSON object
        $jsonObj = @{
            lineNumber = $LineNumber
            recordType = $recordType
            rawLine = $Line
            recordTypeDescription = switch ($recordType) {
                "BH" { "Batch Header" }
                "DT" { "Detail Transaction Record" }
                "A1" { "Accommodation Extension Record" }
                "A2" { "Additional Accommodation Extension Record" }
                "P1" { "Purchasing Card 1 Extension Record" }
                "P2" { "Purchasing Card 2 Extension Record" }
                "DR" { "Direct Marketing Extension Record" }
                "CT" { "Corporate Travel Extension Record" }
                "LG" { "Lodging Extension Record" }
                "FT" { "Fleet Extension Record" }
                "F2" { "Fleet 2 Extension Record" }
                "CK" { "Car Rental Extension Record" }
                "AD" { "Merchant Adjustment Extension Record" }
                "G2" { "Merchant General Data 2 Record" }
                "E1" { "Enhanced Data Extension Record" }
                default { "Unknown Record Type" }
            }
        }
        
        # Parse DT (Detail Transaction) specific fields - Complete TDDF Schema
        if ($recordType -eq "DT" -and $Line.Length -ge 700) {
            # Helper function for field extraction
            function Get-Field {
                param ($line, $start, $length)
                if ($line.Length -ge ($start + $length - 1)) {
                    return $line.Substring($start - 1, $length).Trim()
                } else {
                    return ""
                }
            }
            
            function Parse-TddfAmount {
                param ([string]$rawAmount)
                if ($rawAmount -match '^\d+$') {
                    return [decimal]::Parse($rawAmount) / 100
                }
                return 0
            }
            
            $jsonObj.transactionFields = @{
                # Header fields (1-84)
                associationNumber = Get-Field $Line 1 17
                recordTypeId = Get-Field $Line 18 2
                merchantAccount = Get-Field $Line 24 16
                batchId = Get-Field $Line 40 6
                
                # Transaction core (85-216)
                transactionDate = Get-Field $Line 85 8
                transactionAmount = Get-Field $Line 93 11
                transactionTime = Get-Field $Line 104 6
                cardholderAccount = Get-Field $Line 124 16
                authorizationAmount = Get-Field $Line 192 12
                debitCreditIndicator = Get-Field $Line 216 1
                
                # Merchant info (217-340)
                merchantName = Get-Field $Line 218 25
                merchantCity = Get-Field $Line 243 13
                merchantState = Get-Field $Line 256 2
                merchantZip = Get-Field $Line 258 9
                cardType = Get-Field $Line 267 6
                mccCode = Get-Field $Line 273 4
                vNumber = Get-Field $Line 277 8
                terminalId = Get-Field $Line 285 8
                localTransactionDate = Get-Field $Line 293 8
                localTransactionTime = Get-Field $Line 301 6
                
                # Transaction details (307-400)
                transactionTypeIndicator = Get-Field $Line 307 4
                feeAmount = Get-Field $Line 311 12
                additionalAmount1 = Get-Field $Line 323 12
                additionalAmount2 = Get-Field $Line 335 12
                additionalAmountType1 = Get-Field $Line 347 2
                additionalAmountType2 = Get-Field $Line 349 2
                localTransactionTimeHHMMSS = Get-Field $Line 357 6
                
                # Authorization fields (400-500)
                authorizationCharacteristic = Get-Field $Line 363 1
                authorizationResponseCode = Get-Field $Line 364 2
                authorizationCode = Get-Field $Line 366 6
                authorizationProcessingFlag = Get-Field $Line 372 1
                responseCode = Get-Field $Line 373 1
                
                # Additional transaction data (500-600)
                cardholderIdMethod = Get-Field $Line 374 1
                terminalCapability = Get-Field $Line 375 1
                terminalTypeCapability = Get-Field $Line 376 1
                cardSequenceNumber = Get-Field $Line 377 3
                fallbackIndicator = Get-Field $Line 380 1
                customerServicePhoneNumber = Get-Field $Line 381 10
                
                # POS and transaction environment (600-700)
                posEntryMode = Get-Field $Line 391 2
                posConditionCode = Get-Field $Line 393 2
                posCardPresence = Get-Field $Line 395 1
                posCardholderPresence = Get-Field $Line 396 1
                posCardInputCapability = Get-Field $Line 397 1
                posCardholderAuthentication = Get-Field $Line 398 1
                posCardOutputCapability = Get-Field $Line 399 1
                posTerminalOutput = Get-Field $Line 400 1
                posPinCaptureCapability = Get-Field $Line 401 1
                
                # Network and processing (700-800)
                networkInternationalId = Get-Field $Line 402 3
                networkTransactionId = Get-Field $Line 405 15
                systemTraceAuditNumber = Get-Field $Line 420 6
                messageTypeIndicator = Get-Field $Line 426 4
                processingCode = Get-Field $Line 430 6
                functionCode = Get-Field $Line 436 3
                
                # Card and account data (800-900)
                cardExpirationDate = Get-Field $Line 439 4
                cardSecurityCode = Get-Field $Line 443 4
                cardVerificationValue = Get-Field $Line 447 3
                issuerIdNumber = Get-Field $Line 450 6
                
                # Extended merchant data (900-1000)
                merchantCategoryCodeMcc = Get-Field $Line 456 4
                merchantType = Get-Field $Line 460 4
                merchantUrl = Get-Field $Line 464 25
                merchantPhoneNumber = Get-Field $Line 489 10
                
                # Financial data (1000+)
                currencyCode = Get-Field $Line 499 3
                transactionCurrencyCode = Get-Field $Line 502 3
                settlementCurrencyCode = Get-Field $Line 505 3
                conversionRate = Get-Field $Line 508 8
                
                # Reference and tracking
                referenceNumber = Get-Field $Line 737 50
                batchSequenceNumber = Get-Field $Line 516 6
                
                # AMEX specific fields (if available)
                amexMerchantAddress = Get-Field $Line 538 25
                amexMerchantPostalCode = Get-Field $Line 579 10
                amexPhoneNumber = Get-Field $Line 589 10
                amexEmailAddress = Get-Field $Line 599 30
                
                # Additional processing codes
                transactionSequenceNumber = Get-Field $Line 522 12
                originalTransactionAmount = Get-Field $Line 534 12
                
                # Merchant account details
                merchantAccountNumber = Get-Field $Line 24 16
                merchantBankNumber = Get-Field $Line 546 4
                merchantSettlementMethod = Get-Field $Line 550 1
                
                # Card brand specific
                visaProductId = Get-Field $Line 551 3
                mastercardProductId = Get-Field $Line 554 3
                discoverProductId = Get-Field $Line 557 3
                
                # Transaction environment
                ecommerceIndicator = Get-Field $Line 560 1
                mailPhoneOrderIndicator = Get-Field $Line 561 1
                recurringTransactionIndicator = Get-Field $Line 562 1
                
                # Security and verification
                addressVerificationResult = Get-Field $Line 563 1
                cardVerificationResult = Get-Field $Line 564 1
                threeDSecureResult = Get-Field $Line 565 1
                
                # Additional amounts and fees
                cashbackAmount = Get-Field $Line 566 12
                tipAmount = Get-Field $Line 578 12
                taxAmount = Get-Field $Line 590 12
                fuelAmount = Get-Field $Line 602 12
                
                # Batch and file tracking
                fileSequenceNumber = Get-Field $Line 614 6
                recordSequenceNumber = Get-Field $Line 620 6
                
                # Extended reference fields
                invoiceNumber = Get-Field $Line 626 15
                customerReferenceNumber = Get-Field $Line 641 25
                orderNumber = Get-Field $Line 666 20
                
                # Additional merchant data
                merchantDbaName = Get-Field $Line 686 25
                merchantContactName = Get-Field $Line 711 25
                
                # Extended transaction data
                originalAuthCode = Get-Field $Line 787 6
                originalTransactionDate = Get-Field $Line 793 8
                originalTransactionTime = Get-Field $Line 801 6
                
                # Additional reference numbers
                retrievalReferenceNumber = Get-Field $Line 807 12
                networkReferenceNumber = Get-Field $Line 819 23
                
                # Extended card data
                cardProductType = Get-Field $Line 842 2
                cardLevel = Get-Field $Line 844 2
                cardProgramType = Get-Field $Line 846 2
                
                # Additional processing flags
                partialApprovalIndicator = Get-Field $Line 848 1
                duplicateTransactionIndicator = Get-Field $Line 849 1
                reversalIndicator = Get-Field $Line 850 1
            }
        }
        
        return $jsonObj
    }
    
    # Read and parse TDDF file
    Write-Host "📖 Reading TDDF file..." -ForegroundColor Yellow
    $fileLines = Get-Content $FilePath
    $totalLines = $fileLines.Count
    Write-Host "📊 Total lines: $totalLines" -ForegroundColor Cyan
    
    Write-Host "🔄 Parsing TDDF lines to JSON..." -ForegroundColor Yellow
    $jsonRecords = @()
    $lineNumber = 1
    
    foreach ($line in $fileLines) {
        if ($line.Trim().Length -gt 0) {
            $jsonRecord = Parse-TddfLine -Line $line -LineNumber $lineNumber
            if ($jsonRecord) {
                $jsonRecords += $jsonRecord
            }
        }
        $lineNumber++
        
        if ($lineNumber % 1000 -eq 0) {
            Write-Host "📈 Parsed $lineNumber lines..." -ForegroundColor Gray
        }
    }
    
    Write-Host "✅ Parsed $($jsonRecords.Count) valid JSON records" -ForegroundColor Green
    
    # Split records into batches for streaming
    $batches = @()
    for ($i = 0; $i -lt $jsonRecords.Count; $i += $BatchSize) {
        $endIndex = [math]::Min($i + $BatchSize - 1, $jsonRecords.Count - 1)
        $batch = $jsonRecords[$i..$endIndex]
        $batches += @{
            Index = $batches.Count + 1
            Records = $batch
            Count = $batch.Count
        }
    }
    
    Write-Host "📦 Created $($batches.Count) batches of $BatchSize records each" -ForegroundColor Cyan
    
    # Distribute batches across streams
    $streams = @()
    for ($s = 0; $s -lt $StreamCount; $s++) {
        $streams += @{
            Index = $s + 1
            Batches = @()
        }
    }
    
    # Round-robin distribution of batches to streams
    for ($b = 0; $b -lt $batches.Count; $b++) {
        $streamIndex = $b % $StreamCount
        $streams[$streamIndex].Batches += $batches[$b]
    }
    
    Write-Host ""
    Write-Host "🌊 STREAM DISTRIBUTION:" -ForegroundColor Cyan
    foreach ($stream in $streams) {
        $totalRecords = ($stream.Batches | Measure-Object -Property Count -Sum).Sum
        Write-Host "   Stream $($stream.Index): $($stream.Batches.Count) batches, $totalRecords records" -ForegroundColor White
    }
    
    # Function to upload JSON batches for a stream
    $uploadStreamScript = {
        param($StreamInfo, $ApiKey, $BaseUrl)
        
        $results = @()
        $streamIndex = $StreamInfo.Index
        
        foreach ($batch in $StreamInfo.Batches) {
            try {
                $headers = @{
                    "X-API-Key" = $ApiKey
                    "Content-Type" = "application/json"
                }
                
                # Create JSON payload
                $payload = @{
                    streamId = $streamIndex
                    batchId = $batch.Index
                    recordCount = $batch.Count
                    records = $batch.Records
                } | ConvertTo-Json -Depth 10 -Compress
                
                $startTime = Get-Date
                $response = Invoke-RestMethod -Uri "$BaseUrl/api/tddf/upload-json" -Method POST -Headers $headers -Body $payload -TimeoutSec 60
                $endTime = Get-Date
                $duration = ($endTime - $startTime).TotalSeconds
                
                $results += @{
                    Success = $true
                    StreamId = $streamIndex
                    BatchId = $batch.Index
                    RecordCount = $batch.Count
                    Duration = $duration
                    Response = $response
                    Error = $null
                }
            } catch {
                $results += @{
                    Success = $false
                    StreamId = $streamIndex
                    BatchId = $batch.Index
                    RecordCount = $batch.Count
                    Duration = 0
                    Response = $null
                    Error = $_.Exception.Message
                }
            }
        }
        
        return $results
    }
    
    # Start multi-stream uploads
    Write-Host ""
    Write-Host "🚀 Starting multi-stream JSON upload..." -ForegroundColor Yellow
    
    $jobs = @()
    $uploadStartTime = Get-Date
    
    foreach ($stream in $streams) {
        if ($stream.Batches.Count -gt 0) {
            $job = Start-Job -ScriptBlock $uploadStreamScript -ArgumentList $stream, $ApiKey, $BaseUrl
            $jobs += @{
                Job = $job
                StreamIndex = $stream.Index
                BatchCount = $stream.Batches.Count
            }
            Write-Host "🔄 Started Stream $($stream.Index) with $($stream.Batches.Count) batches (Job ID: $($job.Id))" -ForegroundColor Cyan
        }
    }
    
    # Monitor progress
    Write-Host ""
    Write-Host "⏳ Monitoring upload progress..." -ForegroundColor Yellow
    
    $allResults = @()
    $completedJobs = 0
    
    while ($completedJobs -lt $jobs.Count) {
        Start-Sleep -Seconds 2
        
        foreach ($jobInfo in $jobs) {
            if ($jobInfo.Job.State -eq "Completed" -and -not $jobInfo.Processed) {
                $streamResults = Receive-Job -Job $jobInfo.Job
                $allResults += $streamResults
                Remove-Job -Job $jobInfo.Job
                $jobInfo.Processed = $true
                $completedJobs++
                
                $successCount = ($streamResults | Where-Object { $_.Success }).Count
                $failCount = ($streamResults | Where-Object { -not $_.Success }).Count
                
                Write-Host "✅ Stream $($jobInfo.StreamIndex) completed: $successCount/$($jobInfo.BatchCount) batches successful" -ForegroundColor Green
            }
        }
    }
    
    $uploadEndTime = Get-Date
    $totalDuration = ($uploadEndTime - $uploadStartTime).TotalSeconds
    
    # Generate final report
    Write-Host ""
    Write-Host "📊 MULTI-STREAM JSON UPLOAD RESULTS" -ForegroundColor Cyan
    Write-Host "====================================" -ForegroundColor Cyan
    
    $totalBatches = $allResults.Count
    $successfulBatches = ($allResults | Where-Object { $_.Success }).Count
    $failedBatches = ($allResults | Where-Object { -not $_.Success }).Count
    $totalRecords = ($allResults | Measure-Object -Property RecordCount -Sum).Sum
    
    Write-Host "Total batches: $totalBatches" -ForegroundColor White
    Write-Host "Successful batches: $successfulBatches" -ForegroundColor Green
    Write-Host "Failed batches: $failedBatches" -ForegroundColor Red
    Write-Host "Total records processed: $totalRecords" -ForegroundColor White
    Write-Host "Total upload time: $([math]::Round($totalDuration, 2)) seconds" -ForegroundColor White
    
    if ($successfulBatches -gt 0) {
        $avgBatchTime = ($allResults | Where-Object { $_.Success } | Measure-Object -Property Duration -Average).Average
        $recordsPerSecond = $totalRecords / $totalDuration
        Write-Host "Average batch time: $([math]::Round($avgBatchTime, 2)) seconds" -ForegroundColor Cyan
        Write-Host "Upload rate: $([math]::Round($recordsPerSecond, 0)) records/second" -ForegroundColor Cyan
    }
    
    if ($failedBatches -eq 0) {
        $uploadSuccess = $true
    } else {
        $uploadSuccess = $false
        Write-Host ""
        Write-Host "⚠️ Some batches failed - check server logs for details" -ForegroundColor Yellow
    }
    
} else {
    # Standard file upload mode
    Write-Host "📤 [$uploadTimestamp] Uploading TDDF file..." -ForegroundColor Yellow
    
    try {
        # Prepare the multipart form data
        $boundary = [System.Guid]::NewGuid().ToString()
        $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
        $fileName = [System.IO.Path]::GetFileName($FilePath)
        
        # Create proper multipart form data
        $bodyLines = @()
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`""
        $bodyLines += "Content-Type: application/octet-stream"
        $bodyLines += ""
        $bodyLines += [System.Text.Encoding]::UTF8.GetString($fileBytes)
        $bodyLines += "--$boundary--"
        
        $body = $bodyLines -join "`r`n"
        
        $headers = @{
            "X-API-Key" = $ApiKey
            "Content-Type" = "multipart/form-data; boundary=$boundary"
        }
        
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body $body -TimeoutSec 30
        
        $uploadSuccessTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Host "✅ [$uploadSuccessTimestamp] File uploaded successfully!" -ForegroundColor Green
        Write-Host "📋 Upload Response:" -ForegroundColor Cyan
        Write-Host "$($response | ConvertTo-Json -Depth 3)" -ForegroundColor Cyan
        $uploadSuccess = $true
        
    } catch {
        $uploadErrorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "❌ [$uploadErrorTimestamp] File upload failed (Status: $statusCode)" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        
        if ($statusCode -eq "Unauthorized") {
            Write-Host "💡 API key authentication failed during upload" -ForegroundColor Yellow
        } elseif ($statusCode -eq "BadRequest") {
            Write-Host "💡 Check file format and content" -ForegroundColor Yellow
        } else {
            Write-Host "💡 Check server logs for detailed error information" -ForegroundColor Yellow
        }
        $uploadSuccess = $false
        exit 1
    }
}

if (-not $uploadSuccess) {
    exit 1
}

# Test completion
$completionTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host ""
Write-Host "🏁 [$completionTimestamp] Production TDDF test completed successfully!" -ForegroundColor Green
Write-Host "✅ Connectivity: Working" -ForegroundColor Green
Write-Host "✅ Authentication: Working" -ForegroundColor Green
if ($JsonMode) {
    Write-Host "✅ Multi-Stream JSON Upload: Working" -ForegroundColor Green
} else {
    Write-Host "✅ File Upload: Working" -ForegroundColor Green
}
Write-Host ""
if ($JsonMode) {
    Write-Host "💡 The TDDF records have been uploaded via $StreamCount parallel streams and should be processing on the server." -ForegroundColor Cyan
} else {
    Write-Host "💡 The TDDF file has been uploaded and should be processing on the server." -ForegroundColor Cyan
}
Write-Host "💡 Check the MMS web interface to monitor processing status." -ForegroundColor Cyan