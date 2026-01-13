#!/usr/bin/env node
/**
 * Reprocess TDDF1 Totals Cache for Past 90 Days
 * 
 * This script rebuilds the dev_tddf1_totals table with enhanced BH Net Deposit extraction
 * for all existing TDDF1 file tables from the past 90 days.
 */

const { Pool } = require('@neondatabase/serverless');
const { WebSocket } = require('ws');

// Configure WebSocket for Neon serverless
global.WebSocket = WebSocket;

async function reprocessTddf1TotalsFor90Days() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: true,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: 10
  });
  
  try {
    console.log('[TDDF1-REPROCESS] Starting 90-day totals cache rebuild...');
    
    // Get all TDDF1 file tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'dev_tddf1_file_%' 
      AND table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`[TDDF1-REPROCESS] Found ${tablesResult.rows.length} TDDF1 file tables to process`);
    
    let processedCount = 0;
    let updatedCount = 0;
    
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      
      try {
        // Extract filename and date from table name
        // Format: dev_tddf1_file_vermntsb_6759_tddf_2400_mmddyyyy_hhmmss
        const dateTimeMatch = tableName.match(/(\d{8})_(\d{6})/);
        
        if (!dateTimeMatch) {
          console.warn(`[TDDF1-REPROCESS] Could not extract date from table: ${tableName}`);
          continue;
        }
        
        const dateStr = dateTimeMatch[1];
        const timeStr = dateTimeMatch[2];
        
        // Parse MMDDYYYY format
        const month = parseInt(dateStr.substring(0, 2));
        const day = parseInt(dateStr.substring(2, 4));
        const year = parseInt(dateStr.substring(4, 8));
        const processedDate = new Date(year, month - 1, day);
        
        // Skip if older than 90 days
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        if (processedDate < ninetyDaysAgo) {
          console.log(`[TDDF1-REPROCESS] Skipping ${tableName} - older than 90 days (${processedDate.toISOString().split('T')[0]})`);
          continue;
        }
        
        console.log(`[TDDF1-REPROCESS] Processing ${tableName} for date ${processedDate.toISOString().split('T')[0]}`);
        
        // Check if table has net_deposit column (newer tables) or need to extract from field_data
        const columnsResult = await pool.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = 'net_deposit'
        `, [tableName]);
        
        const hasNetDepositColumn = columnsResult.rows.length > 0;
        
        // Get file statistics from the table
        let statsQuery;
        if (hasNetDepositColumn) {
          // Newer tables with dedicated net_deposit column
          statsQuery = `
            SELECT 
              COUNT(*) as total_records,
              COALESCE(SUM(CASE WHEN record_type = 'DT' AND transaction_amount IS NOT NULL THEN transaction_amount ELSE 0 END), 0) as total_transaction_value,
              COALESCE(SUM(CASE WHEN record_type = 'BH' AND net_deposit IS NOT NULL THEN net_deposit ELSE 0 END), 0) as total_net_deposit_bh,
              source_filename
            FROM ${tableName}
            GROUP BY source_filename
            LIMIT 1
          `;
        } else {
          // Older tables - extract Net Deposit from field_data JSONB (positions 58-77, 20 chars)
          statsQuery = `
            SELECT 
              COUNT(*) as total_records,
              COALESCE(SUM(CASE WHEN record_type = 'DT' AND transaction_amount IS NOT NULL THEN transaction_amount ELSE 0 END), 0) as total_transaction_value,
              COALESCE(SUM(CASE 
                WHEN record_type = 'BH' AND field_data->>'netDeposit' IS NOT NULL 
                THEN CAST(field_data->>'netDeposit' AS NUMERIC) / 100.0
                WHEN record_type = 'BH' AND raw_line IS NOT NULL AND LENGTH(raw_line) >= 77
                THEN CAST(TRIM(SUBSTRING(raw_line FROM 59 FOR 20)) AS NUMERIC) / 100.0
                ELSE 0 
              END), 0) as total_net_deposit_bh,
              source_filename
            FROM ${tableName}
            GROUP BY source_filename
            LIMIT 1
          `;
        }
        
        const statsResult = await pool.query(statsQuery);
        
        if (statsResult.rows.length === 0) {
          console.warn(`[TDDF1-REPROCESS] No data found in table: ${tableName}`);
          continue;
        }
        
        const stats = statsResult.rows[0];
        
        // Get record type breakdown
        const recordTypesResult = await pool.query(`
          SELECT record_type, COUNT(*) as count
          FROM ${tableName}
          GROUP BY record_type
        `);
        
        const recordTypeBreakdown = {};
        let processingTimeMs = 5000; // Default processing time
        
        for (const typeRow of recordTypesResult.rows) {
          recordTypeBreakdown[typeRow.record_type] = parseInt(typeRow.count);
        }
        
        // Construct filename from table name if not available
        let filename = stats.source_filename;
        if (!filename) {
          // Reconstruct filename from table name pattern
          const filenameParts = tableName.replace('dev_tddf1_file_', '').split('_');
          filename = `${filenameParts.join('_').toUpperCase()}.TSYSO`;
        }
        
        console.log(`[TDDF1-REPROCESS] ${tableName}: ${stats.total_records} records, $${parseFloat(stats.total_transaction_value).toFixed(2)} transaction value, $${parseFloat(stats.total_net_deposit_bh).toFixed(2)} BH Net Deposit`);
        
        // Insert or update totals cache entry
        await pool.query(`
          INSERT INTO dev_tddf1_totals (
            date_processed, file_name, table_name, total_records, 
            total_transaction_value, total_net_deposit_bh, record_type_breakdown, 
            processing_time_ms, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (date_processed, file_name) 
          DO UPDATE SET 
            table_name = EXCLUDED.table_name,
            total_records = EXCLUDED.total_records,
            total_transaction_value = EXCLUDED.total_transaction_value,
            total_net_deposit_bh = EXCLUDED.total_net_deposit_bh,
            record_type_breakdown = EXCLUDED.record_type_breakdown,
            processing_time_ms = EXCLUDED.processing_time_ms,
            updated_at = CURRENT_TIMESTAMP
        `, [
          processedDate.toISOString().split('T')[0], // Date in YYYY-MM-DD format
          filename,
          tableName,
          parseInt(stats.total_records),
          parseFloat(stats.total_transaction_value),
          parseFloat(stats.total_net_deposit_bh),
          JSON.stringify(recordTypeBreakdown),
          processingTimeMs
        ]);
        
        updatedCount++;
        console.log(`[TDDF1-REPROCESS] ✅ Updated totals cache for ${processedDate.toISOString().split('T')[0]} - ${filename}`);
        
      } catch (error) {
        console.error(`[TDDF1-REPROCESS] Error processing table ${tableName}:`, error);
      }
      
      processedCount++;
      
      // Add small delay to avoid overwhelming the database
      if (processedCount % 10 === 0) {
        console.log(`[TDDF1-REPROCESS] Progress: ${processedCount}/${tablesResult.rows.length} tables processed (${updatedCount} updated)`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[TDDF1-REPROCESS] ✅ Completed 90-day reprocessing:`);
    console.log(`  - Total tables found: ${tablesResult.rows.length}`);
    console.log(`  - Tables processed: ${processedCount}`);
    console.log(`  - Cache entries updated: ${updatedCount}`);
    
    // Show summary of updated data
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(total_records) as total_records,
        SUM(total_transaction_value) as total_transaction_value,
        SUM(total_net_deposit_bh) as total_net_deposit_bh,
        MIN(date_processed) as earliest_date,
        MAX(date_processed) as latest_date
      FROM dev_tddf1_totals
      WHERE date_processed >= CURRENT_DATE - INTERVAL '90 days'
    `);
    
    if (summaryResult.rows.length > 0) {
      const summary = summaryResult.rows[0];
      console.log(`[TDDF1-REPROCESS] 📊 90-Day Summary:`);
      console.log(`  - Cache entries: ${summary.total_entries}`);
      console.log(`  - Total records: ${parseInt(summary.total_records || 0).toLocaleString()}`);
      console.log(`  - Total transaction value: $${parseFloat(summary.total_transaction_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
      console.log(`  - Total BH Net Deposit: $${parseFloat(summary.total_net_deposit_bh || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
      console.log(`  - Date range: ${summary.earliest_date} to ${summary.latest_date}`);
    }
    
  } catch (error) {
    console.error('[TDDF1-REPROCESS] Fatal error during reprocessing:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Execute if running directly
if (require.main === module) {
  reprocessTddf1TotalsFor90Days()
    .then(() => {
      console.log('[TDDF1-REPROCESS] ✅ Reprocessing completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[TDDF1-REPROCESS] ❌ Reprocessing failed:', error);
      process.exit(1);
    });
}

module.exports = { reprocessTddf1TotalsFor90Days };