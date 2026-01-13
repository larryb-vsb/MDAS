#!/usr/bin/env node

const { Pool } = require('pg');
const { Client } = require('@replit/object-storage');

async function updateStorageMetadataRecords() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const storageClient = new Client();
  
  console.log('🔍 Starting storage metadata record type update...');
  
  try {
    // Get all storage objects from master keys database
    const masterKeysResult = await pool.query(`
      SELECT object_key, original_filename, file_size, line_count, upload_id, metadata
      FROM dev_master_object_keys 
      WHERE processing_status = 'complete'
      ORDER BY file_size DESC
    `);
    
    console.log(`📋 Found ${masterKeysResult.rows.length} storage objects to update`);
    
    let totalUpdated = 0;
    const globalRecordStats = {
      totalFiles: 0,
      totalRecords: 0,
      recordTypes: {}
    };
    
    for (const storageObj of masterKeysResult.rows) {
      try {
        console.log(`📄 Processing: ${storageObj.original_filename}`);
        
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
        let totalFileRecords = 0;
        
        for (const line of lines) {
          if (line.length >= 19) {
            const recordType = line.substring(17, 19); // Positions 18-19 (0-based)
            
            // Initialize record type counters if not seen before
            if (!fileRecordTypes[recordType]) {
              fileRecordTypes[recordType] = 0;
            }
            if (!globalRecordStats.recordTypes[recordType]) {
              globalRecordStats.recordTypes[recordType] = 0;
            }
            
            fileRecordTypes[recordType]++;
            globalRecordStats.recordTypes[recordType]++;
            totalFileRecords++;
          }
        }
        
        // Calculate percentages for this file
        const fileRecordPercentages = {};
        Object.entries(fileRecordTypes).forEach(([type, count]) => {
          fileRecordPercentages[type] = {
            count: count,
            percentage: ((count / totalFileRecords) * 100).toFixed(1)
          };
        });
        
        // Build comprehensive metadata
        const updatedMetadata = {
          ...storageObj.metadata,
          record_type_breakdown: fileRecordTypes,
          record_type_analysis: {
            total_records: totalFileRecords,
            record_types_found: Object.keys(fileRecordTypes).length,
            record_percentages: fileRecordPercentages,
            primary_record_type: Object.entries(fileRecordTypes)
              .sort(([,a], [,b]) => b - a)[0][0],
            analysis_timestamp: new Date().toISOString()
          },
          file_analysis: {
            average_line_length: Math.round(fileContent.length / lines.length),
            total_characters: fileContent.length,
            actual_line_count: lines.length,
            file_encoding: 'UTF-8',
            last_analyzed: new Date().toISOString()
          }
        };
        
        // Update master object keys with comprehensive metadata
        await pool.query(`
          UPDATE dev_master_object_keys 
          SET metadata = $1,
              last_modified_at = NOW()
          WHERE object_key = $2
        `, [JSON.stringify(updatedMetadata), storageObj.object_key]);
        
        globalRecordStats.totalFiles++;
        globalRecordStats.totalRecords += totalFileRecords;
        totalUpdated++;
        
        console.log(`   ✅ Updated: ${Object.keys(fileRecordTypes).length} record types, ${totalFileRecords} total records`);
        
      } catch (fileError) {
        console.log(`❌ Error processing ${storageObj.original_filename}:`, fileError.message);
      }
    }
    
    // Store global statistics in a summary record
    await pool.query(`
      INSERT INTO dev_master_object_keys (
        object_key, original_filename, file_size, line_count, 
        processing_status, metadata, created_at, last_modified_at
      ) VALUES (
        'GLOBAL_STORAGE_ANALYSIS_SUMMARY', 
        'storage_analysis_summary.json',
        0, 0, 'complete',
        $1,
        NOW(), NOW()
      )
      ON CONFLICT (object_key) 
      DO UPDATE SET 
        metadata = $1,
        last_modified_at = NOW()
    `, [JSON.stringify({
      analysis_type: 'global_storage_summary',
      global_statistics: globalRecordStats,
      analysis_completed: new Date().toISOString(),
      files_analyzed: totalUpdated
    })]);
    
    // Print comprehensive summary
    console.log('\n📊 STORAGE METADATA UPDATE COMPLETE');
    console.log('='.repeat(50));
    console.log(`Files Updated: ${totalUpdated}`);
    console.log(`Total Records Analyzed: ${globalRecordStats.totalRecords.toLocaleString()}`);
    console.log(`Average Records per File: ${Math.round(globalRecordStats.totalRecords / globalRecordStats.totalFiles).toLocaleString()}`);
    
    console.log('\n🏷️ GLOBAL RECORD TYPE BREAKDOWN:');
    // Sort record types by count (descending) for better readability
    const sortedRecordTypes = Object.entries(globalRecordStats.recordTypes)
      .sort(([,a], [,b]) => b - a);
    
    sortedRecordTypes.forEach(([type, count]) => {
      const percentage = ((count / globalRecordStats.totalRecords) * 100).toFixed(1);
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
        'DR': 'Detail Record (Non-standard)',
        'TH': 'Transaction Header',
        'TF': 'Transaction Footer',
        'FH': 'File Header',
        'FF': 'File Footer'
      };
      return descriptions[type] || 'Unknown Type';
    }
    
    console.log(`\n✅ Storage metadata updated with comprehensive record type analysis!`);
    console.log(`📋 Global summary stored as GLOBAL_STORAGE_ANALYSIS_SUMMARY record`);
    
  } catch (error) {
    console.error('❌ Metadata update failed:', error);
  } finally {
    await pool.end();
  }
}

updateStorageMetadataRecords().catch(console.error);