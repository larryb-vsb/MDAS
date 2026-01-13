-- Fix production uploader_tddf_jsonb_records table missing columns
-- This script adds missing columns that are defined in the schema but not present in production

-- 1. Add missing processed_at column (defined in schema but missing in production)
ALTER TABLE uploader_tddf_jsonb_records 
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;

-- 2. Add missing indexes that should exist per schema
CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_upload_id_idx 
ON uploader_tddf_jsonb_records(upload_id);

CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_record_type_idx 
ON uploader_tddf_jsonb_records(record_type);

CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_processing_status_idx 
ON uploader_tddf_jsonb_records(processing_status);

-- 3. Ensure proper defaults match the schema
ALTER TABLE uploader_tddf_jsonb_records 
ALTER COLUMN processing_status SET DEFAULT 'pending';

-- 4. Verify the fixes
SELECT 
    'uploader_tddf_jsonb_records' as table_name,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'uploader_tddf_jsonb_records' 
  AND column_name IN ('processed_at', 'processing_status')
ORDER BY column_name;

-- 5. Show current record count
SELECT 
    COUNT(*) as total_records,
    COUNT(CASE WHEN processed_at IS NULL THEN 1 END) as unprocessed_records,
    COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_records
FROM uploader_tddf_jsonb_records;