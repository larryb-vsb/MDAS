-- =====================================================
-- PRODUCTION DATABASE MIGRATION SCRIPT
-- Complete System Updates (Nov 5-6, 2025)
-- =====================================================
-- Version: 2.0.0
-- Date: November 6, 2025
-- Description: Adds ALL missing tables for complete feature parity with development
-- 
-- TABLES ADDED:
-- 1. connection_log - Security monitoring for all API connections
-- 2. ip_blocklist - IP blocking system for malicious actors
-- 3. host_approvals - Host approval system (hostname + API key combinations)
-- 4. master_object_keys - Replit Object Storage management
--
-- INSTRUCTIONS:
-- 1. This script is designed to be SAFE and IDEMPOTENT (can run multiple times)
-- 2. All tables use IF NOT EXISTS to prevent errors on re-run
-- 3. Review the script before running in production
-- 4. Run this script against your PRODUCTION database
-- 5. Monitor execution and verify results
--
-- AFFECTED FEATURES:
-- - Connection tracking and security monitoring
-- - IP blocking system
-- - Host approval workflow for API key uploads
-- - Storage Management page (/storage-management)
-- - Monitoring tab features
-- =====================================================

-- =====================================================
-- 1. CREATE CONNECTION LOG TABLE
-- =====================================================
-- Purpose: Track ALL connections (authenticated or not) for security monitoring
-- Features: IP tracking, endpoint logging, API key usage, response metrics
-- =====================================================

CREATE TABLE IF NOT EXISTS connection_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  client_ip TEXT NOT NULL, -- Client IP address
  endpoint TEXT NOT NULL, -- Which endpoint was accessed (e.g., /api/uploader/ping)
  method TEXT NOT NULL, -- HTTP method (GET, POST, PUT, DELETE, etc)
  user_agent TEXT, -- User agent string from request headers
  api_key_used TEXT, -- API key prefix if used (first 20 chars for security)
  api_user_id INTEGER, -- Foreign key to api_users if authenticated
  authenticated BOOLEAN NOT NULL DEFAULT FALSE, -- Was request authenticated?
  status_code INTEGER, -- HTTP response status code (200, 404, 500, etc)
  response_time INTEGER -- Response time in milliseconds
);

-- Add helpful comment
COMMENT ON TABLE connection_log IS 'Comprehensive security monitoring log tracking all API connections with IP, endpoint, authentication status, and performance metrics. Used for security auditing and threat detection.';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS connection_log_ip_idx ON connection_log(client_ip);
CREATE INDEX IF NOT EXISTS connection_log_timestamp_idx ON connection_log(timestamp);
CREATE INDEX IF NOT EXISTS connection_log_endpoint_idx ON connection_log(endpoint);
CREATE INDEX IF NOT EXISTS connection_log_api_user_id_idx ON connection_log(api_user_id);

-- =====================================================
-- 2. CREATE IP BLOCKLIST TABLE
-- =====================================================
-- Purpose: Track and block malicious IP addresses globally
-- Features: Temporary/permanent blocks, expiration dates, audit trail
-- =====================================================

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id SERIAL PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE, -- IP address to block
  reason TEXT, -- Why this IP was blocked (e.g., "Repeated failed auth attempts")
  blocked_by TEXT, -- Username who blocked this IP
  blocked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP, -- Optional expiration for temporary blocks (NULL = permanent)
  is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Is this block currently active?
  notes TEXT -- Additional admin notes about this IP
);

-- Add helpful comment
COMMENT ON TABLE ip_blocklist IS 'IP blocking system for security threat management. Supports both temporary and permanent blocks with expiration dates and admin audit trail.';
COMMENT ON COLUMN ip_blocklist.expires_at IS 'NULL = permanent block, timestamp = temporary block expires at this time';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS ip_blocklist_ip_idx ON ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS ip_blocklist_active_idx ON ip_blocklist(is_active);

-- =====================================================
-- 3. CREATE HOST APPROVALS TABLE
-- =====================================================
-- Purpose: Security-enhanced upload access control based on hostname + API key
-- Features: Three-state approval workflow (pending/approved/denied)
-- =====================================================

CREATE TABLE IF NOT EXISTS host_approvals (
  id SERIAL PRIMARY KEY,
  hostname TEXT NOT NULL, -- Client hostname from user agent (e.g., "VSB-L-LARRY")
  api_key_prefix TEXT NOT NULL, -- API key prefix (first 20 chars for security)
  api_user_id INTEGER, -- Foreign key to api_users table
  ip_address TEXT, -- Current IP (informational only, can change)
  user_agent TEXT, -- Full user agent string
  status TEXT NOT NULL DEFAULT 'pending', -- Status: 'pending', 'approved', 'denied'
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
