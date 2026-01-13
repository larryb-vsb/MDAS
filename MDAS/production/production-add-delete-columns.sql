-- Add Missing Columns to Production uploader_uploads Table  
-- Purpose: Add soft-delete columns AND record count columns for delete functionality
-- Date: October 31, 2025
-- Risk Level: LOW (adding nullable columns with defaults, no data loss)

-- ==============================================================================
-- PRE-FLIGHT CHECK
-- ==============================================================================

-- Check if columns already exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'uploader_uploads'
    AND column_name IN ('deleted_at', 'deleted_by', 'upload_status')
ORDER BY column_name;

-- ==============================================================================
-- ADD COLUMNS
-- ==============================================================================

BEGIN;

-- Add deleted_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
            AND table_name = 'uploader_uploads' 
            AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE uploader_uploads 
        ADD COLUMN deleted_at TIMESTAMP NULL;
        
        RAISE NOTICE '✅ Added deleted_at column to uploader_uploads';
    ELSE
        RAISE NOTICE 'ℹ️  Column deleted_at already exists';
    END IF;
END $$;

-- Add deleted_by column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
            AND table_name = 'uploader_uploads' 
            AND column_name = 'deleted_by'
    ) THEN
        ALTER TABLE uploader_uploads 
        ADD COLUMN deleted_by VARCHAR(255) NULL;
        
        RAISE NOTICE '✅ Added deleted_by column to uploader_uploads';
    ELSE
        RAISE NOTICE 'ℹ️  Column deleted_by already exists';
    END IF;
END $$;

-- Add upload_status column if it doesn't exist (for filtering deleted files)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
            AND table_name = 'uploader_uploads' 
            AND column_name = 'upload_status'
    ) THEN
        ALTER TABLE uploader_uploads 
        ADD COLUMN upload_status VARCHAR(50) DEFAULT 'active';
        
        -- Set existing records to 'active' status
        UPDATE uploader_uploads SET upload_status = 'active' WHERE upload_status IS NULL;
        
        RAISE NOTICE '✅ Added upload_status column to uploader_uploads';
    ELSE
        RAISE NOTICE 'ℹ️  Column upload_status already exists';
    END IF;
END $$;

-- Add bh_record_count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
            AND table_name = 'uploader_uploads' 
            AND column_name = 'bh_record_count'
    ) THEN
        ALTER TABLE uploader_uploads 
        ADD COLUMN bh_record_count INTEGER DEFAULT 0;
        
        RAISE NOTICE '✅ Added bh_record_count column to uploader_uploads';
    ELSE
        RAISE NOTICE 'ℹ️  Column bh_record_count already exists';
    END IF;
END $$;

-- Add dt_record_count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
            AND table_name = 'uploader_uploads' 
            AND column_name = 'dt_record_count'
    ) THEN
        ALTER TABLE uploader_uploads 
        ADD COLUMN dt_record_count INTEGER DEFAULT 0;
        
        RAISE NOTICE '✅ Added dt_record_count column to uploader_uploads';
    ELSE
        RAISE NOTICE 'ℹ️  Column dt_record_count already exists';
    END IF;
END $$;

-- Add other_record_count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
            AND table_name = 'uploader_uploads' 
            AND column_name = 'other_record_count'
    ) THEN
        ALTER TABLE uploader_uploads 
        ADD COLUMN other_record_count INTEGER DEFAULT 0;
        
        RAISE NOTICE '✅ Added other_record_count column to uploader_uploads';
    ELSE
        RAISE NOTICE 'ℹ️  Column other_record_count already exists';
    END IF;
END $$;

-- Create index on deleted_at for performance
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' 
            AND tablename = 'uploader_uploads' 
            AND indexname = 'idx_uploader_uploads_deleted_at'
    ) THEN
        CREATE INDEX idx_uploader_uploads_deleted_at ON uploader_uploads(deleted_at);
        RAISE NOTICE '✅ Created index on deleted_at';
    ELSE
        RAISE NOTICE 'ℹ️  Index on deleted_at already exists';
    END IF;
END $$;

COMMIT;

-- ==============================================================================
-- VERIFICATION
-- ==============================================================================

-- Verify columns were added
SELECT 
    'Verification: uploader_uploads columns' as status,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'uploader_uploads'
    AND column_name IN ('deleted_at', 'deleted_by', 'upload_status', 'bh_record_count', 'dt_record_count', 'other_record_count')
ORDER BY column_name;

-- Check if any files have been soft-deleted
SELECT 
    'File counts' as status,
    COUNT(*) as total_files,
    COUNT(deleted_at) as deleted_files,
    COUNT(*) - COUNT(deleted_at) as active_files
FROM uploader_uploads;
