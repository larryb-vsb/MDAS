-- ============================================================================
-- MMS PRODUCTION VERIFICATION - OCTOBER 2025
-- ============================================================================
-- Description: Post-deployment verification queries
-- Target Database: ep-quiet-unit-aa0eaxhe (NEON_PROD_DATABASE_URL)
-- Purpose: Validate successful migration and application functionality
-- ============================================================================

\echo '========================================';
\echo 'PRODUCTION VERIFICATION QUERIES';
\echo 'Migration Date: October 31, 2025';
\echo 'Schema Version: 2.9.0';
\echo '========================================';
\echo '';

-- ============================================================================
-- SECTION 1: Schema Validation
-- ============================================================================

\echo 'SECTION 1: Schema Validation';
\echo '----------------------------';

-- Verify uploader_uploads table structure
\echo '1.1 uploader_uploads soft-delete columns:';
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'uploader_uploads'
  AND column_name IN ('deleted_at', 'deleted_by')
ORDER BY column_name;
-- Expected: 2 rows (deleted_at: timestamp, deleted_by: varchar)

-- Verify audit_logs table structure
\echo '';
\echo '1.2 audit_logs file_metadata column:';
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'audit_logs'
  AND column_name = 'file_metadata';
-- Expected: 1 row (file_metadata: jsonb)

-- Verify indexes created
\echo '';
\echo '1.3 New indexes verification:';
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('uploader_uploads', 'audit_logs')
  AND indexname IN ('audit_logs_action_idx', 'uploader_uploads_deleted_at_idx')
ORDER BY tablename, indexname;
-- Expected: 2 rows

\echo '';
\echo '========================================';

-- ============================================================================
-- SECTION 2: Data Integrity Checks
-- ============================================================================

\echo '';
\echo 'SECTION 2: Data Integrity Checks';
\echo '---------------------------------';

-- Check uploader_uploads table health
\echo '2.1 uploader_uploads table statistics:';
SELECT 
    COUNT(*) as total_uploads,
    COUNT(*) FILTER (WHERE upload_status = 'deleted') as deleted_status_count,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as has_deleted_at,
    COUNT(*) FILTER (WHERE deleted_by IS NOT NULL) as has_deleted_by,
    COUNT(*) FILTER (WHERE current_phase = 'completed') as completed_files,
    COUNT(*) FILTER (WHERE current_phase = 'failed') as failed_files
FROM uploader_uploads;

-- Check audit_logs table health
\echo '';
\echo '2.2 audit_logs table statistics:';
SELECT 
    COUNT(*) as total_audit_entries,
    COUNT(*) FILTER (WHERE action = 'soft_delete') as soft_delete_actions,
    COUNT(*) FILTER (WHERE file_metadata IS NOT NULL) as has_file_metadata,
    COUNT(DISTINCT entity_type) as distinct_entity_types,
    COUNT(DISTINCT action) as distinct_actions
FROM audit_logs;

-- Recent file processing activity
\echo '';
\echo '2.3 Recent file uploads (last 24 hours):';
SELECT 
    current_phase,
    upload_status,
    COUNT(*) as count,
    MAX(uploaded_at) as latest_upload
FROM uploader_uploads
WHERE start_time >= NOW() - INTERVAL '24 hours'
GROUP BY current_phase, upload_status
ORDER BY current_phase, upload_status;

\echo '';
\echo '========================================';

-- ============================================================================
-- SECTION 3: Functional Tests
-- ============================================================================

\echo '';
\echo 'SECTION 3: Functional Tests';
\echo '---------------------------';

-- Test soft-delete filtering (simulates API query)
\echo '3.1 Active files query (excludes deleted):';
SELECT 
    COUNT(*) as active_files_count,
    COUNT(DISTINCT current_phase) as distinct_phases
FROM uploader_uploads
WHERE (upload_status != 'deleted' OR upload_status IS NULL)
  AND (is_archived = false OR is_archived IS NULL);

-- Test deleted files query
\echo '';
\echo '3.2 Deleted files query:';
SELECT 
    COUNT(*) as deleted_files_count,
    MIN(deleted_at) as earliest_deletion,
    MAX(deleted_at) as latest_deletion,
    COUNT(DISTINCT deleted_by) as distinct_deleters
FROM uploader_uploads
WHERE upload_status = 'deleted';

-- Test audit log queries by action
\echo '';
\echo '3.3 Audit log action breakdown:';
SELECT 
    action,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE file_metadata IS NOT NULL) as with_metadata,
    MAX(timestamp) as latest_entry
FROM audit_logs
GROUP BY action
ORDER BY count DESC
LIMIT 10;

\echo '';
\echo '========================================';

-- ============================================================================
-- SECTION 4: Performance Checks
-- ============================================================================

\echo '';
\echo 'SECTION 4: Performance Checks';
\echo '-----------------------------';

-- Index usage statistics
\echo '4.1 Index scan statistics (requires pg_stat_statements):';
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename IN ('uploader_uploads', 'audit_logs')
  AND indexname IN ('audit_logs_action_idx', 'uploader_uploads_deleted_at_idx')
ORDER BY tablename, indexname;

-- Table size and bloat check
\echo '';
\echo '4.2 Table sizes:';
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE tablename IN ('uploader_uploads', 'audit_logs')
ORDER BY tablename;

\echo '';
\echo '========================================';

-- ============================================================================
-- SECTION 5: Sample Data Review
-- ============================================================================

\echo '';
\echo 'SECTION 5: Sample Data Review';
\echo '-----------------------------';

-- Most recent uploads
\echo '5.1 Most recent 5 uploads:';
SELECT 
    id,
    filename,
    current_phase,
    upload_status,
    uploaded_at,
    deleted_at,
    deleted_by
FROM uploader_uploads
ORDER BY start_time DESC
LIMIT 5;

-- Recent audit log entries
\echo '';
\echo '5.2 Most recent 5 audit log entries:';
SELECT 
    id,
    entity_type,
    action,
    username,
    timestamp,
    CASE 
        WHEN file_metadata IS NOT NULL THEN 'Yes'
        ELSE 'No'
    END as has_metadata
FROM audit_logs
ORDER BY timestamp DESC
LIMIT 5;

\echo '';
\echo '========================================';

-- ============================================================================
-- SECTION 6: Health Summary
-- ============================================================================

\echo '';
\echo 'SECTION 6: Migration Health Summary';
\echo '-----------------------------------';

DO $$
DECLARE
    upload_cols_count INT;
    audit_cols_count INT;
    indexes_count INT;
    deleted_files INT;
    audit_entries INT;
BEGIN
    -- Count new columns
    SELECT COUNT(*) INTO upload_cols_count
    FROM information_schema.columns
    WHERE table_name = 'uploader_uploads'
      AND column_name IN ('deleted_at', 'deleted_by');
    
    SELECT COUNT(*) INTO audit_cols_count
    FROM information_schema.columns
    WHERE table_name = 'audit_logs'
      AND column_name = 'file_metadata';
    
    -- Count indexes
    SELECT COUNT(*) INTO indexes_count
    FROM pg_indexes
    WHERE indexname IN ('audit_logs_action_idx', 'uploader_uploads_deleted_at_idx');
    
    -- Count affected records
    SELECT COUNT(*) INTO deleted_files
    FROM uploader_uploads
    WHERE upload_status = 'deleted';
    
    SELECT COUNT(*) INTO audit_entries
    FROM audit_logs;
    
    -- Report health status
    RAISE NOTICE '';
    RAISE NOTICE 'Migration Health Report:';
    RAISE NOTICE '========================';
    RAISE NOTICE 'Schema Changes:';
    RAISE NOTICE '  • uploader_uploads new columns: % of 2 expected', upload_cols_count;
    RAISE NOTICE '  • audit_logs new columns: % of 1 expected', audit_cols_count;
    RAISE NOTICE '  • New indexes created: % of 2 expected', indexes_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Data Status:';
    RAISE NOTICE '  • Deleted files tracked: %', deleted_files;
    RAISE NOTICE '  • Total audit log entries: %', audit_entries;
    RAISE NOTICE '';
    
    -- Overall health assessment
    IF upload_cols_count = 2 AND audit_cols_count = 1 AND indexes_count = 2 THEN
        RAISE NOTICE 'Overall Status: ✓ HEALTHY - All migrations successful';
    ELSE
        RAISE WARNING 'Overall Status: ⚠ CHECK REQUIRED - Some migrations may be incomplete';
    END IF;
    RAISE NOTICE '========================';
END $$;

\echo '';
\echo '========================================';
\echo 'VERIFICATION COMPLETE';
\echo 'Review output above for any issues';
\echo '========================================';
