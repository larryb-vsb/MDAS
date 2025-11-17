-- Full script to create uploader_tddf_jsonb_records table in production
-- This creates the complete table with all columns that exist in development

-- Drop existing table if it exists (CAUTION: This will lose all data)
-- Comment out the DROP line if you want to preserve existing data
DROP TABLE IF EXISTS uploader_tddf_jsonb_records CASCADE;

-- Create the complete uploader_tddf_jsonb_records table for production
CREATE TABLE uploader_tddf_jsonb_records (
    -- Core schema fields (from shared/schema.ts)
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_data JSONB NOT NULL,
    processing_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    
    -- Extended fields (from development usage)
    record_identifier TEXT,
    line_number INTEGER,
    raw_line TEXT,
    field_count INTEGER,
    
    -- TDDF metadata fields (enhanced processing)
    original_filename TEXT,
    file_processing_date DATE,
    file_sequence_number TEXT,
    file_processing_time TEXT,
    file_system_id TEXT,
    mainframe_process_data JSONB,
    
    -- Business fields
    merchant_account_number VARCHAR(16)
);

-- Create all required indexes for performance
CREATE INDEX idx_uploader_tddf_jsonb_records_upload_id 
    ON uploader_tddf_jsonb_records(upload_id);

CREATE INDEX idx_uploader_tddf_jsonb_records_record_type 
    ON uploader_tddf_jsonb_records(record_type);

CREATE INDEX idx_uploader_tddf_jsonb_records_processing_status 
    ON uploader_tddf_jsonb_records(processing_status);

CREATE INDEX idx_uploader_tddf_jsonb_records_created_at 
    ON uploader_tddf_jsonb_records(created_at);

CREATE INDEX idx_uploader_tddf_jsonb_records_processed_at 
    ON uploader_tddf_jsonb_records(processed_at);

CREATE INDEX idx_uploader_tddf_jsonb_records_line_number 
    ON uploader_tddf_jsonb_records(line_number);

CREATE INDEX idx_uploader_tddf_jsonb_records_merchant_account 
    ON uploader_tddf_jsonb_records(merchant_account_number);

CREATE INDEX idx_uploader_tddf_jsonb_records_file_processing_date 
    ON uploader_tddf_jsonb_records(file_processing_date);

-- Add foreign key constraint (if uploader_uploads table exists)
-- ALTER TABLE uploader_tddf_jsonb_records 
-- ADD CONSTRAINT fk_uploader_tddf_jsonb_records_upload_id 
-- FOREIGN KEY (upload_id) REFERENCES uploader_uploads(id) ON DELETE CASCADE;

-- Verify table creation
SELECT 
    'uploader_tddf_jsonb_records' as table_name,
    COUNT(*) as column_count
FROM information_schema.columns 
WHERE table_name = 'uploader_tddf_jsonb_records';

-- Show all columns in the created table
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'uploader_tddf_jsonb_records' 
ORDER BY ordinal_position;

-- Show all indexes created
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'uploader_tddf_jsonb_records'
ORDER BY indexname;