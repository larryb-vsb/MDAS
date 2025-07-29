-- TDDF Records Cleanup - What-If Analysis Query
-- This query analyzes what would be deleted if we remove records older than 3 months
-- DO NOT EXECUTE THE DELETE STATEMENTS - This is for analysis only

-- Set the cutoff date (3 months ago from today)
-- Change this date as needed for your analysis
WITH cleanup_analysis AS (
  SELECT 
    DATE('now', '-3 months') as cutoff_date,
    COUNT(*) as total_records,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') THEN 1 END) as records_to_delete,
    COUNT(CASE WHEN created_at >= DATE('now', '-3 months') THEN 1 END) as records_to_keep,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record,
    
    -- Breakdown by record type for records to be deleted
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') AND record_type = 'DT' THEN 1 END) as dt_records_to_delete,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') AND record_type = 'BH' THEN 1 END) as bh_records_to_delete,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') AND record_type = 'P1' THEN 1 END) as p1_records_to_delete,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') AND record_type = 'E1' THEN 1 END) as e1_records_to_delete,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') AND record_type = 'G2' THEN 1 END) as g2_records_to_delete,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') AND record_type NOT IN ('DT', 'BH', 'P1', 'E1', 'G2') THEN 1 END) as other_records_to_delete,
    
    -- Financial impact analysis for DT records
    SUM(CASE 
      WHEN created_at < DATE('now', '-3 months') 
        AND record_type = 'DT' 
        AND (extracted_fields->>'transactionAmount')::text ~ '^[0-9.]+$'
      THEN (extracted_fields->>'transactionAmount')::numeric 
      ELSE 0 
    END) as total_amount_to_delete,
    
    -- File breakdown
    COUNT(DISTINCT CASE WHEN created_at < DATE('now', '-3 months') THEN filename END) as files_to_delete,
    COUNT(DISTINCT CASE WHEN created_at >= DATE('now', '-3 months') THEN filename END) as files_to_keep
    
  FROM dev_tddf_jsonb
)

-- Main analysis report
SELECT 
  'TDDF CLEANUP ANALYSIS REPORT' as report_section,
  '============================' as separator,
  '' as blank_line;

SELECT 
  'CUTOFF DATE: ' || cutoff_date as analysis_detail,
  'TOTAL RECORDS: ' || total_records as current_state,
  'RECORDS TO DELETE: ' || records_to_delete || ' (' || 
    ROUND((records_to_delete * 100.0 / total_records), 2) || '%)' as deletion_impact,
  'RECORDS TO KEEP: ' || records_to_keep || ' (' || 
    ROUND((records_to_keep * 100.0 / total_records), 2) || '%)' as retention_impact
FROM cleanup_analysis;

-- Record type breakdown for deletions
SELECT 
  'RECORD TYPE BREAKDOWN (TO DELETE)' as breakdown_section,
  '=================================' as separator,
  '' as blank_line;

SELECT 
  'DT Records: ' || dt_records_to_delete as dt_impact,
  'BH Records: ' || bh_records_to_delete as bh_impact,
  'P1 Records: ' || p1_records_to_delete as p1_impact,
  'E1 Records: ' || e1_records_to_delete as e1_impact,
  'G2 Records: ' || g2_records_to_delete as g2_impact,
  'Other Records: ' || other_records_to_delete as other_impact
FROM cleanup_analysis;

-- Financial impact
SELECT 
  'FINANCIAL IMPACT ANALYSIS' as financial_section,
  '=========================' as separator,
  '' as blank_line;

SELECT 
  'Total Transaction Amount to Delete: $' || 
    ROUND(total_amount_to_delete, 2) as financial_impact,
  'Files Affected: ' || files_to_delete || ' files would be cleaned' as file_impact
FROM cleanup_analysis;

-- Date range analysis
SELECT 
  'DATE RANGE ANALYSIS' as date_section,
  '==================' as separator,
  '' as blank_line;

SELECT 
  'Oldest Record: ' || oldest_record as date_range_start,
  'Newest Record: ' || newest_record as date_range_end,
  'Cutoff Date: ' || cutoff_date as deletion_cutoff
FROM cleanup_analysis;

-- Sample records that would be deleted (first 10)
SELECT 
  'SAMPLE RECORDS TO BE DELETED' as sample_section,
  '============================' as separator,
  '' as blank_line;

SELECT 
  id,
  filename,
  record_type,
  created_at,
  CASE 
    WHEN record_type = 'DT' THEN 
      'Merchant: ' || COALESCE(extracted_fields->>'merchantName', 'Unknown') ||
      ' | Amount: $' || COALESCE(extracted_fields->>'transactionAmount', '0')
    ELSE 'Non-transaction record'
  END as record_details
FROM dev_tddf_jsonb 
WHERE created_at < DATE('now', '-3 months')
ORDER BY created_at ASC
LIMIT 10;

-- Files that would be completely cleaned out
SELECT 
  'FILES TO BE COMPLETELY CLEANED' as files_section,
  '==============================' as separator,
  '' as blank_line;

SELECT 
  filename,
  COUNT(*) as total_records_in_file,
  MIN(created_at) as oldest_record_in_file,
  MAX(created_at) as newest_record_in_file
FROM dev_tddf_jsonb 
WHERE created_at < DATE('now', '-3 months')
  AND filename NOT IN (
    SELECT DISTINCT filename 
    FROM dev_tddf_jsonb 
    WHERE created_at >= DATE('now', '-3 months')
  )
GROUP BY filename
ORDER BY total_records_in_file DESC
LIMIT 20;

-- 📋 ACTUAL DELETE STATEMENTS (DO NOT EXECUTE)
-- =============================================
-- 
-- IF YOU DECIDE TO PROCEED, these would be the statements to run:
-- 
-- 1. Delete from JSONB table:
-- DELETE FROM dev_tddf_jsonb 
-- WHERE created_at < DATE('now', '-3 months');
-- 
-- 2. For production environment:
-- DELETE FROM tddf_jsonb 
-- WHERE created_at < DATE('now', '-3 months');
-- 
-- 3. Optional: Clean up related raw import records:
-- DELETE FROM dev_tddf_raw_import 
-- WHERE processed_at < DATE('now', '-3 months')
--   AND processing_status = 'processed';
--
-- 4. Optional: Vacuum to reclaim space:
-- VACUUM ANALYZE dev_tddf_jsonb;
-- VACUUM ANALYZE tddf_jsonb;
--
-- ⚠️  IMPORTANT WARNINGS:
-- - This will permanently delete data older than 3 months
-- - Consider backing up data before deletion
-- - Test on development environment first
-- - Ensure no active processing depends on old records
-- - Consider archiving instead of deleting for compliance

-- Performance impact analysis
SELECT 
  'EXPECTED PERFORMANCE IMPROVEMENT' as performance_section,
  '===============================' as separator,
  '' as blank_line;

WITH performance_analysis AS (
  SELECT 
    COUNT(*) as current_total,
    COUNT(CASE WHEN created_at < DATE('now', '-3 months') THEN 1 END) as to_delete,
    COUNT(CASE WHEN created_at >= DATE('now', '-3 months') THEN 1 END) as will_remain
  FROM dev_tddf_jsonb
)
SELECT 
  'Current table size: ' || current_total || ' records' as current_size,
  'After cleanup: ' || will_remain || ' records' as new_size,
  'Size reduction: ' || to_delete || ' records (' || 
    ROUND((to_delete * 100.0 / current_total), 1) || '%)' as size_reduction,
  'Expected query speedup: ' || 
    ROUND((current_total * 1.0 / will_remain), 1) || 'x faster' as speed_improvement
FROM performance_analysis;