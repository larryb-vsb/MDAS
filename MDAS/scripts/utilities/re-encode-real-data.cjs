#!/usr/bin/env node

/**
 * Re-encode the TDDF file with actual content instead of test data
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Neon config for WebSocket
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

async function reEncodeWithRealData() {
  console.log('🔄 Re-encoding TDDF file with real data');
  
  const uploadId = 'uploader_1753770043406_rxjr75vpv';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // 1. Get the real file content from Replit Object Storage
    console.log('\n📁 Step 1: Fetching actual file content...');
    
    const response = await fetch('http://localhost:5000/api/uploader/' + uploadId + '/content', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Failed to fetch file content:', response.status, response.statusText);
      return false;
    }
    
    const fileContent = await response.text();
    console.log(`✅ Retrieved file content: ${fileContent.length} characters`);
    console.log('📋 First 200 characters:', fileContent.substring(0, 200));
    
    // 2. Parse the real TDDF lines
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
    console.log(`\n📊 Step 2: Processing ${lines.length} real TDDF lines...`);
    
    // 3. Clear existing test data
    console.log('\n🗑️ Step 3: Clearing test data...');
    await pool.query(`
      DELETE FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1
    `, [uploadId]);
    
    console.log('✅ Cleared existing test records');
    
    // 4. Process real TDDF lines
    console.log('\n🔄 Step 4: Encoding real TDDF data...');
    
    const recordsToInsert = [];
    
    for (let i = 0; i < lines.length && i < 50; i++) { // Process first 50 lines for testing
      const line = lines[i];
      const lineNumber = i + 1;
      
      // Extract record type (first 2 characters)
      const recordType = line.substring(0, 2);
      
      // Extract basic fields based on record type
      let extractedFields = {};
      
      if (recordType === 'DT') {
        // DT record - extract key transaction fields
        extractedFields = {
          recordType: 'DT',
          merchantAccountNumber: line.substring(2, 22).trim(),
          transactionAmount: parseFloat(line.substring(101, 112)) / 100, // Amount in cents
          transactionDate: formatTddfDate(line.substring(90, 98)),
          authorizationNumber: line.substring(36, 42).trim(),
          cardType: line.substring(187, 188),
          recordIdentifier: `DT-${lineNumber}`
        };
      } else if (recordType === 'BH') {
        // BH record - batch header
        extractedFields = {
          recordType: 'BH',
          batchDate: formatTddfDate(line.substring(90, 98)),
          batchId: line.substring(2, 22).trim(),
          recordIdentifier: `BH-${lineNumber}`
        };
      } else {
        // Other record types
        extractedFields = {
          recordType: recordType,
          recordIdentifier: `${recordType}-${lineNumber}`
        };
      }
      
      recordsToInsert.push({
        upload_id: uploadId,
        record_type: recordType,
        record_data: {
          rawLine: line,
          lineNumber: lineNumber,
          recordType: recordType,
          extractedFields: extractedFields
        }
      });
    }
    
    // 5. Insert real data
    console.log(`\n💾 Step 5: Inserting ${recordsToInsert.length} real records...`);
    
    for (const record of recordsToInsert) {
      await pool.query(`
        INSERT INTO dev_uploader_tddf_jsonb_records (
          upload_id, record_type, record_data, processing_status, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [
        record.upload_id,
        record.record_type,
        JSON.stringify(record.record_data),
        'completed'
      ]);
    }
    
    console.log('✅ Inserted real TDDF records');
    
    // 6. Verify the results
    console.log('\n🔍 Step 6: Verifying results...');
    
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        record_type,
        record_data->>'rawLine' as sample_line
      FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1 
      GROUP BY record_type, record_data->>'rawLine'
      ORDER BY record_type
      LIMIT 5
    `, [uploadId]);
    
    console.log('📊 Verification results:');
    verifyResult.rows.forEach(row => {
      console.log(`   ${row.record_type}: ${row.total} record(s)`);
      console.log(`   Sample: ${row.sample_line?.substring(0, 60)}...`);
    });
    
    console.log('\n🎉 SUCCESS: Re-encoded with real TDDF data!');
    console.log('Now the JSON viewer should show actual merchant account numbers and transaction data.');
    
    return true;
    
  } catch (error) {
    console.error('💥 Re-encoding failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  } finally {
    await pool.end();
  }
}

// Helper function to format TDDF dates
function formatTddfDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return null;
  
  const month = dateStr.substring(0, 2);
  const day = dateStr.substring(2, 4);
  const year = dateStr.substring(4, 8);
  
  return `${year}-${month}-${day}`;
}

// Run the re-encoding
reEncodeWithRealData().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});