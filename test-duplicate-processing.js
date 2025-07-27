import { pool } from './server/db.ts';
import { storage } from './server/storage.ts';

async function testDuplicateProcessing() {
  const client = await pool.connect();
  
  try {
    console.log('Testing duplicate DT record processing...');
    
    // Check pending records
    const pendingResult = await client.query(`
      SELECT id, record_type, raw_line, source_file_id, line_number
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending'
      ORDER BY id
      LIMIT 5
    `);
    
    console.log(`Found ${pendingResult.rows.length} pending records for testing`);
    
    if (pendingResult.rows.length > 0) {
      for (const record of pendingResult.rows) {
        console.log(`Processing record ${record.id} (${record.record_type}):`);
        
        // Extract reference number for DT records
        if (record.record_type === 'DT') {
          const line = record.raw_line;
          const referenceNumber = line.substring(61, 84).trim();
          console.log(`  Reference Number: ${referenceNumber}`);
          
          // Check if this reference number already exists
          const existingCheck = await client.query(`
            SELECT id, source_file_id, created_at 
            FROM dev_tddf_records
            WHERE reference_number = $1
            LIMIT 1
          `, [referenceNumber]);
          
          if (existingCheck.rows.length > 0) {
            const existing = existingCheck.rows[0];
            console.log(`  DUPLICATE DETECTED: Reference ${referenceNumber} exists (ID: ${existing.id}, File: ${existing.source_file_id})`);
          } else {
            console.log(`  NEW RECORD: Reference ${referenceNumber} is unique`);
          }
        }
      }
    }
    
    console.log('Triggering switch-based processing for first 3 records...');
    
    const result = await storage.processPendingTddfRecordsSwitchBased(3);
    
    console.log('Processing Results:');
    console.log(`  Processed: ${result.processed}`);
    console.log(`  Errors: ${result.errors}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    
    if (result.duplicatesLogged > 0) {
      console.log(`  Duplicates Logged: ${result.duplicatesLogged}`);
    }
    
    // Check what happened to the pending count
    const newPendingResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending'
    `);
    
    console.log(`Remaining pending records: ${newPendingResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error during duplicate processing test:', error);
  } finally {
    client.release();
  }
}

testDuplicateProcessing();