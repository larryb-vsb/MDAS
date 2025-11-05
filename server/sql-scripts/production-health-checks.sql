-- ============================================================================
-- PRODUCTION DATABASE HEALTH CHECK SCRIPTS
-- ============================================================================
-- These scripts help identify database issues after deployment
-- Run these in production to validate database integrity
-- ============================================================================

-- 1. CHECK FOR MISSING CRITICAL TABLES
-- ============================================================================
SELECT 
  table_name,
  CASE 
    WHEN table_name IN (
      'uploader_uploads', 'tddf1_totals', 'tddf_api_queue', 'tddf_master',
      'merchants', 'terminals', 'tddf_archive', 'uploader_processing_timing',
      'connection_log', 'ip_blocklist', 'host_approvals', 'api_keys'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'uploader_uploads', 'tddf1_totals', 'tddf_api_queue', 'tddf_master',
    'merchants', 'terminals', 'tddf_archive', 'uploader_processing_timing',
    'connection_log', 'ip_blocklist', 'host_approvals', 'api_keys'
  )
ORDER BY table_name;

-- Check what's missing
SELECT 
  unnest(ARRAY[
    'uploader_uploads', 'tddf1_totals', 'tddf_api_queue', 'tddf_master',
    'merchants', 'terminals', 'tddf_archive', 'uploader_processing_timing',
    'connection_log', 'ip_blocklist', 'host_approvals', 'api_keys'
  ]) as missing_table
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_name = unnest
);


-- 2. CHECK FOR STUCK FILES IN PROCESSING PHASES
-- ============================================================================
SELECT 
  id,
  filename,
  final_file_type,
  current_phase,
  upload_status,
  last_updated,
  EXTRACT(EPOCH FROM (NOW() - last_updated))/60 as minutes_stuck
FROM uploader_uploads
WHERE current_phase IN ('processing', 'encoding', 'validating')
  AND last_updated < NOW() - INTERVAL '30 minutes'
  AND deleted_at IS NULL
  AND is_archived = false
ORDER BY last_updated;


-- 3. CHECK FOR ORPHANED RECORDS (master records without upload record)
-- ============================================================================
SELECT 
  upload_id,
  COUNT(*) as record_count,
  MIN(business_date) as earliest_date,
  MAX(business_date) as latest_date
FROM tddf_master
WHERE upload_id NOT IN (
  SELECT id FROM uploader_uploads
)
GROUP BY upload_id
ORDER BY record_count DESC
LIMIT 20;


-- 4. CHECK CACHE INTEGRITY (TDDF files should have cache entries)
-- ============================================================================
SELECT 
  u.id,
  u.filename,
  u.current_phase,
  u.last_updated,
  CASE 
    WHEN c.upload_id IS NOT NULL THEN 'CACHED'
    ELSE 'MISSING_CACHE'
  END as cache_status
FROM uploader_uploads u
LEFT JOIN tddf1_totals c ON u.id = c.upload_id
WHERE u.final_file_type = 'tddf'
  AND u.current_phase = 'encoded'
  AND u.deleted_at IS NULL
  AND u.is_archived = false
  AND c.upload_id IS NULL
ORDER BY u.last_updated DESC
LIMIT 50;


-- 5. CHECK FOR DUPLICATE FILES (same filename uploaded multiple times)
-- ============================================================================
SELECT 
  filename,
  COUNT(*) as upload_count,
  array_agg(id ORDER BY created_at DESC) as upload_ids,
  array_agg(current_phase ORDER BY created_at DESC) as phases,
  array_agg(created_at ORDER BY created_at DESC) as created_dates
FROM uploader_uploads
WHERE deleted_at IS NULL
GROUP BY filename
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;


-- 6. CHECK API KEY USAGE (identify inactive or suspicious keys)
-- ============================================================================
SELECT 
  id,
  username,
  key_name,
  is_active,
  request_count,
  last_used,
  last_used_ip,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - last_used))/86400 as days_since_last_use
FROM api_keys
ORDER BY last_used DESC NULLS LAST;


-- 7. CHECK HOST APPROVALS (identify pending or denied hosts)
-- ============================================================================
SELECT 
  id,
  hostname,
  api_key_prefix,
  approval_status,
  client_ip,
  last_seen,
  first_seen,
  reviewed_by,
  notes
FROM host_approvals
WHERE approval_status IN ('pending', 'denied')
ORDER BY last_seen DESC;


-- 8. CHECK CONNECTION LOG FOR SUSPICIOUS ACTIVITY
-- ============================================================================
SELECT 
  client_ip,
  COUNT(*) as connection_count,
  COUNT(DISTINCT endpoint) as unique_endpoints,
  MIN(timestamp) as first_seen,
  MAX(timestamp) as last_seen,
  array_agg(DISTINCT api_key_used) FILTER (WHERE api_key_used IS NOT NULL) as api_keys_used
FROM connection_log
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY client_ip
HAVING COUNT(*) > 100  -- More than 100 connections in 24 hours
ORDER BY COUNT(*) DESC
LIMIT 20;


-- 9. CHECK FOR FILES WITH PROCESSING ERRORS
-- ============================================================================
SELECT 
  id,
  filename,
  final_file_type,
  current_phase,
  upload_status,
  processing_errors,
  retry_count,
  last_failure_reason,
  last_updated
FROM uploader_uploads
WHERE processing_errors IS NOT NULL
  OR last_failure_reason IS NOT NULL
  AND deleted_at IS NULL
ORDER BY last_updated DESC
LIMIT 50;


-- 10. OVERALL SYSTEM STATISTICS
-- ============================================================================
SELECT 
  'Total Uploads' as metric,
  COUNT(*)::text as value
FROM uploader_uploads

UNION ALL

SELECT 
  'Active Uploads',
  COUNT(*)::text
FROM uploader_uploads
WHERE deleted_at IS NULL AND is_archived = false

UNION ALL

SELECT 
  'TDDF Files',
  COUNT(*)::text
FROM uploader_uploads
WHERE final_file_type = 'tddf' AND deleted_at IS NULL

UNION ALL

SELECT 
  'Terminal Files',
  COUNT(*)::text
FROM uploader_uploads
WHERE final_file_type = 'terminal' AND deleted_at IS NULL

UNION ALL

SELECT 
  'Merchant Files',
  COUNT(*)::text
FROM uploader_uploads
WHERE final_file_type = 'merchant_detail' AND deleted_at IS NULL

UNION ALL

SELECT 
  'Archived Files',
  COUNT(*)::text
FROM uploader_uploads
WHERE is_archived = true

UNION ALL

SELECT 
  'Total TDDF Records',
  COUNT(*)::text
FROM tddf_master

UNION ALL

SELECT 
  'Total API Queue Records',
  COUNT(*)::text
FROM tddf_api_queue

UNION ALL

SELECT 
  'Active Merchants',
  COUNT(*)::text
FROM merchants

UNION ALL

SELECT 
  'Active Terminals',
  COUNT(*)::text
FROM terminals

ORDER BY metric;
