-- TDDF JSON Page Performance Optimization
-- Creating optimized indexes for the 4.9M+ record dev_tddf_jsonb table
-- This addresses the 85+ second loading times by adding proper indexing

-- 1. Composite index for created_at sorting (most common sort)
-- This will dramatically speed up the default page load
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dev_tddf_jsonb_created_at_performance 
ON dev_tddf_jsonb (created_at DESC);

-- 2. Composite index for record_type filtering with created_at sorting
-- This speeds up record type tabs (DT, BH, P1, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dev_tddf_jsonb_type_date_performance 
ON dev_tddf_jsonb (record_type, created_at DESC);

-- 3. JSONB GIN index for extracted_fields searches
-- This speeds up merchant name, reference number, and transaction searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dev_tddf_jsonb_extracted_fields_gin 
ON dev_tddf_jsonb USING GIN (extracted_fields);

-- 4. Specific index for DT transaction amount calculations
-- This speeds up the stats API total amount calculation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dev_tddf_jsonb_dt_amount_performance 
ON dev_tddf_jsonb (record_type, ((extracted_fields->>'transactionAmount')::NUMERIC))
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionAmount' IS NOT NULL 
  AND extracted_fields->>'transactionAmount' != '';

-- 5. Index for activity heat map queries (DT transaction dates)
-- This speeds up the heat map API that queries transaction dates
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dev_tddf_jsonb_dt_transaction_date 
ON dev_tddf_jsonb (record_type, DATE(extracted_fields->>'transactionDate'))
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionDate' IS NOT NULL 
  AND extracted_fields->>'transactionDate' != '';

-- 6. Upload ID filtering index for record details
-- This speeds up filtering by specific upload files
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dev_tddf_jsonb_upload_type_performance 
ON dev_tddf_jsonb (upload_id, record_type, created_at DESC);

-- Check current table statistics
SELECT 
  schemaname,
  tablename,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables 
WHERE tablename = 'dev_tddf_jsonb';

-- Show index usage after creation
SELECT 
  indexname,
  indexdef,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes 
JOIN pg_indexes USING (indexname)
WHERE tablename = 'dev_tddf_jsonb'
ORDER BY indexname;

-- Performance test queries to verify optimization
-- These should run much faster after index creation

-- Test 1: Count query (used in stats API)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT COUNT(*) FROM dev_tddf_jsonb;

-- Test 2: Record type breakdown (used in stats API)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT record_type, COUNT(*) 
FROM dev_tddf_jsonb 
GROUP BY record_type 
ORDER BY count DESC;

-- Test 3: Default records fetch (used in records API)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM dev_tddf_jsonb 
ORDER BY created_at DESC 
LIMIT 50;

-- Test 4: DT amount calculation (used in stats API)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT SUM(CAST(extracted_fields->>'transactionAmount' AS NUMERIC)) 
FROM dev_tddf_jsonb
WHERE record_type = 'DT' 
  AND extracted_fields->>'transactionAmount' IS NOT NULL
  AND extracted_fields->>'transactionAmount' != '';

-- Test 5: Activity heat map query (used in activity API)
EXPLAIN (ANALYZE, BUFFERS) 
SELECT 
  DATE(extracted_fields->>'transactionDate') as transaction_date,
  COUNT(*) as transaction_count
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND extracted_fields->>'transactionDate' IS NOT NULL
  AND extracted_fields->>'transactionDate' != ''
GROUP BY DATE(extracted_fields->>'transactionDate')
ORDER BY transaction_date DESC
LIMIT 365;