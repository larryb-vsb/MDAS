# Production TDDF API Test Script
# Tests against deployed production environment
# User: TDDF1, Key: mms_1753247424700_l7d6n1wa2qm

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [switch]$PingOnly
)

# Production URL - update this after deployment
$BaseUrl = "https://your-production-url.replit.app"

Write-Host "🚀 Production TDDF API Test" -ForegroundColor Green
Write-Host "File: $FilePath"
Write-Host "API Key: $($ApiKey.Substring(0,15))..."
Write-Host "Production URL: $BaseUrl"
Write-Host ""

# Test connectivity
Write-Host "🔍 Testing production API connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 15
    Write-Host "✅ Production server reachable (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Production server unreachable" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Verify the production URL is correct" -ForegroundColor Yellow
    exit 1
}

# Test API endpoint
Write-Host "🔑 Testing API endpoint availability..." -ForegroundColor Yellow
try {
    $headers = @{
        "X-API-Key" = $ApiKey
        "X-Requested-With" = "XMLHttpRequest"
    }
    $endpoint = "$BaseUrl/api/tddf/upload"
    $response = Invoke-WebRequest -Uri $endpoint -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 15
    Write-Host "✅ API endpoint accessible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    $statusCode = $_.Exception.Response.StatusCode
    if ($statusCode -eq "MethodNotAllowed") {
        Write-Host "✅ API endpoint exists (Method not allowed for GET expected)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  API endpoint response: $statusCode" -ForegroundColor Yellow
    }
}

if ($PingOnly) {
    Write-Host "🏁 Production ping test completed" -ForegroundColor Green
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
Write-Host "📤 Uploading TDDF file to production API..." -ForegroundColor Yellow
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
        "X-API-Key" = $ApiKey
        "X-Requested-With" = "XMLHttpRequest"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }
    
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 180
    
    Write-Host "✅ Production upload successful!" -ForegroundColor Green
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
    
    Write-Host "❌ Production upload failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Status Code: $statusCode" -ForegroundColor Red
    if ($responseBody) {
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🏁 Production TDDF API test completed" -ForegroundColor Green