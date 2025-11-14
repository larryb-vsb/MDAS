-- Fix production dashboard_cache table missing record_count column
-- Error: column "record_count" does not exist

-- Create production dashboard_cache table if it doesn't exist
CREATE TABLE IF NOT EXISTS dashboard_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR NOT NULL,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    build_time_ms INTEGER NOT NULL DEFAULT 0,
    record_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add missing record_count column if table exists but column is missing
ALTER TABLE dashboard_cache 
ADD COLUMN IF NOT EXISTS record_count INTEGER NOT NULL DEFAULT 0;

-- Add missing build_time_ms column if it's missing too
ALTER TABLE dashboard_cache 
ADD COLUMN IF NOT EXISTS build_time_ms INTEGER NOT NULL DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS dashboard_cache_cache_key_idx ON dashboard_cache(cache_key);
CREATE INDEX IF NOT EXISTS dashboard_cache_expires_at_idx ON dashboard_cache(expires_at);
CREATE INDEX IF NOT EXISTS dashboard_cache_created_at_idx ON dashboard_cache(created_at);

-- Verify the fix worked
SELECT 
    'dashboard_cache' as table_name,
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'dashboard_cache' 
  AND column_name IN ('record_count', 'build_time_ms', 'cache_key', 'cache_data')
ORDER BY column_name;

-- Show current record count
SELECT 
    COUNT(*) as total_cache_entries,
    COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_entries,
    COUNT(CASE WHEN expires_at <= NOW() THEN 1 END) as expired_entries
FROM dashboard_cache;