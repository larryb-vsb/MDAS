-- =====================================================
-- PRODUCTION DATABASE MIGRATION SCRIPT
-- Storage Management System Updates
-- =====================================================
-- Version: 1.0.0
-- Date: November 6, 2025
-- Description: Adds master object keys table for Replit Object Storage management
-- 
-- INSTRUCTIONS:
-- 1. This script is designed to be SAFE and IDEMPOTENT (can run multiple times)
-- 2. All tables use IF NOT EXISTS to prevent errors on re-run
-- 3. Review the script before running in production
-- 4. Run this script against your PRODUCTION database
-- 5. Monitor execution and verify results
--
-- AFFECTED FEATURES:
-- - Storage Management page (/storage-management)
-- - Replit Storage monitoring and statistics
-- - Orphaned object detection and cleanup
-- - Duplicate file detection and removal
-- - Storage purge queue management
-- =====================================================

-- =====================================================
-- 1. CREATE MASTER OBJECT KEYS TABLE
-- =====================================================
-- Purpose: Track all objects in Replit Object Storage
-- Features: Status tracking, upload linking, metadata storage
-- =====================================================

CREATE TABLE IF NOT EXISTS master_object_keys (
  id SERIAL PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE, -- Unique storage object key (e.g., 'prod-uploader/2025-11-05/file.csv')
  file_size_bytes INTEGER NOT NULL, -- File size in bytes
  line_count INTEGER, -- Number of lines in the file (if applicable)
  status TEXT NOT NULL DEFAULT 'active', -- Status: 'active', 'archived', 'deleted', 'failed', 'mark_for_purge'
  upload_id TEXT REFERENCES uploader_uploads(id) ON DELETE SET NULL, -- Optional reference to upload record
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add helpful comment
COMMENT ON TABLE master_object_keys IS 'Master registry of all objects stored in Replit Object Storage. Used for storage management, orphan detection, and cleanup operations.';

-- Column comments for documentation
COMMENT ON COLUMN master_object_keys.object_key IS 'Full object storage key path (e.g., prod-uploader/2025-11-05/uploader_123/file.csv)';
COMMENT ON COLUMN master_object_keys.status IS 'Object status: active (in use), archived (completed), deleted (soft-deleted), failed (processing error), mark_for_purge (queued for deletion)';
COMMENT ON COLUMN master_object_keys.upload_id IS 'Foreign key reference to uploader_uploads table. NULL if object is orphaned or not linked to upload.';

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================
-- Purpose: Optimize common query patterns
-- =====================================================

-- Index for object key lookups (unique constraint already creates an index, but explicit for clarity)
CREATE INDEX IF NOT EXISTS master_object_keys_object_key_idx ON master_object_keys(object_key);

-- Index for status filtering (active, archived, mark_for_purge, etc.)
CREATE INDEX IF NOT EXISTS master_object_keys_status_idx ON master_object_keys(status);

-- Index for upload relationship queries
CREATE INDEX IF NOT EXISTS master_object_keys_upload_id_idx ON master_object_keys(upload_id);

-- Index for time-based queries and sorting
CREATE INDEX IF NOT EXISTS master_object_keys_created_at_idx ON master_object_keys(created_at);

-- =====================================================
-- 3. VERIFY UPLOADER_UPLOADS TABLE STRUCTURE
-- =====================================================
-- Purpose: Ensure uploader_uploads has required columns for integration
-- Note: These columns should already exist from previous migrations
-- =====================================================

-- Verify storage_path column exists (used for environment-specific filtering)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploader_uploads' 
        AND column_name = 'storage_path'
    ) THEN
        RAISE WARNING 'Column storage_path does not exist in uploader_uploads table. This may cause integration issues.';
    ELSE
        RAISE NOTICE 'Column storage_path exists in uploader_uploads table.';
    END IF;
END $$;

-- =====================================================
-- 4. MIGRATION VERIFICATION
-- =====================================================
-- Purpose: Confirm all objects were created successfully
-- =====================================================

-- Check if master_object_keys table exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'master_object_keys'
    ) THEN
        RAISE NOTICE '✓ master_object_keys table created successfully';
    ELSE
        RAISE EXCEPTION '✗ master_object_keys table creation failed';
    END IF;
END $$;

-- Check indexes
DO $$ 
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE tablename = 'master_object_keys';
    
    IF index_count >= 4 THEN
        RAISE NOTICE '✓ All indexes created successfully (% indexes found)', index_count;
    ELSE
        RAISE WARNING '⚠ Expected at least 4 indexes, found %', index_count;
    END IF;
END $$;

-- =====================================================
-- 5. POST-MIGRATION STATISTICS
-- =====================================================
-- Purpose: Display table statistics for verification
-- =====================================================

-- Display current table statistics
SELECT 
    'master_object_keys' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('master_object_keys')) as total_size
FROM master_object_keys;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next Steps:
-- 1. Verify table and indexes were created successfully
-- 2. Test Storage Management page functionality
-- 3. Run storage scan to populate master_object_keys:
--    POST /api/storage/master-keys/scan-orphaned
-- 4. Monitor application logs for any errors
-- =====================================================

-- Migration completion message
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'Database: PRODUCTION';
    RAISE NOTICE 'Tables Added: master_object_keys';
    RAISE NOTICE 'Indexes Added: 4';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for Storage Management operations!';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
