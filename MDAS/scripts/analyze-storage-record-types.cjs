#!/usr/bin/env node

const { Pool } = require('pg');
const { Client } = require('@replit/object-storage');

async function analyzeStorageRecordTypes() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const storageClient = new Client();
  
  console.log('🔍 Starting storage record type analysis...');
  
  try {
    // Get all storage objects from master keys database
    const masterKeysResult = await pool.query(`
      SELECT object_key, original_filename, file_size, line_count, upload_id
      FROM dev_master_object_keys 
      WHERE processing_status = 'complete'
      ORDER BY file_size DESC
      LIMIT 50
    `);
    
    console.log(`📋 Found ${masterKeysResult.rows.length} storage objects to analyze`);
    
    let totalFilesAnalyzed = 0;
    let totalRecordsAnalyzed = 0;
    const recordTypeBreakdown = {}; // Dynamic tracking of all record types
    
    const fileAnalysis = [];
    
    for (const storageObj of masterKeysResult.rows) {
      try {
        console.log(`📄 Analyzing: ${storageObj.original_filename} (${storageObj.line_count} lines)`);
        
        // Get file content from storage
        const downloadResult = await storageClient.downloadAsText(storageObj.object_key);
        
        let fileContent;
        if (downloadResult && downloadResult.ok && downloadResult.value) {
          fileContent = downloadResult.value;
        } else if (typeof downloadResult === 'string') {
          fileContent = downloadResult;
        } else {
          console.log(`⚠️ Could not read content for ${storageObj.original_filename}`);
          continue;
        }
        
        const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
        
        // Count record types in this file
        const fileRecordTypes = {};
        
        for (const line of lines) {
          if (line.length >= 19) {
            const recordType = line.substring(17, 19); // Positions 18-19 (0-based)
            
            // Initialize record type counters if not seen before
            if (!fileRecordTypes[recordType]) {
              fileRecordTypes[recordType] = 0;
            }
            if (!recordTypeBreakdown[recordType]) {
              recordTypeBreakdown[recordType] = 0;
            }
            
            fileRecordTypes[recordType]++;
            recordTypeBreakdown[recordType]++;
            totalRecordsAnalyzed++;
          }
        }
        
        // Store file analysis
        fileAnalysis.push({
          filename: storageObj.original_filename,
          object_key: storageObj.object_key,
          file_size: storageObj.file_size,
          line_count: storageObj.line_count,
          upload_id: storageObj.upload_id,
          record_types: fileRecordTypes,
          total_records: Object.values(fileRecordTypes).reduce((a, b) => a + b, 0)
        });
        
        totalFilesAnalyzed++;
        
        // Update master object keys with record type breakdown
        await pool.query(`
          UPDATE dev_master_object_keys 
          SET metadata = jsonb_set(
            COALESCE(metadata, '{}'),
            '{record_type_breakdown}',
            $1::jsonb
          ),
          last_modified_at = NOW()
          WHERE object_key = $2
        `, [JSON.stringify(fileRecordTypes), storageObj.object_key]);
        
      } catch (fileError) {
        console.log(`❌ Error analyzing ${storageObj.original_filename}:`, fileError.message);
      }
    }
    
    // Print comprehensive summary
    console.log('\n📊 STORAGE RECORD TYPE ANALYSIS COMPLETE');
    console.log('='.repeat(50));
    console.log(`Files Analyzed: ${totalFilesAnalyzed}`);
    console.log(`Total Records: ${totalRecordsAnalyzed.toLocaleString()}`);
    console.log(`Average Records per File: ${Math.round(totalRecordsAnalyzed / totalFilesAnalyzed).toLocaleString()}`);
    
    console.log('\n🏷️ RECORD TYPE BREAKDOWN:');
    // Sort record types by count (descending) for better readability
    const sortedRecordTypes = Object.entries(recordTypeBreakdown)
      .sort(([,a], [,b]) => b - a);
    
    sortedRecordTypes.forEach(([type, count]) => {
      const percentage = ((count / totalRecordsAnalyzed) * 100).toFixed(1);
      const description = getRecordTypeDescription(type);
      console.log(`   ${type}: ${count.toLocaleString()} records (${percentage}%) - ${description}`);
    });
    
    function getRecordTypeDescription(type) {
      const descriptions = {
        'DT': 'Detail Transaction',
        'BH': 'Batch Header',
        'P1': 'Purchasing Card 1',
        'P2': 'Purchasing Card 2', 
        'E1': 'Electronic Check',
        'G2': 'General 2',
        'AD': 'Adjustment',
        'TH': 'Transaction Header',
        'TF': 'Transaction Footer',
        'FH': 'File Header',
        'FF': 'File Footer'
      };
      return descriptions[type] || 'Unknown Type';
    }
    
    console.log('\n📋 TOP FILES BY RECORD COUNT:');
    fileAnalysis
      .sort((a, b) => b.total_records - a.total_records)
      .slice(0, 10)
      .forEach((file, i) => {
        console.log(`   ${i+1}. ${file.filename}`);
        console.log(`      Records: ${file.total_records.toLocaleString()} | Size: ${(file.file_size / 1024 / 1024).toFixed(1)}MB`);
        
        // Show top 5 record types for this file
        const topTypes = Object.entries(file.record_types)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => `${type}(${count})`)
          .join(' ');
        console.log(`      Types: ${topTypes}`);
      });
    
    console.log(`\n✅ Record type analysis completed and logged to master object keys database!`);
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await pool.end();
  }
}

analyzeStorageRecordTypes().catch(console.error);