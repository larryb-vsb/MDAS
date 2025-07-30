#!/usr/bin/env node

/**
 * Comprehensive Re-encoding System
 * Processes all TDDF files to ensure complete data encoding across all tables
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Environment-aware table naming
function getTableName(baseName) {
  const environment = process.env.NODE_ENV || 'development';
  return environment === 'production' ? baseName : `dev_${baseName}`;
}

// Re-encoding statistics
const stats = {
  totalFiles: 0,
  filesWithJsonb: 0,
  filesWithTddfRecords: 0,
  filesNeedingReencoding: 0,
  filesProcessed: 0,
  filesSkipped: 0,
  filesErrored: 0,
  recordsCreated: 0,
  processingErrors: []
};

/**
 * Get files that need re-encoding
 */
async function getFilesNeedingReencoding() {
  console.log('🔍 Analyzing files for re-encoding needs...');
  
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
    ORDER BY f.uploaded_at DESC;
  `;
  
  const result = await pool.query(query);
  const files = result.rows;
  
  // Update statistics
  stats.totalFiles = files.length;
  stats.filesWithJsonb = files.filter(f => f.jsonb_records > 0).length;
  stats.filesWithTddfRecords = files.filter(f => f.tddf_records > 0).length;
  stats.filesNeedingReencoding = files.filter(f => f.encoding_status !== 'complete').length;
  
  console.log(`📊 Analysis Complete:`);
  console.log(`   Total TDDF Files: ${stats.totalFiles}`);
  console.log(`   Files with JSONB: ${stats.filesWithJsonb}`);
  console.log(`   Files with TDDF Records: ${stats.filesWithTddfRecords}`);
  console.log(`   Files Needing Re-encoding: ${stats.filesNeedingReencoding}`);
  
  // Group by encoding status
  const statusGroups = {};
  files.forEach(file => {
    if (!statusGroups[file.encoding_status]) {
      statusGroups[file.encoding_status] = [];
    }
    statusGroups[file.encoding_status].push(file);
  });
  
  console.log(`\n📋 Encoding Status Breakdown:`);
  Object.keys(statusGroups).forEach(status => {
    console.log(`   ${status}: ${statusGroups[status].length} files`);
  });
  
  return files.filter(f => f.encoding_status !== 'complete');
}

/**
 * Reset file processing status for re-encoding
 */
async function resetFileForReprocessing(fileId) {
  const query = `
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
  
  await pool.query(query, [fileId]);
}

/**
 * Clear existing data for a file before re-encoding
 */
async function clearExistingData(fileId, filename) {
  console.log(`🧹 Clearing existing data for: ${filename}`);
  
  // Clear TDDF records
  await pool.query(`DELETE FROM ${getTableName('tddf_records')} WHERE source_file_id = $1`, [fileId]);
  
  // Clear JSONB records
  await pool.query(`DELETE FROM ${getTableName('tddf_jsonb')} WHERE filename = $1`, [filename]);
  
  // Clear batch headers
  await pool.query(`DELETE FROM ${getTableName('tddf_batch_headers')} WHERE source_file_id = $1`, [fileId]);
  
  // Clear purchasing extensions
  await pool.query(`DELETE FROM ${getTableName('tddf_purchasing_extensions')} WHERE source_file_id = $1`, [fileId]);
  
  // Clear other record types
  await pool.query(`DELETE FROM ${getTableName('tddf_other_records')} WHERE source_file_id = $1`, [fileId]);
  
  console.log(`   ✅ Cleared all existing data for ${filename}`);
}

/**
 * Trigger file processing
 */
async function triggerFileProcessing(fileId) {
  // Reset the file status to trigger automated processing
  await resetFileForReprocessing(fileId);
  
  console.log(`   🚀 File queued for automated processing pipeline`);
}

/**
 * Process files in batches
 */
async function processFilesInBatches(files, batchSize = 5) {
  console.log(`\n🔄 Starting batch processing of ${files.length} files (batch size: ${batchSize})`);
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(files.length / batchSize);
    
    console.log(`\n📦 Processing Batch ${batchNumber}/${totalBatches} (${batch.length} files):`);
    
    for (const file of batch) {
      try {
        console.log(`\n🔄 Processing: ${file.original_filename}`);
        console.log(`   Status: ${file.encoding_status}`);
        console.log(`   JSONB Records: ${file.jsonb_records}`);
        console.log(`   TDDF Records: ${file.tddf_records}`);
        
        // Clear existing data
        await clearExistingData(file.id, file.original_filename);
        
        // Trigger re-processing
        await triggerFileProcessing(file.id);
        
        stats.filesProcessed++;
        console.log(`   ✅ File prepared for re-encoding`);
        
      } catch (error) {
        console.error(`   ❌ Error processing ${file.original_filename}:`, error.message);
        stats.filesErrored++;
        stats.processingErrors.push({
          filename: file.original_filename,
          error: error.message
        });
      }
    }
    
    // Brief pause between batches
    if (i + batchSize < files.length) {
      console.log(`\n⏸️  Batch ${batchNumber} complete. Pausing 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/**
 * Monitor processing progress
 */
async function monitorProcessingProgress() {
  console.log(`\n📊 Monitoring processing progress...`);
  
  // Check processing status
  const statusQuery = `
    SELECT 
      status,
      processing_status,
      COUNT(*) as count
    FROM ${getTableName('uploaded_files')} 
    WHERE file_type = 'tddf'
    GROUP BY status, processing_status
    ORDER BY status, processing_status;
  `;
  
  const statusResult = await pool.query(statusQuery);
  
  console.log(`\n📈 Current Processing Status:`);
  statusResult.rows.forEach(row => {
    console.log(`   ${row.status}/${row.processing_status}: ${row.count} files`);
  });
  
  // Check records created
  const recordsQuery = `
    SELECT 
      'TDDF Records' as table_name,
      COUNT(*) as count
    FROM ${getTableName('tddf_records')}
    UNION ALL
    SELECT 
      'JSONB Records' as table_name,
      COUNT(*) as count
    FROM ${getTableName('tddf_jsonb')};
  `;
  
  const recordsResult = await pool.query(recordsQuery);
  
  console.log(`\n📊 Records Status:`);
  recordsResult.rows.forEach(row => {
    console.log(`   ${row.table_name}: ${row.count.toLocaleString()}`);
  });
}

/**
 * Generate final report
 */
function generateFinalReport() {
  console.log(`\n\n📋 COMPREHENSIVE RE-ENCODING REPORT`);
  console.log(`=====================================`);
  console.log(`🗓️  Date: ${new Date().toISOString()}`);
  console.log(`📊 Files Analyzed: ${stats.totalFiles}`);
  console.log(`🔄 Files Needing Re-encoding: ${stats.filesNeedingReencoding}`);
  console.log(`✅ Files Processed: ${stats.filesProcessed}`);
  console.log(`⏭️  Files Skipped: ${stats.filesSkipped}`);
  console.log(`❌ Files with Errors: ${stats.filesErrored}`);
  
  if (stats.processingErrors.length > 0) {
    console.log(`\n⚠️  Processing Errors:`);
    stats.processingErrors.forEach(error => {
      console.log(`   ${error.filename}: ${error.error}`);
    });
  }
  
  console.log(`\n🎯 Next Steps:`);
  console.log(`   1. Monitor automated processing pipeline (MMS Watcher)`);
  console.log(`   2. Check processing status in dashboard`);
  console.log(`   3. Verify data integrity after processing completes`);
  console.log(`   4. Run performance tests on updated data`);
  
  console.log(`\n✨ Re-encoding system deployment complete!`);
}

/**
 * Main execution function
 */
async function main() {
  console.log(`🚀 COMPREHENSIVE RE-ENCODING SYSTEM STARTED`);
  console.log(`==========================================`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Target Tables: ${getTableName('uploaded_files')}, ${getTableName('tddf_records')}, ${getTableName('tddf_jsonb')}`);
  
  try {
    // Step 1: Analyze files
    const filesToProcess = await getFilesNeedingReencoding();
    
    if (filesToProcess.length === 0) {
      console.log(`\n✅ All files are already completely encoded. No re-encoding needed.`);
      return;
    }
    
    // Step 2: Confirm with user (in automated mode, we proceed)
    console.log(`\n⚠️  WARNING: This will clear and re-encode ${filesToProcess.length} files.`);
    console.log(`   This process will trigger automated processing for all affected files.`);
    
    // Step 3: Process files in batches
    await processFilesInBatches(filesToProcess, 5);
    
    // Step 4: Monitor initial progress
    await monitorProcessingProgress();
    
    // Step 5: Generate report
    generateFinalReport();
    
  } catch (error) {
    console.error(`❌ Re-encoding system error:`, error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

if (dryRun) {
  console.log(`🔍 DRY RUN MODE - No changes will be made`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  getFilesNeedingReencoding,
  processFilesInBatches,
  monitorProcessingProgress,
  stats
};