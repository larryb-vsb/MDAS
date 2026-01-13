-- Production Database Table Rename Fix
-- Purpose: Rename dev_ prefixed tables to unprefixed names for production consistency
-- Date: October 31, 2025
-- Risk Level: LOW (simple rename operations)

-- ==============================================================================
-- PRE-FLIGHT CHECKS
-- ==============================================================================

-- Check if dev_ prefixed tables exist
SELECT 
    'dev_ prefixed tables found' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename LIKE 'dev_%'
ORDER BY tablename;

-- Check if unprefixed versions already exist (to avoid conflicts)
SELECT 
    'Checking for conflicts' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('processing_timing_logs', 'uploads')
ORDER BY tablename;

-- ==============================================================================
-- RENAME OPERATIONS
-- ==============================================================================

-- Start transaction for safety
BEGIN;

-- Rename dev_processing_timing_logs to processing_timing_logs
-- Only if dev_ version exists and unprefixed doesn't
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_processing_timing_logs'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'processing_timing_logs'
    ) THEN
        ALTER TABLE dev_processing_timing_logs RENAME TO processing_timing_logs;
        RAISE NOTICE 'Renamed dev_processing_timing_logs → processing_timing_logs';
    ELSE
        RAISE NOTICE 'Skipped dev_processing_timing_logs (either missing or target exists)';
    END IF;
END $$;

-- Rename dev_uploads to uploads
-- Only if dev_ version exists and unprefixed doesn't
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'dev_uploads'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'uploads'
    ) THEN
        ALTER TABLE dev_uploads RENAME TO uploads;
        RAISE NOTICE 'Renamed dev_uploads → uploads';
    ELSE
        RAISE NOTICE 'Skipped dev_uploads (either missing or target exists)';
    END IF;
END $$;

-- Commit the transaction
COMMIT;

-- ==============================================================================
-- POST-RENAME VERIFICATION
-- ==============================================================================

-- Verify renamed tables exist
SELECT 
    'Verification: Unprefixed tables' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('processing_timing_logs', 'uploads')
ORDER BY tablename;

-- Check for any remaining dev_ tables
SELECT 
    'Verification: Remaining dev_ tables' as status,
    tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename LIKE 'dev_%'
ORDER BY tablename;

-- ==============================================================================
-- ROLLBACK (if needed)
-- ==============================================================================
-- If something goes wrong, run these commands to revert:
--
-- BEGIN;
-- ALTER TABLE processing_timing_logs RENAME TO dev_processing_timing_logs;
-- ALTER TABLE uploads RENAME TO dev_uploads;
-- COMMIT;
