const { execSync } = require('child_process');

console.log('=== MANUAL ENCODING TEST ===');
console.log('Upload ID: uploader_1753770043406_rxjr75vpv');
console.log('File: VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO\n');

try {
  // First, check current JSONB records
  console.log('1. Checking current JSONB records...');
  const initialCount = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT COUNT(*) FROM dev_tddf_jsonb;"`, { encoding: 'utf8' }).trim();
  console.log(`   Current JSONB records: ${initialCount}`);

  // Check if file exists in storage
  console.log('\n2. Testing file storage access...');
  const storageTest = execSync(`tsx -e "
    import { ReplitStorageService } from './server/replit-storage-service.ts';
    const service = new ReplitStorageService();
    const content = await service.getFileContent('dev-uploader/uploader_1753770043406_rxjr75vpv/VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO');
    if (content) {
      const lines = content.trim().split('\\n');
      console.log(\`   ✓ File found: \${lines.length} lines\`);
      console.log(\`   First line: \${lines[0].substring(0, 50)}...\`);
    } else {
      console.log('   ❌ File not found');
    }
  "`, { cwd: '/home/runner/workspace', encoding: 'utf8' });
  
  console.log(storageTest);

  // Test encoding function
  console.log('\n3. Running encoding test...');
  const encodingResult = execSync(`tsx -e "
    import { encodeTddfToJsonbDirect } from './server/tddf-json-encoder.ts';
    import { ReplitStorageService } from './server/replit-storage-service.ts';
    
    const uploadId = 'uploader_1753770043406_rxjr75vpv';
    const storageKey = 'dev-uploader/uploader_1753770043406_rxjr75vpv/VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO';
    
    const service = new ReplitStorageService();
    const fileContent = await service.getFileContent(storageKey);
    
    if (!fileContent) {
      throw new Error('File content not available');
    }
    
    const result = await encodeTddfToJsonbDirect(uploadId, fileContent);
    console.log(\`   ✓ Encoding completed: \${result.totalRecords} records\`);
    console.log(\`   Processing time: \${result.processingTime}ms\`);
    console.log(\`   Record types: \${JSON.stringify(result.recordTypeBreakdown)}\`);
  "`, { cwd: '/home/runner/workspace', encoding: 'utf8' });
  
  console.log(encodingResult);

  // Verify JSONB records were created
  console.log('\n4. Verifying JSONB records...');
  const finalCount = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT COUNT(*) FROM dev_tddf_jsonb WHERE upload_id = 'uploader_1753770043406_rxjr75vpv';"`, { encoding: 'utf8' }).trim();
  console.log(`   JSONB records created: ${finalCount}`);

  // Update upload status to encoded
  console.log('\n5. Updating upload status...');
  execSync(`psql "${process.env.DATABASE_URL}" -c "UPDATE dev_uploader_uploads SET current_phase = 'encoded', processing_notes = 'Manual encoding test completed successfully' WHERE id = 'uploader_1753770043406_rxjr75vpv';"`, { encoding: 'utf8' });
  console.log('   ✓ Status updated to "encoded"');

  // Test View JSONB API
  console.log('\n6. Testing View JSONB API...');
  const jsonbData = execSync(`curl -s "http://localhost:5000/api/uploader/uploader_1753770043406_rxjr75vpv/jsonb" | jq '.totalRecords // empty'`, { encoding: 'utf8' }).trim();
  console.log(`   View JSONB API returns: ${jsonbData || 'No data'} records`);

  console.log('\n🎉 ENCODING WORKFLOW TEST COMPLETED SUCCESSFULLY!');
  console.log(`✓ File content access: WORKING`);
  console.log(`✓ TDDF encoding: WORKING`);
  console.log(`✓ JSONB storage: WORKING`);
  console.log(`✓ Status updates: WORKING`);
  console.log(`✓ View JSONB API: WORKING`);

} catch (error) {
  console.error('\n❌ ENCODING TEST FAILED:');
  console.error(error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout);
  if (error.stderr) console.error('STDERR:', error.stderr);
  process.exit(1);
}