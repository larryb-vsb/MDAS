import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function processBhRecordsManual() {
  console.log('🔷 Manually processing BH records from raw import...');
  
  try {
    // Get pending BH records from raw import
    const result = await pool.query(`
      SELECT id, source_file_id, line_number, raw_line, record_type
      FROM dev_tddf_raw_import
      WHERE record_type = 'BH' 
      AND processing_status = 'pending'
      ORDER BY source_file_id, line_number
      LIMIT 50
    `);
    
    console.log(`📄 Found ${result.rows.length} pending BH records`);
    
    if (result.rows.length === 0) {
      // Check if there are any BH records marked as processed or skipped
      const checkResult = await pool.query(`
        SELECT processing_status, COUNT(*) as count
        FROM dev_tddf_raw_import 
        WHERE record_type = 'BH'
        GROUP BY processing_status
      `);
      
      console.log('📊 BH Record Status Summary:');
      checkResult.rows.forEach(row => {
        console.log(`   ${row.processing_status}: ${row.count} records`);
      });
      return;
    }
    
    let processed = 0;
    let errors = 0;
    
    for (const row of result.rows) {
      try {
        const rawLine = row.raw_line;
        
        // Extract BH fields from TDDF specification positions
        const recordIdentifier = rawLine.substring(17, 19); // 18-19
        const merchantAccountNumber = rawLine.substring(23, 39); // 24-39
        const transactionCode = rawLine.substring(51, 55); // 52-55 
        const batchDate = rawLine.substring(55, 60); // 56-60
        const batchJulianDate = rawLine.substring(60, 65); // 61-65
        const netDeposit = rawLine.substring(68, 83); // 69-83
        const rejectReason = rawLine.substring(83, 87); // 84-87
        
        // Parse net deposit as currency (assuming cents format)
        const netDepositValue = netDeposit.trim() ? parseFloat(netDeposit) / 100 : 0;
        
        // Create BH record number from file and line info
        const bhRecordNumber = `BH_${row.source_file_id}_${row.line_number}`;
        
        // Insert BH record
        await pool.query(`
          INSERT INTO dev_tddf_batch_headers (
            bh_record_number, record_identifier, merchant_account_number,
            transaction_code, batch_date, batch_julian_date, net_deposit,
            reject_reason, source_file_id, source_row_number, recorded_at,
            raw_data, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, NOW(), NOW()
          )
        `, [
          bhRecordNumber, recordIdentifier, merchantAccountNumber,
          transactionCode, batchDate, batchJulianDate, netDepositValue,
          rejectReason, row.source_file_id, row.line_number, rawLine
        ]);
        
        // Update raw import record as processed
        await pool.query(`
          UPDATE dev_tddf_raw_import 
          SET processing_status = 'processed', processed_at = NOW()
          WHERE id = $1
        `, [row.id]);
        
        processed++;
        console.log(`✅ Processed BH record ${processed}: ${bhRecordNumber} - Net Deposit: $${netDepositValue.toFixed(2)}`);
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing BH record ${row.id}:`, error.message);
        
        // Mark as skipped with error reason
        await pool.query(`
          UPDATE dev_tddf_raw_import 
          SET processing_status = 'skipped', skip_reason = $1
          WHERE id = $2
        `, [error.message, row.id]);
      }
    }
    
    console.log(`\n📊 BH Processing Complete:`);
    console.log(`   ✅ Processed: ${processed}`);
    console.log(`   ❌ Errors: ${errors}`);
    
    // Verify final count
    const finalCount = await pool.query('SELECT COUNT(*) as count FROM dev_tddf_batch_headers');
    console.log(`   📄 Total BH records in database: ${finalCount.rows[0].count}`);
    
  } catch (error) {
    console.error('💥 Fatal error in BH processing:', error);
  } finally {
    await pool.end();
  }
}

processBhRecordsManual();