
param (
    [Parameter(Mandatory = $true)]
    [string]$FolderPath,

    [switch]$Detail
)

if (-not (Test-Path $FolderPath)) {
    Write-Error "Folder not found: $FolderPath"
    exit 1
}

$totalFiles = 0
$grandBH = 0
$grandDT = 0
$grandTotalLines = 0
$grandDeposit = 0.0
$grandAuthorization = 0.0
$fileSummaries = @()

Get-ChildItem -Path $FolderPath -File | ForEach-Object {
    $file = $_.FullName
    $totalFiles++

    $bhCount = 0
    $dtCount = 0
    $totalLines = 0
    $netDepositTotal = 0.0
    $authorizationTotal = 0.0

    $batchGroups = @{}
    $currentBatchKey = ""

    Get-Content $file | ForEach-Object {
        $line = $_
        $totalLines++

        if ($line.Length -lt 103) { return }

        $recordType = $line.Substring(17, 2)

        if ($recordType -eq "BH") {
            $bhCount++

            $entryRun = $line.Substring(7, 6).Trim()
            $merchant = $line.Substring(24, 16).Trim()
            $batchKey = "$entryRun-$merchant"
            $currentBatchKey = $batchKey

            $netDepositRaw = $line.Substring(68, 15).Trim()
            $cleanAmount = ($netDepositRaw -replace "[^0-9]", "")
            $netDeposit = if ($cleanAmount -match "^\d+$") { [double]$cleanAmount / 100 } else { 0.0 }

            $netDepositTotal += $netDeposit

            if ($Detail) {
                $batchGroups[$batchKey] = @{
                    NetDeposit = $netDeposit
                    DTTotal = 0.0
                    BatchCount = 1
                    AuthorizationCount = 0
                }
            }
        }
        elseif ($recordType -eq "DT" -and $currentBatchKey -ne "") {
            $dtCount++

            $txnRaw = $line.Substring(92, 11).Trim()
            $txnClean = ($txnRaw -replace "[^0-9]", "")
            $txnAmount = if ($txnClean -match "^\d+$") { [double]$txnClean / 100 } else { 0.0 }

            $authorizationTotal += $txnAmount

            if ($Detail -and $batchGroups.ContainsKey($currentBatchKey)) {
                $batchGroups[$currentBatchKey].DTTotal += $txnAmount
                $batchGroups[$currentBatchKey].AuthorizationCount++
            }
        }
    }

    $fileSummaries += [PSCustomObject]@{
        FileName           = [System.IO.Path]::GetFileName($file)
        NetDepositTotal    = [math]::Round($netDepositTotal, 2)
        AuthorizationTotal = [math]::Round($authorizationTotal, 2)
        BH_Lines           = $bhCount
        DT_Lines           = $dtCount
        Total_Lines        = $totalLines
    }

    $grandBH += $bhCount
    $grandDT += $dtCount
    $grandTotalLines += $totalLines
    $grandDeposit += $netDepositTotal
    $grandAuthorization += $authorizationTotal

    if ($Detail) {
        Write-Host "`nBH vs DT Summary (Batch Net Deposit vs Authorization) for $($file):`n"
        $batchGroups.GetEnumerator() | ForEach-Object {
            $key = $_.Key
            $data = $_.Value
            Write-Host "Batch Number: $key"
            Write-Host ("  Batch Net Deposit:   {0,10:N2}" -f $data.NetDeposit)
            Write-Host ("  Authorization Total: {0,10:N2}" -f $data.DTTotal)
            Write-Host ("  Batch Count: {0}    Authorization Count: {1}`n" -f $data.BatchCount, $data.AuthorizationCount)
        }
    }
}

# Table of file summaries
Write-Host "`n==================== File Summary Table ====================" -ForegroundColor Cyan
$fileSummaries | Format-Table -AutoSize

# Folder summary
Write-Host "`n==================== Folder Summary ====================" -ForegroundColor Yellow
Write-Host "  Folder Path:         $FolderPath"
Write-Host "  Files Processed:     $totalFiles"
Write-Host ("  Total Authorizations:  {0,10:N2}" -f $grandAuthorization)
Write-Host ("  Total Batch Deposit:   {0,10:N2}" -f $grandDeposit)
Write-Host "  Total DT Lines:      $grandDT"
Write-Host "  Total BH Lines:      $grandBH"
Write-Host "  Total Lines:         $grandTotalLines"
