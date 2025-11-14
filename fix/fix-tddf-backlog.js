// Direct database script to process the 298 pending TDDF records
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure WebSocket for Neon
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function processPendingTddfRecords() {
  console.log('🚀 Starting TDDF backlog processing directly via database...');
  
  try {
    // Get pending DT records from raw import table
    const result = await pool.query(`
      SELECT id, source_file_id, line_number, raw_line, record_type
      FROM dev_tddf_raw_import
      WHERE processing_status = 'pending' 
      AND record_type = 'DT'
      ORDER BY source_file_id, line_number
      LIMIT 100
    `);
    
    console.log(`📄 Found ${result.rows.length} pending DT records to process`);
    
    let processed = 0;
    let errors = 0;
    
    for (const rawLine of result.rows) {
      try {
        const line = rawLine.raw_line;
        const fileId = rawLine.source_file_id;
        
        // Parse TDDF fields from fixed-width format
        const sequenceNumber = line.substring(0, 7).trim() || null;
        const entryRunNumber = line.substring(7, 13).trim() || null;
        const sequenceWithinRun = line.substring(13, 17).trim() || null;
        const recordIdentifier = line.substring(17, 19).trim() || null;
        const bankNumber = line.substring(19, 23).trim() || null;
        const merchantAccountNumber = line.substring(23, 39).trim() || null;
        const referenceNumber = line.substring(61, 84).trim() || null;
        const transactionDate = parseDate(line.substring(84, 92).trim());
        const transactionAmount = parseAmount(line.substring(92, 103).trim());
        const merchantName = line.length > 242 ? line.substring(217, 242).trim() || null : null;
        const authAmount = parseAmount(line.substring(191, 203).trim());
        
        // Use raw SQL to insert TDDF record (avoiding ORM issues)
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
          sequenceNumber, entryRunNumber, sequenceWithinRun, recordIdentifier, bankNumber,
          merchantAccountNumber, referenceNumber, transactionDate, transactionAmount,
          merchantName, authAmount, fileId, rawLine.line_number, line
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
        console.log(`✅ Processed line ${rawLine.line_number}: TDDF record ${recordId} - $${transactionAmount} (${referenceNumber})`);
        
        if (processed % 20 === 0) {
          console.log(`📊 Progress: ${processed} records processed so far...`);
        }
        
      } catch (error) {
        errors++;
        console.error(`❌ Error processing line ${rawLine.id}:`, error.message);
        
        // Mark as skipped
        await pool.query(`
          UPDATE dev_tddf_raw_import 
          SET processing_status = 'skipped',
              skip_reason = $2,
              processed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `, [rawLine.id, `direct_processing_error: ${error.message.substring(0, 100)}`]);
      }
    }
    
    console.log(`\n🎉 TDDF backlog processing complete:`);
    console.log(`   ✅ Processed: ${processed} records`);
    console.log(`   ❌ Errors: ${errors} records`);
    
    // Check remaining backlog
    const backlogResult = await pool.query(`
      SELECT COUNT(*) as remaining
      FROM dev_tddf_raw_import
      WHERE processing_status = 'pending' 
      AND record_type = 'DT'
    `);
    
    console.log(`   📊 Remaining backlog: ${backlogResult.rows[0].remaining} records`);
    
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await pool.end();
  }
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

// Run the processing
processPendingTddfRecords();