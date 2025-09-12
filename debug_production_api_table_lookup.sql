-- Debug: Check where production data actually is vs where the API is looking
-- This confirms the exact table naming issue in production

-- 1. Check if production has records in the CORRECT table (where they should be)
SELECT 
    'uploader_tddf_jsonb_records (CORRECT TABLE)' as table_name,
    COUNT(*) as record_count,
    COUNT(DISTINCT upload_id) as unique_uploads,
    MAX(created_at) as latest_record
FROM uploader_tddf_jsonb_records
WHERE upload_id LIKE '%uploader_1757643264471%' OR upload_id LIKE '%rq1sv9fso%' OR upload_id LIKE '%soho2%'
UNION ALL

-- 2. Check if production has records in the WRONG table (dev_ prefixed)
SELECT 
    'dev_uploader_tddf_jsonb_records (WRONG TABLE - API LOOKING HERE)' as table_name,
    COUNT(*) as record_count,
    COUNT(DISTINCT upload_id) as unique_uploads,
    MAX(created_at) as latest_record
FROM dev_uploader_tddf_jsonb_records
WHERE upload_id LIKE '%uploader_1757643264471%' OR upload_id LIKE '%rq1sv9fso%' OR upload_id LIKE '%soho2%'

-- 3. Check uploader_uploads table for your specific file
UNION ALL
SELECT 
    'uploader_uploads (FILE METADATA)' as table_name,
    COUNT(*) as record_count,
    COUNT(DISTINCT id) as unique_uploads,
    MAX(last_updated) as latest_record
FROM uploader_uploads
WHERE filename LIKE '%soho2%' OR id LIKE '%uploader_1757643264471%' OR id LIKE '%rq1sv9fso%'

-- 4. Show the exact upload ID we need to find
UNION ALL
SELECT 
    'SEARCHING FOR THIS UPLOAD ID:' as table_name,
    0 as record_count,
    0 as unique_uploads,
    NULL as latest_record;

-- 5. Find the exact upload ID from the screenshot
SELECT 
    'FOUND UPLOAD:' as info,
    id as upload_id,
    filename,
    current_phase,
    processing_server_id
FROM uploader_uploads 
WHERE id = 'uploader_1757643264471_rq1sv9fso'
   OR filename LIKE '%soho2%'
   OR id LIKE '%soho2%';

-- 6. Check if that specific upload has JSONB records anywhere
SELECT 
    'RECORDS FOR UPLOAD uploader_1757643264471_rq1sv9fso:' as search_result,
    COUNT(*) as found_in_correct_table
FROM uploader_tddf_jsonb_records 
WHERE upload_id = 'uploader_1757643264471_rq1sv9fso';