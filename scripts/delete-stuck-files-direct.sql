-- ============================================================================
-- DIRECT SQL: Delete Stuck Files in Validating Phase
-- Run this directly in your database client (e.g., Neon Console)
-- ============================================================================

-- STEP 1: Preview what will be deleted
SELECT 
  id,
  filename,
  current_phase,
  start_time,
  ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1) as hours_stuck,
  business_day
FROM uploader_uploads
WHERE current_phase = 'validating'
  AND start_time < NOW() - INTERVAL '24 hours'
  AND deleted_at IS NULL
  AND is_archived = false
ORDER BY start_time ASC;

-- ============================================================================
-- STEP 2: Execute the deletion (uncomment to run)
-- Replace 'LarryB-Shell' with your username
-- ============================================================================

UPDATE uploader_uploads
SET 
  deleted_at = NOW(),
  deleted_by = 'LarryB-Shell',
  processing_notes = COALESCE(processing_notes, '') || 
    E'\n[' || NOW()::text || '] Auto-deleted: Stuck in validating phase for 24+ hours'
WHERE current_phase = 'validating'
  AND start_time < NOW() - INTERVAL '24 hours'
  AND deleted_at IS NULL
  AND is_archived = false
RETURNING id, filename, 
  ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1) as hours_stuck;

-- ============================================================================
-- STEP 3: Verify cleanup
-- ============================================================================

SELECT 
  current_phase,
  COUNT(*) as count
FROM uploader_uploads
WHERE deleted_at IS NULL
  AND is_archived = false
GROUP BY current_phase
ORDER BY count DESC;
