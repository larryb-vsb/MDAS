-- Direct SQL script to check and manually process pending TDDF records

-- Check current status
SELECT 
    'Pending DT Records' as status,
    COUNT(*) as count
FROM dev_tddf_raw_import 
WHERE processing_status = 'pending' 
AND record_type = 'DT';

-- Show sample pending records
SELECT 
    id, 
    source_file_id, 
    line_number, 
    record_type,
    LEFT(raw_line, 50) as raw_line_preview,
    processing_status
FROM dev_tddf_raw_import 
WHERE processing_status = 'pending' 
AND record_type = 'DT'
ORDER BY source_file_id, line_number
LIMIT 5;

-- Check current TDDF records count
SELECT 
    'Current TDDF Records' as status,
    COUNT(*) as count
FROM dev_tddf_records;

-- Check failed files that might need reprocessing
SELECT 
    COUNT(*) as failed_tddf_files,
    STRING_AGG(DISTINCT processing_errors, '; ') as error_types
FROM dev_uploaded_files 
WHERE file_type = 'tddf' 
AND processing_status = 'failed';