-- PRODUCTION DATABASE FIX SCRIPT
-- Issue: column "transaction_date" of relation "api_achtransactions" does not exist
-- Date: 2025-09-12
-- Purpose: Fix production database schema inconsistencies for ACH transactions

-- ====================================================================
-- STEP 1: Check current table existence and structure
-- ====================================================================
SELECT 
    'SCHEMA ANALYSIS START' as status,
    NOW() as timestamp;

-- Check if tables exist
SELECT 
    table_name,
    table_schema,
    CASE 
        WHEN table_name = 'api_achtransactions' THEN 'PRODUCTION TABLE'
        WHEN table_name = 'dev_api_achtransactions' THEN 'DEVELOPMENT TABLE'
        ELSE 'OTHER TABLE'
    END as table_type
FROM information_schema.tables 
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
ORDER BY table_name;

-- Check column structure for both tables
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_name IN ('api_achtransactions', 'dev_api_achtransactions')
ORDER BY t.table_name, c.ordinal_position;

-- ====================================================================
-- STEP 2: Fix api_achtransactions table structure
-- ====================================================================

-- Ensure api_achtransactions table exists with proper schema
CREATE TABLE IF NOT EXISTS api_achtransactions (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    merchant_name varchar(255),
    merchant_id varchar(255),
    account_number varchar(255),
    amount numeric(12,2),
    transaction_date date,
    code varchar(10),
    description text,
    company varchar(255),
    trace_number varchar(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_source varchar(255)
);

-- Add missing transaction_date column if it doesn't exist
DO $$ 
BEGIN
    -- Check if transaction_date column exists
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

-- ====================================================================
-- STEP 3: Fix dev_api_achtransactions table structure
-- ====================================================================

-- Ensure dev_api_achtransactions table exists with proper schema
CREATE TABLE IF NOT EXISTS dev_api_achtransactions (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    merchant_name varchar(255),
    merchant_id varchar(255),
    account_number varchar(255),
    amount numeric(12,2),
    transaction_date date,
    code varchar(10),
    description text,
    company varchar(255),
    trace_number varchar(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_source varchar(255)
);

-- Add missing transaction_date column if it doesn't exist
DO $$ 
BEGIN
    -- Check if transaction_date column exists
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

-- ====================================================================
-- STEP 4: Create required indexes for performance
-- ====================================================================

-- Indexes for api_achtransactions
CREATE INDEX IF NOT EXISTS api_achtransactions_merchant_name_idx 
ON api_achtransactions(merchant_name);

CREATE INDEX IF NOT EXISTS api_achtransactions_merchant_id_idx 
ON api_achtransactions(merchant_id);

CREATE INDEX IF NOT EXISTS api_achtransactions_transaction_date_idx 
ON api_achtransactions(transaction_date);

CREATE INDEX IF NOT EXISTS api_achtransactions_amount_idx 
ON api_achtransactions(amount);

CREATE INDEX IF NOT EXISTS api_achtransactions_created_at_idx 
ON api_achtransactions(created_at);

-- Indexes for dev_api_achtransactions
CREATE INDEX IF NOT EXISTS dev_api_achtransactions_merchant_name_idx 
ON dev_api_achtransactions(merchant_name);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_merchant_id_idx 
ON dev_api_achtransactions(merchant_id);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_transaction_date_idx 
ON dev_api_achtransactions(transaction_date);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_amount_idx 
ON dev_api_achtransactions(amount);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_created_at_idx 
ON dev_api_achtransactions(created_at);

-- ====================================================================
-- STEP 5: Validate the fix
-- ====================================================================

-- Verify table structures
SELECT 
    'VALIDATION: Table structure check' as status;

-- Count columns to ensure all expected columns exist
SELECT 
    table_name,
    COUNT(*) as column_count,
    string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
GROUP BY table_name
ORDER BY table_name;

-- Specifically check for transaction_date column
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('api_achtransactions', 'dev_api_achtransactions')
AND column_name = 'transaction_date'
ORDER BY table_name;

-- Check indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('api_achtransactions', 'dev_api_achtransactions')
AND indexname LIKE '%transaction_date%'
ORDER BY tablename, indexname;

-- ====================================================================
-- STEP 6: Test basic operations
-- ====================================================================

-- Test insert capability (this will be rolled back)
BEGIN;

-- Test insert into both tables
INSERT INTO api_achtransactions (
    merchant_name, merchant_id, account_number, amount, 
    transaction_date, code, description, company, trace_number
) VALUES (
    'TEST_MERCHANT', 'TEST123', '1234567890', 100.00,
    CURRENT_DATE, 'TST', 'Test transaction', 'Test Company', 'TRC123'
);

INSERT INTO dev_api_achtransactions (
    merchant_name, merchant_id, account_number, amount, 
    transaction_date, code, description, company, trace_number
) VALUES (
    'TEST_MERCHANT', 'TEST123', '1234567890', 100.00,
    CURRENT_DATE, 'TST', 'Test transaction', 'Test Company', 'TRC123'
);

-- Verify inserts worked
SELECT 
    'api_achtransactions' as table_name,
    COUNT(*) as test_records,
    MAX(transaction_date) as latest_date
FROM api_achtransactions 
WHERE merchant_name = 'TEST_MERCHANT'

UNION ALL

SELECT 
    'dev_api_achtransactions' as table_name,
    COUNT(*) as test_records,
    MAX(transaction_date) as latest_date
FROM dev_api_achtransactions 
WHERE merchant_name = 'TEST_MERCHANT';

-- Rollback test data
ROLLBACK;

-- ====================================================================
-- FINAL REPORT
-- ====================================================================

SELECT 
    'PRODUCTION DATABASE FIX COMPLETED' as status,
    NOW() as completion_time;

SELECT 
    'Both api_achtransactions and dev_api_achtransactions tables are now properly configured with transaction_date columns' as summary;

SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = t.table_name) as index_count
FROM (
    SELECT 'api_achtransactions' as table_name
    UNION ALL
    SELECT 'dev_api_achtransactions' as table_name
) t
ORDER BY table_name;