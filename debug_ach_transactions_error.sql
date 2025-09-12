-- Debug ACH Transactions "merchant_name does not exist" error
-- The column exists and works, so this checks for potential issues

-- 1. Verify merchant_name column exists and has data
SELECT 
    'Column exists and has data' as status,
    COUNT(*) as total_records,
    COUNT(merchant_name) as records_with_merchant_name,
    COUNT(DISTINCT merchant_name) as unique_merchant_names
FROM dev_api_achtransactions;

-- 2. Test the exact API query used by the frontend
SELECT 
    id,
    merchant_name,
    merchant_id,
    account_number,
    amount,
    transaction_date as date,
    code,
    description,
    company,
    trace_number
FROM dev_api_achtransactions
ORDER BY transaction_date DESC, created_at DESC
LIMIT 10;

-- 3. Check if there are any problematic rows with NULL merchant_name
SELECT 
    'Checking for NULL merchant_name rows' as check_type,
    COUNT(*) as null_merchant_name_count,
    COUNT(CASE WHEN merchant_name = '' THEN 1 END) as empty_merchant_name_count
FROM dev_api_achtransactions
WHERE merchant_name IS NULL OR merchant_name = '';

-- 4. Sample of actual merchant names to verify data quality
SELECT DISTINCT 
    merchant_name,
    COUNT(*) as record_count
FROM dev_api_achtransactions 
WHERE merchant_name IS NOT NULL
GROUP BY merchant_name
ORDER BY record_count DESC
LIMIT 10;

-- CONCLUSION: 
-- If all these queries work, the "merchant_name does not exist" error was either:
-- 1. Temporary/timing issue (already resolved)
-- 2. From a different query/endpoint  
-- 3. Browser cache issue (refresh needed)