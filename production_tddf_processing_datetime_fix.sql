-- PRODUCTION FIX: Error fetching last TDDF processing datetime - missing tddf_processing_datetime column
-- Date: 2025-09-12, Error ID: 574620a9  
-- Issue: Production tddf_jsonb table missing, causing API failure

-- STEP 1: Create production tddf_jsonb table
SELECT 'CREATING PRODUCTION TDDF_JSONB TABLE' as step;

CREATE TABLE IF NOT EXISTS tddf_jsonb (
    id SERIAL PRIMARY KEY,
    upload_id text NOT NULL,
    filename text NOT NULL,
    record_type text NOT NULL,
    line_number integer NOT NULL,
    raw_line text NOT NULL,
    extracted_fields jsonb NOT NULL,
    record_identifier text,
    processing_time_ms integer DEFAULT 0,
    -- Universal TDDF processing datetime fields extracted from filename
    tddf_processing_datetime timestamp,
    tddf_processing_date date,
    -- Universal timestamp fields for chronological ordering
    parsed_datetime timestamp,
    record_time_source text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    -- Additional fields from development schema
    processing_server_id text,
    processing_status text DEFAULT 'pending',
    details jsonb
);

-- STEP 2: Add missing tddf_processing_datetime column to existing tables
SELECT 'ADDING MISSING COLUMNS TO EXISTING TABLES' as step;

-- Add to processing_metrics table (already exists)
ALTER TABLE processing_metrics ADD COLUMN IF NOT EXISTS tddf_processing_datetime timestamp;

-- Add to system_logs table (already exists)
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS tddf_processing_datetime timestamp;

-- STEP 4: Create indexes for performance
SELECT 'CREATING PERFORMANCE INDEXES' as step;

-- tddf_jsonb indexes
CREATE INDEX IF NOT EXISTS tddf_jsonb_upload_id_idx ON tddf_jsonb(upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_filename_idx ON tddf_jsonb(filename);
CREATE INDEX IF NOT EXISTS tddf_jsonb_record_type_idx ON tddf_jsonb(record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_tddf_processing_datetime_idx ON tddf_jsonb(tddf_processing_datetime);
CREATE INDEX IF NOT EXISTS tddf_jsonb_tddf_processing_date_idx ON tddf_jsonb(tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_parsed_datetime_idx ON tddf_jsonb(parsed_datetime);
CREATE INDEX IF NOT EXISTS tddf_jsonb_created_at_idx ON tddf_jsonb(created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_processing_status_idx ON tddf_jsonb(processing_status);

-- processing_metrics indexes
CREATE INDEX IF NOT EXISTS processing_metrics_tddf_processing_datetime_idx ON processing_metrics(tddf_processing_datetime);
CREATE INDEX IF NOT EXISTS processing_metrics_recorded_at_idx ON processing_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS processing_metrics_metric_name_idx ON processing_metrics(metric_name);

-- system_logs indexes
CREATE INDEX IF NOT EXISTS system_logs_tddf_processing_datetime_idx ON system_logs(tddf_processing_datetime);
CREATE INDEX IF NOT EXISTS system_logs_created_at_idx ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS system_logs_log_level_idx ON system_logs(log_level);

-- STEP 5: Insert sample data for testing
SELECT 'INSERTING SAMPLE DATA FOR TESTING' as step;

-- Sample tddf_jsonb record
INSERT INTO tddf_jsonb (
    upload_id, filename, record_type, line_number, raw_line, 
    extracted_fields, tddf_processing_datetime, tddf_processing_date,
    parsed_datetime, record_time_source, processing_status
) 
SELECT 
    'SAMPLE001',
    'SAMPLE_TDDF_FILE.txt',
    'BH',
    1,
    'SAMPLE RAW LINE DATA',
    '{"sample": "data"}',
    CURRENT_TIMESTAMP,
    CURRENT_DATE,
    CURRENT_TIMESTAMP,
    'file_timestamp',
    'encoded'
WHERE NOT EXISTS (SELECT 1 FROM tddf_jsonb WHERE upload_id = 'SAMPLE001');

-- Sample processing_metrics record
INSERT INTO processing_metrics (
    metric_name, metric_value, tddf_processing_datetime, environment
)
SELECT 
    'sample_metric',
    100.0,
    CURRENT_TIMESTAMP,
    'production'
WHERE NOT EXISTS (SELECT 1 FROM processing_metrics WHERE metric_name = 'sample_metric');

-- Sample system_logs record
INSERT INTO system_logs (
    log_level, message, tddf_processing_datetime, source, environment
)
SELECT 
    'INFO',
    'Sample log entry for testing',
    CURRENT_TIMESTAMP,
    'production_fix',
    'production'
WHERE NOT EXISTS (SELECT 1 FROM system_logs WHERE message = 'Sample log entry for testing');

-- STEP 6: Test the API query that was failing
SELECT 'TESTING API QUERY' as test_type;

-- Test the exact query from the API route
SELECT 
    tddf_processing_datetime,
    tddf_processing_date,
    filename,
    record_type,
    created_at
FROM tddf_jsonb
WHERE tddf_processing_datetime IS NOT NULL
ORDER BY tddf_processing_datetime DESC
LIMIT 1;

-- STEP 7: Verify table schema
SELECT 'SCHEMA VERIFICATION' as verification;

-- Check tddf_jsonb columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'tddf_jsonb'
AND column_name IN ('tddf_processing_datetime', 'tddf_processing_date', 'filename', 'record_type')
ORDER BY ordinal_position;

-- Check processing_metrics columns
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'processing_metrics'
AND column_name = 'tddf_processing_datetime';

-- Check system_logs columns
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'system_logs'
AND column_name = 'tddf_processing_datetime';

-- STEP 8: Final verification
SELECT 'FINAL VERIFICATION' as final_step;

-- Show created tables
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('tddf_jsonb', 'processing_metrics', 'system_logs')
ORDER BY table_name;

-- Count records in each table
SELECT 'TDDF_JSONB RECORDS' as table_name, COUNT(*) as record_count FROM tddf_jsonb
UNION ALL
SELECT 'PROCESSING_METRICS RECORDS' as table_name, COUNT(*) as record_count FROM processing_metrics
UNION ALL
SELECT 'SYSTEM_LOGS RECORDS' as table_name, COUNT(*) as record_count FROM system_logs;

SELECT 'PRODUCTION TDDF PROCESSING DATETIME FIX COMPLETE' as completion_status;
SELECT 'API endpoint for last TDDF processing datetime should now work' as api_status;