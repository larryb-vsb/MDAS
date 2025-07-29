// Test the 29-line TDDF file encoding using database-driven approach
const { execSync } = require('child_process');

const uploadId = 'uploader_1753770043406_rxjr75vpv';
const filename = 'VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO';

console.log('=== TESTING 29-LINE TDDF ENCODING ===');
console.log(`Upload ID: ${uploadId}`);
console.log(`File: ${filename}`);
console.log('Expected: 29 JSON records in JSONB table\n');

try {
  // Step 1: Verify file is in encoding status
  console.log('1. Checking file status...');
  const fileStatus = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT current_phase FROM dev_uploader_uploads WHERE id = '${uploadId}';"`, { encoding: 'utf8' }).trim();
  console.log(`   File status: ${fileStatus}`);
  
  if (fileStatus !== 'encoding') {
    console.log('   Setting file to encoding status...');
    execSync(`psql "${process.env.DATABASE_URL}" -c "UPDATE dev_uploader_uploads SET current_phase = 'encoding' WHERE id = '${uploadId}';"`, { encoding: 'utf8' });
  }

  // Step 2: Clear existing JSONB records to ensure clean test
  console.log('\n2. Clearing existing JSONB records...');
  const deleteResult = execSync(`psql "${process.env.DATABASE_URL}" -t -c "DELETE FROM dev_tddf_jsonb WHERE upload_id = '${uploadId}'; SELECT ROW_COUNT();"`, { encoding: 'utf8' }).trim();
  console.log(`   Cleared ${deleteResult || 0} existing records`);

  // Step 3: Test the encoding function directly using API simulation
  console.log('\n3. Testing encoding function...');
  const encodingTest = execSync(`node -e "
    const https = require('https');
    const http = require('http');
    
    // Make API call to encoding endpoint
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/uploader/${uploadId}/encode',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': process.env.TEST_COOKIES || ''
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('   API Response Status:', res.statusCode);
        try {
          const response = JSON.parse(data);
          console.log('   API Response:', JSON.stringify(response, null, 2));
        } catch (e) {
          console.log('   Raw Response:', data);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('   API Error:', err.message);
    });
    
    req.end();
  "`, { encoding: 'utf8' });
  
  console.log(encodingTest);

  // Wait a moment for processing
  console.log('\n4. Waiting for encoding to complete...');
  execSync('sleep 3');

  // Step 4: Check JSONB records created
  console.log('\n5. Verifying JSONB records...');
  const jsonbCount = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT COUNT(*) FROM dev_tddf_jsonb WHERE upload_id = '${uploadId}';"`, { encoding: 'utf8' }).trim();
  console.log(`   JSONB records created: ${jsonbCount}`);

  // Step 5: Get sample records to verify content
  if (parseInt(jsonbCount) > 0) {
    console.log('\n6. Sample JSONB records:');
    const sampleRecords = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT record_type, line_number, LENGTH(raw_line) as raw_length, json_data->'merchantName' as merchant_name FROM dev_tddf_jsonb WHERE upload_id = '${uploadId}' ORDER BY line_number LIMIT 5;"`, { encoding: 'utf8' });
    console.log(sampleRecords);
  }

  // Step 6: Update file status to encoded if successful
  if (parseInt(jsonbCount) === 29) {
    console.log('\n7. Updating file status to encoded...');
    execSync(`psql "${process.env.DATABASE_URL}" -c "UPDATE dev_uploader_uploads SET current_phase = 'encoded', processing_notes = 'Successfully encoded ${jsonbCount} records from 29-line file' WHERE id = '${uploadId}';"`, { encoding: 'utf8' });
    console.log('   ✓ File status updated to encoded');
    
    console.log('\n🎉 SUCCESS: All 29 lines converted to JSON records!');
  } else {
    console.log(`\n❌ MISMATCH: Expected 29 records, got ${jsonbCount}`);
    
    // Get file content to debug
    console.log('\n8. Debugging file content...');
    const lineCount = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT line_count FROM dev_uploader_uploads WHERE id = '${uploadId}';"`, { encoding: 'utf8' }).trim();
    console.log(`   File line_count in database: ${lineCount}`);
  }

} catch (error) {
  console.error('\n❌ ENCODING TEST FAILED:');
  console.error(error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout);
  if (error.stderr) console.error('STDERR:', error.stderr);
}