-- PRODUCTION FIX FOR: Auto-encoding failed: column "code" of relation "api_achtransactions" does not exist
-- Date: 2025-09-12
-- Error ID: 574620a9

-- Step 1: Verify current schema state
SELECT 'SCHEMA VERIFICATION - CODE COLUMN' as step;

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
AND column_name = 'code'
ORDER BY table_name;

-- Step 2: Comprehensive schema fix for both tables
DO $$ 
BEGIN
    -- Ensure api_achtransactions has all required columns
    
    -- code column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_achtransactions' 
        AND column_name = 'code'
    ) THEN
        ALTER TABLE api_achtransactions 
        ADD COLUMN code varchar(255);
        RAISE NOTICE 'Added code column to api_achtransactions';
    ELSE
        RAISE NOTICE 'code column exists in api_achtransactions';
    END IF;

    -- account_number column (backup check)
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

    -- transaction_date column (backup check)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_achtransactions' 
        AND column_name = 'transaction_date'
    ) THEN
        ALTER TABLE api_achtransactions 
        ADD COLUMN transaction_date date;
        RAISE NOTICE 'Added transaction_date column to api_achtransactions';
    ELSE
        RAISE NOTICE 'transaction_date column exists in api_achtransactions';
    END IF;

    -- Ensure dev_api_achtransactions has all required columns
    
    -- code column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dev_api_achtransactions' 
        AND column_name = 'code'
    ) THEN
        ALTER TABLE dev_api_achtransactions 
        ADD COLUMN code varchar(255);
        RAISE NOTICE 'Added code column to dev_api_achtransactions';
    ELSE
        RAISE NOTICE 'code column exists in dev_api_achtransactions';
    END IF;

    -- account_number column (backup check)
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

    -- transaction_date column (backup check)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dev_api_achtransactions' 
        AND column_name = 'transaction_date'
    ) THEN
        ALTER TABLE dev_api_achtransactions 
        ADD COLUMN transaction_date date;
        RAISE NOTICE 'Added transaction_date column to dev_api_achtransactions';
    ELSE
        RAISE NOTICE 'transaction_date column exists in dev_api_achtransactions';
    END IF;
END $$;

-- Step 3: Create performance indexes for all key columns
CREATE INDEX IF NOT EXISTS api_achtransactions_code_idx 
ON api_achtransactions(code);

CREATE INDEX IF NOT EXISTS api_achtransactions_account_number_idx 
ON api_achtransactions(account_number);

CREATE INDEX IF NOT EXISTS api_achtransactions_transaction_date_idx 
ON api_achtransactions(transaction_date);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_code_idx 
ON dev_api_achtransactions(code);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_account_number_idx 
ON dev_api_achtransactions(account_number);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_transaction_date_idx 
ON dev_api_achtransactions(transaction_date);

-- Step 4: Test the exact INSERT/UPDATE operations used by encoding
SELECT 'TESTING ENCODING OPERATIONS' as test_result;

-- Test INSERT structure (what encoding processes use)
INSERT INTO api_achtransactions (
    id, merchant_name, merchant_id, account_number, amount, 
    transaction_date, code, description, company, trace_number, 
    file_source, created_at, updated_at
) VALUES (
    'test_574620a9_' || extract(epoch from now())::text,
    'TEST MERCHANT',
    '12345',
    'TEST_ACCOUNT',
    100.00,
    CURRENT_DATE,
    'TEST_CODE',
    'Test encoding fix',
    'TEST COMPANY',
    'TEST_TRACE',
    'production_fix_test',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Verify the test record was inserted
SELECT 'VERIFICATION TEST RECORD' as verification;

SELECT 
    id, merchant_name, account_number, code, transaction_date, file_source
FROM api_achtransactions 
WHERE file_source = 'production_fix_test'
LIMIT 1;

-- Clean up test record
DELETE FROM api_achtransactions WHERE file_source = 'production_fix_test';

-- Step 5: Final schema verification
SELECT 'FINAL SCHEMA VERIFICATION' as final_step;

SELECT 
    table_name,
    COUNT(*) as total_columns,
    array_agg(column_name ORDER BY ordinal_position) as all_columns
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
GROUP BY table_name
ORDER BY table_name;

-- Step 6: Verify critical columns exist
SELECT 'CRITICAL COLUMNS CHECK' as critical_check;

SELECT 
    table_name,
    CASE WHEN SUM(CASE WHEN column_name = 'code' THEN 1 ELSE 0 END) > 0 THEN 'YES' ELSE 'NO' END as has_code,
    CASE WHEN SUM(CASE WHEN column_name = 'account_number' THEN 1 ELSE 0 END) > 0 THEN 'YES' ELSE 'NO' END as has_account_number,
    CASE WHEN SUM(CASE WHEN column_name = 'transaction_date' THEN 1 ELSE 0 END) > 0 THEN 'YES' ELSE 'NO' END as has_transaction_date
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
GROUP BY table_name
ORDER BY table_name;

SELECT 'PRODUCTION CODE COLUMN FIX COMPLETE' as status;