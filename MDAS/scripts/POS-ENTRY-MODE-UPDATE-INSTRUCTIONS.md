# POS Entry Mode Database Update Instructions

## Problem
The POS Entry Mode field was being extracted from incorrect positions (230-231 instead of 214-215), causing values like "5-" instead of proper 2-digit codes like "05", "07", etc.

## Solution
Two scripts are provided to fix existing database records:

### Option 1: Manual SQL Batches (Recommended for Production)
**File:** `scripts/batch-update-pos-entry-mode.sql`

This script contains pre-written batch update statements that you can run manually in the database console.

**Steps:**
1. Open your database console (dev or prod)
2. Open `scripts/batch-update-pos-entry-mode.sql`
3. Copy and run the appropriate batches:
   - For **Development**: Run DEV BATCH 1, wait 5-10 seconds, run DEV BATCH 2, etc.
   - For **Production**: Run PROD BATCH 1, wait 5-10 seconds, run PROD BATCH 2, etc.
4. After each batch group, run the verification query to check `remaining_to_update`
5. Repeat BATCH 3 as many times as needed until `remaining_to_update = 0`

**Advantages:**
- Full control over each batch
- Can stop and resume anytime
- Safe for production database
- Easy to monitor progress

### Option 2: Automated Shell Script (For Advanced Users)
**File:** `scripts/auto-update-pos-entry-mode.sh`

This script automatically runs batches with delays, continuing until all records are updated.

**Requirements:**
- `psql` command-line tool installed
- Environment variables set:
  - `NEON_DEV_DATABASE_URL` for development database
  - `NEON_PROD_DATABASE_URL` for production database

**Usage:**
```bash
# Make script executable
chmod +x scripts/auto-update-pos-entry-mode.sh

# Run on development database (default: 5000 records per batch, 10 second delay)
./scripts/auto-update-pos-entry-mode.sh dev

# Run on production database with custom settings
./scripts/auto-update-pos-entry-mode.sh prod 3000 15

# Arguments: [dev|prod] [batch_size] [delay_seconds]
```

**Advantages:**
- Fully automated
- Handles all batches until completion
- Shows progress and final statistics

**Caution:**
- Runs continuously until all records updated
- Requires psql and environment variables
- Less control than manual approach

## What Gets Updated

The scripts update the `extracted_fields` JSONB column to:
1. Extract POS Entry Mode from positions **214-215** (correct positions per TDDF spec)
2. Trim whitespace
3. Zero-pad to 2 digits (e.g., "5" becomes "05")

### Records Affected
- Only `record_type = 'DT'` records
- Only records where `posEntryMode` is:
  - NULL
  - Less than 2 characters
  - Contains non-numeric characters (like "5-", "SP", etc.)

## Verification Queries

After updating, verify the results:

### Check Remaining Records
```sql
-- Development
SELECT COUNT(*) as remaining_to_update
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND (extracted_fields->>'posEntryMode' IS NULL 
       OR LENGTH(extracted_fields->>'posEntryMode') < 2
       OR extracted_fields->>'posEntryMode' LIKE '%-%'
       OR extracted_fields->>'posEntryMode' ~ '[^0-9]');

-- Production
SELECT COUNT(*) as remaining_to_update
FROM tddf_jsonb
WHERE record_type = 'DT'
  AND (extracted_fields->>'posEntryMode' IS NULL 
       OR LENGTH(extracted_fields->>'posEntryMode') < 2
       OR extracted_fields->>'posEntryMode' LIKE '%-%'
       OR extracted_fields->>'posEntryMode' ~ '[^0-9]');
```

### Check Value Distribution
```sql
-- Development
SELECT 
  extracted_fields->>'posEntryMode' as pos_entry_mode,
  COUNT(*) as count
FROM dev_tddf_jsonb 
WHERE record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
GROUP BY extracted_fields->>'posEntryMode'
ORDER BY count DESC
LIMIT 20;

-- Production
SELECT 
  extracted_fields->>'posEntryMode' as pos_entry_mode,
  COUNT(*) as count
FROM tddf_jsonb 
WHERE record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
GROUP BY extracted_fields->>'posEntryMode'
ORDER BY count DESC
LIMIT 20;
```

**Expected Results:**
You should see 2-digit codes like:
- 05 (Chip Card)
- 07 (Contactless)
- 01 (Manual Entry)
- 90 (Magnetic Stripe)
- etc.

**No longer seeing:**
- 5- 
- SP
- BA
- Single digit values without zero padding

## Performance

- **Batch Size**: 5000 records (adjustable)
- **Delay**: 5-10 seconds between batches (prevents timeout)
- **Estimated Time**: Depends on total records
  - ~100K records: 3-5 minutes
  - ~1M records: 30-50 minutes
  - ~5M records: 2-4 hours

## Troubleshooting

**Timeout Errors:**
- Reduce batch size (try 3000 or 2000)
- Increase delay between batches (15-20 seconds)

**Query Returns Nothing:**
- All records may already be updated
- Check the verification query to confirm

**Script Won't Run:**
- For shell script: Ensure psql is installed and environment variables are set
- For SQL script: Ensure you're connected to the correct database

## Future Prevention

**The fix is already in place for NEW files:**
- `server/tddf-json-encoder.ts` now extracts from positions 214-215
- New files processed will automatically have correct values
- Only existing historical data needs batch update
