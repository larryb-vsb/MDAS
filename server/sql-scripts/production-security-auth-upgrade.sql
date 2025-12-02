-- ============================================================================
-- PRODUCTION DATABASE SCHEMA UPGRADE: v1010 → v1014
-- ============================================================================
-- This script adds security logging and user authentication tracking features
-- Date: December 2, 2025
-- Version: 1014
--
-- WHAT THIS SCRIPT DOES:
-- 1. Creates security_logs table for authentication event tracking
-- 2. Adds authentication columns to users table (auth_type, login tracking)
-- 3. Adds user profile columns (first_name, last_name, preferences)
--
-- PREREQUISITES:
-- - Production database has already run production-complete-migration.sql
-- - connection_log, ip_blocklist, host_approvals, master_object_keys tables exist
--
-- SAFETY: 
-- ✅ Safe to run multiple times (idempotent)
-- ✅ No data deletion
-- ✅ All new columns are nullable with sensible defaults
-- ============================================================================

BEGIN;

-- =====================================================
-- 1. CREATE SECURITY_LOGS TABLE
-- =====================================================
-- Purpose: Track all authentication events (login, logout, password changes)
-- Used by: Security audit logging, failed login monitoring
-- =====================================================

CREATE TABLE IF NOT EXISTS security_logs (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,              -- 'login_success', 'login_failed', 'password_changed', 'password_reset', 'auth_type_upgraded'
    user_id INTEGER,                        -- References users(id), nullable for failed attempts
    username TEXT,                          -- Username attempted (for logging even if user not found)
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address TEXT,                        -- Client IP address
    user_agent TEXT,                        -- Browser/client info
    resource_type TEXT,                     -- Type of resource accessed
    resource_id TEXT,                       -- ID of resource accessed
    action TEXT,                            -- Specific action taken
    result TEXT NOT NULL,                   -- 'success' or 'failure'
    details JSONB,                          -- Additional event details (JSON)
    session_id TEXT,                        -- Session identifier
    reason TEXT,                            -- Failure reason if applicable
    severity TEXT DEFAULT 'info',           -- 'info', 'warning', 'error', 'critical'
    message TEXT,                           -- Human-readable message
    source TEXT DEFAULT 'authentication'    -- Event source system
);

-- Add helpful comment
COMMENT ON TABLE security_logs IS 'Security event audit log for authentication and authorization events. Tracks login attempts, password changes, and auth type upgrades.';
COMMENT ON COLUMN security_logs.event_type IS 'Type of security event: login_success, login_failed, password_changed, password_reset, auth_type_upgraded';
COMMENT ON COLUMN security_logs.result IS 'Event outcome: success or failure';
COMMENT ON COLUMN security_logs.details IS 'JSON object with additional context (changedBy, previous_auth_type, etc.)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS security_logs_timestamp_idx ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS security_logs_event_type_idx ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS security_logs_user_id_idx ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS security_logs_user_action_idx ON security_logs(user_id, action);
CREATE INDEX IF NOT EXISTS security_logs_result_idx ON security_logs(result);

DO $$ BEGIN RAISE NOTICE '✓ Created security_logs table with indexes'; END $$;


-- =====================================================
-- 2. ADD USER PROFILE COLUMNS
-- =====================================================
-- Purpose: User profile information for personalization
-- =====================================================

-- Add first_name column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'first_name'
    ) THEN
        ALTER TABLE users ADD COLUMN first_name VARCHAR(255);
        RAISE NOTICE '✓ Added first_name column to users table';
    ELSE
        RAISE NOTICE '✓ Column first_name already exists in users table';
    END IF;
END $$;

-- Add last_name column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_name'
    ) THEN
        ALTER TABLE users ADD COLUMN last_name VARCHAR(255);
        RAISE NOTICE '✓ Added last_name column to users table';
    ELSE
        RAISE NOTICE '✓ Column last_name already exists in users table';
    END IF;
END $$;


-- =====================================================
-- 3. ADD USER PREFERENCE COLUMNS
-- =====================================================
-- Purpose: UI/UX preferences stored per user
-- =====================================================

-- Add developer_flag column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'developer_flag'
    ) THEN
        ALTER TABLE users ADD COLUMN developer_flag BOOLEAN DEFAULT false;
        RAISE NOTICE '✓ Added developer_flag column to users table';
    ELSE
        RAISE NOTICE '✓ Column developer_flag already exists in users table';
    END IF;
END $$;

-- Add dark_mode column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'dark_mode'
    ) THEN
        ALTER TABLE users ADD COLUMN dark_mode BOOLEAN DEFAULT false;
        RAISE NOTICE '✓ Added dark_mode column to users table';
    ELSE
        RAISE NOTICE '✓ Column dark_mode already exists in users table';
    END IF;
END $$;

-- Add can_create_users column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'can_create_users'
    ) THEN
        ALTER TABLE users ADD COLUMN can_create_users BOOLEAN DEFAULT false;
        RAISE NOTICE '✓ Added can_create_users column to users table';
    ELSE
        RAISE NOTICE '✓ Column can_create_users already exists in users table';
    END IF;
END $$;

-- Add default_dashboard column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'default_dashboard'
    ) THEN
        ALTER TABLE users ADD COLUMN default_dashboard VARCHAR(255) DEFAULT 'merchants';
        RAISE NOTICE '✓ Added default_dashboard column to users table';
    ELSE
        RAISE NOTICE '✓ Column default_dashboard already exists in users table';
    END IF;
END $$;

-- Add theme_preference column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'theme_preference'
    ) THEN
        ALTER TABLE users ADD COLUMN theme_preference VARCHAR(255) DEFAULT 'system';
        RAISE NOTICE '✓ Added theme_preference column to users table';
    ELSE
        RAISE NOTICE '✓ Column theme_preference already exists in users table';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✓ Added user preference columns'; END $$;


-- =====================================================
-- 4. ADD AUTHENTICATION TRACKING COLUMNS
-- =====================================================
-- Purpose: Track authentication methods and login attempts
-- =====================================================

-- Add auth_type column (local, oauth, hybrid)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'auth_type'
    ) THEN
        ALTER TABLE users ADD COLUMN auth_type TEXT DEFAULT 'local';
        RAISE NOTICE '✓ Added auth_type column to users table';
    ELSE
        RAISE NOTICE '✓ Column auth_type already exists in users table';
    END IF;
END $$;

-- Add last_login_type column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login_type'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login_type TEXT;
        RAISE NOTICE '✓ Added last_login_type column to users table';
    ELSE
        RAISE NOTICE '✓ Column last_login_type already exists in users table';
    END IF;
END $$;

-- Add last_failed_login column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_failed_login'
    ) THEN
        ALTER TABLE users ADD COLUMN last_failed_login TIMESTAMP;
        RAISE NOTICE '✓ Added last_failed_login column to users table';
    ELSE
        RAISE NOTICE '✓ Column last_failed_login already exists in users table';
    END IF;
END $$;

-- Add last_failed_login_type column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_failed_login_type'
    ) THEN
        ALTER TABLE users ADD COLUMN last_failed_login_type TEXT;
        RAISE NOTICE '✓ Added last_failed_login_type column to users table';
    ELSE
        RAISE NOTICE '✓ Column last_failed_login_type already exists in users table';
    END IF;
END $$;

-- Add last_failed_login_reason column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_failed_login_reason'
    ) THEN
        ALTER TABLE users ADD COLUMN last_failed_login_reason TEXT;
        RAISE NOTICE '✓ Added last_failed_login_reason column to users table';
    ELSE
        RAISE NOTICE '✓ Column last_failed_login_reason already exists in users table';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✓ Added authentication tracking columns'; END $$;


-- =====================================================
-- 5. MIGRATION VERIFICATION
-- =====================================================

-- Check if security_logs table was created
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_logs') THEN
        RAISE EXCEPTION '✗ security_logs table was not created';
    ELSE
        RAISE NOTICE '✓ security_logs table exists';
    END IF;
END $$;

-- Check users table columns
DO $$ 
DECLARE
    missing_cols TEXT[] := ARRAY[]::TEXT[];
    required_cols TEXT[] := ARRAY['auth_type', 'last_login_type', 'last_failed_login', 'last_failed_login_type', 'last_failed_login_reason', 'first_name', 'last_name', 'developer_flag', 'dark_mode', 'can_create_users', 'default_dashboard', 'theme_preference'];
    col TEXT;
BEGIN
    FOREACH col IN ARRAY required_cols LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = col
        ) THEN
            missing_cols := array_append(missing_cols, col);
        END IF;
    END LOOP;
    
    IF array_length(missing_cols, 1) > 0 THEN
        RAISE WARNING '⚠ Missing columns in users table: %', array_to_string(missing_cols, ', ');
    ELSE
        RAISE NOTICE '✓ All 12 new columns added to users table successfully';
    END IF;
END $$;

-- Check indexes
DO $$ 
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes 
    WHERE tablename = 'security_logs';
    
    IF index_count >= 5 THEN
        RAISE NOTICE '✓ All security_logs indexes created successfully (% indexes found)', index_count;
    ELSE
        RAISE WARNING '⚠ Expected at least 5 indexes on security_logs, found %', index_count;
    END IF;
END $$;


-- =====================================================
-- 6. BACKFILL EXISTING USERS
-- =====================================================
-- Set auth_type to 'local' for all existing users without auth_type

UPDATE users 
SET auth_type = 'local' 
WHERE auth_type IS NULL;

DO $$ BEGIN RAISE NOTICE '✓ Backfilled auth_type for existing users'; END $$;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'SECURITY AUTH UPGRADE COMPLETED SUCCESSFULLY';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'Database: PRODUCTION';
    RAISE NOTICE 'Target Version: v1014';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables Added: 1';
    RAISE NOTICE '  • security_logs (Security event audit log)';
    RAISE NOTICE '';
    RAISE NOTICE 'Columns Added to users: 12';
    RAISE NOTICE '  Profile: first_name, last_name';
    RAISE NOTICE '  Preferences: developer_flag, dark_mode, can_create_users,';
    RAISE NOTICE '               default_dashboard, theme_preference';
    RAISE NOTICE '  Auth Tracking: auth_type, last_login_type, last_failed_login,';
    RAISE NOTICE '                 last_failed_login_type, last_failed_login_reason';
    RAISE NOTICE '';
    RAISE NOTICE 'Indexes Added: 5';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

COMMIT;
