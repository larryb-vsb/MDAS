-- Performance Indexes for Large Transaction Views
-- Add comprehensive indexes to optimize TDDF transaction queries

-- Development Environment Indexes (dev_ prefixed tables)
-- TDDF Records Performance Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_merchant_account_date_idx 
ON dev_tddf_records (merchant_account_number, transaction_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_terminal_date_idx 
ON dev_tddf_records (terminal_id, transaction_date DESC) 
WHERE terminal_id IS NOT NULL AND terminal_id != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_amount_date_idx 
ON dev_tddf_records (transaction_amount DESC, transaction_date DESC) 
WHERE transaction_amount IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_mcc_merchant_idx 
ON dev_tddf_records (mcc_code, merchant_account_number) 
WHERE mcc_code IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_card_type_date_idx 
ON dev_tddf_records (card_type, transaction_date DESC) 
WHERE card_type IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_merchant_name_search_idx 
ON dev_tddf_records USING gin(to_tsvector('english', merchant_name)) 
WHERE merchant_name IS NOT NULL;

-- Composite index for merchant transaction aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_merchant_aggregation_idx 
ON dev_tddf_records (merchant_account_number, merchant_name, mcc_code, transaction_date DESC);

-- Index for terminal-merchant linking performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_terminal_merchant_idx 
ON dev_tddf_records (terminal_id, merchant_account_number, transaction_date DESC) 
WHERE terminal_id IS NOT NULL AND terminal_id != '';

-- Raw Import Table Indexes for Processing Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_raw_import_processing_status_idx 
ON dev_tddf_raw_import (processing_status, created_at) 
WHERE processing_status != 'processed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_raw_import_record_type_status_idx 
ON dev_tddf_raw_import (record_type, processing_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_raw_import_file_upload_idx 
ON dev_tddf_raw_import (file_upload_id, line_number);

-- Other Record Types Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_other_records_type_merchant_idx 
ON dev_tddf_other_records (record_type, merchant_account_number, transaction_date DESC);

-- Batch Headers Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_batch_headers_merchant_date_idx 
ON dev_tddf_batch_headers (merchant_account_number, batch_date DESC);

-- Purchasing Extensions Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_purchasing_ext_parent_idx 
ON dev_tddf_purchasing_extensions (parent_dt_record_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_purchasing_ext_2_parent_idx 
ON dev_tddf_purchasing_extensions_2 (parent_dt_record_id);

-- Uploaded Files Processing Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_uploaded_files_status_type_idx 
ON dev_uploaded_files (processing_status, file_type, uploaded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_uploaded_files_tddf_processing_idx 
ON dev_uploaded_files (file_type, processing_status, created_at DESC) 
WHERE file_type = 'tddf';

-- Production Environment Indexes (main tables)
-- TDDF Records Performance Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_merchant_account_date_idx 
ON tddf_records (merchant_account_number, transaction_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_terminal_date_idx 
ON tddf_records (terminal_id, transaction_date DESC) 
WHERE terminal_id IS NOT NULL AND terminal_id != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_amount_date_idx 
ON tddf_records (transaction_amount DESC, transaction_date DESC) 
WHERE transaction_amount IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_mcc_merchant_idx 
ON tddf_records (mcc_code, merchant_account_number) 
WHERE mcc_code IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_card_type_date_idx 
ON tddf_records (card_type, transaction_date DESC) 
WHERE card_type IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_merchant_name_search_idx 
ON tddf_records USING gin(to_tsvector('english', merchant_name)) 
WHERE merchant_name IS NOT NULL;

-- Composite index for merchant transaction aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_merchant_aggregation_idx 
ON tddf_records (merchant_account_number, merchant_name, mcc_code, transaction_date DESC);

-- Index for terminal-merchant linking performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_terminal_merchant_idx 
ON tddf_records (terminal_id, merchant_account_number, transaction_date DESC) 
WHERE terminal_id IS NOT NULL AND terminal_id != '';

-- Raw Import Table Indexes for Processing Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_raw_import_processing_status_idx 
ON tddf_raw_import (processing_status, created_at) 
WHERE processing_status != 'processed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_raw_import_record_type_status_idx 
ON tddf_raw_import (record_type, processing_status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_raw_import_file_upload_idx 
ON tddf_raw_import (file_upload_id, line_number);

-- Other Record Types Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_other_records_type_merchant_idx 
ON tddf_other_records (record_type, merchant_account_number, transaction_date DESC);

-- Batch Headers Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_batch_headers_merchant_date_idx 
ON tddf_batch_headers (merchant_account_number, batch_date DESC);

-- Purchasing Extensions Indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_purchasing_ext_parent_idx 
ON tddf_purchasing_extensions (parent_dt_record_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_purchasing_ext_2_parent_idx 
ON tddf_purchasing_extensions_2 (parent_dt_record_id);

-- Uploaded Files Processing Performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS uploaded_files_status_type_idx 
ON uploaded_files (processing_status, file_type, uploaded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS uploaded_files_tddf_processing_idx 
ON uploaded_files (file_type, processing_status, created_at DESC) 
WHERE file_type = 'tddf';

-- Advanced Transaction View Optimization Indexes
-- Heat map activity queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_heatmap_activity_idx 
ON dev_tddf_records (merchant_account_number, transaction_date, transaction_amount) 
WHERE merchant_account_number IS NOT NULL AND transaction_date IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_heatmap_activity_idx 
ON tddf_records (merchant_account_number, transaction_date, transaction_amount) 
WHERE merchant_account_number IS NOT NULL AND transaction_date IS NOT NULL;

-- Large transaction views with filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_large_view_filter_idx 
ON dev_tddf_records (transaction_date DESC, merchant_account_number, terminal_id, card_type, mcc_code) 
WHERE transaction_amount > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_large_view_filter_idx 
ON tddf_records (transaction_date DESC, merchant_account_number, terminal_id, card_type, mcc_code) 
WHERE transaction_amount > 0;

-- Terminal transaction aggregation optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_terminal_aggregation_idx 
ON dev_tddf_records (terminal_id, merchant_account_number) 
INCLUDE (transaction_amount, transaction_date) 
WHERE terminal_id IS NOT NULL AND terminal_id != '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS tddf_records_terminal_aggregation_idx 
ON tddf_records (terminal_id, merchant_account_number) 
INCLUDE (transaction_amount, transaction_date) 
WHERE terminal_id IS NOT NULL AND terminal_id != '';

-- Merchant search and sorting optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_tddf_records_merchant_sort_idx 
ON dev_tddf_records (merchant_name, total_transactions DESC, total_amount DESC) 
WHERE merchant_name IS NOT NULL;

-- Performance statistics tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS dev_processing_metrics_performance_idx 
ON dev_processing_metrics (recorded_at DESC, metric_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS processing_metrics_performance_idx 
ON processing_metrics (recorded_at DESC, metric_type);

-- Comments for documentation
COMMENT ON INDEX dev_tddf_records_merchant_account_date_idx IS 'Optimizes merchant transaction history queries';
COMMENT ON INDEX dev_tddf_records_terminal_date_idx IS 'Optimizes terminal transaction lookups';
COMMENT ON INDEX dev_tddf_records_amount_date_idx IS 'Optimizes high-value transaction queries';
COMMENT ON INDEX dev_tddf_records_merchant_name_search_idx IS 'Enables full-text search on merchant names';
COMMENT ON INDEX dev_tddf_records_merchant_aggregation_idx IS 'Optimizes merchant summary statistics';
COMMENT ON INDEX dev_tddf_records_heatmap_activity_idx IS 'Optimizes transaction activity heat map queries';
COMMENT ON INDEX dev_tddf_records_large_view_filter_idx IS 'Optimizes large transaction view filtering';
COMMENT ON INDEX dev_tddf_records_terminal_aggregation_idx IS 'Optimizes terminal transaction aggregation with covering index';

-- Index maintenance recommendations
-- Run VACUUM ANALYZE after index creation for optimal performance
-- Consider running these commands after index creation:
-- VACUUM ANALYZE dev_tddf_records;
-- VACUUM ANALYZE tddf_records;
-- VACUUM ANALYZE dev_tddf_raw_import;
-- VACUUM ANALYZE tddf_raw_import;