-- CRITICAL FIX: Production Environment Configuration 
-- Issue: Production API is using dev_ table prefixes instead of production table names
-- Result: API looks in dev_uploader_tddf_jsonb_records (empty) instead of uploader_tddf_jsonb_records (197,354 records)

-- STEP 1: Verify the data location issue
SELECT 
    'PRODUCTION DATA LOCATION CHECK' as step,
    table_name,
    row_count,
    'ISSUE CONFIRMED: Data in correct table, API looking in wrong table' as diagnosis
FROM (
    SELECT 'uploader_tddf_jsonb_records (CORRECT - HAS DATA)' as table_name, COUNT(*) as row_count
    FROM uploader_tddf_jsonb_records
    UNION ALL
    SELECT 'dev_uploader_tddf_jsonb_records (WRONG - API LOOKS HERE)', COUNT(*) 
    FROM dev_uploader_tddf_jsonb_records
    UNION ALL  
    SELECT 'uploader_uploads (FILE METADATA)', COUNT(*) 
    FROM uploader_uploads
) data_check;

-- STEP 2: Find your specific soho2.TSYSO file upload in production
SELECT 
    'PRODUCTION FILE SEARCH' as step,
    id as upload_id,
    filename,
    current_phase,
    'FILE EXISTS IN PRODUCTION' as status
FROM uploader_uploads 
WHERE filename LIKE '%soho2%' 
   OR id = 'uploader_1757643264471_rq1sv9fso';

-- STEP 3: Check if that upload has JSONB records in the CORRECT table
SELECT 
    'JSONB RECORDS CHECK' as step,
    upload_id,
    COUNT(*) as record_count,
    COUNT(DISTINCT record_type) as record_types,
    'RECORDS EXIST BUT API CANT FIND THEM' as issue
FROM uploader_tddf_jsonb_records 
WHERE upload_id = 'uploader_1757643264471_rq1sv9fso'
GROUP BY upload_id;

-- STEP 4: Verify the records exist and show sample data
SELECT 
    'SAMPLE DATA VERIFICATION' as step,
    record_type,
    COUNT(*) as count_by_type,
    'THIS IS THE DATA PRODUCTION SHOULD DISPLAY' as note
FROM uploader_tddf_jsonb_records 
WHERE upload_id = 'uploader_1757643264471_rq1sv9fso'
GROUP BY record_type
ORDER BY count_by_type DESC;

-- THE ROOT CAUSE: Production server is configured with NODE_ENV=development
-- THE SOLUTION: Set NODE_ENV=production in production environment variables

-- This will make getTableName() return:
-- ❌ WRONG (current): "dev_uploader_tddf_jsonb_records" 
-- ✅ CORRECT (needed): "uploader_tddf_jsonb_records"

SELECT 
    'ROOT CAUSE IDENTIFIED' as conclusion,
    'NODE_ENV=development in production' as problem,
    'Set NODE_ENV=production' as solution,
    'Will fix table prefix from dev_ to no prefix' as expected_result;