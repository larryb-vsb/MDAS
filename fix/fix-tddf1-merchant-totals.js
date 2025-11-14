// Fix TDDF1 Merchant Totals - Calculate actual BH Net Deposits and DT Amounts
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixTddf1MerchantTotals() {
  console.log('🔄 Starting TDDF1 merchant totals fix...');
  
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
    
    // Calculate totals for each merchant
    const merchantTotals = {};
    
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      console.log(`📋 Processing table: ${tableName}`);
      
      try {
        // Get BH net deposits (positions 69-83) and DT transaction amounts (positions 63-74)
        const totalsQuery = `
          SELECT 
            merchant_id,
            record_type,
            COUNT(*) as record_count,
            -- BH Net Deposits: positions 69-83 (15 chars), divide by 100 for decimal
            SUM(CASE 
              WHEN record_type = 'BH' AND LENGTH(raw_line) >= 83 THEN 
                CAST(REGEXP_REPLACE(SUBSTRING(raw_line, 69, 15), '[^0-9]', '', 'g') AS BIGINT)::DECIMAL / 100.0
              ELSE 0 
            END) as bh_net_deposits,
            -- DT Transaction Amounts: positions 63-74 (12 chars), divide by 100 for decimal  
            SUM(CASE 
              WHEN record_type = 'DT' AND LENGTH(raw_line) >= 74 THEN 
                CAST(REGEXP_REPLACE(SUBSTRING(raw_line, 63, 12), '[^0-9]', '', 'g') AS BIGINT)::DECIMAL / 100.0
              ELSE 0 
            END) as dt_transaction_amounts
          FROM ${tableName}
          WHERE record_type IN ('BH', 'DT')
          GROUP BY merchant_id, record_type
        `;
        
        const totalsResult = await pool.query(totalsQuery);
        
        for (const row of totalsResult.rows) {
          const merchantId = row.merchant_id;
          
          if (!merchantTotals[merchantId]) {
            merchantTotals[merchantId] = {
              bh_net_deposits: 0,
              dt_transaction_amounts: 0,
              bh_record_count: 0,
              dt_record_count: 0
            };
          }
          
          if (row.record_type === 'BH') {
            merchantTotals[merchantId].bh_net_deposits += parseFloat(row.bh_net_deposits || 0);
            merchantTotals[merchantId].bh_record_count += parseInt(row.record_count || 0);
          } else if (row.record_type === 'DT') {
            merchantTotals[merchantId].dt_transaction_amounts += parseFloat(row.dt_transaction_amounts || 0);
            merchantTotals[merchantId].dt_record_count += parseInt(row.record_count || 0);
          }
        }
        
      } catch (tableError) {
        console.log(`⚠️ Error processing table ${tableName}:`, tableError.message);
      }
    }
    
    console.log(`💰 Calculated totals for ${Object.keys(merchantTotals).length} merchants`);
    
    // Update merchant totals
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
          totals.dt_transaction_amounts, 
          totals.dt_record_count,
          merchantId
        ]);
        
        console.log(`✅ Updated ${merchantId}: BH=$${totals.bh_net_deposits.toFixed(2)}, DT=$${totals.dt_transaction_amounts.toFixed(2)}, Records=${totals.dt_record_count}`);
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
      ORDER BY total_amount DESC
      LIMIT 5
    `;
    
    const sampleResult = await pool.query(sampleQuery);
    console.log('\n📋 Sample Updated Results:');
    console.log('Merchant ID | Merchant Name | Net Deposits | DT Amounts | DT Records');
    console.log('-----------|---------------|--------------|------------|----------');
    
    for (const row of sampleResult.rows) {
      console.log(`${row.merchant_id} | ${row.merchant_name?.substring(0, 20) || 'N/A'} | $${parseFloat(row.total_net_deposits).toFixed(2)} | $${parseFloat(row.total_amount).toFixed(2)} | ${row.total_transactions}`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing TDDF1 merchant totals:', error);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixTddf1MerchantTotals();