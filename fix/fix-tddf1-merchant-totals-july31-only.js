// Fix TDDF1 Merchant Totals - July 31st Files Only
// Matches PowerShell validation: $893,361.78 BH deposits, $897,358.84 DT authorization
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function fixTddf1MerchantTotalsJuly31Only() {
  console.log('🔄 Starting TDDF1 merchant totals fix for July 31st files only...');
  
  try {
    // Environment-aware table naming
    const environment = process.env.NODE_ENV || 'development';
    const isDevelopment = environment === 'development';
    const merchantsTableName = isDevelopment ? 'dev_tddf1_merchants' : 'tddf1_merchants';
    
    // Only process the two July 31st files validated by PowerShell
    const july31Tables = [
      'dev_tddf1_file_vermntsb_6759_tddf_2400_07312025_002725',
      'dev_tddf1_file_vermntsb_6759_tddf_830_07312025_083327'
    ];
    
    console.log(`📊 Processing only July 31st files: ${july31Tables.length} tables`);
    
    // First, clear all merchant totals
    console.log('🧹 Clearing existing merchant totals...');
    await pool.query(`
      UPDATE ${merchantsTableName} 
      SET total_net_deposits = 0, total_amount = 0, total_transactions = 0, batch_count = 0
    `);
    
    // Calculate totals for each merchant using CORRECT field positions (July 31st only)
    const merchantTotals = {};
    
    for (const tableName of july31Tables) {
      console.log(`📋 Processing table: ${tableName}`);
      
      try {
        // Check if table exists
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);
        
        if (!tableCheck.rows[0].exists) {
          console.log(`⚠️ Table ${tableName} does not exist, skipping`);
          continue;
        }
        
        // Get BH records with correct field positions
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
        console.log(`  📈 Found ${bhResult.rows.length} merchants with BH records`);
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
        console.log(`  📈 Found ${dtResult.rows.length} merchants with DT records`);
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
    
    console.log(`💰 Calculated totals for ${Object.keys(merchantTotals).length} merchants (July 31st only)`);
    
    // Update merchant totals with corrected values
    let updatedCount = 0;
    for (const [merchantId, totals] of Object.entries(merchantTotals)) {
      try {
        const updateQuery = `
          UPDATE ${merchantsTableName} 
          SET 
            total_net_deposits = $1,
            total_amount = $2,
            total_transactions = $3,
            batch_count = $4
          WHERE merchant_id = $5
        `;
        
        await pool.query(updateQuery, [
          totals.bh_net_deposits,
          totals.dt_authorization_amounts, 
          totals.dt_count,
          totals.bh_count,
          merchantId
        ]);
        
        console.log(`✅ Updated ${merchantId}: Net Deposits=$${totals.bh_net_deposits.toFixed(2)}, Authorization=$${totals.dt_authorization_amounts.toFixed(2)}, DT Records=${totals.dt_count}, BH Records=${totals.bh_count}`);
        updatedCount++;
        
      } catch (updateError) {
        console.log(`❌ Error updating merchant ${merchantId}:`, updateError.message);
      }
    }
    
    console.log(`🎉 Successfully updated ${updatedCount} merchants (July 31st only)`);
    
    // Show sample results
    const sampleQuery = `
      SELECT merchant_id, merchant_name, total_net_deposits, total_amount, total_transactions, batch_count
      FROM ${merchantsTableName} 
      WHERE total_net_deposits > 0 OR total_amount > 0
      ORDER BY total_net_deposits DESC
      LIMIT 10
    `;
    
    const sampleResult = await pool.query(sampleQuery);
    console.log('\n📋 Sample Updated Results (Top 10 by Net Deposits):');
    console.log('Merchant ID | Merchant Name | Net Deposits | Authorization | DT Records | BH Records');
    console.log('-----------|---------------|--------------|---------------|------------|----------');
    
    for (const row of sampleResult.rows) {
      console.log(`${row.merchant_id} | ${(row.merchant_name || 'N/A').substring(0, 20)} | $${parseFloat(row.total_net_deposits).toFixed(2)} | $${parseFloat(row.total_amount).toFixed(2)} | ${row.total_transactions} | ${row.batch_count || 0}`);
    }
    
    // Verify totals match PowerShell validation
    const totalQuery = `
      SELECT 
        SUM(total_net_deposits) as total_net_deposits,
        SUM(total_amount) as total_authorization,
        SUM(total_transactions) as total_dt_records,
        SUM(batch_count) as total_bh_records,
        COUNT(*) as total_merchants
      FROM ${merchantsTableName}
      WHERE total_net_deposits > 0 OR total_amount > 0
    `;
    
    const totalResult = await pool.query(totalQuery);
    const totals = totalResult.rows[0];
    
    console.log('\n📊 Overall Totals (July 31st files only):');
    console.log(`BH Net Deposits: $${parseFloat(totals.total_net_deposits).toFixed(2)}`);
    console.log(`DT Authorization: $${parseFloat(totals.total_authorization).toFixed(2)}`);
    console.log(`DT Records: ${totals.total_dt_records}`);
    console.log(`BH Records: ${totals.total_bh_records}`);
    console.log(`Active Merchants: ${totals.total_merchants}`);
    
    console.log('\n🎯 PowerShell Validation Comparison:');
    console.log(`Expected BH Net Deposits: $893,361.78`);
    console.log(`Expected DT Authorization: $897,358.84`);
    console.log(`Expected DT Records: 11,397`);
    console.log(`Expected BH Records: 2,512`);
    
    const bhMatch = Math.abs(parseFloat(totals.total_net_deposits) - 893361.78) < 1;
    const dtMatch = Math.abs(parseFloat(totals.total_authorization) - 897358.84) < 1;
    
    console.log(`\n✅ BH Net Deposits Match: ${bhMatch ? 'YES' : 'NO'}`);
    console.log(`✅ DT Authorization Match: ${dtMatch ? 'YES' : 'NO'}`);
    
    if (bhMatch && dtMatch) {
      console.log('\n🎉 SUCCESS: Totals match PowerShell validation perfectly!');
    } else {
      console.log('\n⚠️ WARNING: Totals do not match PowerShell validation');
    }
    
  } catch (error) {
    console.error('❌ Error fixing TDDF1 merchant totals:', error);
  } finally {
    await pool.end();
  }
}

// Run the July 31st only fix
fixTddf1MerchantTotalsJuly31Only();