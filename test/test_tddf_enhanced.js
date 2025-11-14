import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import { DatabaseStorage } from './server/storage.js';

async function testEnhancedTddfProcessing() {
  console.log('=== TESTING ENHANCED TDDF PROCESSING ===\n');
  
  try {
    // Check current TDDF files in the system
    const uploadResult = await db.execute(sql`
      SELECT id, original_filename, file_type, processed, processing_status 
      FROM dev_uploaded_files 
      WHERE file_type = 'tddf' OR original_filename LIKE '%.TSYSO'
      ORDER BY uploaded_at DESC 
      LIMIT 3
    `);
    
    console.log('TDDF files in system:');
    for (const file of uploadResult.rows) {
      console.log(`  ${file.id}: ${file.original_filename} - Processed: ${file.processed} - Status: ${file.processing_status}`);
    }
    
    // Check existing TDDF records
    const recordsResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM dev_tddf_records
    `);
    
    console.log(`\nExisting TDDF records: ${recordsResult.rows[0].count}`);
    
    // Test the enhanced processing with sample TDDF content
    const storage = new DatabaseStorage();
    const testContent = `01696290624670002BH6759067590000000215480088880000090171128202233222000000000853920    0000090001484509N8008886759C11292022
01696300624670003DT67590675900000002154800888800000010180088873011002332900014845093112820220000085392033222000000000853920377972XXXXX1024                          NY 4 07N003321356909322N840000000853920          01DNDRIP DROP DISTRO LLC     266851    AM84000000853920 N  519971004114
01696310624670004BH6759067590000000096880088880000090171128202233222000000000001784    0000090001016986N8008886759C11292022
01696320624670005DT67590675900000000968800888800000010180088887287282332900010154024112820220000000128433222000000000001784531260XXXXXX3486       ME03KE06MS02      NY 4607AMDJMSYA1U1128  N840000000001284          81DNHIGHER FLOUR LLC         105024    MD84000000001284 N  546200000001
01696330624670006DT67590675900000000968800888800000010180088887287282332900010169865112820220000000050033222000000000001784531260XXXXXX3486       ME03KE06MS02      NY 4607AMDJM9XEI01128  N840000000000500          81DNHIGHER FLOUR LLC         104051    MD84000000000500 N  546200000001`;

    console.log('\n=== RUNNING ENHANCED TDDF PROCESSING TEST ===');
    console.log('Expected findings:');
    console.log('  - 5 total lines');
    console.log('  - 2 BH records (should be skipped)');
    console.log('  - 3 DT records (should be processed)');
    console.log('  - Enhanced statistics should show record type breakdown\n');
    
    const result = await storage.processTddfFileFromContent(
      testContent,
      'test_enhanced_stats',
      'enhanced_test.TSYSO'
    );
    
    console.log('\n=== PROCESSING COMPLETED ===');
    console.log(`Rows processed: ${result.rowsProcessed}`);
    console.log(`TDDF records created: ${result.tddfRecordsCreated}`);
    console.log(`Errors: ${result.errors}`);
    
    // Verify the results
    const newRecordsResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM dev_tddf_records
    `);
    
    console.log(`\nTotal TDDF records after test: ${newRecordsResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Test error:', error);
    console.error('Stack:', error.stack);
  }
}

testEnhancedTddfProcessing();
