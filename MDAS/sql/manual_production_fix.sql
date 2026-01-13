-- MANUAL PRODUCTION FIX SCRIPT
-- Issue: column "transaction_date" of relation "api_achtransactions" does not exist
-- Date: 2025-09-12
-- Run this directly in production database

-- Step 1: Ensure api_achtransactions table has transaction_date column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_achtransactions' 
        AND column_name = 'transaction_date'
    ) THEN
        ALTER TABLE api_achtransactions 
        ADD COLUMN transaction_date date;
        RAISE NOTICE 'Added transaction_date column to api_achtransactions';
    ELSE
        RAISE NOTICE 'transaction_date column already exists in api_achtransactions';
    END IF;
END $$;

-- Step 2: Ensure dev_api_achtransactions table has transaction_date column  
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'dev_api_achtransactions' 
        AND column_name = 'transaction_date'
    ) THEN
        ALTER TABLE dev_api_achtransactions 
        ADD COLUMN transaction_date date;
        RAISE NOTICE 'Added transaction_date column to dev_api_achtransactions';
    ELSE
        RAISE NOTICE 'transaction_date column already exists in dev_api_achtransactions';
    END IF;
END $$;

-- Step 3: Create essential indexes
CREATE INDEX IF NOT EXISTS api_achtransactions_transaction_date_idx 
ON api_achtransactions(transaction_date);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_transaction_date_idx 
ON dev_api_achtransactions(transaction_date);

-- Step 4: Quick verification
SELECT 'VERIFICATION COMPLETE' as status;

SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
AND column_name = 'transaction_date'
ORDER BY table_name;