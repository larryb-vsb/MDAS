// Enhanced TDDF processing script for both DT and BH records
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure WebSocket for Neon
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function processTddfDtAndBhRecords() {
  console.log('🚀 Starting enhanced TDDF processing for DT and BH records...');
  
  try {
    // Get pending DT and BH records
    const result = await pool.query(`
      SELECT id, source_file_id, line_number, raw_line, record_type, record_description
      FROM dev_tddf_raw_import
      WHERE processing_status = 'pending' 
      AND record_type IN ('DT', 'BH')
      ORDER BY record_type DESC, source_file_id, line_number
      LIMIT 200
    `);
    
    console.log(`📄 Found ${result.rows.length} pending records to process`);
    
    // Separate records by type
    const dtRecords = result.rows.filter(row => row.record_type === 'DT');
    const bhRecords = result.rows.filter(row => row.record_type === 'BH');
    
    console.log(`   📊 DT Records: ${dtRecords.length}`);
    console.log(`   📊 BH Records: ${bhRecords.length}`);
    
    let totalProcessed = 0;
    let totalErrors = 0;
    
    // Process BH records first (batch headers should be processed before transaction details)
    if (bhRecords.length > 0) {
      console.log('\n🔷 Processing BH (Batch Header) Records...');
      const bhResults = await processBhRecords(bhRecords);
      totalProcessed += bhResults.processed;
      totalErrors += bhResults.errors;
    }
    
    // Process DT records
    if (dtRecords.length > 0) {
      console.log('\n🔹 Processing DT (Detail Transaction) Records...');
      const dtResults = await processDtRecords(dtRecords);
      totalProcessed += dtResults.processed;
      totalErrors += dtResults.errors;
    }
    
    console.log(`\n🎉 Enhanced TDDF processing complete:`);
    console.log(`   ✅ Total Processed: ${totalProcessed} records`);
    console.log(`   ❌ Total Errors: ${totalErrors} records`);
    
    // Check remaining backlog
    const backlogResult = await pool.query(`
      SELECT 
        record_type,
        COUNT(*) as remaining
      FROM dev_tddf_raw_import
      WHERE processing_status = 'pending' 
      AND record_type IN ('DT', 'BH')
      GROUP BY record_type
      ORDER BY record_type
    `);
    
    console.log(`\n📊 Remaining backlog by type:`);
    if (backlogResult.rows.length === 0) {
      console.log(`   ✅ No pending DT or BH records remaining`);
    } else {
      backlogResult.rows.forEach(row => {
        console.log(`   ${row.record_type}: ${row.remaining} records`);
      });
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await pool.end();
  }
}

async function processBhRecords(bhRecords) {
  let processed = 0;
  let errors = 0;
  
  for (const rawLine of bhRecords) {
    try {
      const line = rawLine.raw_line;
      const fileId = rawLine.source_file_id;
      
      // Parse BH (Batch Header) fields from TDDF specification
      const bhRecord = {
        sequence_number: line.substring(0, 7).trim() || null,
        entry_run_number: line.substring(7, 13).trim() || null,
        sequence_within_run: line.substring(13, 17).trim() || null,
        record_identifier: line.substring(17, 19).trim() || null,
        bank_number: line.substring(19, 23).trim() || null,
        merchant_account_number: line.substring(23, 39).trim() || null,
        
        // Batch-specific fields (positions vary by TDDF specification)
        batch_date: parseDate(line.substring(84, 92).trim()), // Using same date position as DT for now
        net_deposit: parseAmount(line.substring(108, 123).trim()), // Similar to DT net deposit field
        merchant_reference_number: line.substring(61, 84).trim() || null, // Similar to reference number
        
        // System fields
        source_file_id: fileId,
        source_row_number: rawLine.line_number,
        raw_data: JSON.stringify({ rawLine: line })
      };
      
      // Insert into hierarchical batch headers table
      const insertResult = await pool.query(`
        INSERT INTO dev_tddf_batch_headers (
          sequence_number, entry_run_number, sequence_within_run, record_identifier, bank_number,
          merchant_account_number, batch_date, net_deposit, merchant_reference_number,
          source_file_id, source_row_number, raw_data, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
        ) RETURNING id
      `, [
        bhRecord.sequence_number, bhRecord.entry_run_number, bhRecord.sequence_within_run,
        bhRecord.record_identifier, bhRecord.bank_number, bhRecord.merchant_account_number,
        bhRecord.batch_date, bhRecord.net_deposit, bhRecord.merchant_reference_number,
        bhRecord.source_file_id, bhRecord.source_row_number, bhRecord.raw_data
      ]);
      
      const recordId = insertResult.rows[0].id;
      
      // Mark raw line as processed
      await pool.query(`
        UPDATE dev_tddf_raw_import 
        SET processing_status = 'processed',
            processed_into_table = 'dev_tddf_batch_headers',
            processed_record_id = $2,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [rawLine.id, recordId.toString()]);
      
      processed++;
      console.log(`✅ BH Record ${recordId}: Batch ${bhRecord.merchant_account_number} - ${bhRecord.merchant_reference_number}`);
      
    } catch (error) {
      errors++;
      console.error(`❌ Error processing BH line ${rawLine.id}:`, error.message);
      
      // Mark as skipped
      await pool.query(`
        UPDATE dev_tddf_raw_import 
        SET processing_status = 'skipped',
            skip_reason = $2,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [rawLine.id, `bh_processing_error: ${error.message.substring(0, 100)}`]);
    }
  }
  
  return { processed, errors };
}

async function processDtRecords(dtRecords) {
  let processed = 0;
  let errors = 0;
  
  for (const rawLine of dtRecords) {
    try {
      const line = rawLine.raw_line;
      const fileId = rawLine.source_file_id;
      
      // Parse DT fields (existing logic)
      const dtRecord = {
        sequence_number: line.substring(0, 7).trim() || null,
        entry_run_number: line.substring(7, 13).trim() || null,
        sequence_within_run: line.substring(13, 17).trim() || null,
        record_identifier: line.substring(17, 19).trim() || null,
        bank_number: line.substring(19, 23).trim() || null,
        merchant_account_number: line.substring(23, 39).trim() || null,
        reference_number: line.substring(61, 84).trim() || null,
        transaction_date: parseDate(line.substring(84, 92).trim()),
        transaction_amount: parseAmount(line.substring(92, 103).trim()),
        merchant_name: line.length > 242 ? line.substring(217, 242).trim() || null : null,
        auth_amount: parseAmount(line.substring(191, 203).trim()),
        source_file_id: fileId,
        source_row_number: rawLine.line_number,
        mms_raw_line: line
      };
      
      // Insert into existing TDDF records table
      const insertResult = await pool.query(`
        INSERT INTO dev_tddf_records (
          sequence_number, entry_run_number, sequence_within_run, record_identifier, bank_number,
          merchant_account_number, reference_number, transaction_date, transaction_amount,
          merchant_name, auth_amount, source_file_id, source_row_number, mms_raw_line,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
        ) RETURNING id
      `, [
        dtRecord.sequence_number, dtRecord.entry_run_number, dtRecord.sequence_within_run,
        dtRecord.record_identifier, dtRecord.bank_number, dtRecord.merchant_account_number,
        dtRecord.reference_number, dtRecord.transaction_date, dtRecord.transaction_amount,
        dtRecord.merchant_name, dtRecord.auth_amount, dtRecord.source_file_id,
        dtRecord.source_row_number, dtRecord.mms_raw_line
      ]);
      
      const recordId = insertResult.rows[0].id;
      
      // Mark raw line as processed
      await pool.query(`
        UPDATE dev_tddf_raw_import 
        SET processing_status = 'processed',
            processed_into_table = 'dev_tddf_records',
            processed_record_id = $2,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [rawLine.id, recordId.toString()]);
      
      processed++;
      console.log(`✅ DT Record ${recordId}: $${dtRecord.transaction_amount} - ${dtRecord.reference_number}`);
      
    } catch (error) {
      errors++;
      console.error(`❌ Error processing DT line ${rawLine.id}:`, error.message);
      
      // Mark as skipped
      await pool.query(`
        UPDATE dev_tddf_raw_import 
        SET processing_status = 'skipped',
            skip_reason = $2,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [rawLine.id, `dt_processing_error: ${error.message.substring(0, 100)}`]);
    }
  }
  
  return { processed, errors };
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return null;
  
  // MMDDCCYY format
  const month = parseInt(dateStr.substring(0, 2));
  const day = parseInt(dateStr.substring(2, 4));
  const year = parseInt(dateStr.substring(4, 8));
  
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  
  return new Date(year, month - 1, day);
}

function parseAmount(amountStr) {
  if (!amountStr) return null;
  
  const cleanAmount = amountStr.replace(/[^\d.-]/g, '');
  if (!cleanAmount) return null;
  
  const amount = parseFloat(cleanAmount);
  if (isNaN(amount)) return null;
  
  // Convert from cents to dollars (divide by 100)
  return amount / 100;
}

// Run the enhanced processing
processTddfDtAndBhRecords();