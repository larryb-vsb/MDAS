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
    const recordTypeBreakdown = {
      DT: 0, // Detail Transaction
      BH: 0, // Batch Header  
      P1: 0, // Purchasing Card 1
      P2: 0, // Purchasing Card 2
      E1: 0, // Electronic Check
      G2: 0, // General 2
      AD: 0, // Adjustment
      OTHER: 0
    };
    
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
        const fileRecordTypes = {
          DT: 0, BH: 0, P1: 0, P2: 0, E1: 0, G2: 0, AD: 0, OTHER: 0
        };
        
        for (const line of lines) {
          if (line.length >= 19) {
            const recordType = line.substring(17, 19); // Positions 18-19 (0-based)
            
            if (fileRecordTypes.hasOwnProperty(recordType)) {
              fileRecordTypes[recordType]++;
              recordTypeBreakdown[recordType]++;
            } else {
              fileRecordTypes.OTHER++;
              recordTypeBreakdown.OTHER++;
            }
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
    Object.entries(recordTypeBreakdown).forEach(([type, count]) => {
      const percentage = ((count / totalRecordsAnalyzed) * 100).toFixed(1);
      console.log(`   ${type}: ${count.toLocaleString()} records (${percentage}%)`);
    });
    
    console.log('\n📋 TOP FILES BY RECORD COUNT:');
    fileAnalysis
      .sort((a, b) => b.total_records - a.total_records)
      .slice(0, 10)
      .forEach((file, i) => {
        console.log(`   ${i+1}. ${file.filename}`);
        console.log(`      Records: ${file.total_records.toLocaleString()} | Size: ${(file.file_size / 1024 / 1024).toFixed(1)}MB`);
        console.log(`      Types: DT(${file.record_types.DT}) BH(${file.record_types.BH}) P1(${file.record_types.P1}) P2(${file.record_types.P2}) OTHER(${file.record_types.OTHER})`);
      });
    
    console.log(`\n✅ Record type analysis completed and logged to master object keys database!`);
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await pool.end();
  }
}

analyzeStorageRecordTypes().catch(console.error);