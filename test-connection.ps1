param(
    [string]$Url,
    [string]$Key
)

try {
    $headers = @{
        "X-API-Key" = $Key
    }
    
    $response = Invoke-RestMethod -Uri "$Url/api/uploader/ping" -Method GET -Headers $headers
    
    Write-Host "`n=== MMS Server Ping ===" -ForegroundColor Cyan
    Write-Host "Server: $Url" -ForegroundColor Gray
    Write-Host "`nStatus: $($response.status)" -ForegroundColor Green
    Write-Host "Environment: $($response.environment)" -ForegroundColor Gray
    Write-Host "Message: $($response.message)" -ForegroundColor Gray
    Write-Host "`n✓ Connection successful!" -ForegroundColor Green
}
catch {
    Write-Host "`n✗ Connection failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "`nAuthentication failed. Please check your API key." -ForegroundColor Yellow
    }
}
