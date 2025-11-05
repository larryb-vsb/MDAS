-- ============================================================================
-- PRODUCTION DATABASE FIX SCRIPTS
-- ============================================================================
-- These scripts fix common database issues in production
-- ⚠️ CAUTION: Review each script before running in production
-- ============================================================================

-- FIX 1: RECOVER STUCK FILES IN ENCODING PHASE
-- ============================================================================
-- This recovers files that are stuck in 'encoding' phase but have completed tables
-- Run this if files appear stuck but encoding actually completed

DO $$
DECLARE
  stuck_upload RECORD;
  file_table_name TEXT;
  table_exists BOOLEAN;
BEGIN
  FOR stuck_upload IN 
    SELECT id, filename 
    FROM uploader_uploads
    WHERE current_phase = 'encoding'
      AND last_updated < NOW() - INTERVAL '30 minutes'
      AND deleted_at IS NULL
      AND is_archived = false
  LOOP
    -- Generate expected table name
    file_table_name := 'tddf1_file_' || LOWER(REGEXP_REPLACE(stuck_upload.filename, '[^a-zA-Z0-9]', '_', 'g'));
    
    -- Check if table exists
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = file_table_name
    ) INTO table_exists;
    
    -- If table exists, mark as encoded
    IF table_exists THEN
      UPDATE uploader_uploads
      SET 
        current_phase = 'encoded',
        last_updated = NOW(),
        processing_notes = COALESCE(processing_notes, '{}'::jsonb) || 
          jsonb_build_object(
            'recovered_from_stuck', true,
            'recovered_at', NOW(),
            'recovery_reason', 'File table exists but phase was stuck in encoding'
          )
      WHERE id = stuck_upload.id;
      
      RAISE NOTICE 'Recovered file: % (ID: %)', stuck_upload.filename, stuck_upload.id;
    END IF;
  END LOOP;
END $$;


-- FIX 2: REBUILD MISSING CACHE ENTRIES FOR ENCODED TDDF FILES
-- ============================================================================
-- This rebuilds cache entries for TDDF files that are encoded but missing cache

-- Note: This creates placeholder cache entries. 
-- Actual data should be recalculated by the application
INSERT INTO tddf1_totals (
  upload_id,
  filename,
  total_records,
  bh_records,
  dt_records,
  g2_records,
  other_records,
  first_business_date,
  last_business_date,
  merchant_count,
  terminal_count,
  created_at,
  updated_at
)
SELECT 
  u.id as upload_id,
  u.filename,
  0 as total_records,  -- Placeholder - needs recalculation
  0 as bh_records,
  0 as dt_records,
  0 as g2_records,
  0 as other_records,
  u.business_day as first_business_date,
  u.business_day as last_business_date,
  0 as merchant_count,
  0 as terminal_count,
  NOW() as created_at,
  NOW() as updated_at
FROM uploader_uploads u
WHERE u.final_file_type = 'tddf'
  AND u.current_phase = 'encoded'
  AND u.deleted_at IS NULL
  AND u.is_archived = false
  AND NOT EXISTS (
    SELECT 1 FROM tddf1_totals c WHERE c.upload_id = u.id
  )
ON CONFLICT (upload_id) DO NOTHING;

-- Log the fix
-- SELECT COUNT(*) as cache_entries_created FROM tddf1_totals 
-- WHERE created_at > NOW() - INTERVAL '1 minute';


-- FIX 3: CLEAN UP ORPHANED MASTER RECORDS
-- ============================================================================
-- ⚠️ DANGEROUS: This deletes records that reference non-existent uploads
-- Only run if you're sure these are orphaned and not needed

-- STEP 1: Preview what will be deleted (run this first)
SELECT 
  upload_id,
  COUNT(*) as record_count
FROM tddf_master
WHERE upload_id NOT IN (SELECT id FROM uploader_uploads)
GROUP BY upload_id;

-- STEP 2: If safe to delete, uncomment and run this:
-- DELETE FROM tddf_master
-- WHERE upload_id NOT IN (SELECT id FROM uploader_uploads);

-- STEP 3: Also clean up API queue
-- DELETE FROM tddf_api_queue
-- WHERE upload_id NOT IN (SELECT id FROM uploader_uploads);


-- FIX 4: RESET STUCK FILES IN PROCESSING PHASE
-- ============================================================================
-- This resets files stuck in 'processing' phase back to 'encoded'
-- so they can be re-processed

UPDATE uploader_uploads
SET 
  current_phase = 'encoded',
  last_updated = NOW(),
  processing_notes = COALESCE(processing_notes, '{}'::jsonb) || 
    jsonb_build_object(
      'reset_from_stuck_processing', true,
      'reset_at', NOW(),
      'previous_phase', current_phase
    )
WHERE current_phase = 'processing'
  AND last_updated < NOW() - INTERVAL '1 hour'
  AND deleted_at IS NULL
  AND is_archived = false;


-- FIX 5: UPDATE API KEY STATISTICS FOR KEYS WITH NULL VALUES
-- ============================================================================
-- This initializes NULL values for new API keys

UPDATE api_keys
SET 
  request_count = COALESCE(request_count, 0),
  last_used = COALESCE(last_used, created_at)
WHERE request_count IS NULL 
   OR last_used IS NULL;


-- FIX 6: CLEAN UP OLD CONNECTION LOGS (keep last 30 days)
-- ============================================================================
-- This prevents the connection_log table from growing indefinitely

DELETE FROM connection_log
WHERE timestamp < NOW() - INTERVAL '30 days';


-- FIX 7: REACTIVATE ACCIDENTALLY DEACTIVATED API KEYS
-- ============================================================================
-- This can be used to reactivate specific API keys if needed

-- STEP 1: Check deactivated keys
SELECT id, username, key_name, is_active, deactivated_at
FROM api_keys
WHERE is_active = false;

-- STEP 2: Reactivate specific key (replace ID)
-- UPDATE api_keys
-- SET is_active = true, deactivated_at = NULL
-- WHERE id = <KEY_ID>;


-- FIX 8: UPDATE HOST APPROVAL STATUS
-- ============================================================================
-- Bulk approve pending hosts (use with caution)

-- STEP 1: Check pending approvals
SELECT id, hostname, api_key_prefix, client_ip, first_seen, last_seen
FROM host_approvals
WHERE approval_status = 'pending'
ORDER BY last_seen DESC;

-- STEP 2: Approve specific hosts (uncomment and modify as needed)
-- UPDATE host_approvals
-- SET 
--   approval_status = 'approved',
--   reviewed_at = NOW(),
--   reviewed_by = 'admin',
--   notes = 'Bulk approved during deployment'
-- WHERE approval_status = 'pending'
--   AND hostname IN ('trusted-hostname-1', 'trusted-hostname-2');


-- FIX 9: REBUILD MISSING INDEXES FOR PERFORMANCE
-- ============================================================================
-- These indexes are critical for query performance

-- Index on uploader_uploads for phase filtering
CREATE INDEX IF NOT EXISTS idx_uploader_uploads_current_phase 
ON uploader_uploads(current_phase) 
WHERE deleted_at IS NULL AND is_archived = false;

-- Index on uploader_uploads for deleted/archived filtering
CREATE INDEX IF NOT EXISTS idx_uploader_uploads_active 
ON uploader_uploads(deleted_at, is_archived) 
WHERE deleted_at IS NULL;

-- Index on tddf_master for upload_id lookups
CREATE INDEX IF NOT EXISTS idx_tddf_master_upload_id 
ON tddf_master(upload_id);

-- Index on tddf_master for business date queries
CREATE INDEX IF NOT EXISTS idx_tddf_master_business_date 
ON tddf_master(business_date);

-- Index on tddf_api_queue for upload_id
CREATE INDEX IF NOT EXISTS idx_tddf_api_queue_upload_id 
ON tddf_api_queue(upload_id);

-- Index on connection_log for timestamp (for cleanup)
CREATE INDEX IF NOT EXISTS idx_connection_log_timestamp 
ON connection_log(timestamp);

-- Index on api_keys for active status
CREATE INDEX IF NOT EXISTS idx_api_keys_active 
ON api_keys(is_active) 
WHERE is_active = true;


-- FIX 10: VERIFY DATABASE INTEGRITY
-- ============================================================================
-- Run this to get a comprehensive integrity report

SELECT 
  'Stuck Files' as check_type,
  COUNT(*) as issue_count,
  'Files stuck in processing phases > 30 min' as description
FROM uploader_uploads
WHERE current_phase IN ('processing', 'encoding', 'validating')
  AND last_updated < NOW() - INTERVAL '30 minutes'
  AND deleted_at IS NULL
  AND is_archived = false

UNION ALL

SELECT 
  'Orphaned Records',
  COUNT(DISTINCT upload_id),
  'Master records without upload record'
FROM tddf_master
WHERE upload_id NOT IN (SELECT id FROM uploader_uploads)

UNION ALL

SELECT 
  'Missing Cache',
  COUNT(*),
  'Encoded TDDF files without cache entries'
FROM uploader_uploads u
WHERE u.final_file_type = 'tddf'
  AND u.current_phase = 'encoded'
  AND u.deleted_at IS NULL
  AND u.is_archived = false
  AND NOT EXISTS (SELECT 1 FROM tddf1_totals c WHERE c.upload_id = u.id)

UNION ALL

SELECT 
  'Pending Host Approvals',
  COUNT(*),
  'Hosts waiting for approval'
FROM host_approvals
WHERE approval_status = 'pending'

UNION ALL

SELECT 
  'Inactive API Keys',
  COUNT(*),
  'API keys that are deactivated'
FROM api_keys
WHERE is_active = false

ORDER BY issue_count DESC;
