# TDDF Conversion Script
# Converts TDDF (Transaction Daily Detail File) fixed-width format to structured data
# Based on TSYS TDDF specification

param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputFile = "",
    
    [Parameter(Mandatory=$false)]
    [string]$Format = "JSON"  # JSON, CSV, or PSObject
)

# Helper function to extract fields from fixed-width TDDF lines
function Get-Field {
    param(
        [string]$Line,
        [int]$StartPosition,
        [int]$Length
    )
    
    if ($Line.Length -lt ($StartPosition + $Length - 1)) {
        return ""
    }
    
    return $Line.Substring($StartPosition - 1, $Length).Trim()
}

# Helper function to parse TDDF date format (MMDDCCYY)
function Parse-TddfDate {
    param([string]$DateString)
    
    if ($DateString.Length -ne 8) {
        return $null
    }
    
    $month = $DateString.Substring(0, 2)
    $day = $DateString.Substring(2, 2)
    $century = $DateString.Substring(4, 2)
    $year = $DateString.Substring(6, 2)
    
    # Handle century conversion (20 = 2000s, 19 = 1900s)
    if ($century -eq "20") {
        $fullYear = "20$year"
    } elseif ($century -eq "19") {
        $fullYear = "19$year"
    } else {
        $fullYear = "20$year"  # Default to 2000s
    }
    
    try {
        return [DateTime]::ParseExact("$month/$day/$fullYear", "MM/dd/yyyy", $null)
    } catch {
        return $null
    }
}

# Helper function to parse amounts (divide by 100 for cents to dollars)
function Parse-TddfAmount {
    param([string]$AmountString)
    
    if ([string]::IsNullOrWhiteSpace($AmountString)) {
        return 0
    }
    
    try {
        $amount = [decimal]$AmountString
        return $amount / 100  # Convert cents to dollars
    } catch {
        return 0
    }
}

# Main processing function
function Convert-TddfFile {
    param([string]$FilePath)
    
    if (!(Test-Path $FilePath)) {
        throw "File not found: $FilePath"
    }
    
    $lines = Get-Content $FilePath
    $records = @()
    $lineNumber = 0
    
    foreach ($line in $lines) {
        $lineNumber++
        
        # Skip empty lines
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        
        # Check if this is a DT (Detail Transaction) record
        $recordType = Get-Field $line 18 2
        
        if ($recordType -eq "DT") {
            # Extract Association Number from positions 1-17
            $assocNumber = Get-Field $line 1 17
            
            # Parse transaction date from positions 85-92 (MMDDCCYY format)
            $txnDateRaw = Get-Field $line 85 8
            $txnDate = Parse-TddfDate $txnDateRaw
            
            # Create the record object matching your PowerShell spec
            $record = [PSCustomObject]@{
                RecordLine        = $line
                RecordType        = "DT"
                AssociationNumber = $assocNumber
                MerchantAcct      = Get-Field $line 24 16  # Account Number (positions 24-39)
                TxnDate           = if ($txnDate) { $txnDate.ToString("yyyy-MM-dd") } else { $txnDateRaw }
                TxnAmount         = Parse-TddfAmount (Get-Field $line 93 11)  # Transaction Amount (positions 93-103)
                CreditOrDebit     = Get-Field $line 216 1  # C or D (position 216)
                Reversal          = Get-Field $line 217 1  # Y or N (position 217)
                MerchantName      = Get-Field $line 218 25  # DBA Name (positions 218-242)
                MCC               = Get-Field $line 273 4   # MCC Code (positions 273-276)
                VNumber           = Get-Field $line 277 8   # V Number (positions 277-284)
                CardholderAcct    = Get-Field $line 124 16  # Card number (positions 124-139)
                CardType          = Get-Field $line 253 2   # Card Type (positions 253-254)
                LineNumber        = $lineNumber
                ProcessedAt       = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            }
            
            $records += $record
        }
        else {
            Write-Verbose "Skipping non-DT record at line $lineNumber`: $recordType"
        }
    }
    
    return $records
}

# Main execution
try {
    Write-Host "Converting TDDF file: $InputFile" -ForegroundColor Green
    
    $convertedRecords = Convert-TddfFile $InputFile
    
    Write-Host "Found $($convertedRecords.Count) DT records" -ForegroundColor Yellow
    
    # Output handling
    if ([string]::IsNullOrWhiteSpace($OutputFile)) {
        $OutputFile = [System.IO.Path]::ChangeExtension($InputFile, "")
        
        switch ($Format.ToUpper()) {
            "JSON" { $OutputFile += "_converted.json" }
            "CSV" { $OutputFile += "_converted.csv" }
            default { $OutputFile += "_converted.json" }
        }
    }
    
    # Export based on format
    switch ($Format.ToUpper()) {
        "JSON" {
            $convertedRecords | ConvertTo-Json -Depth 3 | Out-File $OutputFile -Encoding UTF8
            Write-Host "JSON output saved to: $OutputFile" -ForegroundColor Green
        }
        "CSV" {
            $convertedRecords | Export-Csv $OutputFile -NoTypeInformation -Encoding UTF8
            Write-Host "CSV output saved to: $OutputFile" -ForegroundColor Green
        }
        "PSOBJECT" {
            Write-Host "PowerShell objects returned (not saved to file)" -ForegroundColor Yellow
            return $convertedRecords
        }
        default {
            $convertedRecords | ConvertTo-Json -Depth 3 | Out-File $OutputFile -Encoding UTF8
            Write-Host "Default JSON output saved to: $OutputFile" -ForegroundColor Green
        }
    }
    
    # Display sample records
    if ($convertedRecords.Count -gt 0) {
        Write-Host "`nSample records:" -ForegroundColor Cyan
        $convertedRecords | Select-Object -First 3 | Format-Table -AutoSize
        
        Write-Host "`nField Summary:" -ForegroundColor Cyan
        Write-Host "- Total DT Records: $($convertedRecords.Count)"
        Write-Host "- Unique Merchants: $(($convertedRecords | Group-Object MerchantAcct).Count)"
        Write-Host "- Date Range: $(($convertedRecords.TxnDate | Sort-Object)[0]) to $(($convertedRecords.TxnDate | Sort-Object)[-1])"
        Write-Host "- Total Amount: `$$(($convertedRecords.TxnAmount | Measure-Object -Sum).Sum)"
    }
    
} catch {
    Write-Error "Error processing TDDF file: $($_.Exception.Message)"
    exit 1
}

# Usage examples:
<#
# Convert TDDF file to JSON
.\tddf-convert.ps1 -InputFile "sample.TSYSO" -Format JSON

# Convert TDDF file to CSV with custom output
.\tddf-convert.ps1 -InputFile "sample.TSYSO" -OutputFile "transactions.csv" -Format CSV

# Return PowerShell objects for further processing
$records = .\tddf-convert.ps1 -InputFile "sample.TSYSO" -Format PSObject
#>