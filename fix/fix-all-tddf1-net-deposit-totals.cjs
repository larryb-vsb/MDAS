#!/usr/bin/env node

/**
 * Fix Net Deposit Totals for All TDDF1 Files
 * 
 * This script recalculates Net Deposit totals for all existing TDDF1 files
 * using the corrected TDDF positions 69-83 instead of wrong positions 93-103
 */

const { neon } = require('@neondatabase/serverless');

async function fixAllTddf1NetDepositTotals() {
  const sql = neon(process.env.DATABASE_URL);
  
  console.log('🔧 Starting Net Deposit totals correction for all TDDF1 files...');
  
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
        // Calculate corrected Net Deposit total using positions 69-83
        const netDepositResult = await sql(`
          SELECT COALESCE(SUM(CAST(SUBSTRING(raw_line, 69, 15) AS DECIMAL) / 100.0), 0) as corrected_net_deposit
          FROM ${table_name}
          WHERE record_type = 'BH' 
            AND LENGTH(raw_line) >= 83
            AND SUBSTRING(raw_line, 69, 15) ~ '^[0-9]+$'
        `);
        
        const correctedNetDeposit = parseFloat(netDepositResult[0]?.corrected_net_deposit || '0');
        
        // Get the corresponding totals cache entry
        const filenameMatch = table_name.match(/dev_tddf1_file_(.+)/);
        if (!filenameMatch) {
          console.log(`⚠️  Could not extract filename from table name: ${table_name}`);
          continue;
        }
        
        // Convert sanitized filename back to original filename format
        const sanitizedFilename = filenameMatch[1];
        
        // Find the corresponding cache entry
        const cacheResult = await sql(`
          SELECT date_processed, file_name, total_net_deposit_bh 
          FROM dev_tddf1_totals 
          WHERE table_name = $1
        `, [table_name]);
        
        if (cacheResult.length === 0) {
          console.log(`⚠️  No cache entry found for table: ${table_name}`);
          continue;
        }
        
        const cacheEntry = cacheResult[0];
        const oldNetDeposit = parseFloat(cacheEntry.total_net_deposit_bh || '0');
        
        // Update the cache with corrected Net Deposit total
        await sql(`
          UPDATE dev_tddf1_totals 
          SET total_net_deposit_bh = $1, updated_at = CURRENT_TIMESTAMP
          WHERE table_name = $2
        `, [correctedNetDeposit, table_name]);
        
        console.log(`✅ Updated ${cacheEntry.file_name}:`);
        console.log(`   Old Net Deposit: $${oldNetDeposit.toLocaleString()}`);
        console.log(`   New Net Deposit: $${correctedNetDeposit.toLocaleString()}`);
        console.log(`   Difference: $${(correctedNetDeposit - oldNetDeposit).toLocaleString()}`);
        
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
        SUM(total_net_deposit_bh) as total_corrected_net_deposit,
        MIN(date_processed) as earliest_date,
        MAX(date_processed) as latest_date
      FROM dev_tddf1_totals
    `);
    
    if (summaryResult.length > 0) {
      const summary = summaryResult[0];
      console.log(`\n📈 Updated Summary:`);
      console.log(`   Total Files: ${summary.total_files}`);
      console.log(`   Total Net Deposit: $${parseFloat(summary.total_corrected_net_deposit).toLocaleString()}`);
      console.log(`   Date Range: ${summary.earliest_date} to ${summary.latest_date}`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error during Net Deposit correction:', error);
    process.exit(1);
  }
}

// Run the correction if this script is executed directly
if (require.main === module) {
  fixAllTddf1NetDepositTotals()
    .then(() => {
      console.log('\n✅ Net Deposit totals correction completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Net Deposit correction failed:', error);
      process.exit(1);
    });
}

module.exports = { fixAllTddf1NetDepositTotals };