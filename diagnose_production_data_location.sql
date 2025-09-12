-- Diagnostic script to find where your production TDDF data actually went
-- This will show if data exists in dev_ prefixed tables in your production database

-- 1. Check if dev_ prefixed tables exist in production (they shouldn't!)
SELECT 
    schemaname, 
    tablename,
    'SHOULD NOT EXIST IN PRODUCTION!' as status
FROM pg_tables 
WHERE tablename LIKE 'dev_%' 
  AND schemaname = 'public'
ORDER BY tablename;

-- 2. Compare record counts between dev_ and production tables
SELECT 
    'dev_uploader_tddf_jsonb_records' as table_name,
    COUNT(*) as record_count,
    'DATA FOUND HERE - WRONG TABLE!' as issue
FROM dev_uploader_tddf_jsonb_records
UNION ALL
SELECT 
    'uploader_tddf_jsonb_records' as table_name,
    COUNT(*) as record_count,
    'SHOULD HAVE DATA HERE' as issue  
FROM uploader_tddf_jsonb_records
ORDER BY record_count DESC;

-- 3. Check for your specific file (soho2.TSYSO) in both locations
SELECT 
    'dev_uploader_tddf_jsonb_records' as found_in_table,
    COUNT(*) as record_count,
    upload_id
FROM dev_uploader_tddf_jsonb_records 
WHERE upload_id LIKE '%soho2%' OR upload_id LIKE '%TSYSO%'
GROUP BY upload_id
UNION ALL
SELECT 
    'uploader_tddf_jsonb_records' as found_in_table,
    COUNT(*) as record_count,
    upload_id
FROM uploader_tddf_jsonb_records 
WHERE upload_id LIKE '%soho2%' OR upload_id LIKE '%TSYSO%'
GROUP BY upload_id
ORDER BY record_count DESC;

-- 4. Show sample data from wrong table (if it exists)
SELECT 
    'SAMPLE FROM DEV TABLE (WRONG LOCATION):' as note,
    upload_id, 
    record_type, 
    line_number,
    created_at
FROM dev_uploader_tddf_jsonb_records 
LIMIT 5;