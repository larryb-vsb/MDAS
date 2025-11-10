-- ============================================================================
-- QUARTERLY PARTITIONING MIGRATION FOR dev_tddf_jsonb
-- ============================================================================
-- This script converts dev_tddf_jsonb to a quarterly partitioned table
-- 
-- IMPORTANT: This will DROP and RECREATE the table
-- Make sure you can reload your TDDF files before running
-- 
-- Date Range: 2022-Q4 through 2026-Q1 (with auto-creation for future quarters)
-- Partition Key: Extracted batch date from JSONB field
-- ============================================================================

-- Step 1: Drop existing table
DROP TABLE IF EXISTS dev_tddf_jsonb CASCADE;

-- Step 2: Create partitioned parent table
CREATE TABLE dev_tddf_jsonb (
    id SERIAL,
    upload_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    record_type TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    raw_line TEXT NOT NULL,
    extracted_fields JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    tddf_processing_datetime TIMESTAMP,
    tddf_processing_date TIMESTAMP DEFAULT NOW(),
    processing_server_id TEXT,
    processing_status TEXT DEFAULT 'pending',
    details JSONB,
    parsed_datetime TIMESTAMPTZ,
    record_time_source TEXT,
    record_identifier TEXT,
    processing_time_ms INTEGER DEFAULT 0,
    raw_line_hash TEXT,
    -- Partition key column (computed from JSONB)
    batch_date DATE GENERATED ALWAYS AS (
        CASE 
            WHEN extracted_fields->>'batchDate' IS NOT NULL 
            THEN (extracted_fields->>'batchDate')::DATE
            ELSE CURRENT_DATE
        END
    ) STORED
) PARTITION BY RANGE (batch_date);

-- Step 3: Create quarterly partitions from 2022-Q4 through 2026-Q1
-- 2022
CREATE TABLE dev_tddf_jsonb_2022_q4 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2022-10-01') TO ('2023-01-01');

-- 2023
CREATE TABLE dev_tddf_jsonb_2023_q1 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2023-01-01') TO ('2023-04-01');
CREATE TABLE dev_tddf_jsonb_2023_q2 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2023-04-01') TO ('2023-07-01');
CREATE TABLE dev_tddf_jsonb_2023_q3 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2023-07-01') TO ('2023-10-01');
CREATE TABLE dev_tddf_jsonb_2023_q4 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2023-10-01') TO ('2024-01-01');

-- 2024
CREATE TABLE dev_tddf_jsonb_2024_q1 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE dev_tddf_jsonb_2024_q2 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
CREATE TABLE dev_tddf_jsonb_2024_q3 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2024-07-01') TO ('2024-10-01');
CREATE TABLE dev_tddf_jsonb_2024_q4 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');

-- 2025
CREATE TABLE dev_tddf_jsonb_2025_q1 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE dev_tddf_jsonb_2025_q2 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE dev_tddf_jsonb_2025_q3 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE dev_tddf_jsonb_2025_q4 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');

-- 2026 (future)
CREATE TABLE dev_tddf_jsonb_2026_q1 PARTITION OF dev_tddf_jsonb
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

-- Step 4: Create primary key and indexes
-- Primary key on parent table
ALTER TABLE dev_tddf_jsonb ADD PRIMARY KEY (id, batch_date);

-- Expression indexes on JSONB fields (these apply to all partitions)
CREATE INDEX idx_dev_tddf_jsonb_batch_date 
    ON dev_tddf_jsonb ((extracted_fields->>'batchDate'));

CREATE INDEX idx_dev_tddf_jsonb_transaction_date 
    ON dev_tddf_jsonb ((extracted_fields->>'transactionDate'));

CREATE INDEX idx_tddf_jsonb_record_type_batch_date 
    ON dev_tddf_jsonb (record_type, (extracted_fields->>'batchDate'));

CREATE INDEX idx_tddf_jsonb_record_type_transaction_date 
    ON dev_tddf_jsonb (record_type, (extracted_fields->>'transactionDate'));

-- Partial indexes for specific record types
CREATE INDEX idx_dev_tddf_jsonb_bh_batch_date 
    ON dev_tddf_jsonb (record_type, (extracted_fields->>'batchDate'))
    WHERE record_type = 'BH';

CREATE INDEX idx_dev_tddf_jsonb_dt_transaction_date 
    ON dev_tddf_jsonb (record_type, (extracted_fields->>'transactionDate'))
    WHERE record_type = 'DT';

-- Regular column indexes
CREATE INDEX idx_dev_tddf_jsonb_record_type ON dev_tddf_jsonb (record_type);
CREATE INDEX idx_dev_tddf_jsonb_upload_id ON dev_tddf_jsonb (upload_id);
CREATE INDEX idx_dev_tddf_jsonb_created_at ON dev_tddf_jsonb (created_at);

-- JSONB field indexes
CREATE INDEX idx_dev_tddf_jsonb_association_number 
    ON dev_tddf_jsonb ((extracted_fields->>'associationNumber'));

CREATE INDEX idx_dev_tddf_jsonb_card_type 
    ON dev_tddf_jsonb ((extracted_fields->>'cardType'));

CREATE INDEX idx_dev_tddf_jsonb_group_number 
    ON dev_tddf_jsonb ((extracted_fields->>'groupNumber'));

CREATE INDEX idx_dev_tddf_jsonb_merchant_account 
    ON dev_tddf_jsonb ((extracted_fields->>'merchantAccountNumber'));

CREATE INDEX idx_dev_tddf_jsonb_terminal_id 
    ON dev_tddf_jsonb ((extracted_fields->>'terminalId'));

-- GIN index for general JSONB queries
CREATE INDEX idx_dev_tddf_jsonb_extracted_fields 
    ON dev_tddf_jsonb USING GIN (extracted_fields);

-- Step 5: Create function to auto-create future quarterly partitions
CREATE OR REPLACE FUNCTION create_quarterly_partition(target_date DATE)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
    quarter_num INTEGER;
    year_num INTEGER;
BEGIN
    -- Calculate quarter and year
    quarter_num := EXTRACT(QUARTER FROM target_date);
    year_num := EXTRACT(YEAR FROM target_date);
    
    -- Calculate start and end dates for the quarter
    start_date := DATE_TRUNC('quarter', target_date);
    end_date := start_date + INTERVAL '3 months';
    
    -- Generate partition name
    partition_name := 'dev_tddf_jsonb_' || year_num || '_q' || quarter_num;
    
    -- Check if partition already exists
    IF EXISTS (
        SELECT 1 FROM pg_class 
        WHERE relname = partition_name
    ) THEN
        RETURN 'Partition ' || partition_name || ' already exists';
    END IF;
    
    -- Create the partition
    EXECUTE format(
        'CREATE TABLE %I PARTITION OF dev_tddf_jsonb FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        start_date,
        end_date
    );
    
    RETURN 'Created partition ' || partition_name || ' for dates ' || start_date || ' to ' || end_date;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create maintenance function to ensure next 2 quarters always exist
CREATE OR REPLACE FUNCTION ensure_future_partitions()
RETURNS TEXT AS $$
DECLARE
    result TEXT := '';
    current_quarter DATE;
    next_quarter DATE;
    quarter_after DATE;
BEGIN
    current_quarter := DATE_TRUNC('quarter', CURRENT_DATE);
    next_quarter := current_quarter + INTERVAL '3 months';
    quarter_after := next_quarter + INTERVAL '3 months';
    
    result := result || create_quarterly_partition(current_quarter) || E'\n';
    result := result || create_quarterly_partition(next_quarter) || E'\n';
    result := result || create_quarterly_partition(quarter_after);
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Run initial check to ensure future partitions exist
SELECT ensure_future_partitions();

-- Step 8: View partition information
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'dev_tddf_jsonb_%'
ORDER BY tablename;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Reload your TDDF files through the upload system
-- 2. Run: SELECT ensure_future_partitions(); monthly to auto-create new quarters
-- 3. Monitor partition sizes with the query above
-- ============================================================================
