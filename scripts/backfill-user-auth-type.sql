-- Migration: Add and backfill auth_type for existing users
-- Date: November 22, 2025
-- Purpose: Add auth_type column and set default to 'local' for all existing users
--          This migration is safe to run multiple times (idempotent)
--
-- ENVIRONMENT NOTE:
-- - In DEVELOPMENT: Use 'dev_users' instead of 'users'
-- - In PRODUCTION: Use 'users' as shown below
--
-- For development, replace all instances of 'users' with 'dev_users' below

-- Add auth_type column if it doesn't exist (with default value 'local')
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_type TEXT DEFAULT 'local';

-- Update any NULL values to 'local' (for backward compatibility)
-- This handles cases where the column existed but had NULL values
UPDATE users
SET auth_type = 'local'
WHERE auth_type IS NULL;

-- Verify the update
SELECT 
  auth_type,
  COUNT(*) as user_count
FROM users
GROUP BY auth_type
ORDER BY auth_type;
