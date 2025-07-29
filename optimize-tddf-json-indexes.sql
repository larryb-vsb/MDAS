-- Heat Map Performance Optimization Indexes for TDDF JSON Tables
-- This script creates comprehensive indexes for large dataset performance

-- Development environment indexes
-- ================================

-- Primary index for date-based heat map aggregation (development)
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_jsonb_date_performance_idx 
ON dev_tddf_jsonb (
  record_type,
  ((extracted_fields->>'transactionDate')::date),
  ((extracted_fields->>'transactionAmount')::numeric)
) 
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND extracted_fields->>'transactionDate' != '';

-- Weekly aggregation index (development)
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_jsonb_weekly_performance_idx 
ON dev_tddf_jsonb (
  record_type,
  DATE_TRUNC('week', (extracted_fields->>'transactionDate')::date),
  ((extracted_fields->>'transactionAmount')::numeric)
) 
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) >= 2024;

-- Monthly aggregation index (development)
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_jsonb_monthly_performance_idx 
ON dev_tddf_jsonb (
  record_type,
  DATE_TRUNC('month', (extracted_fields->>'transactionDate')::date),
  ((extracted_fields->>'transactionAmount')::numeric)
) 
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL;

-- Filename-based queries index (development)
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_jsonb_filename_idx 
ON dev_tddf_jsonb (filename, record_type, created_at);

-- Production environment indexes
-- ===============================

-- Primary index for date-based heat map aggregation (production)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_jsonb_date_performance_idx 
ON tddf_jsonb (
  record_type,
  ((extracted_fields->>'transactionDate')::date),
  ((extracted_fields->>'transactionAmount')::numeric)
) 
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND extracted_fields->>'transactionDate' != '';

-- Weekly aggregation index (production)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_jsonb_weekly_performance_idx 
ON tddf_jsonb (
  record_type,
  DATE_TRUNC('week', (extracted_fields->>'transactionDate')::date),
  ((extracted_fields->>'transactionAmount')::numeric)
) 
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) >= 2024;

-- Monthly aggregation index (production)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_jsonb_monthly_performance_idx 
ON tddf_jsonb (
  record_type,
  DATE_TRUNC('month', (extracted_fields->>'transactionDate')::date),
  ((extracted_fields->>'transactionAmount')::numeric)
) 
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL;

-- Filename-based queries index (production)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_jsonb_filename_idx 
ON tddf_jsonb (filename, record_type, created_at);

-- Additional performance optimizations
-- ====================================

-- GIN index for JSONB field searches (development)
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_jsonb_extracted_fields_gin_idx 
ON dev_tddf_jsonb USING GIN (extracted_fields);

-- GIN index for JSONB field searches (production)  
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_jsonb_extracted_fields_gin_idx 
ON tddf_jsonb USING GIN (extracted_fields);

-- Record type and line number index for pagination (development)
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_jsonb_pagination_idx 
ON dev_tddf_jsonb (record_type, line_number, id);

-- Record type and line number index for pagination (production)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_jsonb_pagination_idx 
ON tddf_jsonb (record_type, line_number, id);

-- Statistics update for query planner optimization
-- =================================================

-- Update table statistics for development
ANALYZE dev_tddf_jsonb;

-- Update table statistics for production (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tddf_jsonb') THEN
        ANALYZE tddf_jsonb;
    END IF;
END $$;

-- Performance monitoring queries
-- ==============================

-- Check index usage statistics (development)
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE tablename = 'dev_tddf_jsonb'
ORDER BY idx_scan DESC;

-- Check table size and row counts
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size
FROM pg_stat_user_tables 
WHERE tablename IN ('dev_tddf_jsonb', 'tddf_jsonb')
ORDER BY tablename;

-- Sample performance test queries
-- ===============================

-- Test daily aggregation performance (should use dev_tddf_jsonb_date_performance_idx)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
    DATE(extracted_fields->>'transactionDate') as date,
    COUNT(*) as count,
    SUM((extracted_fields->>'transactionAmount')::numeric) as total_amount
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND extracted_fields->>'transactionDate' != ''
  AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = 2025
GROUP BY DATE(extracted_fields->>'transactionDate')
ORDER BY date ASC
LIMIT 365;

-- Test monthly aggregation performance (should use dev_tddf_jsonb_monthly_performance_idx)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
    DATE_TRUNC('month', (extracted_fields->>'transactionDate')::date) as date,
    COUNT(*) as count,
    SUM((extracted_fields->>'transactionAmount')::numeric) as total_amount
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND extracted_fields->>'transactionDate' != ''
  AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = 2025
GROUP BY DATE_TRUNC('month', (extracted_fields->>'transactionDate')::date)
ORDER BY date ASC
LIMIT 12;

-- Index maintenance recommendations
-- =================================

-- Vacuum and reindex recommendations (run during maintenance windows)
-- VACUUM ANALYZE dev_tddf_jsonb;
-- REINDEX INDEX CONCURRENTLY dev_tddf_jsonb_date_performance_idx;

-- Monitor index bloat
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename LIKE '%tddf_jsonb%'
  AND indexname LIKE '%performance%'
ORDER BY pg_relation_size(indexrelid) DESC;