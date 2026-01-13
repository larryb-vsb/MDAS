-- =====================================================================
-- PRODUCTION MIGRATION: Add Missing Columns
-- =====================================================================
-- Generated: 2025-11-24T21:47:21.682Z
-- Missing columns: 5
-- =====================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_type" text DEFAULT 'local'::text;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_type" text;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_failed_login" timestamp without time zone;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_failed_login_type" text;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_failed_login_reason" text;
