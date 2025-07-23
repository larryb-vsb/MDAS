# Simple Local TDDF API Test Script
# Designed for local development testing only
# User: TDDF1, Key: mms_1753247424700_l7d6n1wa2qm

param(
    [string]$FilePath = "test_tddf_sample.TSYSO",
    [string]$ApiKey = "mms_1753247424700_l7d6n1wa2qm",
    [switch]$PingOnly
)

$BaseUrl = "http://localhost:5000"

Write-Host "🚀 Local TDDF API Test" -ForegroundColor Green
Write-Host "API Key: $($ApiKey.Substring(0,15))..."
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# Test connectivity
Write-Host "🔍 Testing local API connectivity..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -UseBasicParsing -TimeoutSec 10
    Write-Host "✅ Local server reachable (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Local server unreachable" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure the development server is running with 'npm run dev'" -ForegroundColor Yellow
    exit 1
}

if ($PingOnly) {
    Write-Host "🏁 Ping test completed - local server is running" -ForegroundColor Green
    exit 0
}

# Create test file if it doesn't exist
if (-not (Test-Path $FilePath)) {
    Write-Host "📝 Creating test TDDF file: $FilePath" -ForegroundColor Yellow
    $testContent = @"
BH01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345
DT01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345
"@
    $testContent | Out-File -FilePath $FilePath -Encoding ASCII
    Write-Host "✅ Test file created with sample BH and DT records" -ForegroundColor Green
}

# Test file upload
Write-Host "📤 Uploading TDDF file to local API..." -ForegroundColor Yellow
try {
    $headers = @{
        "X-API-Key" = $ApiKey
        "X-Requested-With" = "XMLHttpRequest"
    }
    
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
    $fileName = [System.IO.Path]::GetFileName($FilePath)
    
    $bodyTemplate = @"
--{0}
Content-Disposition: form-data; name="file"; filename="{1}"
Content-Type: application/octet-stream

{2}
--{0}--
"@
    
    $body = $bodyTemplate -f $boundary, $fileName, [System.Text.Encoding]::ASCII.GetString($fileBytes)
    $headers["Content-Type"] = "multipart/form-data; boundary=$boundary"
    
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/tddf/upload" -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 30
    
    Write-Host "✅ Upload successful!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($response.Content)" -ForegroundColor Cyan
    
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
}

Write-Host ""
Write-Host "🏁 Local TDDF API test completed" -ForegroundColor Green