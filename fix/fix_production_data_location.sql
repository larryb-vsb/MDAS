-- Fix script to migrate TDDF data from wrong dev_ table to correct production table
-- This moves your processed data from dev_uploader_tddf_jsonb_records to uploader_tddf_jsonb_records

-- STEP 1: Verify the data exists in wrong location before migration
SELECT 
    'BEFORE MIGRATION - Data in wrong dev_ table:' as status,
    COUNT(*) as record_count
FROM dev_uploader_tddf_jsonb_records;

SELECT 
    'BEFORE MIGRATION - Data in correct production table:' as status,
    COUNT(*) as record_count  
FROM uploader_tddf_jsonb_records;

-- STEP 2: Migrate all data from dev_ table to correct production table
-- This preserves all your processed TDDF records
INSERT INTO uploader_tddf_jsonb_records (
    upload_id,
    record_type, 
    record_data,
    processing_status,
    created_at,
    processed_at,
    record_identifier,
    line_number,
    raw_line,
    field_count,
    original_filename,
    file_processing_date,
    file_sequence_number,
    file_processing_time,
    file_system_id,
    mainframe_process_data,
    merchant_account_number
)
SELECT 
    upload_id,
    record_type,
    record_data, 
    processing_status,
    created_at,
    processed_at,
    record_identifier,
    line_number,
    raw_line,
    field_count,
    original_filename,
    file_processing_date,
    file_sequence_number,
    file_processing_time,
    file_system_id,
    mainframe_process_data,
    merchant_account_number
FROM dev_uploader_tddf_jsonb_records
WHERE upload_id NOT IN (
    -- Avoid duplicates if some data already exists
    SELECT upload_id FROM uploader_tddf_jsonb_records
);

-- STEP 3: Verify the migration worked
SELECT 
    'AFTER MIGRATION - Data in correct production table:' as status,
    COUNT(*) as record_count,
    COUNT(DISTINCT upload_id) as unique_files,
    COUNT(DISTINCT record_type) as record_types
FROM uploader_tddf_jsonb_records;

-- STEP 4: Show sample of migrated data 
SELECT 
    'SAMPLE MIGRATED DATA:' as note,
    upload_id,
    record_type,
    line_number,
    CASE 
        WHEN upload_id LIKE '%soho2%' OR upload_id LIKE '%TSYSO%' 
        THEN '← YOUR SOHO2.TSYSO FILE!' 
        ELSE '' 
    END as your_file
FROM uploader_tddf_jsonb_records 
ORDER BY created_at DESC
LIMIT 10;

-- STEP 5: Clean up - Remove the dev_ table to prevent future confusion
-- UNCOMMENT THE NEXT LINE AFTER CONFIRMING MIGRATION WORKED:
-- DROP TABLE dev_uploader_tddf_jsonb_records CASCADE;

SELECT 
    'MIGRATION COMPLETE!' as status,
    'Your TDDF viewer should now show data' as next_step;