-- ============================================================================
-- MMS PRODUCTION DEPLOYMENT - OCTOBER 2025
-- ============================================================================
-- Description: Schema migrations for 27-day development cycle
-- Target Database: ep-quiet-unit-aa0eaxhe (NEON_PROD_DATABASE_URL)
-- Migration Date: October 31, 2025
-- Version: 2.8.0 → 2.9.0
-- ============================================================================

-- PRE-FLIGHT SAFETY CHECKS
-- ============================================================================

-- Verify we're connected to production database
DO $$
DECLARE
    current_db TEXT;
BEGIN
    SELECT current_database() INTO current_db;
    RAISE NOTICE 'Connected to database: %', current_db;
    RAISE NOTICE 'Ensure this is the PRODUCTION database before proceeding!';
END $$;

-- Check if uploader_uploads table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'uploader_uploads') THEN
        RAISE EXCEPTION 'Table uploader_uploads does not exist! Migration cannot proceed.';
    END IF;
    RAISE NOTICE 'Table uploader_uploads exists - continuing migration...';
END $$;

-- Check if audit_logs table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
        RAISE EXCEPTION 'Table audit_logs does not exist! Migration cannot proceed.';
    END IF;
    RAISE NOTICE 'Table audit_logs exists - continuing migration...';
END $$;

-- ============================================================================
-- MIGRATION 1: Add Soft-Delete Columns to uploader_uploads
-- ============================================================================

-- Check if columns already exist
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'uploader_uploads' 
        AND column_name = 'deleted_at'
    ) THEN
        RAISE NOTICE 'Column uploader_uploads.deleted_at already exists - skipping';
    ELSE
        ALTER TABLE uploader_uploads 
        ADD COLUMN deleted_at TIMESTAMP;
        RAISE NOTICE 'Added column: uploader_uploads.deleted_at';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'uploader_uploads' 
        AND column_name = 'deleted_by'
    ) THEN
        RAISE NOTICE 'Column uploader_uploads.deleted_by already exists - skipping';
    ELSE
        ALTER TABLE uploader_uploads 
        ADD COLUMN deleted_by VARCHAR(255);
        RAISE NOTICE 'Added column: uploader_uploads.deleted_by';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION 2: Add file_metadata Column to audit_logs
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        AND column_name = 'file_metadata'
    ) THEN
        RAISE NOTICE 'Column audit_logs.file_metadata already exists - skipping';
    ELSE
        ALTER TABLE audit_logs 
        ADD COLUMN file_metadata JSONB;
        RAISE NOTICE 'Added column: audit_logs.file_metadata';
    END IF;
END $$;

-- ============================================================================
-- MIGRATION 3: Add Performance Indexes
-- ============================================================================

-- Index on audit_logs.action for faster filtering
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'audit_logs' 
        AND indexname = 'audit_logs_action_idx'
    ) THEN
        CREATE INDEX audit_logs_action_idx ON audit_logs(action);
        RAISE NOTICE 'Created index: audit_logs_action_idx';
    ELSE
        RAISE NOTICE 'Index audit_logs_action_idx already exists - skipping';
    END IF;
END $$;

-- Optional: Index on uploader_uploads.deleted_at for faster queries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_indexes 
        WHERE tablename = 'uploader_uploads' 
        AND indexname = 'uploader_uploads_deleted_at_idx'
    ) THEN
        CREATE INDEX uploader_uploads_deleted_at_idx ON uploader_uploads(deleted_at);
        RAISE NOTICE 'Created index: uploader_uploads_deleted_at_idx';
    ELSE
        RAISE NOTICE 'Index uploader_uploads_deleted_at_idx already exists - skipping';
    END IF;
END $$;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Verify uploader_uploads columns
SELECT 
    'uploader_uploads schema check' as verification_type,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'uploader_uploads'
  AND column_name IN ('deleted_at', 'deleted_by')
ORDER BY column_name;

-- Verify audit_logs columns
SELECT 
    'audit_logs schema check' as verification_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_logs'
  AND column_name = 'file_metadata';

-- Verify indexes created
SELECT 
    'index verification' as verification_type,
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('uploader_uploads', 'audit_logs')
  AND indexname IN ('audit_logs_action_idx', 'uploader_uploads_deleted_at_idx')
ORDER BY tablename, indexname;

-- Count records that would be affected by soft-delete filtering
SELECT 
    'soft-delete impact analysis' as verification_type,
    COUNT(*) as total_uploads,
    COUNT(*) FILTER (WHERE upload_status = 'deleted') as already_deleted,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as with_deleted_at,
    COUNT(*) FILTER (WHERE deleted_by IS NOT NULL) as with_deleted_by
FROM uploader_uploads;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Schema Version: 2.8.0 → 2.9.0';
    RAISE NOTICE 'Date: October 31, 2025';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Deploy updated application code';
    RAISE NOTICE '2. Restart production server';
    RAISE NOTICE '3. Monitor logs for errors';
    RAISE NOTICE '4. Test soft-delete functionality';
    RAISE NOTICE '5. Verify audit log creation';
    RAISE NOTICE '========================================';
END $$;
