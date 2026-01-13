/**
 * Comprehensive TDDF Failed File Retry and Recovery System
 * Fixes all failed TDDF files with proper error handling and processing
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Helper function to get environment-specific table names
function getTableName(baseName) {
  const env = process.env.NODE_ENV || 'development';
  return env === 'production' ? baseName : `dev_${baseName}`;
}

// Parse TDDF date format (MMDDCCYY) -> ISO Date
function parseTddfDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return null;
  
  const month = parseInt(dateStr.substring(0, 2), 10);
  const day = parseInt(dateStr.substring(2, 4), 10);
  const centuryYear = parseInt(dateStr.substring(4, 8), 10);
  
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  
  const date = new Date(centuryYear, month - 1, day);
  return date.toISOString();
}

// Parse transaction amounts (includes cents conversion)
function parseAmount(amountStr) {
  if (!amountStr) return 0;
  const cleanAmount = amountStr.replace(/[^\d.-]/g, '');
  const amount = parseFloat(cleanAmount);
  return isNaN(amount) ? 0 : amount;
}

// Parse Auth Amount (positions 192-203) - stored in cents format
function parseAuthAmount(amountStr) {
  if (!amountStr) return 0;
  const cleanAmount = amountStr.replace(/[^\d]/g, '');
  const amountInCents = parseInt(cleanAmount, 10);
  return isNaN(amountInCents) ? 0 : (amountInCents / 100);
}

// Comprehensive TDDF record processing from raw line
async function processTddfRecord(rawLine, client) {
  const line = rawLine.raw_line;
  const recordType = line.substring(17, 19).trim();
  
  if (recordType !== 'DT') {
    // Skip non-DT records, mark as skipped
    await client.query(`
      UPDATE "${getTableName('tddf_raw_import')}" 
      SET processing_status = 'skipped',
          skip_reason = 'non_dt_record',
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [rawLine.id]);
    return { type: 'skipped', reason: 'non_dt_record' };
  }

  try {
    // Parse comprehensive TDDF fixed-width format
    const tddfRecord = {
      // Core TDDF header fields (positions 1-23)
      recordFormat: line.substring(0, 3).trim() || null,
      applicationIndicator: line.substring(3, 4).trim() || null,
      routingId: line.substring(4, 6).trim() || '02',
      recordType: line.substring(17, 19).trim() || null,
      merchantAccount: line.substring(23, 39).trim() || null,
      
      // Transaction identification and amounts (positions 40-120)
      transactionDate: parseTddfDate(line.substring(84, 92).trim()) || null,
      transactionAmount: parseAuthAmount(line.substring(192, 203).trim()) || parseAmount(line.substring(92, 103).trim()),
      referenceNumber: line.substring(61, 84).trim() || null,
      batchId: line.substring(39, 49).trim() || null,
      
      // Enhanced transaction details
      authAmount: parseAuthAmount(line.substring(192, 203).trim()),
      txnType: line.substring(334, 338).trim() || null,
      cardType: line.substring(338, 341).trim() || null,
      debitCreditIndicator: line.substring(204, 205).trim() || null,
      
      // Merchant information
      merchantName: line.substring(104, 129).trim() || null,
      merchantCity: line.substring(129, 142).trim() || null,
      merchantState: line.substring(142, 144).trim() || null,
      merchantZip: line.substring(144, 154).trim() || null,
      mccCode: line.substring(272, 276).trim() || null,
      
      // Terminal and POS information
      vNumber: line.substring(276, 284).trim() || null,
      terminalId: line.substring(276, 284).trim() || null,
      
      // System fields
      sourceFileId: rawLine.source_file_id,
      sourceRowNumber: rawLine.line_number,
      mmsRawLine: line,
      rawData: {
        recordType: rawLine.record_type,
        recordDescription: rawLine.record_description,
        lineNumber: rawLine.line_number,
        lineLength: line.length,
        processingTimestamp: new Date().toISOString()
      }
    };

    // Insert TDDF record using parameterized query
    const insertResult = await client.query(`
      INSERT INTO "${getTableName('tddf_records')}" (
        record_format, application_indicator, routing_id, record_type, merchant_account,
        transaction_date, transaction_amount, reference_number, batch_id, auth_amount,
        txn_type, card_type, debit_credit_indicator, merchant_name, merchant_city,
        merchant_state, merchant_zip, mcc_code, v_number, terminal_id,
        source_file_id, source_row_number, mms_raw_line, raw_data, recorded_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, CURRENT_TIMESTAMP
      ) RETURNING id
    `, [
      tddfRecord.recordFormat, tddfRecord.applicationIndicator, tddfRecord.routingId,
      tddfRecord.recordType, tddfRecord.merchantAccount, tddfRecord.transactionDate,
      tddfRecord.transactionAmount, tddfRecord.referenceNumber, tddfRecord.batchId,
      tddfRecord.authAmount, tddfRecord.txnType, tddfRecord.cardType,
      tddfRecord.debitCreditIndicator, tddfRecord.merchantName, tddfRecord.merchantCity,
      tddfRecord.merchantState, tddfRecord.merchantZip, tddfRecord.mccCode,
      tddfRecord.vNumber, tddfRecord.terminalId, tddfRecord.sourceFileId,
      tddfRecord.sourceRowNumber, tddfRecord.mmsRawLine, JSON.stringify(tddfRecord.rawData)
    ]);

    const createdRecordId = insertResult.rows[0].id;

    // Mark raw line as processed
    await client.query(`
      UPDATE "${getTableName('tddf_raw_import')}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [getTableName('tddf_records'), createdRecordId, rawLine.id]);

    return { 
      type: 'processed', 
      recordId: createdRecordId, 
      amount: tddfRecord.transactionAmount,
      reference: tddfRecord.referenceNumber 
    };

  } catch (error) {
    // Mark raw line as failed
    await client.query(`
      UPDATE "${getTableName('tddf_raw_import')}" 
      SET processing_status = 'failed',
          skip_reason = $1,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [`processing_error: ${error.message}`, rawLine.id]);

    return { type: 'error', error: error.message };
  }
}

// Main retry processing function
async function retryFailedTddfFiles() {
  console.log('🔄 Starting comprehensive TDDF failed file retry system...');
  
  try {
    // Get all failed TDDF files
    const failedFilesResult = await pool.query(`
      SELECT id, original_filename, processing_errors, file_content
      FROM "${getTableName('uploaded_files')}"
      WHERE file_type = 'tddf' 
      AND processing_status = 'failed'
      AND file_content IS NOT NULL
      ORDER BY uploaded_at ASC
    `);

    const failedFiles = failedFilesResult.rows;
    console.log(`📄 Found ${failedFiles.length} failed TDDF files to retry`);

    if (failedFiles.length === 0) {
      console.log('✅ No failed TDDF files found');
      return;
    }

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let filesFixed = 0;

    for (const file of failedFiles) {
      console.log(`\n🔧 Retrying file: ${file.original_filename} (${file.id})`);
      console.log(`   Previous error: ${file.processing_errors}`);

      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // First, store/update raw import data if not exists
        const fileContent = file.file_content;
        if (!fileContent) {
          console.log('   ❌ No file content available, skipping');
          continue;
        }

        const lines = fileContent.split('\n').filter(line => line.trim());
        console.log(`   📊 Processing ${lines.length} lines from file content`);

        // Clear any existing raw import records for this file
        await client.query(`
          DELETE FROM "${getTableName('tddf_raw_import')}" 
          WHERE source_file_id = $1
        `, [file.id]);

        // Insert all raw lines first
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const recordType = line.length >= 19 ? line.substring(17, 19).trim() : 'UNKNOWN';
          
          await client.query(`
            INSERT INTO "${getTableName('tddf_raw_import')}" (
              source_file_id, line_number, raw_line, record_type, 
              record_description, processing_status, created_at
            ) VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
          `, [
            file.id, 
            i + 1, 
            line, 
            recordType, 
            `${recordType} record from line ${i + 1}`
          ]);
        }

        // Now process all raw lines for this file
        const rawLinesResult = await client.query(`
          SELECT * FROM "${getTableName('tddf_raw_import')}"
          WHERE source_file_id = $1
          ORDER BY line_number
        `, [file.id]);

        const rawLines = rawLinesResult.rows;
        let fileProcessed = 0;
        let fileSkipped = 0;
        let fileErrors = 0;

        for (const rawLine of rawLines) {
          const result = await processTddfRecord(rawLine, client);
          
          if (result.type === 'processed') {
            fileProcessed++;
            console.log(`   ✅ Line ${rawLine.line_number}: $${result.amount} - ${result.reference}`);
          } else if (result.type === 'skipped') {
            fileSkipped++;
          } else if (result.type === 'error') {
            fileErrors++;
            console.log(`   ❌ Line ${rawLine.line_number}: ${result.error}`);
          }
        }

        // Update file status to completed
        await client.query(`
          UPDATE "${getTableName('uploaded_files')}"
          SET processing_status = 'completed',
              records_processed = $1,
              records_skipped = $2,
              records_with_errors = $3,
              processing_errors = NULL,
              processing_completed_at = CURRENT_TIMESTAMP,
              processed_at = CURRENT_TIMESTAMP,
              processed = true
          WHERE id = $4
        `, [fileProcessed, fileSkipped, fileErrors, file.id]);

        await client.query('COMMIT');
        
        totalProcessed += fileProcessed;
        totalSkipped += fileSkipped;
        totalErrors += fileErrors;
        filesFixed++;

        console.log(`   ✅ File fixed: ${fileProcessed} processed, ${fileSkipped} skipped, ${fileErrors} errors`);

      } catch (error) {
        await client.query('ROLLBACK');
        console.log(`   ❌ Failed to retry file ${file.original_filename}: ${error.message}`);
      } finally {
        client.release();
      }
    }

    console.log(`\n🎉 Retry operation complete:`);
    console.log(`   ✅ Files Fixed: ${filesFixed}/${failedFiles.length}`);
    console.log(`   ✅ Total Processed: ${totalProcessed} records`);
    console.log(`   ✅ Total Skipped: ${totalSkipped} records`);
    console.log(`   ❌ Total Errors: ${totalErrors} records`);

  } catch (error) {
    console.error('❌ Error in retry system:', error);
  } finally {
    await pool.end();
  }
}

// Run the retry system
retryFailedTddfFiles().catch(console.error);