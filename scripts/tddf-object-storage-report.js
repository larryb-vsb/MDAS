#!/usr/bin/env node

/**
 * TDDF Object Storage Row Counting Report
 * 
 * This script generates a comprehensive report of raw TDDF rows in object storage
 * for each file, providing detailed metadata and totals.
 * 
 * Features:
 * - Counts raw lines in each TDDF file in object storage
 * - Provides file metadata (size, upload date, storage location)
 * - Generates summary statistics and totals
 * - Exports results to JSON and CSV formats
 * - Identifies file processing status
 */

import { Client } from '@replit/object-storage';
import { Pool } from '@neondatabase/serverless';
import fs from 'fs/promises';
import path from 'path';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Initialize Replit Object Storage client
const client = new Client();

// Environment detection
const isProduction = process.env.NODE_ENV === 'production' || 
                    process.env.REPLIT_DEPLOYMENT === 'true' || 
                    process.env.REPL_SLUG?.includes('.replit.app');

const getTableName = (baseName) => {
  return isProduction ? baseName : `dev_${baseName}`;
};

console.log(`🔍 TDDF Object Storage Row Counting Report`);
console.log(`📍 Environment: ${isProduction ? 'Production' : 'Development'}`);
console.log(`📅 Generated: ${new Date().toLocaleString()}`);
console.log('=' .repeat(80));

async function getUploadedFiles() {
  const tableName = getTableName('uploaded_files');
  console.log(`📋 Querying database table: ${tableName}`);
  
  const result = await pool.query(`
    SELECT 
      id,
      filename,
      upload_date,
      file_size,
      status,
      storage_key,
      raw_lines_count,
      processing_notes,
      file_type
    FROM ${tableName}
    WHERE file_type = 'tddf' 
      AND storage_key IS NOT NULL
      AND storage_key != ''
    ORDER BY upload_date DESC
  `);
  
  console.log(`📊 Found ${result.rows.length} TDDF files in database`);
  return result.rows;
}

async function countLinesInFile(storageKey) {
  try {
    console.log(`📄 Processing: ${storageKey}`);
    
    // Get file content from object storage
    const fileContent = await client.read(storageKey);
    
    if (!fileContent) {
      console.log(`⚠️  File not found in storage: ${storageKey}`);
      return {
        lineCount: 0,
        fileSize: 0,
        error: 'File not found in object storage',
        status: 'missing'
      };
    }
    
    // Convert buffer to string and count lines
    const content = fileContent.toString('utf-8');
    const lines = content.split('\n');
    
    // Filter out empty lines
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    // Calculate file size
    const fileSize = Buffer.byteLength(content, 'utf-8');
    
    // Analyze record types (first 2 characters of each line)
    const recordTypes = {};
    nonEmptyLines.forEach(line => {
      if (line.length >= 2) {
        const recordType = line.substring(0, 2);
        recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
      }
    });
    
    console.log(`✅ ${storageKey}: ${nonEmptyLines.length} lines, ${fileSize} bytes`);
    
    return {
      lineCount: nonEmptyLines.length,
      totalLines: lines.length,
      fileSize,
      recordTypes,
      status: 'success',
      error: null
    };
    
  } catch (error) {
    console.error(`❌ Error processing ${storageKey}:`, error.message);
    return {
      lineCount: 0,
      fileSize: 0,
      error: error.message,
      status: 'error'
    };
  }
}

async function generateReport() {
  const startTime = Date.now();
  
  try {
    // Get all TDDF files from database
    const files = await getUploadedFiles();
    
    if (files.length === 0) {
      console.log('📭 No TDDF files found in database');
      return;
    }
    
    console.log(`\n🔄 Processing ${files.length} TDDF files...`);
    console.log('-'.repeat(80));
    
    const report = {
      metadata: {
        generated: new Date().toISOString(),
        environment: isProduction ? 'production' : 'development',
        totalFiles: files.length,
        processingTime: null
      },
      summary: {
        totalRawLines: 0,
        totalFileSize: 0,
        successfulFiles: 0,
        errorFiles: 0,
        missingFiles: 0,
        recordTypeTotals: {}
      },
      files: []
    };
    
    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`[${i + 1}/${files.length}] ${file.filename}`);
      
      // Count lines in object storage
      const lineCount = await countLinesInFile(file.storage_key);
      
      // Compare database vs actual count
      const dbLineCount = file.raw_lines_count || 0;
      const actualLineCount = lineCount.lineCount;
      const countMismatch = dbLineCount !== actualLineCount;
      
      const fileReport = {
        id: file.id,
        filename: file.filename,
        uploadDate: file.upload_date,
        storageKey: file.storage_key,
        status: file.status,
        database: {
          fileSize: file.file_size,
          rawLinesCount: dbLineCount,
          processingNotes: file.processing_notes
        },
        objectStorage: {
          lineCount: actualLineCount,
          totalLines: lineCount.totalLines,
          fileSize: lineCount.fileSize,
          recordTypes: lineCount.recordTypes,
          status: lineCount.status,
          error: lineCount.error
        },
        analysis: {
          countMismatch,
          sizeMismatch: file.file_size !== lineCount.fileSize,
          dataIntegrity: !countMismatch && !lineCount.error ? 'good' : 'issues'
        }
      };
      
      report.files.push(fileReport);
      
      // Update summary
      if (lineCount.status === 'success') {
        report.summary.successfulFiles++;
        report.summary.totalRawLines += actualLineCount;
        report.summary.totalFileSize += lineCount.fileSize;
        
        // Aggregate record types
        if (lineCount.recordTypes) {
          for (const [recordType, count] of Object.entries(lineCount.recordTypes)) {
            report.summary.recordTypeTotals[recordType] = 
              (report.summary.recordTypeTotals[recordType] || 0) + count;
          }
        }
      } else if (lineCount.status === 'missing') {
        report.summary.missingFiles++;
      } else {
        report.summary.errorFiles++;
      }
      
      // Add delay to prevent overwhelming the system
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const processingTime = Date.now() - startTime;
    report.metadata.processingTime = processingTime;
    
    // Display summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TDDF OBJECT STORAGE ROW COUNT REPORT SUMMARY');
    console.log('='.repeat(80));
    console.log(`📁 Total Files Processed: ${report.metadata.totalFiles}`);
    console.log(`✅ Successful: ${report.summary.successfulFiles}`);
    console.log(`❌ Errors: ${report.summary.errorFiles}`);
    console.log(`📭 Missing: ${report.summary.missingFiles}`);
    console.log(`📝 Total Raw Lines: ${report.summary.totalRawLines.toLocaleString()}`);
    console.log(`💾 Total File Size: ${(report.summary.totalFileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`⏱️  Processing Time: ${(processingTime / 1000).toFixed(2)} seconds`);
    
    // Record type breakdown
    if (Object.keys(report.summary.recordTypeTotals).length > 0) {
      console.log('\n📋 Record Type Breakdown:');
      for (const [recordType, count] of Object.entries(report.summary.recordTypeTotals)) {
        console.log(`   ${recordType}: ${count.toLocaleString()} lines`);
      }
    }
    
    // Save report to files
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = './reports';
    
    try {
      await fs.mkdir(reportDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    // Save JSON report
    const jsonFile = path.join(reportDir, `tddf-object-storage-report-${timestamp}.json`);
    await fs.writeFile(jsonFile, JSON.stringify(report, null, 2));
    console.log(`\n💾 JSON Report saved: ${jsonFile}`);
    
    // Save CSV report
    const csvFile = path.join(reportDir, `tddf-object-storage-report-${timestamp}.csv`);
    const csvContent = generateCSV(report);
    await fs.writeFile(csvFile, csvContent);
    console.log(`💾 CSV Report saved: ${csvFile}`);
    
    // Show data integrity issues
    const issueFiles = report.files.filter(f => f.analysis.dataIntegrity === 'issues');
    if (issueFiles.length > 0) {
      console.log(`\n⚠️  ${issueFiles.length} files have data integrity issues:`);
      issueFiles.forEach(file => {
        console.log(`   ${file.filename}: ${file.objectStorage.error || 'Count mismatch'}`);
      });
    }
    
    console.log('\n✅ TDDF Object Storage Report Complete!');
    
  } catch (error) {
    console.error('❌ Error generating report:', error);
    throw error;
  }
}

function generateCSV(report) {
  const headers = [
    'Filename',
    'Upload Date',
    'Storage Key',
    'Status',
    'DB Raw Lines',
    'Actual Raw Lines',
    'Total Lines',
    'File Size (MB)',
    'Record Types',
    'Count Mismatch',
    'Data Integrity',
    'Error'
  ];
  
  const rows = [headers.join(',')];
  
  report.files.forEach(file => {
    const recordTypes = file.objectStorage.recordTypes ? 
      Object.entries(file.objectStorage.recordTypes)
        .map(([type, count]) => `${type}:${count}`)
        .join(';') : '';
    
    const row = [
      `"${file.filename}"`,
      file.uploadDate,
      `"${file.storageKey}"`,
      file.status,
      file.database.rawLinesCount,
      file.objectStorage.lineCount,
      file.objectStorage.totalLines,
      (file.objectStorage.fileSize / 1024 / 1024).toFixed(2),
      `"${recordTypes}"`,
      file.analysis.countMismatch,
      file.analysis.dataIntegrity,
      `"${file.objectStorage.error || ''}"`
    ];
    
    rows.push(row.join(','));
  });
  
  return rows.join('\n');
}

// Run the report
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReport()
    .then(() => {
      console.log('\n🎉 Report generation completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Report generation failed:', error);
      process.exit(1);
    });
}

export { generateReport };