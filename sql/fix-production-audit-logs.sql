-- Production fix script for audit_logs table
-- This script adds missing columns required by the application
-- Run this against production database to fix "column entitytype does not exist" error

-- Add missing columns to audit_logs table
DO $$
BEGIN
  -- Add entity_type column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_type') THEN
    ALTER TABLE audit_logs ADD COLUMN entity_type text DEFAULT 'unknown';
    RAISE NOTICE 'Added entity_type column to audit_logs';
  END IF;
  
  -- Add entity_id column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_id') THEN
    ALTER TABLE audit_logs ADD COLUMN entity_id text DEFAULT '';
    RAISE NOTICE 'Added entity_id column to audit_logs';
  END IF;
  
  -- Add username column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'username') THEN
    ALTER TABLE audit_logs ADD COLUMN username text DEFAULT 'system';
    RAISE NOTICE 'Added username column to audit_logs';
  END IF;
  
  -- Add old_values column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'old_values') THEN
    ALTER TABLE audit_logs ADD COLUMN old_values jsonb;
    RAISE NOTICE 'Added old_values column to audit_logs';
  END IF;
  
  -- Add new_values column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'new_values') THEN
    ALTER TABLE audit_logs ADD COLUMN new_values jsonb;
    RAISE NOTICE 'Added new_values column to audit_logs';
  END IF;
  
  -- Add changed_fields column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'changed_fields') THEN
    ALTER TABLE audit_logs ADD COLUMN changed_fields text[];
    RAISE NOTICE 'Added changed_fields column to audit_logs';
  END IF;
  
  -- Add notes column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'notes') THEN
    ALTER TABLE audit_logs ADD COLUMN notes text;
    RAISE NOTICE 'Added notes column to audit_logs';
  END IF;
END
$$;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS audit_logs_entity_id_idx ON audit_logs(entity_id);

-- Verify the columns exist
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'audit_logs' 
ORDER BY ordinal_position;
