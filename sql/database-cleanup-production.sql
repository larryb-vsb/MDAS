-- =====================================================
-- PRODUCTION DATABASE CLEANUP SCRIPT
-- Server: ep-quiet-unit-aa0eaxhe (NEON_PROD_DATABASE_URL)
-- Generated: October 31, 2025
-- Purpose: Rename orphan tables with del_ prefix
-- =====================================================

-- IMPORTANT: Review this script before running on production!
-- These tables appear to be orphaned based on development database analysis.
-- Verify they're not in use before proceeding.

-- =====================================================
-- STEP 1: RENAME EMPTY ORPHAN TABLES (Low Risk)
-- These tables were completely empty in development
-- =====================================================

-- king-server (8 KB, 0 rows in dev)
ALTER TABLE "king-server" RENAME TO "del_king-server";

-- uploader_uploads_backup (16 KB, 0 rows in dev)
ALTER TABLE uploader_uploads_backup RENAME TO del_uploader_uploads_backup;

-- processing_timing_logs (48 KB, 0 rows in dev)
ALTER TABLE processing_timing_logs RENAME TO del_processing_timing_logs;

-- system_logs (16 KB, 0 rows in dev) 
-- NOTE: Has dev version (dev_system_logs) that is actively used
ALTER TABLE system_logs RENAME TO del_system_logs;

-- uploaded_files (32 KB, 0 rows in dev)
-- NOTE: Has dev version (dev_uploaded_files) that is actively used
ALTER TABLE uploaded_files RENAME TO del_uploaded_files;

-- uploader_uploads (16 KB, 0 rows in dev)
-- NOTE: Has dev version (dev_uploader_uploads) that is actively used
ALTER TABLE uploader_uploads RENAME TO del_uploader_uploads;

-- =====================================================
-- STEP 2: RENAME TEST DATA TABLES (Low Risk)
-- These tables had only 1 test row in development
-- =====================================================

-- tddf1_merchants (144 KB, 1 row in dev)
-- NOTE: Has dev version (dev_tddf1_merchants) that is actively used
ALTER TABLE tddf1_merchants RENAME TO del_tddf1_merchants;

-- duplicate_finder_cache (32 KB, 1 row in dev)
-- NOTE: Has dev version (dev_duplicate_finder_cache) that is actively used
ALTER TABLE duplicate_finder_cache RENAME TO del_duplicate_finder_cache;

-- processing_metrics (128 KB, 1 row in dev)
-- NOTE: Has dev version (dev_processing_metrics) that is actively used
ALTER TABLE processing_metrics RENAME TO del_processing_metrics;

-- tddf_jsonb (32 KB, 1 row in dev)
-- NOTE: Has dev version (dev_tddf_jsonb) that is actively used (10 GB)
ALTER TABLE tddf_jsonb RENAME TO del_tddf_jsonb;

-- =====================================================
-- STEP 3: RENAME LARGE LEGACY TABLE (REVIEW FIRST!)
-- This table contains significant data - verify before proceeding
-- =====================================================

-- uploader_tddf_jsonb_records (277 MB, 197K rows in dev)
-- Last activity in dev: September 11, 2025
-- NOTE: Has dev version (dev_uploader_tddf_jsonb_records) that is actively used (3.3 GB)
-- CAUTION: This is a large table. Verify you have backups before renaming!
ALTER TABLE uploader_tddf_jsonb_records RENAME TO del_uploader_tddf_jsonb_records;

-- =====================================================
-- STEP 4: VERIFICATION QUERIES
-- Run these after renaming to verify
-- =====================================================

-- Check all renamed tables
-- SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name)::regclass)) as size
-- FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name LIKE 'del_%'
-- ORDER BY table_name;

-- Verify active tables still exist
-- SELECT 
--     CASE 
--         WHEN table_name LIKE 'dev_%' THEN 'Active (dev)'
--         WHEN table_name LIKE 'del_%' THEN 'Marked for deletion'
--         ELSE 'Shared/System'
--     END as category,
--     COUNT(*) as table_count
-- FROM information_schema.tables
-- WHERE table_schema = 'public' 
--   AND table_type = 'BASE TABLE'
-- GROUP BY category;

-- =====================================================
-- TABLES TO KEEP (DO NOT RENAME)
-- =====================================================
-- merchant_mcc_schema - Active table with 177 rows, last analyzed Oct 8, 2025
-- All dev_* tables - These are the active development/production tables
-- backup_schedules, backup_history - System tables
-- schema_versions, schema_content - Schema management tables
-- transactions - May have active data (had 7 deleted rows in dev)
-- tddf_api_* tables - TDDF API system tables
-- tddf_json_record_type_counts_pre_cache - Cache table

-- =====================================================
-- CLEANUP INSTRUCTIONS
-- =====================================================
-- After verifying the application works with renamed tables:
-- 
-- 1. Wait at least 7-14 days to ensure no issues
-- 2. Run final check to confirm del_ tables aren't being accessed
-- 3. Drop the tables permanently:
--    DROP TABLE "del_king-server";
--    DROP TABLE del_uploader_uploads_backup;
--    DROP TABLE del_processing_timing_logs;
--    DROP TABLE del_system_logs;
--    DROP TABLE del_uploaded_files;
--    DROP TABLE del_uploader_uploads;
--    DROP TABLE del_tddf1_merchants;
--    DROP TABLE del_duplicate_finder_cache;
--    DROP TABLE del_processing_metrics;
--    DROP TABLE del_tddf_jsonb;
--    DROP TABLE del_uploader_tddf_jsonb_records;  -- This is large (277 MB)!
--
-- Estimated space to be freed: ~278 MB
-- =====================================================
