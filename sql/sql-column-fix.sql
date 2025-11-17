-- FIX MISSING PROCESSING_NOTES COLUMN IN PRODUCTION UPLOADER_UPLOADS TABLE
-- ERROR: column "processing_notes" of relation "uploader_uploads" does not exist
-- SOLUTION: Add the missing column to match the schema

-- Add missing processing_notes column to production table
ALTER TABLE uploader_uploads 
ADD COLUMN IF NOT EXISTS processing_notes TEXT;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'uploader_uploads' 
  AND column_name = 'processing_notes'
  AND table_schema = 'public';

-- Check if there are any other missing columns by comparing with dev table
SELECT 
  dev.column_name as dev_column,
  prod.column_name as prod_column,
  CASE 
    WHEN prod.column_name IS NULL THEN 'MISSING IN PRODUCTION'
    ELSE 'EXISTS'
  END as status
FROM 
  (SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'dev_uploader_uploads' AND table_schema = 'public') dev
LEFT JOIN 
  (SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'uploader_uploads' AND table_schema = 'public') prod
ON dev.column_name = prod.column_name
ORDER BY dev.column_name;