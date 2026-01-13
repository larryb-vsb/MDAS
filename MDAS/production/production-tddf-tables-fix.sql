-- Production TDDF Tables Fix
-- Purpose: Create or rename TDDF-related tables for production (no dev_ prefix)
-- Date: October 31, 2025
-- Risk Level: LOW-MEDIUM (creates/renames cache tables, no data loss risk)

-- ==============================================================================
-- PRE-FLIGHT CHECKS
-- ==============================================================================

-- Check which TDDF tables exist with dev_ prefix
SELECT 
    'TDDF tables with dev_ prefix' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename LIKE 'dev_tddf%'
ORDER BY tablename;

-- Check which TDDF tables exist without prefix
SELECT 
    'TDDF tables without prefix' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename LIKE 'tddf%'
    AND tablename NOT LIKE 'dev_%'
ORDER BY tablename;

-- ==============================================================================
-- RENAME/CREATE CRITICAL TDDF TABLES
-- ==============================================================================

BEGIN;

-- 1. tddf1_totals (CRITICAL - needed for dashboard)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf1_totals'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf1_totals'
    ) THEN
        ALTER TABLE dev_tddf1_totals RENAME TO tddf1_totals;
        RAISE NOTICE '✅ Renamed dev_tddf1_totals → tddf1_totals';
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf1_totals'
    ) THEN
        -- Create empty table if neither exists
        CREATE TABLE tddf1_totals (
            id SERIAL PRIMARY KEY,
            business_date DATE NOT NULL,
            batch_date DATE,
            transaction_date DATE,
            record_type VARCHAR(10),
            record_count INTEGER DEFAULT 0,
            transaction_amount NUMERIC(15,2) DEFAULT 0,
            net_deposits NUMERIC(15,2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_tddf1_totals_business_date ON tddf1_totals(business_date);
        CREATE INDEX idx_tddf1_totals_record_type ON tddf1_totals(record_type);
        RAISE NOTICE '✅ Created empty tddf1_totals table';
    ELSE
        RAISE NOTICE 'ℹ️  tddf1_totals already exists';
    END IF;
END $$;

-- 2. tddf1_monthly_cache
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf1_monthly_cache'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf1_monthly_cache'
    ) THEN
        ALTER TABLE dev_tddf1_monthly_cache RENAME TO tddf1_monthly_cache;
        RAISE NOTICE '✅ Renamed dev_tddf1_monthly_cache → tddf1_monthly_cache';
    ELSE
        RAISE NOTICE 'ℹ️  Skipped tddf1_monthly_cache';
    END IF;
END $$;

-- 3. tddf1_activity_cache
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf1_activity_cache'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf1_activity_cache'
    ) THEN
        ALTER TABLE dev_tddf1_activity_cache RENAME TO tddf1_activity_cache;
        RAISE NOTICE '✅ Renamed dev_tddf1_activity_cache → tddf1_activity_cache';
    ELSE
        RAISE NOTICE 'ℹ️  Skipped tddf1_activity_cache';
    END IF;
END $$;

-- 4. tddf_jsonb (main data table)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf_jsonb'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf_jsonb'
    ) THEN
        ALTER TABLE dev_tddf_jsonb RENAME TO tddf_jsonb;
        RAISE NOTICE '✅ Renamed dev_tddf_jsonb → tddf_jsonb';
    ELSE
        RAISE NOTICE 'ℹ️  Skipped tddf_jsonb';
    END IF;
END $$;

-- 5. tddf_api_queue
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf_api_queue'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf_api_queue'
    ) THEN
        ALTER TABLE dev_tddf_api_queue RENAME TO tddf_api_queue;
        RAISE NOTICE '✅ Renamed dev_tddf_api_queue → tddf_api_queue';
    ELSE
        RAISE NOTICE 'ℹ️  tddf_api_queue already exists or dev version missing';
    END IF;
END $$;

-- 6. tddf_api_files  
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf_api_files'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf_api_files'
    ) THEN
        ALTER TABLE dev_tddf_api_files RENAME TO tddf_api_files;
        RAISE NOTICE '✅ Renamed dev_tddf_api_files → tddf_api_files';
    ELSE
        RAISE NOTICE 'ℹ️  tddf_api_files already exists or dev version missing';
    END IF;
END $$;

-- 7. tddf_api_records
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf_api_records'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf_api_records'
    ) THEN
        ALTER TABLE dev_tddf_api_records RENAME TO tddf_api_records;
        RAISE NOTICE '✅ Renamed dev_tddf_api_records → tddf_api_records';
    ELSE
        RAISE NOTICE 'ℹ️  tddf_api_records already exists or dev version missing';
    END IF;
END $$;

-- 8. tddf_api_schemas
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_tddf_api_schemas'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'tddf_api_schemas'
    ) THEN
        ALTER TABLE dev_tddf_api_schemas RENAME TO tddf_api_schemas;
        RAISE NOTICE '✅ Renamed dev_tddf_api_schemas → tddf_api_schemas';
    ELSE
        RAISE NOTICE 'ℹ️  tddf_api_schemas already exists or dev version missing';
    END IF;
END $$;

COMMIT;

-- ==============================================================================
-- POST-RENAME VERIFICATION
-- ==============================================================================

-- Verify critical TDDF tables now exist without prefix
SELECT 
    'Verification: Critical TDDF tables' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'tddf1_totals',
        'tddf1_monthly_cache', 
        'tddf1_activity_cache',
        'tddf_jsonb',
        'tddf_api_queue',
        'tddf_api_files',
        'tddf_api_records',
        'tddf_api_schemas'
    )
ORDER BY tablename;

-- Count rows in tddf1_totals to verify data exists
SELECT 
    'tddf1_totals row count' as info,
    COUNT(*) as row_count
FROM tddf1_totals;

-- ==============================================================================
-- NOTES
-- ==============================================================================
-- If tddf1_totals is empty after this fix, the TDDF dashboard cache
-- will need to be rebuilt. The application has automatic cache rebuilding
-- that will populate this table from the master tddf_jsonb table.
