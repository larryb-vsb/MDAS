-- ========================================
-- PRODUCTION INDEX CREATION SCRIPT
-- ========================================
-- Date: November 4, 2025
-- Purpose: TDDF1 Daily Merchant Volume Analytics Performance Indexes
-- Target Table: uploader_tddf_jsonb_records (production)
-- Source Table: dev_uploader_tddf_jsonb_records (development)
-- 
-- These 8 indexes optimize the Merchant Volume tab for daily merchant
-- transaction breakdowns with record type details, supporting:
-- - Fast date-based filtering
-- - Merchant-specific queries
-- - Record type aggregations
-- - Amount calculations from JSONB fields
--
-- Estimated Impact: <1 second query time for 900K+ records
-- Risk Level: LOW (indexes only, no schema changes)
-- Execution Mode: CONCURRENTLY (non-blocking, production-safe)
-- ========================================

-- ========================================
-- IMPORTANT: CONCURRENTLY REQUIREMENTS
-- ========================================
-- CREATE INDEX CONCURRENTLY has special requirements:
-- 1. CANNOT be run inside a transaction block (BEGIN/COMMIT)
-- 2. Connection must remain open for entire duration
-- 3. Takes longer than regular CREATE INDEX but doesn't block writes
-- 4. If interrupted, may leave INVALID indexes that must be dropped
--
-- Therefore:
-- - Run this script in autocommit mode (default for psql)
-- - Don't wrap in BEGIN...COMMIT
-- - Ensure stable database connection
-- - Monitor progress in separate session if needed
-- ========================================

-- ========================================
-- PRE-FLIGHT CHECKS
-- ========================================
-- Verify target table exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'uploader_tddf_jsonb_records'
    ) THEN
        RAISE EXCEPTION 'ERROR: Table uploader_tddf_jsonb_records does not exist';
    END IF;
    
    RAISE NOTICE 'PRE-FLIGHT CHECK: Table uploader_tddf_jsonb_records exists ✓';
END $$;

-- Verify required columns exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploader_tddf_jsonb_records' 
        AND column_name = 'file_processing_date'
    ) THEN
        RAISE EXCEPTION 'ERROR: Column file_processing_date does not exist';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploader_tddf_jsonb_records' 
        AND column_name = 'merchant_account_number'
    ) THEN
        RAISE EXCEPTION 'ERROR: Column merchant_account_number does not exist';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploader_tddf_jsonb_records' 
        AND column_name = 'record_type'
    ) THEN
        RAISE EXCEPTION 'ERROR: Column record_type does not exist';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploader_tddf_jsonb_records' 
        AND column_name = 'record_data'
    ) THEN
        RAISE EXCEPTION 'ERROR: Column record_data does not exist';
    END IF;
    
    RAISE NOTICE 'PRE-FLIGHT CHECK: All required columns exist ✓';
END $$;

-- Check for existing indexes (will be skipped if they exist)
DO $$
DECLARE
    existing_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO existing_count
    FROM pg_indexes
    WHERE tablename = 'uploader_tddf_jsonb_records'
    AND indexname IN (
        'idx_tddf_file_processing_date',
        'idx_tddf_merchant_account_number',
        'idx_tddf_record_type',
        'idx_tddf_date_merchant',
        'idx_tddf_date_merchant_record_type',
        'idx_tddf_date_record_type',
        'idx_tddf_transaction_amount_jsonb',
        'idx_tddf_net_deposit_jsonb'
    );
    
    IF existing_count > 0 THEN
        RAISE NOTICE 'PRE-FLIGHT CHECK: Found % existing indexes (will be skipped via IF NOT EXISTS)', existing_count;
    ELSE
        RAISE NOTICE 'PRE-FLIGHT CHECK: No existing indexes found, all 8 will be created ✓';
    END IF;
END $$;

-- ========================================
-- INDEX 1: File Processing Date
-- ========================================
-- Optimizes: Date-based filtering for daily breakdowns
-- Usage: WHERE file_processing_date = '2025-10-30'
-- Duration: ~15-30 seconds for 900K records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_file_processing_date 
ON uploader_tddf_jsonb_records 
USING btree (file_processing_date);

-- ========================================
-- INDEX 2: Merchant Account Number
-- ========================================
-- Optimizes: Merchant-specific queries
-- Usage: WHERE merchant_account_number = '0675900000197319'
-- Duration: ~15-30 seconds for 900K records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_merchant_account_number 
ON uploader_tddf_jsonb_records 
USING btree (merchant_account_number);

-- ========================================
-- INDEX 3: Record Type
-- ========================================
-- Optimizes: Record type filtering (BH, DT, G2, etc.)
-- Usage: WHERE record_type = 'DT'
-- Duration: ~10-20 seconds for 900K records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_record_type 
ON uploader_tddf_jsonb_records 
USING btree (record_type);

-- ========================================
-- INDEX 4: Date + Merchant (Composite)
-- ========================================
-- Optimizes: Daily merchant-specific queries
-- Usage: WHERE file_processing_date = '2025-10-30' AND merchant_account_number = '...'
-- Duration: ~20-40 seconds for 900K records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_date_merchant 
ON uploader_tddf_jsonb_records 
USING btree (file_processing_date, merchant_account_number);

-- ========================================
-- INDEX 5: Date + Merchant + Record Type (Composite)
-- ========================================
-- Optimizes: Daily merchant queries with record type filtering
-- Usage: WHERE file_processing_date = '...' AND merchant_account_number = '...' AND record_type = 'DT'
-- Duration: ~30-60 seconds for 900K records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_date_merchant_record_type 
ON uploader_tddf_jsonb_records 
USING btree (file_processing_date, merchant_account_number, record_type);

-- ========================================
-- INDEX 6: Date + Record Type (Composite)
-- ========================================
-- Optimizes: Daily record type aggregations
-- Usage: WHERE file_processing_date = '2025-10-30' AND record_type = 'BH'
-- Duration: ~20-40 seconds for 900K records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_date_record_type 
ON uploader_tddf_jsonb_records 
USING btree (file_processing_date, record_type);

-- ========================================
-- INDEX 7: Transaction Amount (JSONB)
-- ========================================
-- Optimizes: Sum/aggregate calculations on transaction amounts
-- Usage: SUM(CAST(record_data->>'transactionAmount' AS numeric))
-- Duration: ~30-60 seconds for 900K records (JSONB extraction)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_transaction_amount_jsonb 
ON uploader_tddf_jsonb_records 
USING btree ((record_data->>'transactionAmount'));

-- ========================================
-- INDEX 8: Net Deposit Amount (JSONB)
-- ========================================
-- Optimizes: Sum/aggregate calculations on net deposit amounts
-- Usage: SUM(CAST(record_data->>'netDepositAmount' AS numeric))
-- Duration: ~30-60 seconds for 900K records (JSONB extraction)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tddf_net_deposit_jsonb 
ON uploader_tddf_jsonb_records 
USING btree ((record_data->>'netDepositAmount'));

-- ========================================
-- POST-CREATION VERIFICATION
-- ========================================
DO $$
DECLARE
    index_count INTEGER;
    invalid_count INTEGER;
BEGIN
    -- Count successfully created indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename = 'uploader_tddf_jsonb_records'
    AND indexname IN (
        'idx_tddf_file_processing_date',
        'idx_tddf_merchant_account_number',
        'idx_tddf_record_type',
        'idx_tddf_date_merchant',
        'idx_tddf_date_merchant_record_type',
        'idx_tddf_date_record_type',
        'idx_tddf_transaction_amount_jsonb',
        'idx_tddf_net_deposit_jsonb'
    );
    
    -- Check for invalid indexes (CONCURRENTLY failures)
    SELECT COUNT(*) INTO invalid_count
    FROM pg_index i
    JOIN pg_class c ON i.indexrelid = c.oid
    JOIN pg_class t ON i.indrelid = t.oid
    WHERE t.relname = 'uploader_tddf_jsonb_records'
    AND c.relname IN (
        'idx_tddf_file_processing_date',
        'idx_tddf_merchant_account_number',
        'idx_tddf_record_type',
        'idx_tddf_date_merchant',
        'idx_tddf_date_merchant_record_type',
        'idx_tddf_date_record_type',
        'idx_tddf_transaction_amount_jsonb',
        'idx_tddf_net_deposit_jsonb'
    )
    AND NOT i.indisvalid;
    
    IF index_count = 8 AND invalid_count = 0 THEN
        RAISE NOTICE '✓ SUCCESS: All 8 indexes created successfully';
    ELSIF invalid_count > 0 THEN
        RAISE WARNING '⚠ WARNING: % invalid indexes found (CONCURRENTLY was interrupted)', invalid_count;
        RAISE NOTICE 'Run this query to see invalid indexes:';
        RAISE NOTICE 'SELECT c.relname FROM pg_index i JOIN pg_class c ON i.indexrelid = c.oid WHERE NOT i.indisvalid;';
    ELSE
        RAISE WARNING '⚠ WARNING: Only % of 8 indexes were created', index_count;
    END IF;
END $$;

-- ========================================
-- COMPLETION SUMMARY
-- ========================================
-- Display final index count and sizes
SELECT 
    'Index Creation Complete' as status,
    COUNT(*) as total_indexes_on_table,
    COUNT(*) FILTER (WHERE indexname LIKE 'idx_tddf_%') as new_merchant_volume_indexes,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_index_size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'uploader_tddf_jsonb_records';

-- ========================================
-- TROUBLESHOOTING: Invalid Indexes
-- ========================================
-- If CREATE INDEX CONCURRENTLY was interrupted, it may leave INVALID indexes.
-- To identify them:
--
-- SELECT c.relname as index_name
-- FROM pg_index i
-- JOIN pg_class c ON i.indexrelid = c.oid
-- JOIN pg_class t ON i.indrelid = t.oid
-- WHERE t.relname = 'uploader_tddf_jsonb_records'
-- AND NOT i.indisvalid;
--
-- To drop invalid indexes:
-- DROP INDEX CONCURRENTLY <index_name>;
--
-- Then re-run the CREATE INDEX CONCURRENTLY statement for that index.
