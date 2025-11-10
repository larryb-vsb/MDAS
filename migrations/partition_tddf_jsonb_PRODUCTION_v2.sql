-- ============================================================================
-- QUARTERLY PARTITIONING MIGRATION FOR tddf_jsonb PRODUCTION (REVISED V2)
-- ============================================================================
-- This script converts tddf_jsonb to a quarterly partitioned table
-- 
-- KEY CHANGES FROM V1:
-- - Partition on tddf_processing_date (existing column) instead of JSONB extraction  
-- - Keep simple primary key structure (id, tddf_processing_date)
-- - Add default partition for NULL/out-of-range dates
-- - More backward compatible with existing code
--
-- IMPORTANT: This will DROP and RECREATE the table
-- Make sure you can reload your TDDF files before running
-- ============================================================================

-- Step 1: Drop existing table
DROP TABLE IF EXISTS tddf_jsonb CASCADE;

-- Step 2: Create partitioned parent table
CREATE TABLE tddf_jsonb (
    id SERIAL,
    upload_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    record_type TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    raw_line TEXT NOT NULL,
    extracted_fields JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    tddf_processing_datetime TIMESTAMP,
    tddf_processing_date DATE DEFAULT CURRENT_DATE, -- PARTITION KEY
    processing_server_id TEXT,
    processing_status TEXT DEFAULT 'pending',
    details JSONB,
    parsed_datetime TIMESTAMPTZ,
    record_time_source TEXT,
    record_identifier TEXT,
    processing_time_ms INTEGER DEFAULT 0,
    raw_line_hash TEXT,
    PRIMARY KEY (id, tddf_processing_date)
) PARTITION BY RANGE (tddf_processing_date);

-- Step 3: Create default partition
CREATE TABLE tddf_jsonb_default PARTITION OF tddf_jsonb DEFAULT;

-- Step 4: Create quarterly partitions from 2021-Q1 through 2026-Q1
-- 2021
CREATE TABLE tddf_jsonb_2021_q1 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2021-01-01') TO ('2021-04-01');
CREATE TABLE tddf_jsonb_2021_q2 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2021-04-01') TO ('2021-07-01');
CREATE TABLE tddf_jsonb_2021_q3 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2021-07-01') TO ('2021-10-01');
CREATE TABLE tddf_jsonb_2021_q4 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2021-10-01') TO ('2022-01-01');

-- 2022
CREATE TABLE tddf_jsonb_2022_q1 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2022-01-01') TO ('2022-04-01');
CREATE TABLE tddf_jsonb_2022_q2 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2022-04-01') TO ('2022-07-01');
CREATE TABLE tddf_jsonb_2022_q3 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2022-07-01') TO ('2022-10-01');
CREATE TABLE tddf_jsonb_2022_q4 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2022-10-01') TO ('2023-01-01');

-- 2023
CREATE TABLE tddf_jsonb_2023_q1 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2023-01-01') TO ('2023-04-01');
CREATE TABLE tddf_jsonb_2023_q2 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2023-04-01') TO ('2023-07-01');
CREATE TABLE tddf_jsonb_2023_q3 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2023-07-01') TO ('2023-10-01');
CREATE TABLE tddf_jsonb_2023_q4 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2023-10-01') TO ('2024-01-01');

-- 2024
CREATE TABLE tddf_jsonb_2024_q1 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE tddf_jsonb_2024_q2 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
CREATE TABLE tddf_jsonb_2024_q3 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2024-07-01') TO ('2024-10-01');
CREATE TABLE tddf_jsonb_2024_q4 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2024-10-01') TO ('2025-01-01');

-- 2025
CREATE TABLE tddf_jsonb_2025_q1 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE tddf_jsonb_2025_q2 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
CREATE TABLE tddf_jsonb_2025_q3 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2025-07-01') TO ('2025-10-01');
CREATE TABLE tddf_jsonb_2025_q4 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2025-10-01') TO ('2026-01-01');

-- 2026 (future)
CREATE TABLE tddf_jsonb_2026_q1 PARTITION OF tddf_jsonb
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

-- Step 5: Create all indexes
CREATE INDEX idx_tddf_jsonb_batch_date 
    ON tddf_jsonb ((extracted_fields->>'batchDate'));

CREATE INDEX idx_tddf_jsonb_transaction_date 
    ON tddf_jsonb ((extracted_fields->>'transactionDate'));

CREATE INDEX idx_tddf_jsonb_record_type_batch_date 
    ON tddf_jsonb (record_type, (extracted_fields->>'batchDate'));

CREATE INDEX idx_tddf_jsonb_record_type_transaction_date 
    ON tddf_jsonb (record_type, (extracted_fields->>'transactionDate'));

CREATE INDEX idx_tddf_jsonb_bh_batch_date 
    ON tddf_jsonb (record_type, (extracted_fields->>'batchDate'))
    WHERE record_type = 'BH';

CREATE INDEX idx_tddf_jsonb_dt_transaction_date 
    ON tddf_jsonb (record_type, (extracted_fields->>'transactionDate'))
    WHERE record_type = 'DT';

CREATE INDEX idx_tddf_jsonb_id ON tddf_jsonb (id); -- For id-only queries across partitions
CREATE INDEX idx_tddf_jsonb_record_type ON tddf_jsonb (record_type);
CREATE INDEX idx_tddf_jsonb_upload_id ON tddf_jsonb (upload_id);
CREATE INDEX idx_tddf_jsonb_created_at ON tddf_jsonb (created_at);
CREATE INDEX idx_tddf_jsonb_processing_date ON tddf_jsonb (tddf_processing_date);

CREATE INDEX idx_tddf_jsonb_association_number 
    ON tddf_jsonb ((extracted_fields->>'associationNumber'));

CREATE INDEX idx_tddf_jsonb_card_type 
    ON tddf_jsonb ((extracted_fields->>'cardType'));

CREATE INDEX idx_tddf_jsonb_group_number 
    ON tddf_jsonb ((extracted_fields->>'groupNumber'));

CREATE INDEX idx_tddf_jsonb_merchant_account 
    ON tddf_jsonb ((extracted_fields->>'merchantAccountNumber'));

CREATE INDEX idx_tddf_jsonb_terminal_id 
    ON tddf_jsonb ((extracted_fields->>'terminalId'));

CREATE INDEX idx_tddf_jsonb_extracted_fields 
    ON tddf_jsonb USING GIN (extracted_fields);

-- Step 6: Create auto-partition functions
CREATE OR REPLACE FUNCTION create_quarterly_partition(target_date DATE)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
    quarter_num INTEGER;
    year_num INTEGER;
BEGIN
    quarter_num := EXTRACT(QUARTER FROM target_date);
    year_num := EXTRACT(YEAR FROM target_date);
    start_date := DATE_TRUNC('quarter', target_date);
    end_date := start_date + INTERVAL '3 months';
    partition_name := 'tddf_jsonb_' || year_num || '_q' || quarter_num;
    
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
        RETURN 'Partition ' || partition_name || ' already exists';
    END IF;
    
    EXECUTE format(
        'CREATE TABLE %I PARTITION OF tddf_jsonb FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
    
    RETURN 'Created partition ' || partition_name || ' for dates ' || start_date || ' to ' || end_date;
END;
$$ LANGUAGE plpgsql;

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

-- Step 7: Run initial check
SELECT ensure_future_partitions();

-- Step 8: View partition information
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'tddf_jsonb%'
ORDER BY tablename;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
