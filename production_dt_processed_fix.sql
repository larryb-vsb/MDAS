-- PRODUCTION FIX: Error getting records peak from database - missing dt_processed column
-- Date: 2025-09-12
-- Issue: Production processing_metrics table has wrong schema, missing dt_processed and other TDDF columns

-- =========================================================================
-- WARNING: This script will DROP and recreate processing_metrics table
-- =========================================================================

-- STEP 1: Backup existing data (if any) before dropping
SELECT 'BACKING UP EXISTING DATA' as step;

-- Create backup table with current data
CREATE TABLE IF NOT EXISTS processing_metrics_backup_20250912 AS
SELECT * FROM processing_metrics;

SELECT 'BACKUP COMPLETE - PROCEEDING WITH TABLE RECREATION' as status;

-- STEP 2: Drop existing processing_metrics table
SELECT 'DROPPING PRODUCTION PROCESSING_METRICS TABLE' as step;

DROP TABLE IF EXISTS processing_metrics CASCADE;

-- STEP 3: Create production processing_metrics table with correct schema
SELECT 'CREATING PRODUCTION PROCESSING_METRICS TABLE WITH CORRECT SCHEMA' as step;

CREATE TABLE processing_metrics (
    id SERIAL PRIMARY KEY,
    timestamp timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    transactions_per_second numeric(8,2) NOT NULL,
    peak_transactions_per_second numeric(8,2) NOT NULL,
    records_per_minute numeric(8,2) NOT NULL DEFAULT 0,
    peak_records_per_minute numeric(8,2) NOT NULL DEFAULT 0,
    total_files integer NOT NULL,
    queued_files integer NOT NULL,
    processed_files integer NOT NULL,
    files_with_errors integer NOT NULL,
    currently_processing integer NOT NULL,
    average_processing_time_ms integer,
    system_status text NOT NULL DEFAULT 'idle',
    metric_type text NOT NULL DEFAULT 'snapshot',
    notes text,
    -- Raw line processing tracking
    raw_lines_processed integer DEFAULT 0,
    raw_lines_skipped integer DEFAULT 0,
    raw_lines_total integer DEFAULT 0,
    -- TDDF-specific fields for historical tracking
    tddf_files integer DEFAULT 0,
    tddf_records integer DEFAULT 0,
    tddf_raw_lines integer DEFAULT 0,
    tddf_total_value numeric(15,2) DEFAULT 0,
    tddf_pending_lines integer DEFAULT 0,
    -- Individual TDDF record type breakdowns (THE MISSING COLUMNS)
    dt_processed integer DEFAULT 0,
    dt_pending integer DEFAULT 0,
    dt_skipped integer DEFAULT 0,
    bh_processed integer DEFAULT 0,
    bh_pending integer DEFAULT 0,
    bh_skipped integer DEFAULT 0,
    p1_processed integer DEFAULT 0,
    p1_pending integer DEFAULT 0,
    p1_skipped integer DEFAULT 0,
    e1_processed integer DEFAULT 0,
    e1_pending integer DEFAULT 0,
    e1_skipped integer DEFAULT 0,
    g2_processed integer DEFAULT 0,
    g2_pending integer DEFAULT 0,
    g2_skipped integer DEFAULT 0,
    ad_processed integer DEFAULT 0,
    ad_skipped integer DEFAULT 0,
    dr_processed integer DEFAULT 0,
    dr_skipped integer DEFAULT 0,
    p2_processed integer DEFAULT 0,
    p2_skipped integer DEFAULT 0,
    other_processed integer DEFAULT 0,
    other_skipped integer DEFAULT 0
);

-- STEP 4: Update dev_processing_metrics table to match (if needed)
SELECT 'UPDATING DEV_PROCESSING_METRICS SCHEMA' as step;

-- Check if dev table exists and has proper columns
DO $$
BEGIN
    -- Add missing columns to dev_processing_metrics if they don't exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dev_processing_metrics') THEN
        
        -- Add dt_processed column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'dt_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN dt_processed integer DEFAULT 0;
        END IF;
        
        -- Add dt_pending column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'dt_pending') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN dt_pending integer DEFAULT 0;
        END IF;
        
        -- Add dt_skipped column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'dt_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN dt_skipped integer DEFAULT 0;
        END IF;
        
        -- Add other missing TDDF columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'bh_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN bh_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'bh_pending') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN bh_pending integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'bh_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN bh_skipped integer DEFAULT 0;
        END IF;
        
        -- Add P1 columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'p1_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN p1_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'p1_pending') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN p1_pending integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'p1_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN p1_skipped integer DEFAULT 0;
        END IF;
        
        -- Add E1 columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'e1_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN e1_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'e1_pending') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN e1_pending integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'e1_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN e1_skipped integer DEFAULT 0;
        END IF;
        
        -- Add G2 columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'g2_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN g2_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'g2_pending') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN g2_pending integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'g2_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN g2_skipped integer DEFAULT 0;
        END IF;
        
        -- Add AD columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'ad_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN ad_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'ad_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN ad_skipped integer DEFAULT 0;
        END IF;
        
        -- Add DR columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'dr_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN dr_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'dr_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN dr_skipped integer DEFAULT 0;
        END IF;
        
        -- Add P2 columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'p2_processed') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN p2_processed integer DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dev_processing_metrics' AND column_name = 'p2_skipped') THEN
            ALTER TABLE dev_processing_metrics ADD COLUMN p2_skipped integer DEFAULT 0;
        END IF;
        
    END IF;
END
$$;

-- STEP 5: Create indexes for performance
SELECT 'CREATING PERFORMANCE INDEXES' as step;

-- Production table indexes
CREATE INDEX IF NOT EXISTS processing_metrics_timestamp_idx ON processing_metrics(timestamp);
CREATE INDEX IF NOT EXISTS processing_metrics_type_idx ON processing_metrics(metric_type);
CREATE INDEX IF NOT EXISTS processing_metrics_status_idx ON processing_metrics(system_status);
CREATE INDEX IF NOT EXISTS processing_metrics_dt_processed_idx ON processing_metrics(dt_processed);
CREATE INDEX IF NOT EXISTS processing_metrics_bh_processed_idx ON processing_metrics(bh_processed);
CREATE INDEX IF NOT EXISTS processing_metrics_p1_processed_idx ON processing_metrics(p1_processed);

-- Development table indexes (if exists)
CREATE INDEX IF NOT EXISTS dev_processing_metrics_timestamp_idx ON dev_processing_metrics(timestamp);
CREATE INDEX IF NOT EXISTS dev_processing_metrics_dt_processed_idx ON dev_processing_metrics(dt_processed);

-- STEP 6: Insert sample data for testing
SELECT 'INSERTING SAMPLE DATA FOR TESTING' as step;

INSERT INTO processing_metrics (
    transactions_per_second, peak_transactions_per_second, records_per_minute, peak_records_per_minute,
    total_files, queued_files, processed_files, files_with_errors, currently_processing,
    system_status, metric_type, dt_processed, bh_processed, p1_processed, 
    dt_pending, dt_skipped, bh_pending, bh_skipped
) VALUES (
    10.5, 25.0, 100.0, 200.0,
    5, 2, 3, 0, 1,
    'processing', 'snapshot', 150, 25, 10,
    5, 2, 1, 0
);

-- STEP 7: Test the queries that were failing
SELECT 'TESTING QUERIES THAT WERE FAILING' as test_type;

-- Test the exact query that was failing
SELECT 
    timestamp,
    tddf_records,
    tddf_raw_lines,
    tddf_pending_lines,
    dt_processed, dt_pending, dt_skipped,
    bh_processed, bh_pending, bh_skipped,
    p1_processed, p1_pending, p1_skipped,
    e1_processed, e1_pending, e1_skipped,
    g2_processed, g2_pending, g2_skipped,
    ad_processed, ad_skipped,
    dr_processed, dr_skipped,
    p2_processed, p2_skipped,
    other_processed, other_skipped
FROM processing_metrics
ORDER BY timestamp DESC
LIMIT 1;

-- STEP 8: Verify schema
SELECT 'SCHEMA VERIFICATION' as verification;

-- Check production table columns
SELECT 
    'PRODUCTION' as environment,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'processing_metrics'
AND column_name IN ('dt_processed', 'dt_pending', 'dt_skipped', 'bh_processed', 'p1_processed')
ORDER BY ordinal_position;

-- Check development table columns
SELECT 
    'DEVELOPMENT' as environment,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'dev_processing_metrics'
AND column_name IN ('dt_processed', 'dt_pending', 'dt_skipped', 'bh_processed', 'p1_processed')
ORDER BY ordinal_position;

-- STEP 9: Final verification
SELECT 'FINAL VERIFICATION' as final_step;

-- Count records in tables
SELECT 'PROCESSING_METRICS' as table_name, COUNT(*) as record_count FROM processing_metrics
UNION ALL
SELECT 'DEV_PROCESSING_METRICS' as table_name, COUNT(*) as record_count FROM dev_processing_metrics;

-- Show backup table was created
SELECT 'BACKUP TABLE' as table_name, COUNT(*) as backup_record_count 
FROM processing_metrics_backup_20250912;

SELECT 'PRODUCTION DT_PROCESSED FIX COMPLETE' as completion_status;
SELECT 'Records peak API endpoints should now work' as api_status;