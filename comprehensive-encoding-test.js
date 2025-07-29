import { encodeTddfToJsonbDirect } from './server/tddf-json-encoder.js';
import { ReplitStorageService } from './server/replit-storage-service.js';
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

const uploadId = 'uploader_1753770043406_rxjr75vpv';
const filename = 'VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO';

console.log('=== COMPREHENSIVE 29-LINE ENCODING TEST ===');
console.log(`Upload ID: ${uploadId}`);
console.log(`File: ${filename}`);
console.log('Expected: 29 JSON records in JSONB table\n');

async function testCompleteEncoding() {
  try {
    // Step 1: Verify file exists and get content
    console.log('1. Getting file content from Replit Storage...');
    const storageService = new ReplitStorageService();
    const storageKey = `dev-uploader/${uploadId}/${filename}`;
    console.log(`   Storage key: ${storageKey}`);
    
    const fileContent = await storageService.getFileContent(storageKey);
    if (!fileContent) {
      throw new Error(`File content not found at ${storageKey}`);
    }
    
    const lines = fileContent.trim().split('\n');
    console.log(`   ✓ File content retrieved: ${lines.length} lines`);
    console.log(`   ✓ File size: ${fileContent.length} characters`);
    console.log(`   ✓ First line: ${lines[0].substring(0, 50)}...`);
    
    // Step 2: Clear existing JSONB records
    console.log('\n2. Clearing existing JSONB records...');
    const deleteResult = await db.execute(sql`
      DELETE FROM dev_tddf_jsonb WHERE upload_id = ${uploadId}
    `);
    console.log(`   ✓ Cleared existing records`);
    
    // Step 3: Perform encoding
    console.log('\n3. Starting TDDF to JSONB encoding...');
    console.log(`   Processing ${lines.length} lines...`);
    
    const startTime = Date.now();
    const encodingResults = await encodeTddfToJsonbDirect(uploadId, fileContent);
    const endTime = Date.now();
    
    console.log(`   ✓ Encoding completed in ${endTime - startTime}ms`);
    console.log(`   ✓ Total records processed: ${encodingResults.totalRecords}`);
    console.log(`   ✓ Processing time: ${encodingResults.processingTime}ms`);
    
    if (encodingResults.recordTypeBreakdown) {
      console.log('   ✓ Record type breakdown:');
      for (const [type, count] of Object.entries(encodingResults.recordTypeBreakdown)) {
        console.log(`     - ${type}: ${count} records`);
      }
    }
    
    // Step 4: Verify JSONB records were created
    console.log('\n4. Verifying JSONB records in database...');
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM dev_tddf_jsonb WHERE upload_id = ${uploadId}
    `);
    
    const recordCount = countResult[0]?.count || 0;
    console.log(`   ✓ JSONB records found: ${recordCount}`);
    
    // Step 5: Get sample records
    if (recordCount > 0) {
      console.log('\n5. Sample JSONB records:');
      const sampleRecords = await db.execute(sql`
        SELECT record_type, line_number, LENGTH(raw_line) as raw_length, 
               json_data->>'recordType' as record_type_json,
               json_data->>'lineNumber' as line_number_json
        FROM dev_tddf_jsonb 
        WHERE upload_id = ${uploadId} 
        ORDER BY line_number 
        LIMIT 5
      `);
      
      for (const record of sampleRecords) {
        console.log(`   - Line ${record.line_number}: Type ${record.record_type}, Raw length: ${record.raw_length}`);
      }
    }
    
    // Step 6: Update file status if successful
    if (recordCount === 29) {
      console.log('\n6. Updating file status to encoded...');
      await db.execute(sql`
        UPDATE dev_uploader_uploads 
        SET current_phase = 'encoded',
            processing_notes = ${`Successfully encoded ${recordCount} records from 29-line TDDF file`}
        WHERE id = ${uploadId}
      `);
      console.log('   ✓ File status updated to encoded');
      
      console.log('\n🎉 SUCCESS: All 29 lines converted to JSON records!');
      console.log('✓ File is ready for viewing in the web interface');
      return { success: true, recordCount: 29 };
      
    } else {
      console.log(`\n❌ MISMATCH: Expected 29 records, got ${recordCount}`);
      console.log('Troubleshooting information:');
      console.log(`- File lines: ${lines.length}`);
      console.log(`- Encoding result claimed: ${encodingResults.totalRecords}`);
      console.log(`- Database records: ${recordCount}`);
      
      return { success: false, expected: 29, actual: recordCount };
    }
    
  } catch (error) {
    console.error('\n❌ ENCODING TEST FAILED:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Try to update file status to failed
    try {
      await db.execute(sql`
        UPDATE dev_uploader_uploads 
        SET current_phase = 'failed',
            processing_notes = ${`Encoding failed: ${error.message}`}
        WHERE id = ${uploadId}
      `);
      console.log('✓ File status updated to failed');
    } catch (updateError) {
      console.error('Failed to update file status:', updateError.message);
    }
    
    return { success: false, error: error.message };
  }
}

// Run the comprehensive test
testCompleteEncoding()
  .then(result => {
    console.log('\n=== TEST COMPLETE ===');
    console.log('Final result:', result);
    
    if (result.success) {
      console.log('\n🎉 The 29-line TDDF file has been successfully encoded to JSONB!');
      console.log('You can now view the results in the web interface.');
    } else {
      console.log('\n❌ Encoding test failed. Check the error details above.');
    }
    
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n💥 Fatal error during test:');
    console.error(error.message);
    process.exit(1);
  });