# BH Net Deposit Decode Logic - TDDF Specification

## TDDF BH Record Net Deposit Field Extraction

### Field Specification
- **Field Name**: Net Deposit
- **TDDF Positions**: 69-83 (15 characters)
- **Data Type**: Numeric (stored in cents)
- **Precision**: 15 digits, 2 decimal places after conversion

### Step-by-Step Decode Process

#### 1. Raw TDDF Line Structure
```
BH Record: [Positions 1-300+]
Position:  123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789...
           |        |        |        |        |        |        |        |        |        |
           1        10       20       30       40       50       60       70       80       90
```

#### 2. Net Deposit Extraction (Positions 69-83)
```javascript
// Extract 15-character string from positions 69-83
const netDepositRaw = rawLine.substring(68, 83); // Convert to 0-based indexing (69-1, 83)

// Example: "000000000005502" → represents $55.02 in cents
```

#### 3. Conversion Logic
```javascript
// Step 1: Convert string to decimal (removes leading zeros)
const netDepositCents = CAST(netDepositRaw AS DECIMAL);
// Example: "000000000005502" → 5502

// Step 2: Convert cents to dollars (divide by 100)
const netDepositDollars = netDepositCents / 100.0;
// Example: 5502 → $55.02
```

#### 4. Complete SQL Implementation
```sql
SELECT 
  -- Extract Net Deposit from correct TDDF positions
  SUBSTRING(raw_line, 69, 15) as net_deposit_raw,
  
  -- Convert to decimal and divide by 100 for dollar amount
  CAST(SUBSTRING(raw_line, 69, 15) AS DECIMAL) / 100.0 as net_deposit_dollars
  
FROM tddf1_table_name 
WHERE record_type = 'BH' 
  AND LENGTH(raw_line) >= 83  -- Ensure line is long enough
```

### Real Data Examples

| Raw String (Pos 69-83) | Cents Value | Dollar Amount |
|------------------------|-------------|---------------|
| 000000000005502        | 5502        | $55.02        |
| 000000000013437        | 13437       | $134.37       |
| 000000000010121        | 10121       | $101.21       |
| 000000000035554        | 35554       | $355.54       |

### Key Points

1. **Position Accuracy**: Must use positions 69-83, NOT 93-103
   - Positions 93-103 contain "Merchant Reference Number"
   - This was the source of the $9 million error

2. **Data Format**: Always stored as cents (multiply by 100)
   - TDDF standard stores monetary amounts as integers in cents
   - Must divide by 100.0 to get actual dollar amounts

3. **Leading Zeros**: TDDF uses fixed-width fields with leading zeros
   - "000000000005502" is valid representation of $55.02
   - SQL CAST automatically handles leading zero removal

4. **Validation**: Check minimum line length before extraction
   - Ensure raw_line has at least 83 characters
   - Prevents extraction errors on malformed records

### Current Implementation Status
✅ **Fixed**: Updated TDDF1 encoder to use correct positions 69-83
✅ **Tested**: Verified with real TDDF data showing realistic amounts
✅ **Result**: BH Net Deposit totals now show correct dollar amounts instead of millions