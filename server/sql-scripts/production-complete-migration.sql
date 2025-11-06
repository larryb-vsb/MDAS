'pending', -- Status: 'pending', 'approved', 'denied'
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by TEXT, -- Username who approved/denied this host
  reviewed_at TIMESTAMP, -- When it was approved/denied
  notes TEXT, -- Admin notes about this host approval
  last_seen_at TIMESTAMP, -- Last time this host+key combination connected
  last_seen_ip TEXT, -- Most recent IP address seen (informational)
  
  -- Unique constraint: One approval per hostname+API key combination
  CONSTRAINT host_approvals_hostname_key_unique UNIQUE (hostname, api_key_prefix)
);

-- Add helpful comment
COMMENT ON TABLE host_approvals IS 'Host approval system for upload access control. Tracks hostname + API key combinations with pending/approved/denied workflow. Only approved combinations can upload files.';
COMMENT ON COLUMN host_approvals.hostname IS 'Extracted from User-Agent string, represents the client machine hostname';
COMMENT ON COLUMN host_approvals.status IS 'pending = awaiting approval, approved = can upload, denied = blocked';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS host_approvals_status_idx ON host_approvals(status);
CREATE INDEX IF NOT EXISTS host_approvals_hostname_idx ON host_approvals(hostname);

-- =====================================================
-- 4. CREATE MASTER OBJECT KEYS TABLE
-- =====================================================
-- Purpose: Track all objects in Replit Object Storage
-- Features: Status tracking, upload linking, metadata storage
-- =====================================================

CREATE TABLE IF NOT EXISTS master_object_keys (
  id SERIAL PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE, -- Unique storage object key (e.g., 'prod-uploader/2025-11-05/file.csv')
  file_size_bytes INTEGER NOT NULL, -- File size in bytes
  line_count INTEGER, -- Number of lines in the file (if applicable)
  status TEXT NOT NULL DEFAULT 'active', -- Status: 'active', 'archived', 'deleted', 'failed', 'mark_for_purge'
  upload_id TEXT REFERENCES uploader_uploads(id) ON DELETE SET NULL, -- Optional reference to upload record
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add helpful comment
COMMENT ON TABLE master_object_keys IS 'Master registry of all objects stored in Replit Object Storage. Used for storage management, orphan detection, and cleanup operations.';
COMMENT ON COLUMN master_object_keys.object_key IS 'Full object storage key path (e.g., prod-uploader/2025-11-05/uploader_123/file.csv)';
COMMENT ON COLUMN master_object_keys.status IS 'Object status: active (in use), archived (completed), deleted (soft-deleted), failed (processing error), mark_for_purge (queued for deletion)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS master_object_keys_object_key_idx ON master_object_keys(object_key);
CREATE INDEX IF NOT EXISTS master_object_keys_status_idx ON master_object_keys(status);
CREATE INDEX IF NOT EXISTS master_object_keys_upload_id_idx ON master_object_keys(upload_id);
CREATE INDEX IF NOT EXISTS master_object_keys_created_at_idx ON master_object_keys(created_at);

-- =====================================================
-- 5. VERIFY API_USERS TABLE STRUCTURE
-- =====================================================
-- Purpose: Ensure api_users has required columns for integration
-- Note: Columns added on Nov 5, 2025 for API key tracking
-- =====================================================

-- Add last_used column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_users' 
        AND column_name = 'last_used'
    ) THEN
        ALTER TABLE api_users ADD COLUMN last_used TIMESTAMP;
        RAISE NOTICE '✓ Added last_used column to api_users table';
    ELSE
        RAISE NOTICE '✓ Column last_used already exists in api_users table';
    END IF;
END $$;

-- Add last_used_ip column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_users' 
        AND column_name = 'last_used_ip'
    ) THEN
        ALTER TABLE api_users ADD COLUMN last_used_ip TEXT;
        RAISE NOTICE '✓ Added last_used_ip column to api_users table';
    ELSE
        RAISE NOTICE '✓ Column last_used_ip already exists in api_users table';
    END IF;
END $$;

-- Add request_count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'api_users' 
        AND column_name = 'request_count'
    ) THEN
        ALTER TABLE api_users ADD COLUMN request_count INTEGER DEFAULT 0;
        RAISE NOTICE '✓ Added request_count column to api_users table';
    ELSE
        RAISE NOTICE '✓ Column request_count already exists in api_users table';
    END IF;
END $$;

-- =====================================================
-- 6. VERIFY UPLOADER_UPLOADS TABLE STRUCTURE
-- =====================================================
-- Purpose: Ensure uploader_uploads has required columns for integration
-- =====================================================

-- Verify storage_path column exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'uploader_uploads' 
        AND column_name = 'storage_path'
    ) THEN
        RAISE WARNING 'Column storage_path does not exist in uploader_uploads table. This may cause integration issues.';
    ELSE
        RAISE NOTICE '✓ Column storage_path exists in uploader_uploads table';
    END IF;
END $$;

-- =====================================================
-- 7. MIGRATION VERIFICATION
-- =====================================================
-- Purpose: Confirm all objects were created successfully
-- =====================================================

-- Check if all tables exist
DO $$ 
DECLARE
    missing_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Check connection_log
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'connection_log') THEN
        missing_tables := array_append(missing_tables, 'connection_log');
    END IF;
    
    -- Check ip_blocklist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ip_blocklist') THEN
        missing_tables := array_append(missing_tables, 'ip_blocklist');
    END IF;
    
    -- Check host_approvals
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'host_approvals') THEN
        missing_tables := array_append(missing_tables, 'host_approvals');
    END IF;
    
    -- Check master_object_keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'master_object_keys') THEN
        missing_tables := array_append(missing_tables, 'master_object_keys');
    END IF;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION '✗ Missing tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE '✓ All 4 tables created successfully';
    END IF;
END $$;

-- Check indexes
DO $$ 
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE tablename IN ('connection_log', 'ip_blocklist', 'host_approvals', 'master_object_keys');
    
    IF index_count >= 12 THEN
        RAISE NOTICE '✓ All indexes created successfully (% indexes found)', index_count;
    ELSE
        RAISE WARNING '⚠ Expected at least 12 indexes, found %', index_count;
    END IF;
END $$;

-- =====================================================
-- 8. POST-MIGRATION STATISTICS
-- =====================================================
-- Purpose: Display table statistics for verification
-- =====================================================

-- Display current table statistics
SELECT 
    'connection_log' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('connection_log')) as total_size
FROM connection_log
UNION ALL
SELECT 
    'ip_blocklist' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('ip_blocklist')) as total_size
FROM ip_blocklist
UNION ALL
SELECT 
    'host_approvals' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('host_approvals')) as total_size
FROM host_approvals
UNION ALL
SELECT 
    'master_object_keys' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('master_object_keys')) as total_size
FROM master_object_keys
ORDER BY table_name;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next Steps:
-- 1. Verify all tables and indexes were created successfully
-- 2. Test Monitoring tab features (Connection Log, Host List, IP Blocklist)
-- 3. Test Storage Management page functionality
-- 4. Update NODE_ENV environment variable to 'production' or set TABLE_PREFIX to empty string
-- 5. Restart application to connect to production database
-- 6. Monitor application logs for any errors
-- =====================================================

-- Migration completion message
DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'Database: PRODUCTION';
    RAISE NOTICE 'Tables Added: 4';
    RAISE NOTICE '  • connection_log (Security monitoring)';
    RAISE NOTICE '  • ip_blocklist (IP blocking system)';
    RAISE NOTICE '  • host_approvals (Host approval workflow)';
    RAISE NOTICE '  • master_object_keys (Storage management)';
    RAISE NOTICE 'Indexes Added: 12+';
    RAISE NOTICE 'API Users Columns: last_used, last_used_ip, request_count';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for production deployment!';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
