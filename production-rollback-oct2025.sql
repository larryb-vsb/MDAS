-- ============================================================================
-- MMS PRODUCTION ROLLBACK - OCTOBER 2025
-- ============================================================================
-- Description: Rollback script for October 2025 migrations
-- Target Database: ep-quiet-unit-aa0eaxhe (NEON_PROD_DATABASE_URL)
-- Rollback Date: As needed
-- Version: 2.9.0 → 2.8.0
-- ============================================================================
-- WARNING: This script removes schema changes but preserves all data
-- ============================================================================

-- PRE-ROLLBACK SAFETY CHECKS
-- ============================================================================

-- Verify we're connected to production database
DO $$
DECLARE
    current_db TEXT;
BEGIN
    SELECT current_database() INTO current_db;
    RAISE NOTICE 'Connected to database: %', current_db;
    RAISE NOTICE 'Ensure this is the PRODUCTION database before proceeding!';
    RAISE NOTICE 'This rollback will REMOVE newly added columns!';
END $$;

-- Check for data in new columns before rollback
SELECT 
    'Data loss warning' as warning_type,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as records_with_deleted_at,
    COUNT(*) FILTER (WHERE deleted_by IS NOT NULL) as records_with_deleted_by
FROM uploader_uploads;

SELECT 
    'Data loss warning' as warning_type,
    COUNT(*) FILTER (WHERE file_metadata IS NOT NULL) as records_with_file_metadata
FROM audit_logs;

-- Confirm rollback intention
DO $$
BEGIN
    RAISE WARNING 'Rollback will remove:';
    RAISE WARNING '  - uploader_uploads.deleted_at column';
    RAISE WARNING '  - uploader_uploads.deleted_by column';
    RAISE WARNING '  - audit_logs.file_metadata column';
    RAISE WARNING '  - audit_logs_action_idx index';
    RAISE WARNING '  - uploader_uploads_deleted_at_idx index';
    RAISE WARNING 'Type ROLLBACK to cancel, or proceed with script execution.';
END $$;

-- ============================================================================
-- ROLLBACK 1: Remove Indexes
-- ============================================================================

-- Drop audit_logs_action_idx
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'audit_logs' 
        AND indexname = 'audit_logs_action_idx'
    ) THEN
        DROP INDEX audit_logs_action_idx;
        RAISE NOTICE 'Dropped index: audit_logs_action_idx';
    ELSE
        RAISE NOTICE 'Index audit_logs_action_idx does not exist - skipping';
    END IF;
END $$;

-- Drop uploader_uploads_deleted_at_idx
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'uploader_uploads' 
        AND indexname = 'uploader_uploads_deleted_at_idx'
    ) THEN
        DROP INDEX uploader_uploads_deleted_at_idx;
        RAISE NOTICE 'Dropped index: uploader_uploads_deleted_at_idx';
    ELSE
        RAISE NOTICE 'Index uploader_uploads_deleted_at_idx does not exist - skipping';
    END IF;
END $$;

-- ============================================================================
-- ROLLBACK 2: Remove audit_logs.file_metadata Column
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        AND column_name = 'file_metadata'
    ) THEN
        ALTER TABLE audit_logs 
        DROP COLUMN file_metadata;
        RAISE NOTICE 'Dropped column: audit_logs.file_metadata';
    ELSE
        RAISE NOTICE 'Column audit_logs.file_metadata does not exist - skipping';
    END IF;
END $$;

-- ============================================================================
-- ROLLBACK 3: Remove uploader_uploads Soft-Delete Columns
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'uploader_uploads' 
        AND column_name = 'deleted_by'
    ) THEN
        ALTER TABLE uploader_uploads 
        DROP COLUMN deleted_by;
        RAISE NOTICE 'Dropped column: uploader_uploads.deleted_by';
    ELSE
        RAISE NOTICE 'Column uploader_uploads.deleted_by does not exist - skipping';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'uploader_uploads' 
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE uploader_uploads 
        DROP COLUMN deleted_at;
        RAISE NOTICE 'Dropped column: uploader_uploads.deleted_at';
    ELSE
        RAISE NOTICE 'Column uploader_uploads.deleted_at does not exist - skipping';
    END IF;
END $$;

-- ============================================================================
-- POST-ROLLBACK VERIFICATION
-- ============================================================================

-- Verify columns removed from uploader_uploads
SELECT 
    'uploader_uploads rollback verification' as verification_type,
    COUNT(*) as remaining_soft_delete_columns
FROM information_schema.columns
WHERE table_name = 'uploader_uploads'
  AND column_name IN ('deleted_at', 'deleted_by');
-- Expected result: 0 rows

-- Verify column removed from audit_logs
SELECT 
    'audit_logs rollback verification' as verification_type,
    COUNT(*) as remaining_file_metadata_columns
FROM information_schema.columns
WHERE table_name = 'audit_logs'
  AND column_name = 'file_metadata';
-- Expected result: 0 rows

-- Verify indexes removed
SELECT 
    'index rollback verification' as verification_type,
    COUNT(*) as remaining_indexes
FROM pg_indexes
WHERE tablename IN ('uploader_uploads', 'audit_logs')
  AND indexname IN ('audit_logs_action_idx', 'uploader_uploads_deleted_at_idx');
-- Expected result: 0 rows

-- ============================================================================
-- ROLLBACK COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ROLLBACK COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Schema Version: 2.9.0 → 2.8.0';
    RAISE NOTICE 'Date: %', CURRENT_TIMESTAMP;
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Revert application code to previous version';
    RAISE NOTICE '2. Restart production server';
    RAISE NOTICE '3. Monitor logs for normal operation';
    RAISE NOTICE '4. Review rollback reason and plan re-deployment';
    RAISE NOTICE '========================================';
END $$;
