#!/usr/bin/env node

/**
 * Manual TDDF Encoding Test
 * Direct function call to test encoding process
 */

// Import required modules
const { encodeTddfToJsonbDirect } = require('./server/tddf-json-encoder.ts');
const { db } = require('./server/db.ts');

async function testEncoding() {
  console.log('🧪 Starting Manual TDDF Encoding Test');
  
  const uploadId = 'uploader_1753770043406_rxjr75vpv';
  console.log(`📁 Testing file: ${uploadId}`);
  
  try {
    // Step 1: Get file content from storage
    console.log('📖 Reading file content...');
    
    // Step 2: Call encoding function directly
    console.log('🔄 Starting encoding process...');
    
    const result = await encodeTddfToJsonbDirect(uploadId);
    
    console.log('✅ Encoding completed!');
    console.log(`📊 Results:`, result);
    
    // Step 3: Verify JSONB records
    console.log('🔍 Verifying JSONB records...');
    
    const records = await db.query(
      'SELECT COUNT(*) as count FROM dev_uploader_tddf_jsonb_records WHERE upload_id = $1',
      [uploadId]
    );
    
    console.log(`📈 Records created: ${records.rows[0].count}`);
    
    if (records.rows[0].count >= 29) {
      console.log('🎉 SUCCESS! Test completed successfully');
      return true;
    } else {
      console.log('❌ Insufficient records created');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run test
testEncoding().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});