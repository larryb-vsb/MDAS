#!/usr/bin/env node

/**
 * Fix DT Transaction Amount Totals for All TDDF1 Files
 * 
 * This script recalculates DT Transaction Amount totals for all existing TDDF1 files
 * using the correct raw TDDF positions 93-103 with regex validation
 */

const { neon } = require('@neondatabase/serverless');

async function fixAllTddf1TransactionTotals() {
  const sql = neon(process.env.DATABASE_URL);
  
  console.log('🔧 Starting DT Transaction Amount totals correction for all TDDF1 files...');
  
  try {
    // Get all TDDF1 tables that need correction
    const tablesResult = await sql(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'dev_tddf1_file_%'
      ORDER BY table_name
    `);
    
    console.log(`📊 Found ${tablesResult.length} TDDF1 tables to process`);
    
    let totalUpdated = 0;
    
    for (const { table_name } of tablesResult) {
      console.log(`\n🔄 Processing ${table_name}...`);
      
      try {
        // Calculate corrected DT Transaction Amount total using positions 93-103
        const transactionResult = await sql(`
          SELECT COALESCE(SUM(CAST(SUBSTRING(raw_line, 93, 11) AS DECIMAL) / 100.0), 0) as corrected_transaction_value
          FROM ${table_name}
          WHERE record_type = 'DT' 
            AND LENGTH(raw_line) >= 103
            AND SUBSTRING(raw_line, 93, 11) ~ '^[0-9]+$'
        `);
        
        const correctedTransactionValue = parseFloat(transactionResult[0]?.corrected_transaction_value || '0');
        
        // Get the corresponding totals cache entry
        const cacheResult = await sql(`
          SELECT date_processed, file_name, total_transaction_value 
          FROM dev_tddf1_totals 
          WHERE table_name = $1
        `, [table_name]);
        
        if (cacheResult.length === 0) {
          console.log(`⚠️  No cache entry found for table: ${table_name}`);
          continue;
        }
        
        const cacheEntry = cacheResult[0];
        const oldTransactionValue = parseFloat(cacheEntry.total_transaction_value || '0');
        
        // Update the cache with corrected DT Transaction Amount total
        await sql(`
          UPDATE dev_tddf1_totals 
          SET total_transaction_value = $1, updated_at = CURRENT_TIMESTAMP
          WHERE table_name = $2
        `, [correctedTransactionValue, table_name]);
        
        console.log(`✅ Updated ${cacheEntry.file_name}:`);
        console.log(`   Old Transaction Value: $${oldTransactionValue.toLocaleString()}`);
        console.log(`   New Transaction Value: $${correctedTransactionValue.toLocaleString()}`);
        console.log(`   Difference: $${(correctedTransactionValue - oldTransactionValue).toLocaleString()}`);
        
        totalUpdated++;
        
      } catch (tableError) {
        console.error(`❌ Error processing ${table_name}:`, tableError.message);
      }
    }
    
    console.log(`\n🎉 Correction complete! Updated ${totalUpdated} out of ${tablesResult.length} files`);
    
    // Show summary of corrected totals
    const summaryResult = await sql(`
      SELECT 
        COUNT(*) as total_files,
        SUM(total_transaction_value) as total_corrected_transaction_value,
        MIN(date_processed) as earliest_date,
        MAX(date_processed) as latest_date
      FROM dev_tddf1_totals
    `);
    
    if (summaryResult.length > 0) {
      const summary = summaryResult[0];
      console.log(`\n📈 Updated Summary:`);
      console.log(`   Total Files: ${summary.total_files}`);
      console.log(`   Total Transaction Value: $${parseFloat(summary.total_corrected_transaction_value).toLocaleString()}`);
      console.log(`   Date Range: ${summary.earliest_date} to ${summary.latest_date}`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error during DT Transaction Amount correction:', error);
    process.exit(1);
  }
}

// Run the correction if this script is executed directly
if (require.main === module) {
  fixAllTddf1TransactionTotals()
    .then(() => {
      console.log('\n✅ DT Transaction Amount totals correction completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ DT Transaction Amount correction failed:', error);
      process.exit(1);
    });
}

module.exports = { fixAllTddf1TransactionTotals };