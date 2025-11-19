-- Production cleanup: Soft-delete files stuck in 'Validating' status for 48+ hours
-- Created: 2025-11-18
-- Environment: PRODUCTION (uploader_uploads table)
-- Safety: This is a soft-delete only (reversible via deleted_at column)

-- Step 1: Preview files that will be deleted (run this first to verify)
SELECT 
    id,
    filename,
    upload_status,
    queued_at,
    NOW() - queued_at AS stuck_duration,
    current_phase
FROM uploader_uploads
WHERE upload_status = 'validating'
  AND deleted_at IS NULL
  AND queued_at < NOW() - INTERVAL '48 hours'
ORDER BY queued_at ASC;

-- Step 2: Get count of files to be deleted
SELECT COUNT(*) as files_to_delete
FROM uploader_uploads
WHERE upload_status = 'validating'
  AND deleted_at IS NULL
  AND queued_at < NOW() - INTERVAL '48 hours';

-- Step 3: Execute the soft-delete (uncomment to run)
-- WARNING: Only run this after verifying the preview results above
/*
UPDATE uploader_uploads
SET 
    deleted_at = NOW(),
    deleted_by = 'admin-cleanup',
    last_updated = NOW(),
    processing_notes = COALESCE(processing_notes, '') || 
        E'\n[' || NOW()::text || '] Soft-deleted by admin: Stuck in validating status for 48+ hours'
WHERE upload_status = 'validating'
  AND deleted_at IS NULL
  AND queued_at < NOW() - INTERVAL '48 hours';
*/

-- Step 4: Verify the deletion (run after Step 3)
-- SELECT COUNT(*) as remaining_validating_files
-- FROM uploader_uploads
-- WHERE upload_status = 'validating'
--   AND deleted_at IS NULL;
