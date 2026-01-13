-- Master Object Key Database with Processing and History Metadata
-- Created: July 30, 2025

-- Create master object keys table
CREATE TABLE IF NOT EXISTS dev_master_object_keys (
    id SERIAL PRIMARY KEY,
    object_key VARCHAR(500) NOT NULL UNIQUE,
    bucket_name VARCHAR(100) NOT NULL DEFAULT 'default-replit-bucket',
    
    -- File metadata
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size BIGINT NOT NULL,
    line_count INTEGER,
    content_hash VARCHAR(64), -- SHA-256 hash for deduplication
    
    -- Processing metadata
    upload_id INTEGER REFERENCES dev_uploader_uploads(id) ON DELETE CASCADE,
    current_phase VARCHAR(50) NOT NULL DEFAULT 'stored',
    processing_status VARCHAR(50) NOT NULL DEFAULT 'complete',
    
    -- Processing history (JSONB for flexible metadata)
    processing_history JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    last_modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Purge management
    marked_for_purge BOOLEAN NOT NULL DEFAULT FALSE,
    purge_after_date TIMESTAMP WITH TIME ZONE,
    purge_reason VARCHAR(255),
    
    -- Indexes for performance
    INDEX idx_master_object_keys_object_key (object_key),
    INDEX idx_master_object_keys_upload_id (upload_id),
    INDEX idx_master_object_keys_file_type (file_type),
    INDEX idx_master_object_keys_processing_status (processing_status),
    INDEX idx_master_object_keys_purge_status (marked_for_purge, purge_after_date),
    INDEX idx_master_object_keys_created_at (created_at),
    INDEX idx_master_object_keys_content_hash (content_hash)
);

-- Create processing history table for detailed tracking
CREATE TABLE IF NOT EXISTS dev_object_processing_history (
    id SERIAL PRIMARY KEY,
    object_key_id INTEGER NOT NULL REFERENCES dev_master_object_keys(id) ON DELETE CASCADE,
    
    -- Processing details
    phase VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    processing_time_ms INTEGER,
    records_processed INTEGER DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- Processing metadata
    processor_id VARCHAR(100), -- Which service processed it
    processing_notes JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    
    INDEX idx_object_processing_history_object_key_id (object_key_id),
    INDEX idx_object_processing_history_phase (phase),
    INDEX idx_object_processing_history_status (status),
    INDEX idx_object_processing_history_started_at (started_at)
);

-- Create purge queue table
CREATE TABLE IF NOT EXISTS dev_object_purge_queue (
    id SERIAL PRIMARY KEY,
    object_key_id INTEGER NOT NULL REFERENCES dev_master_object_keys(id) ON DELETE CASCADE,
    
    -- Purge details
    purge_type VARCHAR(50) NOT NULL, -- 'orphaned', 'expired', 'manual', 'policy'
    purge_reason TEXT,
    scheduled_purge_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Purge status
    purge_status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'failed'
    purge_started_at TIMESTAMP WITH TIME ZONE,
    purge_completed_at TIMESTAMP WITH TIME ZONE,
    purge_error TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    INDEX idx_object_purge_queue_scheduled_date (scheduled_purge_date),
    INDEX idx_object_purge_queue_status (purge_status),
    INDEX idx_object_purge_queue_type (purge_type)
);

-- Create views for common queries
CREATE OR REPLACE VIEW dev_object_storage_summary AS
SELECT 
    COUNT(*) as total_objects,
    COUNT(CASE WHEN marked_for_purge THEN 1 END) as marked_for_purge,
    COUNT(CASE WHEN processing_status = 'complete' THEN 1 END) as processing_complete,
    COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as processing_failed,
    SUM(file_size) as total_storage_bytes,
    SUM(line_count) as total_lines,
    file_type,
    current_phase
FROM dev_master_object_keys 
GROUP BY file_type, current_phase;

-- Create view for orphaned objects (objects without valid upload_id)
CREATE OR REPLACE VIEW dev_orphaned_objects AS
SELECT mok.*
FROM dev_master_object_keys mok
LEFT JOIN dev_uploader_uploads uu ON mok.upload_id = uu.id
WHERE uu.id IS NULL OR mok.upload_id IS NULL;

-- Function to add processing history entry
CREATE OR REPLACE FUNCTION add_object_processing_history(
    p_object_key VARCHAR(500),
    p_phase VARCHAR(50),
    p_status VARCHAR(50),
    p_processing_time_ms INTEGER DEFAULT NULL,
    p_records_processed INTEGER DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_processor_id VARCHAR(100) DEFAULT NULL,
    p_processing_notes JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER AS $$
DECLARE
    v_object_key_id INTEGER;
    v_history_id INTEGER;
BEGIN
    -- Get object key ID
    SELECT id INTO v_object_key_id 
    FROM dev_master_object_keys 
    WHERE object_key = p_object_key;
    
    IF v_object_key_id IS NULL THEN
        RAISE EXCEPTION 'Object key not found: %', p_object_key;
    END IF;
    
    -- Insert processing history
    INSERT INTO dev_object_processing_history (
        object_key_id, phase, status, processing_time_ms, 
        records_processed, error_message, processor_id, processing_notes,
        completed_at
    ) VALUES (
        v_object_key_id, p_phase, p_status, p_processing_time_ms,
        p_records_processed, p_error_message, p_processor_id, p_processing_notes,
        CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE NULL END
    ) RETURNING id INTO v_history_id;
    
    -- Update master record
    UPDATE dev_master_object_keys 
    SET 
        current_phase = p_phase,
        processing_status = p_status,
        last_modified_at = NOW()
    WHERE id = v_object_key_id;
    
    RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark objects for purge
CREATE OR REPLACE FUNCTION mark_object_for_purge(
    p_object_key VARCHAR(500),
    p_purge_type VARCHAR(50),
    p_purge_reason TEXT,
    p_purge_after_days INTEGER DEFAULT 7
) RETURNS BOOLEAN AS $$
DECLARE
    v_object_key_id INTEGER;
    v_purge_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get object key ID
    SELECT id INTO v_object_key_id 
    FROM dev_master_object_keys 
    WHERE object_key = p_object_key;
    
    IF v_object_key_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    v_purge_date := NOW() + INTERVAL '1 day' * p_purge_after_days;
    
    -- Mark for purge
    UPDATE dev_master_object_keys 
    SET 
        marked_for_purge = TRUE,
        purge_after_date = v_purge_date,
        purge_reason = p_purge_reason,
        last_modified_at = NOW()
    WHERE id = v_object_key_id;
    
    -- Add to purge queue
    INSERT INTO dev_object_purge_queue (
        object_key_id, purge_type, purge_reason, scheduled_purge_date
    ) VALUES (
        v_object_key_id, p_purge_type, p_purge_reason, v_purge_date
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create production versions (same structure, different names)
CREATE TABLE IF NOT EXISTS master_object_keys (LIKE dev_master_object_keys INCLUDING ALL);
CREATE TABLE IF NOT EXISTS object_processing_history (LIKE dev_object_processing_history INCLUDING ALL);
CREATE TABLE IF NOT EXISTS object_purge_queue (LIKE dev_object_purge_queue INCLUDING ALL);

-- Add foreign key constraints for production tables
ALTER TABLE object_processing_history DROP CONSTRAINT IF EXISTS object_processing_history_object_key_id_fkey;
ALTER TABLE object_processing_history ADD CONSTRAINT object_processing_history_object_key_id_fkey 
    FOREIGN KEY (object_key_id) REFERENCES master_object_keys(id) ON DELETE CASCADE;

ALTER TABLE object_purge_queue DROP CONSTRAINT IF EXISTS object_purge_queue_object_key_id_fkey;
ALTER TABLE object_purge_queue ADD CONSTRAINT object_purge_queue_object_key_id_fkey 
    FOREIGN KEY (object_key_id) REFERENCES master_object_keys(id) ON DELETE CASCADE;

COMMENT ON TABLE dev_master_object_keys IS 'Master registry of all object storage keys with processing metadata and history';
COMMENT ON TABLE dev_object_processing_history IS 'Detailed processing history for each object';
COMMENT ON TABLE dev_object_purge_queue IS 'Queue for objects scheduled for purging';