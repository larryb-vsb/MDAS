#!/usr/bin/env node

// Test script to verify switch processing handles duplicates and all record types properly on first pass
const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testSwitchProcessingFix() {
  const client = await pool.connect();
  
  try {
    console.log('=============== SWITCH PROCESSING FIX VERIFICATION ===============');
    console.log('Testing that switch processing finalizes all records on first pass');
    
    // Step 1: Create test file with mixed record types including duplicates
    const testFileId = `test_switch_fix_${Date.now()}`;
    const testTddfContent = `01602850573090001BH6759067590000000017480000180000090171026202229922000000000000001    0000090001020001N8000016759C10272022
01602860573090002DT67590675900000000174800001800000010180000124001192299900010200001102620220000000000129922000000000000596408699XXXXXX0000       VS04VS111111111   NYV1 A E462299780188823N840000000000000M7NG00    05DNVERMONT STATE BANK       59470D    VS84000000000000 N  549975551542                            000000000+                D CD 12057                     000000000  N000000000 452   0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                     01418 F000000000000 0000000000000.13     02200 00000                  
01602870573090003DT67590675900000000174800001800000010180000124001192299900010200002102620220000000000229922000000000000596408699XXXXXX0000       VS04VS111111111   NYV1 A E462299780188823N840000000000000M7NG00    05DNVERMONT STATE BANK       59470D    VS84000000000000 N  549975551542                            000000000+                D CD 12057                     000000000  N000000000 452   0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                     01418 F000000000000 0000000000000.22     02200 00000                  
01602880573090004DT67590675900000000174800001800000010180000124001192299900010200001102620220000000000129922000000000000596408699XXXXXX0000       VS04VS111111111   NYV1 A E462299780188823N840000000000000M7NG00    05DNVERMONT STATE BANK       59470D    VS84000000000000 N  549975551542                            000000000+                D CD 12057                     000000000  N000000000 452   0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                     01418 F000000000000 0000000000000.13     02200 00000                  `;
    
    // Write test file
    fs.writeFileSync(`test_switch_fix_${testFileId}.TSYSO`, testTddfContent);
    
    // Step 2: Upload test file to system
    console.log('\n1. Uploading test file with BH + DT records (including duplicate)...');
    
    await client.query(`
      INSERT INTO dev_uploaded_files (id, original_filename, file_type, status, file_size, upload_date, content)
      VALUES ($1, $2, 'tddf', 'uploaded', $3, NOW(), $4)
    `, [testFileId, `test_switch_fix_${testFileId}.TSYSO`, testTddfContent.length, testTddfContent]);
    
    // Step 3: Process raw data (simulate TDDF upload processing)
    const lines = testTddfContent.split('\n').filter(line => line.trim());
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const recordType = line.substring(17, 19);
      
      await client.query(`
        INSERT INTO dev_tddf_raw_import (source_file_id, line_number, raw_line, record_type, processing_status, created_at)
        VALUES ($1, $2, $3, $4, 'pending', NOW())
      `, [testFileId, i + 1, line, recordType]);
    }
    
    console.log(`   ✓ Uploaded ${lines.length} lines (1 BH + 3 DT records, line 4 duplicates line 2)`);
    
    // Step 4: Check initial pending count
    const initialPending = await client.query(`
      SELECT COUNT(*) as count FROM dev_tddf_raw_import 
      WHERE source_file_id = $1 AND processing_status = 'pending'
    `, [testFileId]);
    
    console.log(`   ✓ Initial pending count: ${initialPending.rows[0].count}`);
    
    // Step 5: Run switch-based processing (first pass)
    console.log('\n2. Running switch-based processing (first pass)...');
    
    const { DatabaseStorage } = require('./server/storage.ts');
    const storage = new DatabaseStorage();
    
    const startTime = Date.now();
    const result = await storage.processPendingTddfRecordsSwitchBased(testFileId, 10);
    const processingTime = Date.now() - startTime;
    
    console.log(`   ✓ Processing completed in ${processingTime}ms`);
    console.log(`   ✓ Results: ${result.totalProcessed} processed, ${result.totalSkipped} skipped, ${result.totalErrors} errors`);
    
    if (result.breakdown) {
      console.log('   ✓ Breakdown by record type:');
      for (const [recordType, stats] of Object.entries(result.breakdown)) {
        console.log(`      ${recordType}: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors`);
      }
    }
    
    // Step 6: Verify zero pending records after first pass
    const finalPending = await client.query(`
      SELECT COUNT(*) as count FROM dev_tddf_raw_import 
      WHERE source_file_id = $1 AND processing_status = 'pending'
    `, [testFileId]);
    
    console.log(`\n3. Verification Results:`);
    console.log(`   ✓ Final pending count: ${finalPending.rows[0].count}`);
    
    // Step 7: Check status breakdown
    const statusBreakdown = await client.query(`
      SELECT processing_status, COUNT(*) as count 
      FROM dev_tddf_raw_import 
      WHERE source_file_id = $1 
      GROUP BY processing_status
      ORDER BY processing_status
    `, [testFileId]);
    
    console.log('   ✓ Status breakdown:');
    for (const row of statusBreakdown.rows) {
      console.log(`      ${row.processing_status}: ${row.count} records`);
    }
    
    // Step 8: Check for duplicate handling details
    const duplicateCheck = await client.query(`
      SELECT skip_reason, COUNT(*) as count 
      FROM dev_tddf_raw_import 
      WHERE source_file_id = $1 AND skip_reason IS NOT NULL
      GROUP BY skip_reason
    `, [testFileId]);
    
    if (duplicateCheck.rows.length > 0) {
      console.log('   ✓ Duplicate handling:');
      for (const row of duplicateCheck.rows) {
        console.log(`      ${row.skip_reason}: ${row.count} records`);
      }
    }
    
    // SUCCESS CRITERIA
    const success = finalPending.rows[0].count === 0;
    console.log(`\n4. TEST RESULT: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (success) {
      console.log('   ✓ All records processed/finalized on first pass');
      console.log('   ✓ No pending records remain');
      console.log('   ✓ Switch processing fix working correctly');
    } else {
      console.log(`   ❌ ${finalPending.rows[0].count} records still pending after first pass`);
      console.log('   ❌ Switch processing needs additional fixes');
    }
    
    // Cleanup
    await client.query(`DELETE FROM dev_tddf_raw_import WHERE source_file_id = $1`, [testFileId]);
    await client.query(`DELETE FROM dev_uploaded_files WHERE id = $1`, [testFileId]);
    fs.unlinkSync(`test_switch_fix_${testFileId}.TSYSO`);
    
    console.log('\n5. Test cleanup completed');
    
  } catch (error) {
    console.error('Error during switch processing fix test:', error);
  } finally {
    client.release();
  }
}

testSwitchProcessingFix();