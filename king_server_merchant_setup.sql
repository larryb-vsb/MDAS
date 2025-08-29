-- KING SERVER MERCHANT ACCOUNT SETUP SCRIPT
-- Run these commands in your King server database (ep-shy-king-aasxdlh7)
-- This will add the merchant_account_number column and populate it from existing data

-- ============================================================================
-- STEP 1: Add merchant_account_number column to the TDDF JSONB records table
-- ============================================================================

ALTER TABLE dev_uploader_tddf_jsonb_records 
ADD COLUMN IF NOT EXISTS merchant_account_number VARCHAR(16);

-- ============================================================================
-- STEP 2: Populate merchant_account_number from existing raw_line data
-- Positions 24-39 (16 characters) contain the merchant account number
-- ============================================================================

UPDATE dev_uploader_tddf_jsonb_records 
SET merchant_account_number = TRIM(SUBSTRING(raw_line, 24, 16))
WHERE raw_line IS NOT NULL 
  AND LENGTH(raw_line) >= 39
  AND merchant_account_number IS NULL;

-- ============================================================================
-- STEP 3: Add index for fast merchant account searches
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_dev_tddf_merchant_account 
ON dev_uploader_tddf_jsonb_records(merchant_account_number)
WHERE merchant_account_number IS NOT NULL;

-- ============================================================================
-- STEP 4: Verify the data extraction worked correctly
-- ============================================================================

-- Check how many records now have merchant account numbers
SELECT 
  COUNT(*) as total_records,
  COUNT(merchant_account_number) as records_with_merchant_accounts,
  COUNT(DISTINCT merchant_account_number) as unique_merchant_accounts
FROM dev_uploader_tddf_jsonb_records;

-- Show sample merchant account numbers
SELECT DISTINCT merchant_account_number, COUNT(*) as record_count
FROM dev_uploader_tddf_jsonb_records 
WHERE merchant_account_number IS NOT NULL
GROUP BY merchant_account_number
ORDER BY record_count DESC
LIMIT 10;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify specific merchant account (replace with actual number from your data)
SELECT record_type, line_number, merchant_account_number, 
       SUBSTRING(raw_line, 1, 50) as line_sample
FROM dev_uploader_tddf_jsonb_records 
WHERE merchant_account_number = '0675900000002881'  -- Replace with actual merchant account
LIMIT 5;

-- Check for any empty or problematic merchant accounts
SELECT COUNT(*) as empty_merchant_accounts
FROM dev_uploader_tddf_jsonb_records 
WHERE raw_line IS NOT NULL 
  AND LENGTH(raw_line) >= 39 
  AND (merchant_account_number IS NULL OR TRIM(merchant_account_number) = '');

-- ============================================================================
-- NOTES FOR USER:
-- 1. After running these commands, the merchant search functionality will work
-- 2. Future TDDF file uploads will automatically populate merchant_account_number
-- 3. The search interface in the web application will be able to find records
-- 4. The TDDF encoder already includes this field in its processing logic
-- ============================================================================