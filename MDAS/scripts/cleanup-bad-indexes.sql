-- =====================================================================
-- CLEANUP BAD INDEXES IN PRODUCTION
-- =====================================================================
-- This script drops indexes with dev_ prefixes that were created
-- by the old buggy schema script (before version 2.9.0)
--
-- Safe to run multiple times (uses IF EXISTS)
-- Run this BEFORE running production-schema.sql on existing database
-- =====================================================================

BEGIN;

-- Drop bad indexes created by buggy script (v2.8.0 and earlier)
-- These have dev_ prefixes and should be recreated with proper names

DROP INDEX IF EXISTS dev_users_username_key;
DROP INDEX IF EXISTS dev_users_email_key;
DROP INDEX IF EXISTS dev_api_users_username_key;
DROP INDEX IF EXISTS dev_api_users_api_key_key;
DROP INDEX IF EXISTS dev_merchants_merchant_number_key;
DROP INDEX IF EXISTS dev_terminals_terminal_number_key;

-- Note: Add more indexes here if you see other dev_* indexes in production
-- You can find them with:
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'dev_%';

COMMIT;

-- =====================================================================
-- After running this cleanup:
-- 1. Run: psql "$NEON_PROD_DATABASE_URL" -f production-schema.sql
-- 2. This will recreate indexes with correct names (without dev_ prefix)
-- =====================================================================
