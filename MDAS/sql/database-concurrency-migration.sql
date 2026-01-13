-- Database Migration for Multi-Node Concurrency Control
-- This script adds necessary columns and indexes for database-level file processing coordination

-- Add concurrency control columns to development environment
ALTER TABLE dev_uploaded_files 
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_server_id VARCHAR(100);

-- Add concurrency control columns to production environment  
ALTER TABLE uploaded_files 
ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20),
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processing_server_id VARCHAR(100);

-- Add indexes for efficient concurrency queries on development
CREATE INDEX IF NOT EXISTS idx_dev_uploaded_files_processing_status 
ON dev_uploaded_files(processing_status) WHERE processing_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dev_uploaded_files_server_processing 
ON dev_uploaded_files(processing_server_id, processing_status, processing_started_at) 
WHERE processing_status = 'processing';

-- Add indexes for efficient concurrency queries on production
CREATE INDEX IF NOT EXISTS idx_uploaded_files_processing_status 
ON uploaded_files(processing_status) WHERE processing_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_uploaded_files_server_processing 
ON uploaded_files(processing_server_id, processing_status, processing_started_at) 
WHERE processing_status = 'processing';

-- Clean up any stuck processing files older than 1 hour (stale locks)
-- Development environment
UPDATE dev_uploaded_files 
SET processing_status = 'failed',
    processing_completed_at = NOW(),
    processing_errors = 'Processing timeout - server may have crashed'
WHERE processing_status = 'processing' 
  AND processing_started_at < NOW() - INTERVAL '1 hour';

-- Production environment  
UPDATE uploaded_files 
SET processing_status = 'failed',
    processing_completed_at = NOW(),
    processing_errors = 'Processing timeout - server may have crashed'
WHERE processing_status = 'processing' 
  AND processing_started_at < NOW() - INTERVAL '1 hour';

-- Add check constraints for valid processing statuses
-- Development
ALTER TABLE dev_uploaded_files 
ADD CONSTRAINT IF NOT EXISTS chk_dev_processing_status 
CHECK (processing_status IN ('processing', 'completed', 'failed', 'queued'));

-- Production
ALTER TABLE uploaded_files 
ADD CONSTRAINT IF NOT EXISTS chk_processing_status 
CHECK (processing_status IN ('processing', 'completed', 'failed', 'queued'));

-- Verify migration success
SELECT 
  'dev_uploaded_files' as table_name,
  COUNT(*) as total_files,
  COUNT(CASE WHEN processing_status = 'processing' THEN 1 END) as currently_processing,
  COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN processing_status IS NULL THEN 1 END) as no_status
FROM dev_uploaded_files
UNION ALL
SELECT 
  'uploaded_files' as table_name,
  COUNT(*) as total_files,
  COUNT(CASE WHEN processing_status = 'processing' THEN 1 END) as currently_processing,
  COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed,
  COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed,
  COUNT(CASE WHEN processing_status IS NULL THEN 1 END) as no_status
FROM uploaded_files;