// Fix TDDF1 Merchant Totals - Final Correct Version with Proper Field Positions
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixTddf1MerchantTotalsFinal() {
  console.log('🔄 Starting FINAL corrected TDDF1 merchant totals fix...');
  
  try {
    // Environment-aware table naming
    const environment = process.env.NODE_ENV || 'development';
    const isDevelopment = environment === 'development';
    const merchantsTableName = isDevelopment ? 'dev_tddf1_merchants' : 'tddf1_merchants';
    
    // Get all TDDF1 file tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '${isDevelopment ? 'dev_' : ''}tddf1_file_%'
      ORDER BY table_name
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    console.log(`📊 Found ${tablesResult.rows.length} TDDF1 file tables`);
    
    // Calculate totals for each merchant using CORRECT field positions
    const merchantTotals = {};
    
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      console.log(`📋 Processing table: ${tableName}`);
      
      try {
        // Get BH and DT records with CORRECT field positions from TDDF specification
        const bhQuery = `
          SELECT 
            merchant_id,
            COUNT(*) as bh_count,
            -- BH Net Deposit: positions 69-83 (15 chars), divide by 100 for decimal conversion
            SUM(
              CASE 
                WHEN LENGTH(raw_line) >= 83 AND SUBSTRING(raw_line, 69, 15) ~ '^[0-9]+$' THEN 
                  CAST(SUBSTRING(raw_line, 69, 15) AS BIGINT)::DECIMAL / 100.0
                ELSE 0 
              END
            ) as total_net_deposits
          FROM ${tableName}
          WHERE record_type = 'BH'
          GROUP BY merchant_id
        `;
        
        const dtQuery = `
          SELECT 
            merchant_id,
            COUNT(*) as dt_count,
            -- DT Transaction Amount: positions 93-103 (11 chars), divide by 100 for decimal conversion
            SUM(
              CASE 
                WHEN LENGTH(raw_line) >= 103 AND SUBSTRING(raw_line, 93, 11) ~ '^[0-9]+$' THEN 
                  CAST(SUBSTRING(raw_line, 93, 11) AS BIGINT)::DECIMAL / 100.0
                ELSE 0 
              END
            ) as total_authorization_amount
          FROM ${tableName}
          WHERE record_type = 'DT'
          GROUP BY merchant_id
        `;
        
        // Process BH records
        const bhResult = await pool.query(bhQuery);
        for (const row of bhResult.rows) {
          const merchantId = row.merchant_id;
          if (!merchantTotals[merchantId]) {
            merchantTotals[merchantId] = {
              bh_net_deposits: 0,
              dt_authorization_amounts: 0,
              bh_count: 0,
              dt_count: 0
            };
          }
          merchantTotals[merchantId].bh_net_deposits += parseFloat(row.total_net_deposits || 0);
          merchantTotals[merchantId].bh_count += parseInt(row.bh_count || 0);
        }
        
        // Process DT records
        const dtResult = await pool.query(dtQuery);
        for (const row of dtResult.rows) {
          const merchantId = row.merchant_id;
          if (!merchantTotals[merchantId]) {
            merchantTotals[merchantId] = {
              bh_net_deposits: 0,
              dt_authorization_amounts: 0,
              bh_count: 0,
              dt_count: 0
            };
          }
          merchantTotals[merchantId].dt_authorization_amounts += parseFloat(row.total_authorization_amount || 0);
          merchantTotals[merchantId].dt_count += parseInt(row.dt_count || 0);
        }
        
      } catch (tableError) {
        console.log(`⚠️ Error processing table ${tableName}:`, tableError.message);
      }
    }
    
    console.log(`💰 Calculated totals for ${Object.keys(merchantTotals).length} merchants`);
    
    // Update merchant totals with corrected values
    let updatedCount = 0;
    for (const [merchantId, totals] of Object.entries(merchantTotals)) {
      try {
        const updateQuery = `
          UPDATE ${merchantsTableName} 
          SET 
            total_net_deposits = $1,
            total_amount = $2,
            total_transactions = $3
          WHERE merchant_id = $4
        `;
        
        await pool.query(updateQuery, [
          totals.bh_net_deposits,
          totals.dt_authorization_amounts, 
          totals.dt_count,
          merchantId
        ]);
        
        console.log(`✅ Updated ${merchantId}: Net Deposits=$${totals.bh_net_deposits.toFixed(2)}, Authorization=$${totals.dt_authorization_amounts.toFixed(2)}, DT Records=${totals.dt_count}, BH Records=${totals.bh_count}`);
        updatedCount++;
        
      } catch (updateError) {
        console.log(`❌ Error updating merchant ${merchantId}:`, updateError.message);
      }
    }
    
    console.log(`🎉 Successfully updated ${updatedCount} merchants`);
    
    // Show sample results
    const sampleQuery = `
      SELECT merchant_id, merchant_name, total_net_deposits, total_amount, total_transactions
      FROM ${merchantsTableName} 
      WHERE total_net_deposits > 0 OR total_amount > 0
      ORDER BY total_net_deposits DESC
      LIMIT 10
    `;
    
    const sampleResult = await pool.query(sampleQuery);
    console.log('\n📋 Sample Updated Results (Top 10 by Net Deposits):');
    console.log('Merchant ID | Merchant Name | Net Deposits | Authorization | DT Records');
    console.log('-----------|---------------|--------------|---------------|----------');
    
    for (const row of sampleResult.rows) {
      console.log(`${row.merchant_id} | ${(row.merchant_name || 'N/A').substring(0, 20)} | $${parseFloat(row.total_net_deposits).toFixed(2)} | $${parseFloat(row.total_amount).toFixed(2)} | ${row.total_transactions}`);
    }
    
    // Verify totals match daily overview expectations
    const totalQuery = `
      SELECT 
        SUM(total_net_deposits) as total_net_deposits,
        SUM(total_amount) as total_authorization,
        SUM(total_transactions) as total_dt_records,
        COUNT(*) as total_merchants
      FROM ${merchantsTableName}
      WHERE total_net_deposits > 0 OR total_amount > 0
    `;
    
    const totalResult = await pool.query(totalQuery);
    const totals = totalResult.rows[0];
    
    console.log('\n📊 Overall Totals:');
    console.log(`BH Net Deposits: $${parseFloat(totals.total_net_deposits).toFixed(2)}`);
    console.log(`DT Authorization: $${parseFloat(totals.total_authorization).toFixed(2)}`);
    console.log(`DT Records: ${totals.total_dt_records}`);
    console.log(`Active Merchants: ${totals.total_merchants}`);
    
    console.log('\n✅ TDDF1 merchant totals fix completed successfully!');
    console.log('   - BH Net Deposits now show actual batch deposit amounts');
    console.log('   - DT Authorization shows correct transaction amounts (positions 93-103)');
    console.log('   - Merchant table ready for display');
    
  } catch (error) {
    console.error('❌ Error fixing TDDF1 merchant totals:', error);
  } finally {
    await pool.end();
  }
}

// Run the final corrected fix
fixTddf1MerchantTotalsFinal();