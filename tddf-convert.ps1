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
            
            # Create the comprehensive record object with all TDDF fields
            $record = [PSCustomObject]@{
                # Core identification fields
                RecordLine        = $line
                RecordType        = "DT"
                LineNumber        = $lineNumber
                ProcessedAt       = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                
                # Header fields (positions 1-23)
                AssociationNumber = $assocNumber                               # Positions 1-17
                RecordTypePosition = Get-Field $line 18 2                     # Positions 18-19
                FilerNumber       = Get-Field $line 20 4                      # Positions 20-23
                
                # Core merchant and transaction fields (positions 24-103)
                MerchantAcct      = Get-Field $line 24 16                     # Account Number (positions 24-39)
                MerchantId        = Get-Field $line 40 16                     # Merchant ID (positions 40-55)
                BatchDate         = Get-Field $line 56 8                      # Batch Date (positions 56-63)
                BatchNumber       = Get-Field $line 64 6                      # Batch Number (positions 64-69)
                BatchSequence     = Get-Field $line 70 6                      # Batch Sequence (positions 70-75)
                ItemSequence      = Get-Field $line 76 9                      # Item Sequence (positions 76-84)
                TxnDate           = if ($txnDate) { $txnDate.ToString("yyyy-MM-dd") } else { $txnDateRaw }  # Positions 85-92
                TxnAmount         = Parse-TddfAmount (Get-Field $line 93 11)  # Transaction Amount (positions 93-103)
                
                # Authorization and settlement fields (positions 104-123)
                AuthAmount        = Parse-TddfAmount (Get-Field $line 104 11) # Auth Amount (positions 104-114)
                AuthCode          = Get-Field $line 115 6                     # Auth Code (positions 115-120)
                AuthDate          = Get-Field $line 121 3                     # Auth Date (positions 121-123)
                
                # Cardholder account fields (positions 124-142)
                CardholderAcct    = Get-Field $line 124 16                    # Card number (positions 124-139)
                CardExpiry        = Get-Field $line 140 4                     # Card Expiry (positions 140-143)
                
                # Transaction processing fields (positions 144-215)
                PosEntryMode      = Get-Field $line 144 2                     # POS Entry Mode (positions 144-145)
                PosConditionCode  = Get-Field $line 146 2                     # POS Condition Code (positions 146-147)
                TransactionType   = Get-Field $line 148 2                     # Transaction Type (positions 148-149)
                ProcessingCode    = Get-Field $line 150 6                     # Processing Code (positions 150-155)
                ResponseCode      = Get-Field $line 156 2                     # Response Code (positions 156-157)
                TerminalCapability = Get-Field $line 158 1                    # Terminal Capability (position 158)
                CardPresent       = Get-Field $line 159 1                     # Card Present (position 159)
                CardholderPresent = Get-Field $line 160 1                     # Cardholder Present (position 160)
                CardInputCapability = Get-Field $line 161 1                   # Card Input Capability (position 161)
                CardholderAuth    = Get-Field $line 162 1                     # Cardholder Auth (position 162)
                CardOutputCapability = Get-Field $line 163 1                  # Card Output Capability (position 163)
                TerminalOutputCapability = Get-Field $line 164 1              # Terminal Output Capability (position 164)
                PinCapability     = Get-Field $line 165 1                     # PIN Capability (position 165)
                TerminalType      = Get-Field $line 166 1                     # Terminal Type (position 166)
                CvvResult         = Get-Field $line 167 1                     # CVV Result (position 167)
                AvsResult         = Get-Field $line 168 1                     # AVS Result (position 168)
                CashbackAmount    = Parse-TddfAmount (Get-Field $line 169 11) # Cashback Amount (positions 169-179)
                SurchargeAmount   = Parse-TddfAmount (Get-Field $line 180 11) # Surcharge Amount (positions 180-190)
                TipAmount         = Parse-TddfAmount (Get-Field $line 191 11) # Tip Amount (positions 191-201)
                ConvenienceFee    = Parse-TddfAmount (Get-Field $line 202 11) # Convenience Fee (positions 202-212)
                TaxAmount         = Parse-TddfAmount (Get-Field $line 213 3)  # Tax Amount (positions 213-215)
                
                # Transaction status and merchant info (positions 216-242)
                CreditOrDebit     = Get-Field $line 216 1                     # C or D (position 216)
                Reversal          = Get-Field $line 217 1                     # Y or N (position 217)
                MerchantName      = Get-Field $line 218 25                    # DBA Name (positions 218-242)
                
                # Authorization and card details (positions 243-268)
                AuthorizationNumber = Get-Field $line 243 6                   # Authorization Number (positions 243-248)
                RejectReason      = Get-Field $line 249 4                     # Reject Reason (positions 249-252)
                CardType          = Get-Field $line 253 2                     # Card Type (positions 253-254)
                CurrencyCode      = Get-Field $line 255 3                     # Currency Code (positions 255-257)
                OriginalTxnAmount = Parse-TddfAmount (Get-Field $line 258 11) # Original Transaction Amount (positions 258-268)
                
                # Additional flags and codes (positions 269-284)
                ForeignCardIndicator = Get-Field $line 269 1                  # Foreign Card Indicator (position 269)
                CarryoverIndicator = Get-Field $line 270 1                    # Carryover Indicator (position 270)
                ExtensionRecordIndicator = Get-Field $line 271 2              # Extension Record Indicator (positions 271-272)
                MCC               = Get-Field $line 273 4                     # MCC Code (positions 273-276)
                VNumber           = Get-Field $line 277 8                     # V Number (positions 277-284)
                
                # Extended processing fields (positions 285-334)
                DiscoverPosEntryMode = Get-Field $line 285 3                  # Discover POS Entry Mode (positions 285-287)
                PurchaseId        = Get-Field $line 288 25                    # Purchase ID (positions 288-312)
                CashBackAmountExt = Parse-TddfAmount (Get-Field $line 313 9)  # Cash Back Amount Extended (positions 313-321)
                CustomerCode      = Get-Field $line 322 13                    # Customer Code (positions 322-334)
                
                # Transaction type and network fields (positions 335-400)
                TxnTypeIdentifier = Get-Field $line 335 4                     # Transaction Type Identifier (positions 335-338)
                AcquirerRefNumber = Get-Field $line 339 23                    # Acquirer Reference Number (positions 339-361)
                LocalTxnTime      = Get-Field $line 362 6                     # Local Transaction Time (positions 362-367)
                LocalTxnDate      = Get-Field $line 368 4                     # Local Transaction Date (positions 368-371)
                NetworkId         = Get-Field $line 372 3                     # Network ID (positions 372-374)
                SettlementDate    = Get-Field $line 375 4                     # Settlement Date (positions 375-378)
                AuthCharIndicator = Get-Field $line 379 1                     # Auth Characteristic Indicator (position 379)
                
                # Fee and interchange fields (positions 380-450)
                InterchangeFee    = Parse-TddfAmount (Get-Field $line 380 9)  # Interchange Fee (positions 380-388)
                AssessmentFee     = Parse-TddfAmount (Get-Field $line 389 9)  # Assessment Fee (positions 389-397)
                AcquirerFee       = Parse-TddfAmount (Get-Field $line 398 9)  # Acquirer Fee (positions 398-406)
                MarkupFee         = Parse-TddfAmount (Get-Field $line 407 9)  # Markup Fee (positions 407-415)
                PassthroughFee    = Parse-TddfAmount (Get-Field $line 416 9)  # Passthrough Fee (positions 416-424)
                DowngradeFee      = Parse-TddfAmount (Get-Field $line 425 9)  # Downgrade Fee (positions 425-433)
                ChargebackFee     = Parse-TddfAmount (Get-Field $line 434 9)  # Chargeback Fee (positions 434-442)
                RetrievalFee      = Parse-TddfAmount (Get-Field $line 443 9)  # Retrieval Fee (positions 443-451)
                
                # Regulatory and compliance fields (positions 452-500)
                FederalTax        = Parse-TddfAmount (Get-Field $line 452 9)  # Federal Tax (positions 452-460)
                StateTax          = Parse-TddfAmount (Get-Field $line 461 9)  # State Tax (positions 461-469)
                LocalTax          = Parse-TddfAmount (Get-Field $line 470 9)  # Local Tax (positions 470-478)
                CityTax           = Parse-TddfAmount (Get-Field $line 479 9)  # City Tax (positions 479-487)
                CountyTax         = Parse-TddfAmount (Get-Field $line 488 9)  # County Tax (positions 488-496)
                OtherTax          = Parse-TddfAmount (Get-Field $line 497 9)  # Other Tax (positions 497-505)
                
                # AMEX specific fields (positions 506-628)
                AmexSENumber      = Get-Field $line 506 15                    # AMEX SE Number (positions 506-520)
                AmexCardMemberNumber = Get-Field $line 521 17                 # AMEX Card Member Number (positions 521-537)
                AmexMerchantAddress = Get-Field $line 538 25                  # AMEX Merchant Address (positions 538-562)
                AmexMerchantCity  = Get-Field $line 563 16                    # AMEX Merchant City (positions 563-578)
                AmexMerchantPostal = Get-Field $line 579 10                   # AMEX Merchant Postal Code (positions 579-588)
                AmexMerchantEmail = Get-Field $line 589 20                    # AMEX Merchant Email (positions 589-608)
                AmexMerchantPhone = Get-Field $line 609 20                    # AMEX Merchant Phone (positions 609-628)
                
                # Additional processing fields (positions 629-700+)
                MerchantState     = Get-Field $line 629 2                     # Merchant State (positions 629-630)
                MerchantCountry   = Get-Field $line 631 3                     # Merchant Country (positions 631-633)
                CardholderBillingCurrency = Get-Field $line 634 3             # Cardholder Billing Currency (positions 634-636)
                ConversionRate    = Get-Field $line 637 12                    # Conversion Rate (positions 637-648)
                DccMargin         = Get-Field $line 649 6                     # DCC Margin (positions 649-654)
                DccMarkup         = Parse-TddfAmount (Get-Field $line 655 9)  # DCC Markup (positions 655-663)
                CrossBorderFee    = Parse-TddfAmount (Get-Field $line 664 9)  # Cross Border Fee (positions 664-672)
                FxFee             = Parse-TddfAmount (Get-Field $line 673 9)  # FX Fee (positions 673-681)
                KioskId           = Get-Field $line 682 10                    # Kiosk ID (positions 682-691)
                TerminalSerial    = Get-Field $line 692 20                    # Terminal Serial Number (positions 692-711)
                TransactionId     = Get-Field $line 712 25                    # Unique Transaction ID (positions 712-736)
                ReferenceNumber   = Get-Field $line 737 50                    # Reference Number (positions 737-786)
                
                # Extended merchant information (positions 787+)
                MerchantCategory  = Get-Field $line 787 25                    # Merchant Category Description (positions 787-811)
                IndustryCode      = Get-Field $line 812 4                     # Industry Code (positions 812-815)
                BusinessType      = Get-Field $line 816 10                    # Business Type (positions 816-825)
                OwnershipType     = Get-Field $line 826 10                    # Ownership Type (positions 826-835)
                AnnualVolume      = Parse-TddfAmount (Get-Field $line 836 15) # Annual Volume (positions 836-850)
                
                # Risk and fraud fields (positions 851+)
                RiskScore         = Get-Field $line 851 3                     # Risk Score (positions 851-853)
                FraudScore        = Get-Field $line 854 3                     # Fraud Score (positions 854-856)
                VelocityCheck     = Get-Field $line 857 1                     # Velocity Check Result (position 857)
                GeoLocation       = Get-Field $line 858 20                    # Geographic Location (positions 858-877)
                IpAddress         = Get-Field $line 878 15                    # IP Address (positions 878-892)
                DeviceFingerprint = Get-Field $line 893 25                    # Device Fingerprint (positions 893-917)
                
                # Additional data fields (positions 918+)
                CustomField1      = Get-Field $line 918 50                    # Custom Field 1 (positions 918-967)
                CustomField2      = Get-Field $line 968 50                    # Custom Field 2 (positions 968-1017)
                CustomField3      = Get-Field $line 1018 50                   # Custom Field 3 (positions 1018-1067)
                ReservedField     = Get-Field $line 1068 50                   # Reserved for future use (positions 1068-1117)
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