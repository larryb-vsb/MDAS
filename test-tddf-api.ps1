# PowerShell TDDF API Upload Test Script
# This script tests the TDDF upload endpoint using the TDDF1 API key

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [string]$BaseUrl = "https://replit.com/t/vermont-state-bank/repls/MMS"
)

Write-Host "🚀 TDDF API Upload Test" -ForegroundColor Green
Write-Host "File: $FilePath" -ForegroundColor Cyan
Write-Host "API Key: $($ApiKey.Substring(0,15))..." -ForegroundColor Cyan
Write-Host "Endpoint: $BaseUrl/api/tddf/upload" -ForegroundColor Cyan
Write-Host ""

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