import { pool } from './server/db.ts';

async function completeCleanup() {
  const client = await pool.connect();
  
  try {
    console.log('COMPLETE PENDING RECORDS CLEANUP');
    console.log('=================================');
    
    // Get all remaining pending records
    const pendingResult = await client.query(`
      SELECT id, record_type, raw_line, source_file_id, line_number
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending'
      ORDER BY record_type, line_number
    `);
    
    console.log(`Found ${pendingResult.rows.length} pending records to process`);
    
    let processed = 0;
    let duplicates = 0;
    let others = 0;
    
    for (const record of pendingResult.rows) {
      console.log(`\nProcessing ${record.record_type} record ${record.id} (line ${record.line_number})`);
      
      if (record.record_type === 'DT') {
        // Handle DT records with duplicate checking
        const line = record.raw_line;
        const referenceNumber = line.substring(61, 84).trim();
        
        // Check for existing record
        const existingCheck = await client.query(`
          SELECT id, source_file_id 
          FROM dev_tddf_records
          WHERE reference_number = $1
          LIMIT 1
        `, [referenceNumber]);
        
        if (existingCheck.rows.length > 0) {
          const existing = existingCheck.rows[0];
          
          // Log as duplicate
          await client.query(`
            UPDATE dev_tddf_raw_import 
            SET processing_status = 'processed',
                processed_into_table = $1,
                processed_record_id = $2,
                processed_at = CURRENT_TIMESTAMP,
                skip_reason = $3
            WHERE id = $4
          `, [
            'dev_tddf_records', 
            existing.id.toString(), 
            `duplicate_reference_logged: ${referenceNumber} (original_id: ${existing.id})`,
            record.id
          ]);
          
          console.log(`  ✅ DUPLICATE logged: Reference ${referenceNumber} → existing ID ${existing.id}`);
          duplicates++;
        } else {
          console.log(`  ⚠️  NEW RECORD: Reference ${referenceNumber} - would need full DT processing`);
          others++;
        }
      } else {
        // Handle non-DT records (BH, P1, etc.)
        console.log(`  ⚠️  NON-DT RECORD: ${record.record_type} - would need specific processing`);
        others++;
      }
      
      processed++;
    }
    
    console.log('\n=== CLEANUP SUMMARY ===');
    console.log(`Total processed: ${processed}`);
    console.log(`Duplicates handled: ${duplicates}`);
    console.log(`Other records needing processing: ${others}`);
    
    // Final count check
    const finalResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending'
    `);
    
    console.log(`Remaining pending records: ${finalResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    client.release();
  }
}

completeCleanup();