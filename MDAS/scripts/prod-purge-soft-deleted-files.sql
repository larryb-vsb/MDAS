-- PRODUCTION: Permanently delete (HARD DELETE) soft-deleted files
-- WARNING: This operation is IRREVERSIBLE - deleted data cannot be recovered
-- Created: 2025-11-18
-- Environment: PRODUCTION (uploader_uploads table)

-- Step 1: Preview files that will be PERMANENTLY deleted
-- Run this first to verify what will be removed
SELECT 
    id,
    filename,
    upload_status,
    current_phase,
    deleted_at,
    deleted_by,
    uploaded_at,
    NOW() - deleted_at AS days_since_deleted
FROM uploader_uploads
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- Step 2: Count of files to be permanently deleted
SELECT 
    COUNT(*) as total_files_to_purge,
    MIN(deleted_at) as oldest_deletion,
    MAX(deleted_at) as newest_deletion
FROM uploader_uploads
WHERE deleted_at IS NOT NULL;

-- Step 3: HARD DELETE - Permanently remove soft-deleted files
-- WARNING: Uncomment and run ONLY after verifying Steps 1 and 2
-- THIS OPERATION CANNOT BE UNDONE - DATA WILL BE LOST FOREVER
/*
DELETE FROM uploader_uploads
WHERE deleted_at IS NOT NULL;
*/

-- Step 4: Verify the purge completed (run after Step 3)
-- Should return 0 rows
-- SELECT COUNT(*) as remaining_soft_deleted_files
-- FROM uploader_uploads
-- WHERE deleted_at IS NOT NULL;
