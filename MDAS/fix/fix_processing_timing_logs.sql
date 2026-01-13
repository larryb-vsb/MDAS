-- Fix for processing_timing_logs table error
-- Error: [RE-ENCODE-TIMING] Could not create timing log: relation "processing_timing_logs" does not exist
-- Date: 2025-09-11 21:48:57.45

-- Create missing processing_timing_logs table for production
CREATE TABLE IF NOT EXISTS processing_timing_logs (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL, -- References uploader_uploads.id
    operation_type TEXT NOT NULL, -- 're-encode', 'initial-process', 'cache-build'  
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    total_records INTEGER,
    records_per_second NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
    metadata JSONB, -- Additional operation details
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS processing_timing_logs_upload_id_idx ON processing_timing_logs(upload_id);
CREATE INDEX IF NOT EXISTS processing_timing_logs_operation_type_idx ON processing_timing_logs(operation_type);  
CREATE INDEX IF NOT EXISTS processing_timing_logs_status_idx ON processing_timing_logs(status);
CREATE INDEX IF NOT EXISTS processing_timing_logs_start_time_idx ON processing_timing_logs(start_time);

-- Verify table creation
SELECT 
    'processing_timing_logs' as table_name,
    COUNT(*) as initial_record_count,
    'CREATED' as status
FROM processing_timing_logs;