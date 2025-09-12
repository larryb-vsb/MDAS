-- PRODUCTION FIX: Create dev_api_achtransactions table with merchant_name column
-- Fixes error: "column merchant_name does not exist" 
-- Run this in PRODUCTION database: ep-quiet-unit-aa0eaxhe

-- Step 1: Check if dev_api_achtransactions table exists
SELECT 'Checking if dev_api_achtransactions exists...' as status;

-- Step 2: Create dev_api_achtransactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS dev_api_achtransactions (
    id text NOT NULL,
    merchant_name character varying,
    merchant_id character varying,  
    account_number character varying,
    amount numeric,
    transaction_date date,
    code character varying,
    description character varying,
    company character varying,
    trace_number character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    file_source character varying,
    CONSTRAINT dev_api_achtransactions_pkey PRIMARY KEY (id)
);

-- Step 3: Add merchant_name column if table exists but column is missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dev_api_achtransactions' 
        AND column_name = 'merchant_name'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE dev_api_achtransactions 
        ADD COLUMN merchant_name character varying;
    END IF;
END $$;

-- Step 4: Copy data from api_achtransactions if it exists and dev_api_achtransactions is empty
INSERT INTO dev_api_achtransactions (
    id, merchant_name, merchant_id, account_number, amount,
    transaction_date, code, description, company, trace_number,
    created_at, updated_at, file_source
)
SELECT 
    id, merchant_name, merchant_id, account_number, amount,
    transaction_date, code, description, company, trace_number,
    COALESCE(created_at, now()), COALESCE(updated_at, now()), file_source
FROM api_achtransactions
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_achtransactions')
ON CONFLICT (id) DO UPDATE SET
    merchant_name = EXCLUDED.merchant_name,
    merchant_id = EXCLUDED.merchant_id,
    account_number = EXCLUDED.account_number,
    amount = EXCLUDED.amount,
    transaction_date = EXCLUDED.transaction_date,
    code = EXCLUDED.code,
    description = EXCLUDED.description,
    company = EXCLUDED.company,
    trace_number = EXCLUDED.trace_number,
    updated_at = now(),
    file_source = EXCLUDED.file_source;

-- Step 5: Create performance indexes
CREATE INDEX IF NOT EXISTS dev_api_achtransactions_merchant_name_idx 
ON dev_api_achtransactions(merchant_name);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_transaction_date_idx 
ON dev_api_achtransactions(transaction_date);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_merchant_id_idx 
ON dev_api_achtransactions(merchant_id);

-- Step 6: Verify the fix worked
SELECT 
    'SUCCESS: Table created/fixed' as status,
    COUNT(*) as total_records,
    COUNT(merchant_name) as records_with_merchant_name,
    COUNT(DISTINCT merchant_name) as unique_merchants
FROM dev_api_achtransactions;

-- Step 7: Test the exact query that was failing
SELECT 
    'Testing failed query:' as test,
    id,
    merchant_name,  -- This should now work
    merchant_id,
    amount,
    transaction_date as date
FROM dev_api_achtransactions 
ORDER BY transaction_date DESC
LIMIT 5;

-- Step 8: Confirm merchant_name column exists
SELECT 
    'COLUMN VERIFICATION:' as check,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'dev_api_achtransactions' 
  AND column_name = 'merchant_name'
  AND table_schema = 'public';

SELECT 'FIX COMPLETED - ACH Transactions API should now work!' as final_status;