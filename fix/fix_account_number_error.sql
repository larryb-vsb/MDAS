-- MANUAL FIX FOR: Error fetching ACH transactions: error: column "account_number" does not exist
-- Date: 2025-09-12

-- Step 1: Verify both tables exist and have account_number column
SELECT 'SCHEMA VERIFICATION' as step;

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
AND column_name = 'account_number'
ORDER BY table_name;

-- Step 2: Ensure both tables have complete required schema
DO $$ 
BEGIN
    -- Check api_achtransactions
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_achtransactions' 
        AND column_name = 'account_number'
    ) THEN
        ALTER TABLE api_achtransactions 
        ADD COLUMN account_number varchar(255);
        RAISE NOTICE 'Added account_number column to api_achtransactions';
    ELSE
        RAISE NOTICE 'account_number column exists in api_achtransactions';
    END IF;

    -- Check dev_api_achtransactions
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dev_api_achtransactions' 
        AND column_name = 'account_number'
    ) THEN
        ALTER TABLE dev_api_achtransactions 
        ADD COLUMN account_number varchar(255);
        RAISE NOTICE 'Added account_number column to dev_api_achtransactions';
    ELSE
        RAISE NOTICE 'account_number column exists in dev_api_achtransactions';
    END IF;
END $$;

-- Step 3: Create indexes for account_number (performance)
CREATE INDEX IF NOT EXISTS api_achtransactions_account_number_idx 
ON api_achtransactions(account_number);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_account_number_idx 
ON dev_api_achtransactions(account_number);

-- Step 4: Test basic queries that the application uses
-- Test api_achtransactions
SELECT 'TESTING api_achtransactions' as test_result;

SELECT 
    COUNT(*) as total_records,
    COUNT(account_number) as records_with_account_number,
    COUNT(DISTINCT account_number) as unique_account_numbers
FROM api_achtransactions;

-- Test dev_api_achtransactions  
SELECT 'TESTING dev_api_achtransactions' as test_result;

SELECT 
    COUNT(*) as total_records,
    COUNT(account_number) as records_with_account_number,
    COUNT(DISTINCT account_number) as unique_account_numbers
FROM dev_api_achtransactions;

-- Step 5: Test the exact query structure the application uses
SELECT 'TESTING APPLICATION QUERY STRUCTURE' as test_result;

-- Test the SELECT structure from routes.ts
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
    trace_number,
    file_source,
    created_at
FROM api_achtransactions
LIMIT 1;

-- Test dev table
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
    trace_number,
    file_source,
    created_at
FROM dev_api_achtransactions
LIMIT 1;

-- Final verification
SELECT 'FIX VERIFICATION COMPLETE' as status;

SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
AND column_name = 'account_number'
ORDER BY table_name;