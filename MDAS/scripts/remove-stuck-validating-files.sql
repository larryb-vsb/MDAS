-- ============================================================================
-- PRODUCTION SCRIPT: Remove Stuck Files in Validating Status
-- ============================================================================
-- PURPOSE: Soft-delete files stuck in "Validating" phase for 24+ hours
-- SAFETY: Uses soft-delete (sets deleted_at), can be reversed if needed
-- 
-- IMPORTANT: Run in TWO STEPS:
--   1. First run the SELECT query to review what will be deleted
--   2. Only after confirming, run the UPDATE query
-- ============================================================================

-- STEP 1: PREVIEW - See what files will be deleted
-- Copy and run this query first to review the stuck files
SELECT 
  id,
  filename,
  current_phase,
  start_time,
  ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1) as hours_stuck,
  upload_id,
  file_size,
  business_day
FROM uploader_uploads
WHERE current_phase = 'validating'
  AND start_time < NOW() - INTERVAL '24 hours'
  AND deleted_at IS NULL
  AND is_archived = false
  -- SAFETY: Exclude any files that might be actively processing
  AND current_phase != 'processing'
ORDER BY start_time ASC;

-- ============================================================================
-- STEP 2: EXECUTE - Soft-delete the stuck files
-- Only run this AFTER reviewing the preview above
-- Replace 'YOUR_USERNAME' with your actual username
-- ============================================================================

-- UPDATE uploader_uploads
-- SET 
--   deleted_at = NOW(),
--   deleted_by = 'YOUR_USERNAME',
--   processing_notes = COALESCE(processing_notes, '') || 
--     E'\n[' || NOW()::text || '] Auto-deleted: Stuck in validating phase for ' || 
--     ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1)::text || ' hours'
-- WHERE current_phase = 'validating'
--   AND start_time < NOW() - INTERVAL '24 hours'
--   AND deleted_at IS NULL
--   AND is_archived = false
--   AND current_phase != 'processing'
-- RETURNING id, filename, 
--   ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1) as hours_stuck;

-- ============================================================================
-- OPTIONAL: If you need to UNDO the deletion (restore files)
-- ============================================================================

-- SELECT COUNT(*) FROM uploader_uploads 
-- WHERE deleted_at IS NOT NULL 
--   AND deleted_by = 'YOUR_USERNAME'
--   AND deleted_at > NOW() - INTERVAL '1 hour';

-- To restore (uncomment and adjust the time window as needed):
-- UPDATE uploader_uploads
-- SET deleted_at = NULL, deleted_by = NULL
-- WHERE deleted_by = 'YOUR_USERNAME'
--   AND deleted_at > NOW() - INTERVAL '1 hour';

-- ============================================================================
-- STATISTICS: Check current queue status after cleanup
-- ============================================================================

-- SELECT 
--   current_phase,
--   COUNT(*) as file_count,
--   ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600), 1) as avg_hours_in_phase
-- FROM uploader_uploads
-- WHERE deleted_at IS NULL
--   AND is_archived = false
-- GROUP BY current_phase
-- ORDER BY file_count DESC;
