#!/usr/bin/env node

/**
 * Test Encoding Fix - Verify JSONB Database Insertion
 * Tests the fix for upload_id null value issue in dev_tddf_jsonb table
 */

import { execSync } from 'child_process';

console.log('[ENCODING-FIX-TEST] Testing JSONB database insertion fix...');

// Find an identified file to test with
const curlCommand = `curl -s -H "Cookie: $(cat cookies.txt)" "http://localhost:5000/api/uploader" | jq -r '.[] | select(.currentPhase == "identified" and .finalFileType == "tddf") | .id' | head -1`;

try {
  const uploadId = execSync(curlCommand, { encoding: 'utf8' }).trim();
  
  if (!uploadId || uploadId === 'null') {
    console.log('[ENCODING-FIX-TEST] ❌ No identified TDDF files found for testing');
    console.log('[ENCODING-FIX-TEST] Looking for any encoded files to verify database content...');
    
    // Check if there are any records in the database
    const checkDbCommand = `curl -s -H "Cookie: $(cat cookies.txt)" "http://localhost:5000/api/uploader/storage-config"`;
    const dbResult = execSync(checkDbCommand, { encoding: 'utf8' });
    console.log('[ENCODING-FIX-TEST] Database status:', dbResult);
    
    process.exit(0);
  }
  
  console.log(`[ENCODING-FIX-TEST] Testing encoding for upload: ${uploadId}`);
  
  // Test encoding API
  const encodeCommand = `curl -s -X POST -H "Cookie: $(cat cookies.txt)" -H "Content-Type: application/json" \\
    -d '{"strategy": "tddf_json"}' \\
    "http://localhost:5000/api/uploader/${uploadId}/encode"`;
  
  console.log('[ENCODING-FIX-TEST] Sending encoding request...');
  const encodeResult = execSync(encodeCommand, { encoding: 'utf8' });
  
  try {
    const result = JSON.parse(encodeResult);
    console.log('[ENCODING-FIX-TEST] ✅ Encoding response received:');
    console.log('- Status:', result.status || 'unknown');
    console.log('- Message:', result.message || 'no message');
    console.log('- Records:', result.jsonSample ? result.jsonSample.length : 0);
    console.log('- Errors:', result.results ? result.results.errors.length : 'unknown');
    
    if (result.results && result.results.errors.length > 0) {
      console.log('[ENCODING-FIX-TEST] ❌ Encoding errors found:');
      result.results.errors.forEach(error => {
        console.log('  -', error);
      });
    } else {
      console.log('[ENCODING-FIX-TEST] ✅ No encoding errors - database insertion likely successful');
    }
    
    // Check JSONB data endpoint
    console.log('[ENCODING-FIX-TEST] Checking JSONB data endpoint...');
    const jsonbCommand = `curl -s -H "Cookie: $(cat cookies.txt)" "http://localhost:5000/api/uploader/${uploadId}/jsonb-data"`;
    const jsonbResult = execSync(jsonbCommand, { encoding: 'utf8' });
    
    try {
      const jsonbData = JSON.parse(jsonbResult);
      console.log('[ENCODING-FIX-TEST] JSONB data check:');
      console.log('- Total records:', jsonbData.pagination ? jsonbData.pagination.total : 'unknown');
      console.log('- Records retrieved:', jsonbData.data ? jsonbData.data.length : 0);
      
      if (jsonbData.data && jsonbData.data.length > 0) {
        console.log('[ENCODING-FIX-TEST] ✅ SUCCESS: JSONB records found in database!');
        console.log('- Sample record has upload_id:', jsonbData.data[0].upload_id ? '✅' : '❌');
      } else {
        console.log('[ENCODING-FIX-TEST] ❌ No JSONB records found - database insertion may have failed');
      }
    } catch (parseError) {
      console.log('[ENCODING-FIX-TEST] ❌ Failed to parse JSONB response:', parseError.message);
    }
    
  } catch (parseError) {
    console.log('[ENCODING-FIX-TEST] ❌ Failed to parse encoding response:', parseError.message);
    console.log('Raw response:', encodeResult);
  }
  
} catch (error) {
  console.error('[ENCODING-FIX-TEST] ❌ Test failed:', error.message);
}

console.log('[ENCODING-FIX-TEST] Test completed');