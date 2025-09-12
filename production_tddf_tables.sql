-- Production TDDF API Tables Creation Script
-- Run this in your production database (ep-quiet-unit-aa0eaxhe)

-- 1. Create tddf_api_files table first (referenced by foreign keys)
CREATE TABLE tddf_api_files (
    id SERIAL PRIMARY KEY,
    original_name VARCHAR NOT NULL,
    storage_path VARCHAR,
    schema_id INTEGER,
    status VARCHAR DEFAULT 'uploaded',
    processing_started TIMESTAMPTZ,
    processing_completed TIMESTAMPTZ,
    record_count INTEGER,
    processed_records INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    file_size BIGINT,
    content_type VARCHAR,
    upload_session_id VARCHAR,
    error_message TEXT,
    metadata JSONB,
    checksum VARCHAR,
    is_processed BOOLEAN DEFAULT false
);

-- 2. Create tddf_api_schemas table
CREATE TABLE tddf_api_schemas (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    version VARCHAR DEFAULT '1.0',
    schema_data JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR DEFAULT 'system'
);

-- 3. Create tddf_api_queue table (THE MISSING ONE!)
CREATE TABLE tddf_api_queue (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES tddf_api_files(id) ON DELETE CASCADE,
    status VARCHAR DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_details JSONB
);

-- 4. Create tddf_api_records table
CREATE TABLE tddf_api_records (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES tddf_api_files(id) ON DELETE CASCADE,
    record_type VARCHAR,
    record_data JSONB,
    line_number INTEGER,
    processing_status VARCHAR DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    sequence_number INTEGER
);

-- 5. Insert default schema data
INSERT INTO tddf_api_schemas (name, version, schema_data, description, created_by) VALUES 
('TDDF Standard', '2025.1', '{"type": "fixed_width", "fields": []}', 'Standard TDDF format', 'system'),
('TDDF Extended', '2025.1', '{"type": "fixed_width", "fields": []}', 'Extended TDDF format', 'system'),
('Custom Format', '1.0', '{"type": "custom", "fields": []}', 'Custom processing format', 'system');