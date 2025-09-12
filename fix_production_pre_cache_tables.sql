-- Fix missing production pre-cache tables
-- Based on startup logs showing missing TDDF pre-cache tables

-- 1. Create missing TDDF JSON stats pre-cache table  
CREATE TABLE IF NOT EXISTS tddf_json_stats_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    record_types JSONB,
    processing_stats JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 2. Create missing TDDF JSON activity pre-cache table
CREATE TABLE IF NOT EXISTS tddf_json_activity_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    activity_data JSONB NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 3. Create missing TDDF JSON record type counts pre-cache table
CREATE TABLE IF NOT EXISTS tddf_json_record_type_counts_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_type TEXT NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0,
    percentage NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 4. Create missing TDDF records all pre-cache table
CREATE TABLE IF NOT EXISTS tddf_records_all_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    record_type TEXT NOT NULL,
    line_number INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 5. Create missing TDDF records DT pre-cache table
CREATE TABLE IF NOT EXISTS tddf_records_dt_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    transaction_amount NUMERIC(15,2),
    merchant_account TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 6. Create missing TDDF records BH pre-cache table
CREATE TABLE IF NOT EXISTS tddf_records_bh_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    batch_id TEXT,
    net_deposit NUMERIC(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 7. Create missing TDDF records P1 pre-cache table
CREATE TABLE IF NOT EXISTS tddf_records_p1_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    purchasing_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 8. Create missing TDDF records P2 pre-cache table
CREATE TABLE IF NOT EXISTS tddf_records_p2_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    purchasing_extension_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 9. Create missing TDDF records other pre-cache table
CREATE TABLE IF NOT EXISTS tddf_records_other_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    record_data JSONB NOT NULL,
    record_type TEXT NOT NULL,
    other_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 10. Create missing TDDF batch relationships pre-cache table
CREATE TABLE IF NOT EXISTS tddf_batch_relationships_pre_cache (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    batch_header_id INTEGER,
    transaction_ids INTEGER[],
    extension_ids INTEGER[],
    relationship_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- 11. Create missing TDDF records tab processing status table
CREATE TABLE IF NOT EXISTS tddf_records_tab_processing_status (
    id SERIAL PRIMARY KEY,
    upload_id TEXT NOT NULL,
    tab_name TEXT NOT NULL,
    processing_status TEXT DEFAULT 'pending',
    record_count INTEGER DEFAULT 0,
    last_processed TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Create missing charts pre-cache table
CREATE TABLE IF NOT EXISTS charts_pre_cache (
    id SERIAL PRIMARY KEY,
    cache_key TEXT NOT NULL,
    chart_data JSONB NOT NULL,
    chart_type TEXT NOT NULL,
    upload_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS tddf_json_stats_pre_cache_upload_id_idx ON tddf_json_stats_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_json_activity_pre_cache_upload_id_idx ON tddf_json_activity_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_json_record_type_counts_pre_cache_upload_id_idx ON tddf_json_record_type_counts_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_all_pre_cache_upload_id_idx ON tddf_records_all_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_dt_pre_cache_upload_id_idx ON tddf_records_dt_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_bh_pre_cache_upload_id_idx ON tddf_records_bh_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_p1_pre_cache_upload_id_idx ON tddf_records_p1_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_p2_pre_cache_upload_id_idx ON tddf_records_p2_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_other_pre_cache_upload_id_idx ON tddf_records_other_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_batch_relationships_pre_cache_upload_id_idx ON tddf_batch_relationships_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_records_tab_processing_status_upload_id_idx ON tddf_records_tab_processing_status(upload_id);
CREATE INDEX IF NOT EXISTS charts_pre_cache_cache_key_idx ON charts_pre_cache(cache_key);

-- Verify tables were created
SELECT 
    table_name,
    'CREATED' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'tddf_json_stats_pre_cache',
    'tddf_json_activity_pre_cache', 
    'tddf_json_record_type_counts_pre_cache',
    'tddf_records_all_pre_cache',
    'tddf_records_dt_pre_cache',
    'tddf_records_bh_pre_cache',
    'tddf_records_p1_pre_cache',
    'tddf_records_p2_pre_cache',
    'tddf_records_other_pre_cache',
    'tddf_batch_relationships_pre_cache',
    'tddf_records_tab_processing_status',
    'charts_pre_cache'
  )
ORDER BY table_name;