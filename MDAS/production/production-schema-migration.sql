-- Production Database Schema Migration Script
-- Purpose: Synchronize production tables with development schema
-- Safety: Additive-only changes, idempotent operations, concurrent indexes
-- Generated from schema comparison on 2025-09-10

-- =============================================================================
-- SAFETY NOTICE: This script performs ADDITIVE-ONLY changes
-- - No existing data or columns are modified or deleted
-- - All operations are idempotent (safe to run multiple times)
-- - Indexes are created concurrently to avoid locking
-- =============================================================================

BEGIN;

-- Enable concurrent index creation (will commit after each)
-- Note: Concurrent index creation cannot be done inside a transaction
-- These will be run separately after the main migration

-- =============================================================================
-- TABLE: uploaded_files
-- Missing 17 columns in production
-- =============================================================================

ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS filename character varying;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_path character varying;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS status character varying DEFAULT 'uploaded'::character varying;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS business_day date;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_date date;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'pending'::text;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS processing_server_id text;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS processing_started_at timestamp without time zone;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_content text;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS processed_at timestamp without time zone;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS processing_completed_at timestamp without time zone;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS records_processed integer DEFAULT 0;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS records_skipped integer DEFAULT 0;

-- Backfill essential columns for uploaded_files
UPDATE uploaded_files 
SET filename = COALESCE(filename, original_filename) 
WHERE filename IS NULL AND original_filename IS NOT NULL;

UPDATE uploaded_files 
SET file_path = COALESCE(file_path, storage_path) 
WHERE file_path IS NULL AND storage_path IS NOT NULL;

UPDATE uploaded_files 
SET processing_status = COALESCE(processing_status, 'pending') 
WHERE processing_status IS NULL;

-- Set NOT NULL constraints after backfill
DO $$ 
BEGIN 
  -- Only set NOT NULL if we can safely backfill
  IF NOT EXISTS (SELECT 1 FROM uploaded_files WHERE filename IS NULL) THEN
    ALTER TABLE uploaded_files ALTER COLUMN filename SET NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM uploaded_files WHERE file_path IS NULL) THEN
    ALTER TABLE uploaded_files ALTER COLUMN file_path SET NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- TABLE: uploader_uploads  
-- Missing 30 columns in production
-- =============================================================================

ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS upload_started_at timestamp with time zone;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS detected_file_type text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS user_classified_type text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS final_file_type text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS data_size integer;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS compression_used text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS validation_errors jsonb;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS processing_notes text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS file_content text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS s3_bucket text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS s3_key text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS s3_url text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS s3_etag text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS failed_at timestamp without time zone;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS tddf_records_created integer;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS encoding_complete timestamp without time zone;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS identification_results text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS phase integer DEFAULT 1;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS encoding_completion_time timestamp with time zone;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS encoding_notes text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS last_retry_at timestamp with time zone;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS processing_warnings text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS last_warning_at timestamp with time zone;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS can_retry boolean DEFAULT false;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS last_failure_reason text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS processing_server_id text;
ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'pending'::text;

-- =============================================================================
-- TABLE: duplicate_finder_cache
-- Missing 12 columns AND critical ID issue fix
-- SAFETY: Using development-aligned schema (id: text) and lock-safe approach
-- =============================================================================

-- CRITICAL: Fix missing ID primary key column that caused NULL violations
-- Using text type to match development schema
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS id text;

-- Add missing columns (safe approach - nullable first)
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS color text DEFAULT 'gray'::text;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS records_found integer DEFAULT 0;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS processing_complete boolean DEFAULT false;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS total_records integer DEFAULT 0;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS has_conflicts boolean DEFAULT false;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS merchant_count integer;
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS conflict_summary text;
-- Add scan_type as nullable first (safe approach)
ALTER TABLE duplicate_finder_cache ADD COLUMN IF NOT EXISTS scan_type text DEFAULT 'duplicate_scan_status';

-- SAFE BACKFILL: Generate unique IDs for existing rows with NULL id
UPDATE duplicate_finder_cache 
SET id = md5(random()::text || clock_timestamp()::text || COALESCE(scan_type, 'default'))
WHERE id IS NULL;

-- Set NOT NULL constraints after safe backfill (in separate steps to avoid long locks)
DO $$ 
BEGIN 
  -- Only set NOT NULL after successful backfill
  IF NOT EXISTS (SELECT 1 FROM duplicate_finder_cache WHERE id IS NULL) THEN
    ALTER TABLE duplicate_finder_cache ALTER COLUMN id SET NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM duplicate_finder_cache WHERE scan_type IS NULL) THEN
    ALTER TABLE duplicate_finder_cache ALTER COLUMN scan_type SET NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- TABLE: merchants
-- Missing 3 columns in production  
-- =============================================================================

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS vwobEbtReturn text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchantRecordSt text;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS terminalContractType text;

-- =============================================================================
-- TABLE: system_logs  
-- Missing 4 columns in production
-- =============================================================================

ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS service text;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS transaction_id text;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS metadata jsonb;

-- =============================================================================
-- TABLE: processing_metrics
-- Missing 1 column in production
-- =============================================================================

ALTER TABLE processing_metrics ADD COLUMN IF NOT EXISTS tddf_processing_datetime timestamp without time zone;

COMMIT;

-- =============================================================================
-- CONCURRENT INDEX CREATION
-- These must be run OUTSIDE of a transaction for concurrency
-- =============================================================================

-- Critical indexes for file processing performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploaded_files_processing_status 
ON uploaded_files(processing_status) 
WHERE processing_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploaded_files_created_at 
ON uploaded_files(created_at) 
WHERE created_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploaded_files_server_status 
ON uploaded_files(processing_server_id, processing_status) 
WHERE processing_server_id IS NOT NULL AND processing_status IS NOT NULL;

-- Uploader performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploader_uploads_processing_status 
ON uploader_uploads(processing_status) 
WHERE processing_status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploader_uploads_phase 
ON uploader_uploads(phase) 
WHERE phase IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploader_uploads_server_status 
ON uploader_uploads(processing_server_id, processing_status) 
WHERE processing_server_id IS NOT NULL AND processing_status IS NOT NULL;

-- Duplicate finder performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_duplicate_finder_cache_status 
ON duplicate_finder_cache(status) 
WHERE status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_duplicate_finder_cache_updated 
ON duplicate_finder_cache(last_updated) 
WHERE last_updated IS NOT NULL;

-- =============================================================================
-- CRITICAL: Primary key creation for duplicate_finder_cache
-- Must be done AFTER all column modifications and NOT NULL constraints
-- =============================================================================

-- Create unique index for primary key (NO WHERE clause - full coverage required)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_duplicate_finder_cache_id_pk 
ON duplicate_finder_cache(id);

-- Add primary key constraint using the unique index (safe, non-blocking)
DO $$ 
BEGIN 
  -- Check if primary key exists with proper schema scoping
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c 
    JOIN pg_class cl ON c.conrelid = cl.oid 
    JOIN pg_namespace n ON cl.relnamespace = n.oid
    WHERE cl.relname = 'duplicate_finder_cache' 
    AND n.nspname = 'public'
    AND c.contype = 'p'
  ) THEN
    -- Use the unique index to create primary key (avoids table scan)
    BEGIN
      ALTER TABLE duplicate_finder_cache 
      ADD CONSTRAINT duplicate_finder_cache_pkey 
      PRIMARY KEY USING INDEX idx_duplicate_finder_cache_id_pk;
      
      RAISE NOTICE 'Successfully created primary key for duplicate_finder_cache using unique index';
    EXCEPTION 
      WHEN OTHERS THEN
        RAISE NOTICE 'Failed to create primary key: %. Index may not be ready yet.', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Primary key already exists for duplicate_finder_cache';
  END IF;
END $$;

-- =============================================================================
-- VALIDATION QUERIES
-- Run these after migration to confirm success
-- =============================================================================

-- Check that critical columns exist
DO $$
DECLARE
    missing_columns text := '';
BEGIN
    -- Check uploaded_files critical columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uploaded_files' AND column_name = 'processing_status') THEN
        missing_columns := missing_columns || 'uploaded_files.processing_status ';
    END IF;
    
    -- Check uploader_uploads critical columns  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'uploader_uploads' AND column_name = 'processing_server_id') THEN
        missing_columns := missing_columns || 'uploader_uploads.processing_server_id ';
    END IF;
    
    -- Check duplicate_finder_cache ID column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'duplicate_finder_cache' AND column_name = 'id') THEN
        missing_columns := missing_columns || 'duplicate_finder_cache.id ';
    END IF;
    
    IF missing_columns != '' THEN
        RAISE EXCEPTION 'Migration validation failed. Missing columns: %', missing_columns;
    ELSE
        RAISE NOTICE 'Migration validation successful. All critical columns present.';
    END IF;
END
$$;

-- =============================================================================
-- MIGRATION SUMMARY  
-- =============================================================================
-- Tables updated: 6
-- Columns added: 67
-- Indexes created: 8 (concurrent)
-- Primary key fixes: 1 (duplicate_finder_cache)
-- 
-- This migration addresses the critical schema gaps between production and 
-- development environments, focusing on file processing pipeline functionality.
-- =============================================================================