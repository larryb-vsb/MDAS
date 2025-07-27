import { pool } from './server/db.ts';

async function manualDuplicateTest() {
  const client = await pool.connect();
  
  try {
    console.log('MANUAL DUPLICATE HANDLING TEST');
    console.log('================================');
    
    // Get the first DT record that we know is a duplicate
    const dupRecord = await client.query(`
      SELECT id, record_type, raw_line, source_file_id, line_number
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending' AND record_type = 'DT'
      LIMIT 1
    `);
    
    if (dupRecord.rows.length === 0) {
      console.log('No pending DT records found');
      return;
    }
    
    const record = dupRecord.rows[0];
    console.log(`Testing duplicate handling for record ${record.id}`);
    
    const line = record.raw_line;
    const referenceNumber = line.substring(61, 84).trim();
    console.log(`Reference Number: ${referenceNumber}`);
    
    // Check for existing record
    const existingCheck = await client.query(`
      SELECT id, source_file_id, created_at 
      FROM dev_tddf_records
      WHERE reference_number = $1
      LIMIT 1
    `, [referenceNumber]);
    
    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      console.log(`DUPLICATE FOUND: ID ${existing.id}, File: ${existing.source_file_id}`);
      
      // Simulate the new duplicate handling logic
      console.log('Applying duplicate handling logic...');
      
      const updateResult = await client.query(`
        UPDATE dev_tddf_raw_import 
        SET processing_status = 'processed',
            processed_into_table = $1,
            processed_record_id = $2,
            processed_at = CURRENT_TIMESTAMP,
            skip_reason = $3
        WHERE id = $4
        RETURNING id
      `, [
        'dev_tddf_records', 
        existing.id.toString(), 
        `duplicate_reference_logged: ${referenceNumber} (original_id: ${existing.id})`,
        record.id
      ]);
      
      if (updateResult.rowCount > 0) {
        console.log(`✅ Successfully logged duplicate record ${record.id} pointing to existing ID ${existing.id}`);
        
        // Check remaining pending count
        const remainingResult = await client.query(`
          SELECT COUNT(*) as count 
          FROM dev_tddf_raw_import 
          WHERE processing_status = 'pending'
        `);
        
        console.log(`Remaining pending records: ${remainingResult.rows[0].count}`);
      } else {
        console.log('❌ Failed to update record');
      }
    } else {
      console.log('This would be a new record (no duplicate found)');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
  }
}

manualDuplicateTest();