#!/usr/bin/env node

// Production July 2025 File Processing Fix
// This script processes the 1,131 July 2025 files stuck in production uploaded_files table

const { neon } = require('@neondatabase/serverless');
const path = require('path');
const fs = require('fs');

const sql = neon(process.env.DATABASE_URL);

console.log('🚀 Production July 2025 File Processing Fix Starting...');

async function processProductionJulyFiles() {
  try {
    // Get all July 2025 files that need processing
    const julyFiles = await sql`
      SELECT id, original_filename, file_content, file_size, raw_lines_count, uploaded_at
      FROM uploaded_files 
      WHERE uploaded_at >= '2025-07-01' 
        AND uploaded_at < '2025-08-01'
        AND status = 'uploaded'
        AND file_type = 'tddf'
      ORDER BY uploaded_at
      LIMIT 10
    `;

    console.log(`📊 Found ${julyFiles.length} July 2025 files ready for processing`);

    if (julyFiles.length === 0) {
      console.log('✅ No files to process - all July 2025 files may already be processed');
      return;
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const file of julyFiles) {
      try {
        console.log(`\n🔄 Processing file: ${file.original_filename} (${file.id})`);
        
        // Update file status to 'encoding'
        await sql`
          UPDATE uploaded_files 
          SET status = 'encoding', 
              processing_notes = 'Started production processing via fix script'
          WHERE id = ${file.id}
        `;

        // Decode file content from base64
        const fileContent = Buffer.from(file.file_content, 'base64').toString('utf8');
        const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
        
        console.log(`📄 File content: ${lines.length} lines, ${fileContent.length} characters`);

        // Generate production table name for this file
        const sanitizedFilename = file.original_filename
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .toLowerCase();
        const productionTableName = `tddf1_file_${sanitizedFilename}`;

        console.log(`🗄️ Creating production table: ${productionTableName}`);

        // Create the production TDDF1 file table
        await sql`
          CREATE TABLE IF NOT EXISTS ${sql(productionTableName)} (
            id SERIAL PRIMARY KEY,
            raw_line TEXT NOT NULL,
            record_type VARCHAR(10),
            processing_date DATE,
            transaction_amount DECIMAL(15,2),
            bh_net_deposit DECIMAL(15,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;

        // Process each line and insert into the table
        let recordCount = 0;
        let totalTransactionAmount = 0;
        let totalBhNetDeposit = 0;

        for (const line of lines) {
          if (line.trim().length === 0) continue;

          let recordType = '';
          let transactionAmount = 0;
          let bhNetDeposit = 0;
          let processingDate = null;

          // Extract record type (first 2 characters)
          if (line.length >= 2) {
            recordType = line.substring(0, 2);
          }

          // Extract processing date from various record types
          if (recordType === 'BH' && line.length >= 15) {
            const dateStr = line.substring(7, 15); // YYYYMMDD format
            if (dateStr.match(/^\d{8}$/)) {
              processingDate = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
            }
          }

          // Extract transaction amounts based on TDDF specification
          if (recordType === 'DT' && line.length >= 103) {
            // DT record: positions 93-103 (0-indexed: 92-102)
            const amountStr = line.substring(92, 103);
            if (amountStr.match(/^\d+$/)) {
              transactionAmount = parseInt(amountStr) / 100; // Divide by 100 for decimal
              totalTransactionAmount += transactionAmount;
            }
          } else if (recordType === 'BH' && line.length >= 83) {
            // BH record: positions 69-83 (0-indexed: 68-82)  
            const netDepositStr = line.substring(68, 83);
            if (netDepositStr.match(/^\d+$/)) {
              bhNetDeposit = parseInt(netDepositStr) / 100; // Divide by 100 for decimal
              totalBhNetDeposit += bhNetDeposit;
            }
          }

          // Insert record into table
          await sql`
            INSERT INTO ${sql(productionTableName)} (
              raw_line, record_type, processing_date, transaction_amount, bh_net_deposit
            ) VALUES (
              ${line}, ${recordType}, ${processingDate}, ${transactionAmount}, ${bhNetDeposit}
            )
          `;

          recordCount++;
        }

        console.log(`✅ Inserted ${recordCount} records`);
        console.log(`💰 Total DT amounts: $${totalTransactionAmount.toFixed(2)}`);
        console.log(`🏦 Total BH deposits: $${totalBhNetDeposit.toFixed(2)}`);

        // Update file status to 'encoded' and add totals
        await sql`
          UPDATE uploaded_files 
          SET status = 'encoded',
              processing_notes = ${`Processed successfully: ${recordCount} records, $${totalTransactionAmount.toFixed(2)} DT, $${totalBhNetDeposit.toFixed(2)} BH`},
              total_records = ${recordCount},
              total_transaction_value = ${totalTransactionAmount}
          WHERE id = ${file.id}
        `;

        // Update production TDDF1 totals cache
        const fileDate = new Date(file.uploaded_at).toISOString().split('T')[0];
        await sql`
          INSERT INTO tddf1_totals (
            processing_date, total_files, total_records, 
            dt_transaction_amounts, bh_net_deposits, total_transaction_value
          ) VALUES (
            ${fileDate}, 1, ${recordCount}, 
            ${totalTransactionAmount}, ${totalBhNetDeposit}, ${totalTransactionAmount}
          )
          ON CONFLICT (processing_date) 
          DO UPDATE SET
            total_files = tddf1_totals.total_files + 1,
            total_records = tddf1_totals.total_records + ${recordCount},
            dt_transaction_amounts = tddf1_totals.dt_transaction_amounts + ${totalTransactionAmount},
            bh_net_deposits = tddf1_totals.bh_net_deposits + ${totalBhNetDeposit},
            total_transaction_value = tddf1_totals.total_transaction_value + ${totalTransactionAmount},
            last_updated = CURRENT_TIMESTAMP
        `;

        processedCount++;
        console.log(`✅ File ${file.original_filename} processed successfully (${processedCount}/${julyFiles.length})`);
        
      } catch (error) {
        console.error(`❌ Error processing file ${file.original_filename}:`, error.message);
        
        // Update file with error status
        await sql`
          UPDATE uploaded_files 
          SET status = 'error',
              processing_errors = ${`Processing failed: ${error.message}`}
          WHERE id = ${file.id}
        `;
        
        errorCount++;
      }
    }

    console.log(`\n🎉 Production July 2025 Processing Complete!`);
    console.log(`✅ Successfully processed: ${processedCount} files`);
    console.log(`❌ Errors: ${errorCount} files`);
    console.log(`📊 Remaining files: ${julyFiles.length - processedCount - errorCount}`);

    // Show updated totals
    const totals = await sql`
      SELECT processing_date, total_files, total_records,
             dt_transaction_amounts, bh_net_deposits
      FROM tddf1_totals 
      WHERE processing_date >= '2025-07-01' AND processing_date < '2025-08-01'
      ORDER BY processing_date
    `;

    console.log(`\n📈 Production TDDF1 Totals Updated:`);
    for (const total of totals) {
      console.log(`📅 ${total.processing_date}: ${total.total_files} files, ${total.total_records} records, $${total.dt_transaction_amounts} DT, $${total.bh_net_deposits} BH`);
    }

  } catch (error) {
    console.error('❌ Critical error in production processing:', error);
    throw error;
  }
}

// Run the fix
processProductionJulyFiles()
  .then(() => {
    console.log('🏁 Production July 2025 fix completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Production July 2025 fix failed:', error);
    process.exit(1);
  });