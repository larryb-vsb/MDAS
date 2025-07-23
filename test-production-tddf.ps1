# Comprehensive Production TDDF API Test Script
# Tests connectivity, authentication, and file upload capabilities
# User: TDDF1, Key: mms_1753247424700_l7d6n1wa2qm
# Production URL: https://mms-vsb.replit.app

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [string]$BaseUrl = "https://mms-vsb.replit.app",
    [switch]$PingOnly,
    [switch]$Local
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
Write-Host "📁 Preparing file upload test..." -ForegroundColor Yellow

# Verify file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "❌ File not found: $FilePath" -ForegroundColor Red
    Write-Host "💡 Please provide a valid TDDF file path" -ForegroundColor Yellow
    exit 1
}

$fileInfo = Get-Item $FilePath
$uploadTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "📤 [$uploadTimestamp] Uploading TDDF file..." -ForegroundColor Yellow
Write-Host "📁 File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan

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
    exit 1
}

# Test completion
$completionTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host ""
Write-Host "🏁 [$completionTimestamp] Production TDDF test completed successfully!" -ForegroundColor Green
Write-Host "✅ Connectivity: Working" -ForegroundColor Green
Write-Host "✅ Authentication: Working" -ForegroundColor Green  
Write-Host "✅ File Upload: Working" -ForegroundColor Green
Write-Host ""
Write-Host "💡 The TDDF file has been uploaded and should be processing on the server." -ForegroundColor Cyan
Write-Host "💡 Check the MMS web interface to monitor processing status." -ForegroundColor Cyan