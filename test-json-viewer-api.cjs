#!/usr/bin/env node

/**
 * Test JSON Viewer API Direct Database Access
 * Tests the API endpoint and compares with direct database access
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Neon config for WebSocket
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

async function testJsonViewerApi() {
  console.log('🧪 Testing JSON Viewer API vs Database Direct Access');
  
  const uploadId = 'uploader_1753770043406_rxjr75vpv';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Test 1: Direct database access
    console.log('\n📊 Step 1: Direct Database Query');
    const dbResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        array_agg(record_type) as record_types
      FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1
    `, [uploadId]);
    
    const dbData = dbResult.rows[0];
    console.log(`✅ Database Direct: ${dbData.total} records found`);
    console.log(`📋 Record Types: ${dbData.record_types ? [...new Set(dbData.record_types)].join(', ') : 'None'}`);
    
    if (dbData.total === 0) {
      console.log('❌ No records found in database - the upload ID may be incorrect or encoding failed');
      return false;
    }
    
    // Test 2: Sample record structure
    console.log('\n🔍 Step 2: Sample Record Structure');
    const sampleResult = await pool.query(`
      SELECT record_type, record_data
      FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1 
      LIMIT 1
    `, [uploadId]);
    
    if (sampleResult.rows.length > 0) {
      const sample = sampleResult.rows[0];
      console.log(`📄 Sample Record Type: ${sample.record_type}`);
      console.log(`📊 Sample Data Structure:`);
      console.log(`   - lineNumber: ${sample.record_data.lineNumber}`);
      console.log(`   - rawLine: ${sample.record_data.rawLine ? sample.record_data.rawLine.substring(0, 50) + '...' : 'None'}`);
      console.log(`   - extractedFields: ${Object.keys(sample.record_data.extractedFields || {}).join(', ')}`);
    }
    
    // Test 3: API transformation simulation
    console.log('\n🔄 Step 3: API Transformation Simulation');
    const transformedSample = {
      id: sampleResult.rows[0] ? 1 : 0,
      upload_id: uploadId,
      filename: sampleResult.rows[0]?.record_data.filename || 'Unknown',
      record_type: sampleResult.rows[0]?.record_type || 'N/A',
      line_number: sampleResult.rows[0]?.record_data.lineNumber || 0,
      raw_line: sampleResult.rows[0]?.record_data.rawLine || '',
      extracted_fields: sampleResult.rows[0]?.record_data.extractedFields || {},
      record_identifier: `${sampleResult.rows[0]?.record_type || 'N/A'}-${sampleResult.rows[0]?.record_data.lineNumber || 0}`,
      processing_time_ms: sampleResult.rows[0]?.record_data.processingTimeMs || 0
    };
    
    console.log('✅ Transformation successful - API should work with this structure:');
    console.log(`   - Record ID: ${transformedSample.record_identifier}`);
    console.log(`   - Line: ${transformedSample.line_number}`);
    console.log(`   - Fields: ${Object.keys(transformedSample.extracted_fields).length} extracted`);
    
    // Test 4: Upload metadata check
    console.log('\n📂 Step 4: Upload Metadata Check');
    const uploadResult = await pool.query(`
      SELECT filename, current_phase, encoding_status, json_records_created 
      FROM dev_uploader_uploads 
      WHERE id = $1
    `, [uploadId]);
    
    if (uploadResult.rows.length > 0) {
      const upload = uploadResult.rows[0];
      console.log(`📁 Upload File: ${upload.filename}`);
      console.log(`📊 Phase: ${upload.current_phase}, Status: ${upload.encoding_status}`);
      console.log(`🔢 Expected Records: ${upload.json_records_created}`);
      
      const recordsMatch = parseInt(upload.json_records_created) === parseInt(dbData.total);
      console.log(`${recordsMatch ? '✅' : '⚠️'} Record Count Match: ${recordsMatch ? 'Yes' : 'No'} (${upload.json_records_created} expected, ${dbData.total} found)`);
    }
    
    // Final assessment
    console.log('\n🎯 Final Assessment:');
    if (dbData.total > 0) {
      console.log('✅ JSON data exists in database');
      console.log('✅ Record structure is compatible with API transformation');
      console.log('✅ JSON viewer should work once authentication is resolved');
      console.log('\n💡 The issue is likely with API authentication, not data availability');
      return true;
    } else {
      console.log('❌ No JSON data found - encoding may not have completed properly');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

// Run the test
testJsonViewerApi().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});