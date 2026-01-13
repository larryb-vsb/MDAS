-- ============================================================================
-- PRODUCTION DATABASE ROLLBACK: v1014 → v1010
-- ============================================================================
-- This script reverts the security logging and user authentication changes
-- Date: December 2, 2025
--
-- ⚠️ WARNING: This will DELETE all security log data and remove auth tracking!
-- Only run this if you need to completely revert the v1014 upgrade.
-- ============================================================================

BEGIN;

-- =====================================================
-- 1. DROP SECURITY_LOGS TABLE
-- =====================================================

DROP TABLE IF EXISTS security_logs CASCADE;

DO $$ BEGIN RAISE NOTICE '✓ Dropped security_logs table'; END $$;


-- =====================================================
-- 2. REMOVE AUTHENTICATION TRACKING COLUMNS FROM USERS
-- =====================================================

ALTER TABLE users DROP COLUMN IF EXISTS auth_type;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_type;
ALTER TABLE users DROP COLUMN IF EXISTS last_failed_login;
ALTER TABLE users DROP COLUMN IF EXISTS last_failed_login_type;
ALTER TABLE users DROP COLUMN IF EXISTS last_failed_login_reason;

DO $$ BEGIN RAISE NOTICE '✓ Removed authentication tracking columns from users table'; END $$;


-- =====================================================
-- 3. REMOVE USER PREFERENCE COLUMNS FROM USERS
-- =====================================================

ALTER TABLE users DROP COLUMN IF EXISTS developer_flag;
ALTER TABLE users DROP COLUMN IF EXISTS dark_mode;
ALTER TABLE users DROP COLUMN IF EXISTS can_create_users;
ALTER TABLE users DROP COLUMN IF EXISTS default_dashboard;
ALTER TABLE users DROP COLUMN IF EXISTS theme_preference;

DO $$ BEGIN RAISE NOTICE '✓ Removed user preference columns from users table'; END $$;


-- =====================================================
-- 4. REMOVE USER PROFILE COLUMNS FROM USERS
-- =====================================================

ALTER TABLE users DROP COLUMN IF EXISTS first_name;
ALTER TABLE users DROP COLUMN IF EXISTS last_name;

DO $$ BEGIN RAISE NOTICE '✓ Removed user profile columns from users table'; END $$;


-- =====================================================
-- ROLLBACK COMPLETE
-- =====================================================

DO $$ 
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'ROLLBACK COMPLETED SUCCESSFULLY';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE 'Database: PRODUCTION';
    RAISE NOTICE 'Reverted to: v1010';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables Dropped: 1';
    RAISE NOTICE '  • security_logs';
    RAISE NOTICE '';
    RAISE NOTICE 'Columns Removed from users: 12';
    RAISE NOTICE '  • first_name, last_name';
    RAISE NOTICE '  • developer_flag, dark_mode, can_create_users';
    RAISE NOTICE '  • default_dashboard, theme_preference';
    RAISE NOTICE '  • auth_type, last_login_type, last_failed_login';
    RAISE NOTICE '  • last_failed_login_type, last_failed_login_reason';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️ Security audit logs have been deleted!';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

COMMIT;
