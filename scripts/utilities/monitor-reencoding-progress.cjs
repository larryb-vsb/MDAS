#!/usr/bin/env node

/**
 * Monitor Re-encoding Progress
 * Real-time monitoring of comprehensive data re-encoding process
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Environment-aware table naming
function getTableName(baseName) {
  const environment = process.env.NODE_ENV || 'development';
  return environment === 'production' ? baseName : `dev_${baseName}`;
}

/**
 * Get comprehensive system status
 */
async function getSystemStatus() {
  console.log('📊 COMPREHENSIVE RE-ENCODING STATUS REPORT');
  console.log('==========================================');
  console.log(`🗓️  Time: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // File processing status
  const fileStatusQuery = `
    SELECT 
      status,
      processing_status,
      COUNT(*) as count
    FROM ${getTableName('uploaded_files')} 
    WHERE file_type = 'tddf'
    GROUP BY status, processing_status
    ORDER BY status, processing_status;
  `;
  
  const fileStatusResult = await pool.query(fileStatusQuery);
  
  console.log(`\n📁 FILE PROCESSING STATUS:`);
  fileStatusResult.rows.forEach(row => {
    const statusIndicator = getStatusIndicator(row.status, row.processing_status);
    console.log(`   ${statusIndicator} ${row.status}/${row.processing_status}: ${row.count} files`);
  });
  
  // Record generation progress
  const recordsQuery = `
    SELECT 
      'Regular TDDF Records' as type,
      COUNT(*) as count,
      COUNT(DISTINCT source_file_id) as unique_files
    FROM ${getTableName('tddf_records')}
    UNION ALL
    SELECT 
      'JSONB Records' as type,
      COUNT(*) as count,
      COUNT(DISTINCT filename) as unique_files
    FROM ${getTableName('tddf_jsonb')};
  `;
  
  const recordsResult = await pool.query(recordsQuery);
  
  console.log(`\n💾 RECORD GENERATION PROGRESS:`);
  recordsResult.rows.forEach(row => {
    console.log(`   📊 ${row.type}: ${parseInt(row.count).toLocaleString()} records across ${row.unique_files} files`);
  });
  
  // Active processing files
  const activeQuery = `
    SELECT 
      original_filename,
      status,
      processing_status,
      records_processed,
      EXTRACT(EPOCH FROM (NOW() - processing_started_at))/60 as minutes_processing
    FROM ${getTableName('uploaded_files')} 
    WHERE file_type = 'tddf' 
      AND processing_status IN ('queued', 'processing', 'encoding')
      AND processing_started_at IS NOT NULL
    ORDER BY processing_started_at DESC
    LIMIT 10;
  `;
  
  const activeResult = await pool.query(activeQuery);
  
  if (activeResult.rows.length > 0) {
    console.log(`\n⚡ ACTIVE PROCESSING FILES (${activeResult.rows.length}):`);
    activeResult.rows.forEach((row, index) => {
      const timeStr = row.minutes_processing ? `${Math.round(row.minutes_processing)}min` : 'starting';
      console.log(`   ${index + 1}. ${row.original_filename.substring(0, 40)}...`);
      console.log(`      Status: ${row.status}/${row.processing_status} | Records: ${row.records_processed || 0} | Time: ${timeStr}`);
    });
  }
  
  // Failed/Error files
  const failedQuery = `
    SELECT 
      COUNT(*) as failed_count,
      COUNT(CASE WHEN processing_status = 'error' THEN 1 END) as error_count,
      COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed_processing_count
    FROM ${getTableName('uploaded_files')} 
    WHERE file_type = 'tddf' 
      AND processing_status IN ('error', 'failed');
  `;
  
  const failedResult = await pool.query(failedQuery);
  const failedData = failedResult.rows[0];
  
  if (failedData.failed_count > 0) {
    console.log(`\n⚠️  FILES NEEDING ATTENTION:`);
    console.log(`   ❌ Error Status: ${failedData.error_count} files`);
    console.log(`   🔄 Failed Processing: ${failedData.failed_processing_count} files`);
  }
  
  // Files still needing re-encoding
  const needingReencodingQuery = `
    SELECT COUNT(*) as files_needing_reencoding
    FROM (
      SELECT f.id
      FROM ${getTableName('uploaded_files')} f
      LEFT JOIN (
        SELECT filename, COUNT(*) as count 
        FROM ${getTableName('tddf_jsonb')}
        GROUP BY filename
      ) jsonb_count ON f.original_filename = jsonb_count.filename
      LEFT JOIN (
        SELECT source_file_id, COUNT(*) as count 
        FROM ${getTableName('tddf_records')}
        GROUP BY source_file_id
      ) tddf_count ON f.id = tddf_count.source_file_id
      WHERE f.file_type = 'tddf' 
        AND f.status IN ('uploaded', 'completed', 'encoded')
        AND (
          (COALESCE(jsonb_count.count, 0) > 0 AND COALESCE(tddf_count.count, 0) = 0) OR
          (COALESCE(jsonb_count.count, 0) = 0 AND COALESCE(tddf_count.count, 0) > 0) OR
          (COALESCE(jsonb_count.count, 0) = 0 AND COALESCE(tddf_count.count, 0) = 0)
        )
    ) subquery;
  `;
  
  const needingReencodingResult = await pool.query(needingReencodingQuery);
  const remainingFiles = needingReencodingResult.rows[0].files_needing_reencoding;
  
  console.log(`\n🎯 RE-ENCODING PROGRESS:`);
  console.log(`   📋 Files Still Needing Re-encoding: ${remainingFiles}`);
  
  if (remainingFiles > 0) {
    console.log(`   🔄 Next Action: Run "node start-reencoding.cjs 15" to process next batch`);
  } else {
    console.log(`   ✅ ALL FILES COMPLETE - Re-encoding system successful!`);
  }
  
  // System performance metrics
  const performanceQuery = `
    SELECT 
      AVG(processing_time_ms) as avg_processing_time,
      MAX(processing_time_ms) as max_processing_time,
      COUNT(CASE WHEN processing_time_ms IS NOT NULL THEN 1 END) as files_with_timing
    FROM ${getTableName('uploaded_files')} 
    WHERE file_type = 'tddf' AND processing_time_ms > 0;
  `;
  
  const performanceResult = await pool.query(performanceQuery);
  const perfData = performanceResult.rows[0];
  
  if (perfData.files_with_timing > 0) {
    console.log(`\n⚡ SYSTEM PERFORMANCE:`);
    console.log(`   📊 Avg Processing Time: ${Math.round(perfData.avg_processing_time || 0)}ms`);
    console.log(`   🚀 Max Processing Time: ${Math.round(perfData.max_processing_time || 0)}ms`);
    console.log(`   📈 Files Processed: ${perfData.files_with_timing}`);
  }
  
  console.log(`\n🔄 System Status: ${remainingFiles === 0 ? '✅ COMPLETE' : '⚡ ACTIVE PROCESSING'}`);
  console.log(`==========================================`);
  
  return { remainingFiles, activeProcessing: activeResult.rows.length };
}

/**
 * Get status indicator emoji
 */
function getStatusIndicator(status, processingStatus) {
  if (status === 'processing' || processingStatus === 'processing') return '⚡';
  if (processingStatus === 'queued') return '📋';
  if (processingStatus === 'completed') return '✅';
  if (processingStatus === 'error' || processingStatus === 'failed') return '❌';
  if (processingStatus === 'uploading') return '📤';
  return '📁';
}

/**
 * Main monitoring function
 */
async function main() {
  try {
    const status = await getSystemStatus();
    
    // Check if we should suggest next action
    if (status.remainingFiles > 0) {
      console.log(`\n💡 SUGGESTED NEXT STEPS:`);
      console.log(`   1. Monitor active processing for a few minutes`);
      console.log(`   2. Run next batch: node start-reencoding.cjs 15`);
      console.log(`   3. Check system health in dashboard`);
    }
    
  } catch (error) {
    console.error(`❌ Monitoring error:`, error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getSystemStatus };