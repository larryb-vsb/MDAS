# Production TDDF API Test Script
# Tests against deployed production environment
# User: TDDF1, Key: mms_1753247424700_l7d6n1wa2qm

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [switch]$PingOnly
)

# Production URL - update this after deployment
$BaseUrl = "https://merchant-management-system--vermont-state-bank.replit.app"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🚀 Production TDDF API Test - $timestamp" -ForegroundColor Green
Write-Host "File: $FilePath"
Write-Host "API Key: $($ApiKey.Substring(0,15))..."
Write-Host "Production URL: $BaseUrl"
Write-Host ""

# Test connectivity
$connectTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🔍 [$connectTimestamp] Testing production API connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 15
    $successTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "✅ [$successTimestamp] Production server reachable (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    $errorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "❌ [$errorTimestamp] Production server unreachable" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Verify the production URL is correct" -ForegroundColor Yellow
    exit 1
}

# Test API endpoint with proper Bearer authentication
$apiTestTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🔑 [$apiTestTimestamp] Testing API endpoint availability..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "application/json"
    }
    $endpoint = "$BaseUrl/api/tddf/upload"
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headers -Body '{}' -TimeoutSec 15
    $apiSuccessTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "✅ [$apiSuccessTimestamp] API endpoint accessible and authenticated" -ForegroundColor Green
    Write-Host "📋 Response: $response" -ForegroundColor Cyan
} catch {
    $apiErrorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $statusCode = $_.Exception.Response.StatusCode
    Write-Host "⚠️  [$apiErrorTimestamp] API endpoint response: $statusCode" -ForegroundColor Yellow
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
}

if ($PingOnly) {
    $completionTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "🏁 [$completionTimestamp] Production ping test completed" -ForegroundColor Green
    exit 0
}

# Verify file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "❌ File not found: $FilePath" -ForegroundColor Red
    Write-Host "💡 Please provide a valid TDDF file path" -ForegroundColor Yellow
    exit 1
}

$fileInfo = Get-Item $FilePath
Write-Host "📁 File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan

# Test file upload to production
$uploadStartTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "📤 [$uploadStartTimestamp] Uploading TDDF file to production API..." -ForegroundColor Yellow
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
    $bodyLines += [System.Text.Encoding]::ASCII.GetString($fileBytes)
    $bodyLines += "--$boundary--"
    
    $body = $bodyLines -join "`r`n"
    
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }
    
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 180
    
    $uploadSuccessTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "✅ [$uploadSuccessTimestamp] Production upload successful!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    
    # Parse and display response
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host "📋 Production Processing Results:" -ForegroundColor Cyan
    Write-Host "   File ID: $($responseData.fileId)" -ForegroundColor White
    Write-Host "   Message: $($responseData.message)" -ForegroundColor White
    Write-Host "   Uploaded By: $($responseData.uploadedBy)" -ForegroundColor White
    Write-Host "   Upload Time: $($responseData.uploadedAt)" -ForegroundColor White
    
    if ($responseData.processingResults) {
        Write-Host ""
        Write-Host "📊 Processing Details:" -ForegroundColor Cyan
        Write-Host "   Raw Lines: $($responseData.processingResults.rawLinesProcessed)" -ForegroundColor White
        Write-Host "   TDDF Records: $($responseData.processingResults.tddfRecordsCreated)" -ForegroundColor White
        Write-Host "   Errors: $($responseData.processingResults.errors)" -ForegroundColor White
        Write-Host "   Processing Time: $($responseData.processingResults.processingTime)" -ForegroundColor White
    }
    
    if ($responseData.processingError) {
        Write-Host ""
        Write-Host "⚠️  Processing Warning: $($responseData.processingError)" -ForegroundColor Yellow
    }
    
} catch {
    $statusCode = $_.Exception.Response.StatusCode
    $responseBody = ""
    if ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $responseBody = $reader.ReadToEnd()
        } catch {}
    }
    
    $uploadErrorTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "❌ [$uploadErrorTimestamp] Production upload failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Status Code: $statusCode" -ForegroundColor Red
    if ($responseBody) {
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
$finalTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "🏁 [$finalTimestamp] Production TDDF API test completed" -ForegroundColor Green