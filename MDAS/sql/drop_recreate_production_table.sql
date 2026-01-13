-- PRODUCTION TABLE DROP AND RECREATE SCRIPT
-- Error: column "code" of relation "api_achtransactions" does not exist
-- Date: 2025-09-12, Error ID: 574620a9
-- WARNING: This is a DESTRUCTIVE operation. Run in production only if absolutely necessary.

-- STEP 1: DATA BACKUP
-- Create backup table with current timestamp
DO $$
DECLARE
    backup_table_name text;
    record_count integer;
BEGIN
    backup_table_name := 'api_achtransactions_backup_' || to_char(now(), 'YYYYMMDD_HH24MISS');
    
    -- Get current record count
    EXECUTE 'SELECT COUNT(*) FROM api_achtransactions' INTO record_count;
    RAISE NOTICE 'Creating backup table: % with % records', backup_table_name, record_count;
    
    -- Create backup table
    EXECUTE 'CREATE TABLE ' || backup_table_name || ' AS SELECT * FROM api_achtransactions';
    
    -- Verify backup
    EXECUTE 'SELECT COUNT(*) FROM ' || backup_table_name INTO record_count;
    RAISE NOTICE 'Backup created successfully with % records', record_count;
    
    -- Store backup table name for reference
    CREATE TABLE IF NOT EXISTS temp_backup_info (
        backup_table text,
        created_at timestamp default now(),
        original_table text,
        record_count integer
    );
    
    INSERT INTO temp_backup_info (backup_table, original_table, record_count) 
    VALUES (backup_table_name, 'api_achtransactions', record_count);
    
END $$;

-- STEP 2: DROP EXISTING TABLE
SELECT 'DROPPING EXISTING TABLE' as step;
DROP TABLE IF EXISTS api_achtransactions CASCADE;

-- STEP 3: RECREATE TABLE WITH COMPLETE SCHEMA
SELECT 'RECREATING TABLE WITH COMPLETE SCHEMA' as step;

CREATE TABLE api_achtransactions (
    id text NOT NULL PRIMARY KEY,
    merchant_name varchar(255),
    merchant_id varchar(255),
    account_number varchar(255),
    amount numeric(10,2),
    transaction_date date,
    code varchar(255),
    description varchar(255),
    company varchar(255),
    trace_number varchar(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    file_source varchar(255)
);

-- STEP 4: CREATE INDEXES FOR PERFORMANCE
SELECT 'CREATING PERFORMANCE INDEXES' as step;

CREATE INDEX api_achtransactions_merchant_id_idx ON api_achtransactions(merchant_id);
CREATE INDEX api_achtransactions_account_number_idx ON api_achtransactions(account_number);
CREATE INDEX api_achtransactions_transaction_date_idx ON api_achtransactions(transaction_date);
CREATE INDEX api_achtransactions_code_idx ON api_achtransactions(code);
CREATE INDEX api_achtransactions_amount_idx ON api_achtransactions(amount);
CREATE INDEX api_achtransactions_file_source_idx ON api_achtransactions(file_source);
CREATE INDEX api_achtransactions_created_at_idx ON api_achtransactions(created_at);

-- STEP 5: RESTORE DATA FROM BACKUP
SELECT 'RESTORING DATA FROM BACKUP' as step;

DO $$
DECLARE
    backup_table_name text;
    restored_count integer;
BEGIN
    -- Get the backup table name
    SELECT backup_table INTO backup_table_name 
    FROM temp_backup_info 
    WHERE original_table = 'api_achtransactions' 
    ORDER BY created_at DESC 
    LIMIT 1;
    
    IF backup_table_name IS NOT NULL THEN
        RAISE NOTICE 'Restoring data from backup table: %', backup_table_name;
        
        -- Restore all data
        EXECUTE 'INSERT INTO api_achtransactions SELECT * FROM ' || backup_table_name;
        
        -- Verify restoration
        SELECT COUNT(*) INTO restored_count FROM api_achtransactions;
        RAISE NOTICE 'Data restored successfully: % records', restored_count;
        
        -- Update backup info
        UPDATE temp_backup_info 
        SET record_count = restored_count 
        WHERE backup_table = backup_table_name;
        
    ELSE
        RAISE NOTICE 'No backup table found - starting with empty table';
    END IF;
END $$;

-- STEP 6: TEST THE RECREATED TABLE
SELECT 'TESTING RECREATED TABLE' as step;

-- Test basic structure
SELECT 'TABLE STRUCTURE TEST' as test_type;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'api_achtransactions'
ORDER BY ordinal_position;

-- Test INSERT operation (what encoding uses)
SELECT 'INSERT OPERATION TEST' as test_type;
INSERT INTO api_achtransactions (
    id, merchant_name, merchant_id, account_number, amount, 
    transaction_date, code, description, company, trace_number, 
    file_source, created_at, updated_at
) VALUES (
    'test_recreate_' || extract(epoch from now())::text,
    'TEST MERCHANT',
    '12345',
    'TEST_ACCOUNT',
    100.00,
    CURRENT_DATE,
    'TEST_CODE',
    'Test recreate operation',
    'TEST COMPANY',
    'TEST_TRACE',
    'recreate_test',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Verify test record
SELECT 'TEST RECORD VERIFICATION' as verification;
SELECT 
    id, merchant_name, account_number, code, transaction_date, file_source
FROM api_achtransactions 
WHERE file_source = 'recreate_test'
LIMIT 1;

-- Clean up test record
DELETE FROM api_achtransactions WHERE file_source = 'recreate_test';

-- STEP 7: FINAL VERIFICATION
SELECT 'FINAL VERIFICATION' as step;

SELECT 
    'api_achtransactions' as table_name,
    COUNT(*) as total_records,
    COUNT(DISTINCT merchant_id) as unique_merchants,
    MIN(transaction_date) as earliest_date,
    MAX(transaction_date) as latest_date,
    COUNT(CASE WHEN code IS NOT NULL THEN 1 END) as records_with_code,
    COUNT(CASE WHEN account_number IS NOT NULL THEN 1 END) as records_with_account_number
FROM api_achtransactions;

-- Show backup information
SELECT 'BACKUP INFORMATION' as info_type;
SELECT 
    backup_table,
    created_at,
    record_count,
    'Backup available for emergency restore' as status
FROM temp_backup_info 
WHERE original_table = 'api_achtransactions'
ORDER BY created_at DESC;

-- STEP 8: CLEANUP TEMP TABLES (optional - keep for safety)
-- Uncomment the following lines if you want to clean up temp tables
-- DROP TABLE IF EXISTS temp_backup_info;

SELECT 'PRODUCTION TABLE DROP AND RECREATE COMPLETE' as final_status;
SELECT 'All encoding columns (code, account_number, transaction_date) are now available' as encoding_status;