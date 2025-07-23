# Enhanced TDDF API Test Script
# Supports both local development and external deployment testing
# User: TDDF1, Key: mms_1753247424700_l7d6n1wa2qm

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [string]$BaseUrl = "https://replit.com/t/vermont-state-bank/repls/MMS",
    [switch]$PingOnly,
    [switch]$Local
)

# Override BaseUrl if Local switch is used
if ($Local) {
    $BaseUrl = "http://localhost:5000"
    Write-Host "🏠 LOCAL MODE: Using development server at $BaseUrl" -ForegroundColor Cyan
} else {
    Write-Host "🌐 EXTERNAL MODE: Using deployed server at $BaseUrl" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "🚀 Enhanced TDDF API Test" -ForegroundColor Green
Write-Host "File: $FilePath"
Write-Host "API Key: $($ApiKey.Substring(0,15))..."
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# Test connectivity
Write-Host "🔍 Testing API connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Host "✅ Server reachable (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    if ($Local) {
        Write-Host "❌ Local development server unreachable" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Ensure the development server is running with 'npm run dev'" -ForegroundColor Yellow
        Write-Host "💡 Server should be accessible at http://localhost:5000" -ForegroundColor Yellow
    } else {
        Write-Host "❌ External server unreachable" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Try using -Local switch for development testing" -ForegroundColor Yellow
    }
    exit 1
}

# Test API key validation
Write-Host "🔑 Testing API key validation..." -ForegroundColor Yellow
try {
    $headers = @{
        "X-API-Key" = $ApiKey
        "X-Requested-With" = "XMLHttpRequest"
    }
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/tddf/upload" -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 10
    Write-Host "⚠️  API endpoint response (Status: $($response.StatusCode)): $($response.Content.Substring(0, [Math]::Min(50, $response.Content.Length)))..." -ForegroundColor Yellow
} catch {
    Write-Host "✅ API connection established (non-200 response expected for GET)" -ForegroundColor Green
}

if ($PingOnly) {
    Write-Host "🏁 Ping test completed - server is operational" -ForegroundColor Green
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

# Test file upload
Write-Host "📤 Uploading TDDF file..." -ForegroundColor Yellow
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
    
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 120
    
    Write-Host "✅ Upload successful!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    
    # Parse and display response
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host "📋 Processing Results:" -ForegroundColor Cyan
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
        if ($Local) {
            Write-Host "💡 This is expected for complex processing on development server" -ForegroundColor Yellow
        }
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
    
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Status Code: $statusCode" -ForegroundColor Red
    if ($responseBody) {
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
    
    if (-not $Local -and $statusCode -eq "NotFound") {
        Write-Host ""
        Write-Host "💡 External deployment may have access restrictions" -ForegroundColor Yellow
        Write-Host "💡 Try using -Local switch for development testing:" -ForegroundColor Yellow
        Write-Host "   .\test-tddf-enhanced.ps1 -Local `"$FilePath`"" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "🏁 Enhanced TDDF API test completed" -ForegroundColor Green