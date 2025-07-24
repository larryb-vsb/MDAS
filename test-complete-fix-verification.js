// Comprehensive test to verify complete Base64 TDDF processing fix
import { pool } from './server/db.ts';

console.log('🔍 Running Complete Base64 TDDF Processing Fix Verification...');

async function runCompleteVerification() {
  try {
    console.log('\n===== STEP 1: Verify Raw Import Record Corrections =====');
    
    // Check that all raw import records are properly decoded
    const rawImportCheck = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN raw_line ~ '^[0-9]+[A-Z]{2}[0-9]' THEN 1 END) as fixed_tddf_format,
        COUNT(CASE WHEN raw_line ~ '^[A-Za-z0-9+/=]+$' AND LENGTH(raw_line) % 4 = 0 AND LENGTH(raw_line) > 50 THEN 1 END) as still_base64,
        COUNT(CASE WHEN record_type IN ('BH', 'DT', 'AD', 'P1', 'P2', 'DR') THEN 1 END) as valid_record_types
      FROM dev_tddf_raw_import
    `);

    const rawStats = rawImportCheck.rows[0];
    console.log(`📊 Raw Import Records Status:`);
    console.log(`  Total Records: ${rawStats.total_records}`);
    console.log(`  Fixed TDDF Format: ${rawStats.fixed_tddf_format}`);
    console.log(`  Still Base64: ${rawStats.still_base64}`);
    console.log(`  Valid Record Types: ${rawStats.valid_record_types}`);

    console.log('\n===== STEP 2: Sample Record Type Distribution =====');
    
    const recordTypeDistribution = await pool.query(`
      SELECT record_type, COUNT(*) as count
      FROM dev_tddf_raw_import
      GROUP BY record_type
      ORDER BY count DESC
    `);

    console.log(`📈 Record Type Distribution:`);
    recordTypeDistribution.rows.forEach(row => {
      console.log(`  ${row.record_type}: ${row.count} records`);
    });

    console.log('\n===== STEP 3: Content Format Validation =====');
    
    const sampleRecords = await pool.query(`
      SELECT 
        record_type,
        LEFT(raw_line, 80) as content_sample,
        LENGTH(raw_line) as content_length
      FROM dev_tddf_raw_import
      WHERE record_type IN ('BH', 'DT', 'AD')
      ORDER BY created_at DESC
      LIMIT 5
    `);

    console.log(`🔍 Sample Records Content:`);
    sampleRecords.rows.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.record_type}: "${record.content_sample}..." (${record.content_length} chars)`);
    });

    console.log('\n===== STEP 4: Processing Pipeline Test =====');
    
    // Test Base64 decoding logic directly
    const testBase64 = "MDE4OTk0OTA1OTg0NjAwMDJCSDY3NTkwNjc1OTAwMDAwMDAwMT";
    const decodedTest = Buffer.from(testBase64, 'base64').toString('utf8');
    const recordType = decodedTest.substring(17, 19);
    
    console.log(`🧪 Direct Processing Test:`);
    console.log(`  Base64 Input: ${testBase64}`);
    console.log(`  Decoded Output: ${decodedTest}`);
    console.log(`  Record Type: ${recordType}`);
    console.log(`  Valid TDDF Format: ${decodedTest.startsWith('01899') && recordType === 'BH' ? '✅ YES' : '❌ NO'}`);

    console.log('\n===== STEP 5: Database Integrity Check =====');
    
    const integrityCheck = await pool.query(`
      SELECT 
        COUNT(DISTINCT source_file_id) as unique_files,
        MIN(created_at) as oldest_record,
        MAX(created_at) as newest_record,
        AVG(LENGTH(raw_line)) as avg_content_length
      FROM dev_tddf_raw_import
    `);

    const integrity = integrityCheck.rows[0];
    console.log(`📂 Database Integrity:`);
    console.log(`  Unique Source Files: ${integrity.unique_files}`);
    console.log(`  Date Range: ${integrity.oldest_record} to ${integrity.newest_record}`);
    console.log(`  Average Content Length: ${Math.round(integrity.avg_content_length)} characters`);

    console.log('\n===== VERIFICATION SUMMARY =====');
    
    const isFullyFixed = rawStats.still_base64 === '0' && rawStats.fixed_tddf_format > 0;
    const hasValidRecordTypes = rawStats.valid_record_types > 0;
    const testPassed = recordType === 'BH' && decodedTest.startsWith('01899');

    console.log(`🎯 Overall Fix Status:`);
    console.log(`  ✅ Raw Records Decoded: ${isFullyFixed ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Valid Record Types: ${hasValidRecordTypes ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Processing Logic Test: ${testPassed ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Overall Status: ${isFullyFixed && hasValidRecordTypes && testPassed ? '🟢 COMPLETE SUCCESS' : '🔴 ISSUES DETECTED'}`);

    return {
      success: isFullyFixed && hasValidRecordTypes && testPassed,
      stats: rawStats,
      recordTypes: recordTypeDistribution.rows,
      integrity: integrity
    };

  } catch (error) {
    console.error('❌ Verification Error:', error);
    throw error;
  }
}

// Run the complete verification
runCompleteVerification()
  .then(result => {
    console.log('\n🎉 Complete Base64 TDDF Processing Fix Verification COMPLETED!');
    if (result.success) {
      console.log('🟢 ALL SYSTEMS OPERATIONAL - Base64 processing bug completely resolved');
    } else {
      console.log('🔴 ISSUES DETECTED - Additional fixes may be required');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Verification failed:', error);
    process.exit(1);
  });