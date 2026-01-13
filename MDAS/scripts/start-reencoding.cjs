#!/usr/bin/env node

/**
 * Start Re-encoding System - Batch Processing
 * Process files in small batches to avoid timeouts
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
 * Get a batch of files that need re-encoding
 */
async function getBatchOfFilesNeedingReencoding(limit = 10) {
  console.log(`🔍 Finding batch of ${limit} files needing re-encoding...`);
  
  const query = `
    SELECT 
      f.id,
      f.original_filename,
      f.status,
      f.uploaded_at,
      f.raw_lines_count,
      COALESCE(jsonb_count.count, 0) as jsonb_records,
      COALESCE(tddf_count.count, 0) as tddf_records,
      CASE 
        WHEN COALESCE(jsonb_count.count, 0) > 0 AND COALESCE(tddf_count.count, 0) = 0 THEN 'needs_tddf_encoding'
        WHEN COALESCE(jsonb_count.count, 0) = 0 AND COALESCE(tddf_count.count, 0) > 0 THEN 'needs_jsonb_encoding'
        WHEN COALESCE(jsonb_count.count, 0) = 0 AND COALESCE(tddf_count.count, 0) = 0 THEN 'needs_full_encoding'
        ELSE 'complete'
      END as encoding_status
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
    ORDER BY f.uploaded_at DESC
    LIMIT $1;
  `;
  
  const result = await pool.query(query, [limit]);
  return result.rows;
}

/**
 * Reset file for re-processing
 */
async function resetFileForReprocessing(fileId, filename) {
  console.log(`🔄 Resetting ${filename} for re-processing...`);
  
  // Clear existing data
  await pool.query(`DELETE FROM ${getTableName('tddf_records')} WHERE source_file_id = $1`, [fileId]);
  await pool.query(`DELETE FROM ${getTableName('tddf_jsonb')} WHERE filename = $1`, [filename]);
  await pool.query(`DELETE FROM ${getTableName('tddf_batch_headers')} WHERE source_file_id = $1`, [fileId]);
  await pool.query(`DELETE FROM ${getTableName('tddf_purchasing_extensions')} WHERE source_file_id = $1`, [fileId]);
  
  // Reset file status
  const resetQuery = `
    UPDATE ${getTableName('uploaded_files')} 
    SET 
      status = 'uploaded',
      processing_status = 'uploaded',
      processed = false,
      processing_started_at = NULL,
      processing_completed_at = NULL,
      processing_errors = NULL,
      records_processed = 0,
      records_skipped = 0,
      records_with_errors = 0,
      processing_notes = COALESCE(processing_notes, '') || E'\n[RE-ENCODING] Reset for comprehensive re-encoding on ' || NOW()::text
    WHERE id = $1;
  `;
  
  await pool.query(resetQuery, [fileId]);
  console.log(`   ✅ File reset and queued for processing`);
}

/**
 * Process a single batch
 */
async function processBatch(batchSize = 10) {
  console.log(`\n🚀 STARTING BATCH RE-ENCODING (${batchSize} files)`);
  console.log(`==========================================`);
  
  try {
    const files = await getBatchOfFilesNeedingReencoding(batchSize);
    
    if (files.length === 0) {
      console.log(`✅ No files need re-encoding. All data is complete!`);
      return { processed: 0, complete: true };
    }
    
    console.log(`📋 Found ${files.length} files to re-encode:`);
    files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.original_filename} (${file.encoding_status})`);
      console.log(`      JSONB: ${file.jsonb_records}, TDDF: ${file.tddf_records}`);
    });
    
    console.log(`\n🔄 Processing batch...`);
    
    for (const file of files) {
      await resetFileForReprocessing(file.id, file.original_filename);
    }
    
    console.log(`\n✅ Batch processing complete!`);
    console.log(`📊 Files processed: ${files.length}`);
    console.log(`🔧 Files are now queued for automated processing by MMS Watcher`);
    
    return { processed: files.length, complete: false };
    
  } catch (error) {
    console.error(`❌ Batch processing error:`, error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const batchSize = parseInt(process.argv[2]) || 10;
  
  console.log(`🎯 BATCH RE-ENCODING SYSTEM`);
  console.log(`Processing ${batchSize} files at a time`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  try {
    const result = await processBatch(batchSize);
    
    if (result.complete) {
      console.log(`\n🎉 ALL FILES COMPLETE - NO RE-ENCODING NEEDED`);
    } else {
      console.log(`\n⏭️  BATCH COMPLETE - RUN AGAIN FOR NEXT BATCH`);
      console.log(`   Run: node start-reencoding.cjs ${batchSize}`);
      console.log(`   Monitor progress in dashboard and MMS Watcher logs`);
    }
    
  } catch (error) {
    console.error(`❌ System error:`, error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { processBatch, getBatchOfFilesNeedingReencoding };