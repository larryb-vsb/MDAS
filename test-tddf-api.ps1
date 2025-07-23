# PowerShell TDDF API Upload Test Script
# This script tests the TDDF upload endpoint using the TDDF1 API key

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [string]$BaseUrl = "https://merchant-management-system-mms--vermont-state-bank.replit.app",
    [switch]$PingOnly,
    [switch]$Local
)

# TDDF1 API User Configuration
# User: TDDF1 
# Key: mms_1753247424700_l7d6n1wa2qm
# Permissions: tddf:upload
# Production URL: https://merchant-management-system-mms--vermont-state-bank.replit.app
# 
# Usage Examples:
# .\test-tddf-api.ps1 -PingOnly                    # Test connectivity only
# .\test-tddf-api.ps1 -Local -PingOnly             # Test local development server
# .\test-tddf-api.ps1                              # Full upload test with default file
# .\test-tddf-api.ps1 -Local                       # Test against local development server
# .\test-tddf-api.ps1 -FilePath "myfile.TSYSO"     # Upload specific file

if ($Local) {
    $BaseUrl = "http://localhost:5000"
}

Write-Host "🚀 TDDF API Test" -ForegroundColor Green
if ($PingOnly) {
    Write-Host "Mode: Connectivity Test (Ping Only)" -ForegroundColor Yellow
} else {
    Write-Host "Mode: Full Upload Test" -ForegroundColor Yellow
    Write-Host "File: $FilePath" -ForegroundColor Cyan
}
Write-Host "API Key: $($ApiKey.Substring(0,15))..." -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Cyan
Write-Host ""

# Ping test function
function Test-ApiConnectivity {
    param([string]$BaseUrl, [string]$ApiKey)
    
    Write-Host "🔍 Testing API connectivity..." -ForegroundColor Yellow
    
    # Test basic connectivity to main site
    try {
        $pingResponse = Invoke-WebRequest -Uri $BaseUrl -Method GET -TimeoutSec 10 -UseBasicParsing
        Write-Host "✅ Base URL reachable (Status: $($pingResponse.StatusCode))" -ForegroundColor Green
    } catch {
        Write-Host "❌ Base URL unreachable: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
    
    # Test API endpoint accessibility
    $headers = @{
        "X-API-Key" = $ApiKey
        "X-Requested-With" = "XMLHttpRequest" 
        "Origin" = "https://replit.com"
        "Referer" = $BaseUrl
    }
    
    try {
        Write-Host "🔑 Testing API key validation..." -ForegroundColor Yellow
        $apiResponse = Invoke-WebRequest -Uri "$BaseUrl/api/tddf" -Method GET -Headers $headers -TimeoutSec 10 -UseBasicParsing
        Write-Host "✅ API endpoint reachable (Status: $($apiResponse.StatusCode))" -ForegroundColor Green
        return $true
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "⚠️  API endpoint response (Status: $statusCode): $($_.Exception.Message)" -ForegroundColor Yellow
        
        if ($statusCode -eq 401) {
            Write-Host "❌ API key authentication failed" -ForegroundColor Red
            return $false
        } elseif ($statusCode -eq 404) {
            Write-Host "⚠️  Endpoint not found - may need different URL path" -ForegroundColor Yellow
            return $true  # Connection works, just wrong endpoint
        } else {
            Write-Host "✅ API connection established (non-200 response expected for GET)" -ForegroundColor Green
            return $true
        }
    }
}

# Run ping test
$connectivityTest = Test-ApiConnectivity -BaseUrl $BaseUrl -ApiKey $ApiKey

if ($PingOnly) {
    if ($connectivityTest) {
        Write-Host "✅ Connectivity test passed - API is reachable" -ForegroundColor Green
    } else {
        Write-Host "❌ Connectivity test failed" -ForegroundColor Red
    }
    Write-Host "🏁 Ping test completed" -ForegroundColor Green
    exit
}

if (-not $connectivityTest) {
    Write-Host "❌ Connectivity test failed - aborting upload test" -ForegroundColor Red
    exit 1
}

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-Host "❌ Error: File '$FilePath' not found" -ForegroundColor Red
    exit 1
}

# Prepare the multipart form data
$fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
$fileName = [System.IO.Path]::GetFileName($FilePath)
$boundary = [System.Guid]::NewGuid().ToString()

# Create multipart form data
$LF = "`n"
$bodyArray = @()

# File part
$bodyArray += "--$boundary"
$bodyArray += "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`""
$bodyArray += "Content-Type: application/octet-stream"
$bodyArray += ""

# Convert file bytes to string for form data
$fileContent = [System.Text.Encoding]::UTF8.GetString($fileBytes)
$bodyArray += $fileContent
$bodyArray += "--$boundary--"

$body = ($bodyArray -join $LF)

# Prepare headers
$headers = @{
    "X-API-Key" = $ApiKey
    "X-Requested-With" = "XMLHttpRequest"
    "Origin" = "https://replit.com"
    "Referer" = "$BaseUrl"
    "Content-Type" = "multipart/form-data; boundary=$boundary"
}

try {
    Write-Host "📤 Uploading TDDF file..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body $body -TimeoutSec 30
    
    Write-Host "✅ Upload successful!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor White
    $response | ConvertTo-Json -Depth 5 | Write-Host
    
} catch {
    Write-Host "❌ Upload failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "Status Code: $statusCode" -ForegroundColor Yellow
        
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $errorBody = $reader.ReadToEnd()
            Write-Host "Response Body: $errorBody" -ForegroundColor Yellow
        } catch {
            Write-Host "Could not read error response body" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "🏁 Test completed" -ForegroundColor Green