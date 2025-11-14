-- PRODUCTION FIX: Error fetching TDDF JSON record type counts: column "total_records" does not exist
-- Date: 2025-09-12, Error ID: 574620a9
-- Issue: Missing tddf_json_record_type_counts_pre_cache table

-- STEP 1: Create missing TDDF JSON record type counts cache table for PRODUCTION
SELECT 'CREATING PRODUCTION TDDF CACHE TABLE' as step;

CREATE TABLE IF NOT EXISTS tddf_json_record_type_counts_pre_cache (
    id SERIAL PRIMARY KEY,
    cache_key varchar(255) UNIQUE NOT NULL DEFAULT 'tddf_json_record_type_counts',
    page_name varchar(255) DEFAULT 'settings',
    total_records integer DEFAULT 0,
    dt_count integer DEFAULT 0,
    bh_count integer DEFAULT 0,
    p1_count integer DEFAULT 0,
    p2_count integer DEFAULT 0,
    e1_count integer DEFAULT 0,
    g2_count integer DEFAULT 0,
    ad_count integer DEFAULT 0,
    dr_count integer DEFAULT 0,
    other_count integer DEFAULT 0,
    cache_data jsonb,
    data_sources jsonb,
    processing_time_ms integer DEFAULT 0,
    last_update_datetime timestamp DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp,
    metadata jsonb,
    created_by varchar(255) DEFAULT 'system',
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- STEP 2: Create missing TDDF JSON record type counts cache table for DEVELOPMENT
SELECT 'CREATING DEVELOPMENT TDDF CACHE TABLE' as step;

CREATE TABLE IF NOT EXISTS dev_tddf_json_record_type_counts_pre_cache (
    id SERIAL PRIMARY KEY,
    cache_key varchar(255) UNIQUE NOT NULL DEFAULT 'tddf_json_record_type_counts',
    page_name varchar(255) DEFAULT 'settings',
    total_records integer DEFAULT 0,
    dt_count integer DEFAULT 0,
    bh_count integer DEFAULT 0,
    p1_count integer DEFAULT 0,
    p2_count integer DEFAULT 0,
    e1_count integer DEFAULT 0,
    g2_count integer DEFAULT 0,
    ad_count integer DEFAULT 0,
    dr_count integer DEFAULT 0,
    other_count integer DEFAULT 0,
    cache_data jsonb,
    data_sources jsonb,
    processing_time_ms integer DEFAULT 0,
    last_update_datetime timestamp DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp,
    metadata jsonb,
    created_by varchar(255) DEFAULT 'system',
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- STEP 3: Create indexes for performance
SELECT 'CREATING PERFORMANCE INDEXES' as step;

-- Production indexes
CREATE INDEX IF NOT EXISTS tddf_json_record_type_counts_pre_cache_cache_key_idx 
ON tddf_json_record_type_counts_pre_cache(cache_key);

CREATE INDEX IF NOT EXISTS tddf_json_record_type_counts_pre_cache_last_update_idx 
ON tddf_json_record_type_counts_pre_cache(last_update_datetime);

-- Development indexes
CREATE INDEX IF NOT EXISTS dev_tddf_json_record_type_counts_pre_cache_cache_key_idx 
ON dev_tddf_json_record_type_counts_pre_cache(cache_key);

CREATE INDEX IF NOT EXISTS dev_tddf_json_record_type_counts_pre_cache_last_update_idx 
ON dev_tddf_json_record_type_counts_pre_cache(last_update_datetime);

-- STEP 4: Insert initial cache records
SELECT 'INSERTING INITIAL CACHE RECORDS' as step;

-- Production initial record
INSERT INTO tddf_json_record_type_counts_pre_cache (
    cache_key, page_name, total_records, dt_count, bh_count, p1_count, p2_count,
    e1_count, g2_count, ad_count, dr_count, other_count, cache_data, data_sources,
    processing_time_ms, last_update_datetime, expires_at, metadata, created_by
) VALUES (
    'tddf_json_record_type_counts',
    'settings',
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    '{"recordTypes": {"DT": 0, "BH": 0, "P1": 0, "P2": 0, "E1": 0, "G2": 0, "AD": 0, "DR": 0, "Other": 0}, "totalRecords": 0, "buildTime": 0}',
    '{"sourceTable": "tddf_jsonb", "queryType": "record_type_aggregation"}',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '15 minutes',
    '{"environment": "production", "cacheVersion": "1.0", "buildMethod": "initial_setup"}',
    'system'
) ON CONFLICT (cache_key) DO NOTHING;

-- Development initial record
INSERT INTO dev_tddf_json_record_type_counts_pre_cache (
    cache_key, page_name, total_records, dt_count, bh_count, p1_count, p2_count,
    e1_count, g2_count, ad_count, dr_count, other_count, cache_data, data_sources,
    processing_time_ms, last_update_datetime, expires_at, metadata, created_by
) VALUES (
    'tddf_json_record_type_counts',
    'settings',
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    '{"recordTypes": {"DT": 0, "BH": 0, "P1": 0, "P2": 0, "E1": 0, "G2": 0, "AD": 0, "DR": 0, "Other": 0}, "totalRecords": 0, "buildTime": 0}',
    '{"sourceTable": "dev_tddf_jsonb", "queryType": "record_type_aggregation"}',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '15 minutes',
    '{"environment": "development", "cacheVersion": "1.0", "buildMethod": "initial_setup"}',
    'system'
) ON CONFLICT (cache_key) DO NOTHING;

-- STEP 5: Test the tables
SELECT 'TESTING TABLES' as step;

-- Test production table
SELECT 'PRODUCTION TABLE TEST' as test_type;
SELECT 
    cache_key,
    total_records,
    dt_count,
    bh_count,
    p1_count,
    p2_count,
    e1_count,
    g2_count,
    ad_count,
    dr_count,
    other_count,
    last_update_datetime
FROM tddf_json_record_type_counts_pre_cache
LIMIT 1;

-- Test development table
SELECT 'DEVELOPMENT TABLE TEST' as test_type;
SELECT 
    cache_key,
    total_records,
    dt_count,
    bh_count,
    p1_count,
    p2_count,
    e1_count,
    g2_count,
    ad_count,
    dr_count,
    other_count,
    last_update_datetime
FROM dev_tddf_json_record_type_counts_pre_cache
LIMIT 1;

-- STEP 6: Verify table schema
SELECT 'FINAL SCHEMA VERIFICATION' as verification;

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('tddf_json_record_type_counts_pre_cache', 'dev_tddf_json_record_type_counts_pre_cache')
AND column_name = 'total_records'
ORDER BY table_name;

-- STEP 7: Show all tables created
SELECT 'TABLES CREATED' as final_status;

SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE '%tddf_json_record_type_counts%'
ORDER BY table_name;

SELECT 'PRODUCTION TDDF CACHE FIX COMPLETE' as completion_status;
SELECT 'API endpoint /api/settings/tddf-json-record-counts should now work' as api_status;