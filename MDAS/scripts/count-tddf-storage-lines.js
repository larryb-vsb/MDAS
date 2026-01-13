#!/usr/bin/env node

// TDDF Storage Line Counter with Record Type Analysis
// Counts lines in TDDF files stored in Replit Object Storage with detailed record type breakdown

import { getClient as getObjectStorageClient } from '@replit/object-storage';
import { db } from '../server/db.ts';
import { getTableName } from '../server/database-helpers.ts';

class TddfStorageLineCounter {
  constructor() {
    this.objectStorage = getObjectStorageClient();
    this.results = {
      totalFiles: 0,
      totalLines: 0,
      recordTypes: {},
      fileDetails: [],
      errors: []
    };
  }

  // Parse TDDF record type from line (positions 18-19)
  parseRecordType(line) {
    if (!line || line.length < 19) return 'UNKNOWN';
    return line.substring(17, 19).trim() || 'UNKNOWN';
  }

  // Analyze single TDDF file content
  async analyzeFileContent(content, filename) {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    const fileResult = {
      filename,
      totalLines: lines.length,
      recordTypes: {},
      errors: []
    };

    for (const line of lines) {
      try {
        const recordType = this.parseRecordType(line);
        fileResult.recordTypes[recordType] = (fileResult.recordTypes[recordType] || 0) + 1;
        this.results.recordTypes[recordType] = (this.results.recordTypes[recordType] || 0) + 1;
      } catch (error) {
        fileResult.errors.push(`Line parsing error: ${error.message}`);
      }
    }

    return fileResult;
  }

  // Get all TDDF files from uploader database
  async getTddfFiles() {
    const tableName = getTableName('uploader_uploads');
    
    const query = `
      SELECT id, filename, storage_key, current_phase, final_file_type, file_size, line_count
      FROM ${tableName}
      WHERE final_file_type = 'tddf'
      AND storage_key IS NOT NULL
      AND current_phase IN ('uploaded', 'identified', 'encoding', 'processing', 'completed', 'encoded')
      ORDER BY filename
    `;

    const result = await db.execute(query);
    return result.rows;
  }

  // Count lines and analyze record types for all TDDF files
  async countStorageLines() {
    console.log('[TDDF-COUNTER] Starting TDDF storage line counting with record type analysis...');
    
    try {
      // Get all TDDF files from database
      const tddfFiles = await this.getTddfFiles();
      console.log(`[TDDF-COUNTER] Found ${tddfFiles.length} TDDF files in storage`);
      
      if (tddfFiles.length === 0) {
        console.log('[TDDF-COUNTER] No TDDF files found in storage');
        return this.results;
      }

      // Process each file
      for (const file of tddfFiles) {
        try {
          console.log(`[TDDF-COUNTER] Processing ${file.filename} (${file.storage_key})`);
          
          // Get file content from object storage
          const fileContent = await this.objectStorage.downloadAsText(file.storage_key);
          
          // Analyze content
          const fileResult = await this.analyzeFileContent(fileContent, file.filename);
          
          // Add database metadata
          fileResult.uploadId = file.id;
          fileResult.storageKey = file.storage_key;
          fileResult.currentPhase = file.current_phase;
          fileResult.fileSize = file.file_size;
          fileResult.dbLineCount = file.line_count;
          
          // Compare actual vs database line count
          if (file.line_count && file.line_count !== fileResult.totalLines) {
            fileResult.lineCountMismatch = {
              database: file.line_count,
              actual: fileResult.totalLines,
              difference: fileResult.totalLines - file.line_count
            };
          }
          
          this.results.fileDetails.push(fileResult);
          this.results.totalFiles++;
          this.results.totalLines += fileResult.totalLines;
          
          console.log(`[TDDF-COUNTER] ${file.filename}: ${fileResult.totalLines} lines, Record Types: ${JSON.stringify(fileResult.recordTypes)}`);
          
        } catch (error) {
          console.error(`[TDDF-COUNTER] Error processing ${file.filename}:`, error.message);
          this.results.errors.push({
            filename: file.filename,
            error: error.message,
            storageKey: file.storage_key
          });
        }
      }

      return this.results;
      
    } catch (error) {
      console.error('[TDDF-COUNTER] Fatal error:', error);
      this.results.errors.push({ global: true, error: error.message });
      return this.results;
    }
  }

  // Display comprehensive results
  displayResults() {
    console.log('\n' + '='.repeat(80));
    console.log('TDDF STORAGE LINE COUNT & RECORD TYPE ANALYSIS');
    console.log('='.repeat(80));
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total Files: ${this.results.totalFiles}`);
    console.log(`   Total Lines: ${this.results.totalLines.toLocaleString()}`);
    console.log(`   Errors: ${this.results.errors.length}`);
    
    console.log(`\n📋 RECORD TYPE BREAKDOWN:`);
    const sortedRecordTypes = Object.entries(this.results.recordTypes)
      .sort(([,a], [,b]) => b - a);
    
    for (const [recordType, count] of sortedRecordTypes) {
      const percentage = ((count / this.results.totalLines) * 100).toFixed(2);
      console.log(`   ${recordType.padEnd(8)}: ${count.toLocaleString().padStart(10)} (${percentage}%)`);
    }
    
    console.log(`\n📁 FILE DETAILS:`);
    for (const file of this.results.fileDetails) {
      console.log(`\n   ${file.filename}`);
      console.log(`     Lines: ${file.totalLines.toLocaleString()}`);
      console.log(`     Phase: ${file.currentPhase}`);
      console.log(`     Size: ${file.fileSize ? (file.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
      
      if (file.lineCountMismatch) {
        console.log(`     ⚠️  Line Count Mismatch: DB=${file.lineCountMismatch.database}, Actual=${file.lineCountMismatch.actual} (${file.lineCountMismatch.difference > 0 ? '+' : ''}${file.lineCountMismatch.difference})`);
      }
      
      console.log(`     Record Types: ${Object.entries(file.recordTypes).map(([type, count]) => `${type}:${count}`).join(', ')}`);
      
      if (file.errors.length > 0) {
        console.log(`     Errors: ${file.errors.length}`);
      }
    }
    
    if (this.results.errors.length > 0) {
      console.log(`\n❌ ERRORS:`);
      for (const error of this.results.errors) {
        if (error.global) {
          console.log(`   Global Error: ${error.error}`);
        } else {
          console.log(`   ${error.filename}: ${error.error}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }

  // Export results to JSON file
  async exportResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tddf-storage-analysis-${timestamp}.json`;
    
    try {
      const fs = await import('fs');
      fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
      console.log(`\n💾 Results exported to: ${filename}`);
      return filename;
    } catch (error) {
      console.error('Error exporting results:', error.message);
      return null;
    }
  }
}

// Main execution
async function main() {
  const counter = new TddfStorageLineCounter();
  
  try {
    console.log('🚀 Starting TDDF Storage Analysis...\n');
    
    const results = await counter.countStorageLines();
    counter.displayResults();
    
    // Export results
    await counter.exportResults();
    
    console.log('\n✅ TDDF Storage Analysis Complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('Fatal error during analysis:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { TddfStorageLineCounter };