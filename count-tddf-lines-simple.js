// Simple TDDF Line Counter
// Query database for TDDF files and show line counts with record type analysis

import { Client } from '@replit/object-storage';
import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Object storage client
const storageClient = new Client();

// Parse record type from TDDF line (positions 18-19)
function parseRecordType(line) {
  if (!line || line.length < 19) return 'UNKNOWN';
  return line.substring(17, 19).trim() || 'UNKNOWN';
}

// Analyze file content for record types
function analyzeContent(content) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const recordTypes = {};
  
  for (const line of lines) {
    const recordType = parseRecordType(line);
    recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
  }
  
  return {
    totalLines: lines.length,
    recordTypes
  };
}

async function main() {
  try {
    console.log('🔍 Counting TDDF lines in storage...\n');
    
    // Get environment and table name
    const isDev = process.env.NODE_ENV !== 'production';
    const tableName = isDev ? 'dev_uploader_uploads' : 'uploader_uploads';
    
    // Query for TDDF files
    const query = `
      SELECT id, filename, storage_key, current_phase, final_file_type, 
             file_size, line_count, created_at
      FROM ${tableName}
      WHERE final_file_type = 'tddf'
      AND storage_key IS NOT NULL
      AND current_phase IN ('uploaded', 'identified', 'encoding', 'processing', 'completed', 'encoded')
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query);
    const files = result.rows;
    
    console.log(`Found ${files.length} TDDF files in storage\n`);
    
    if (files.length === 0) {
      console.log('No TDDF files found in storage');
      return;
    }
    
    let totalFiles = 0;
    let totalLines = 0;
    let globalRecordTypes = {};
    let analysisCount = 0;
    const maxAnalysis = 10; // Limit to first 10 files for detailed analysis
    
    console.log('📊 FILE ANALYSIS:\n');
    
    for (const file of files) {
      totalFiles++;
      const dbLines = file.line_count || 0;
      totalLines += dbLines;
      
      console.log(`${file.filename}`);
      console.log(`  Phase: ${file.current_phase}`);
      console.log(`  DB Lines: ${dbLines.toLocaleString()}`);
      console.log(`  Size: ${file.file_size ? (file.file_size / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
      console.log(`  Storage: ${file.storage_key}`);
      
      // Do detailed analysis for first few files
      if (analysisCount < maxAnalysis && file.storage_key) {
        try {
          console.log(`  Analyzing content...`);
          const content = await storageClient.downloadAsText(file.storage_key);
          const analysis = analyzeContent(content);
          
          console.log(`  Actual Lines: ${analysis.totalLines.toLocaleString()}`);
          
          if (analysis.totalLines !== dbLines) {
            const diff = analysis.totalLines - dbLines;
            console.log(`  ⚠️  Mismatch: ${diff > 0 ? '+' : ''}${diff} lines`);
          }
          
          console.log(`  Record Types: ${Object.entries(analysis.recordTypes).map(([type, count]) => `${type}:${count}`).join(', ')}`);
          
          // Add to global count
          for (const [type, count] of Object.entries(analysis.recordTypes)) {
            globalRecordTypes[type] = (globalRecordTypes[type] || 0) + count;
          }
          
          analysisCount++;
          
        } catch (error) {
          console.log(`  ❌ Analysis failed: ${error.message}`);
        }
      }
      
      console.log('');
    }
    
    console.log('=' .repeat(60));
    console.log('📈 SUMMARY:');
    console.log(`Total Files: ${totalFiles}`);
    console.log(`Total Lines (DB): ${totalLines.toLocaleString()}`);
    console.log(`Files Analyzed: ${analysisCount}/${totalFiles}`);
    
    if (Object.keys(globalRecordTypes).length > 0) {
      console.log('\n📋 RECORD TYPES (from analyzed files):');
      const sortedTypes = Object.entries(globalRecordTypes).sort(([,a], [,b]) => b - a);
      for (const [type, count] of sortedTypes) {
        console.log(`  ${type}: ${count.toLocaleString()}`);
      }
    }
    
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();