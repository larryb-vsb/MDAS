import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function populateJuly31Merchants() {
  console.log('🔄 Populating merchants table with July 31st data only...');
  
  try {
    // Step 1: Get BH data for July 31st
    const bhQuery = `
      WITH july31_bh AS (
        SELECT 
          merchant_id,
          raw_line,
          CASE 
            WHEN LENGTH(raw_line) >= 84 AND SUBSTRING(raw_line, 70, 15) ~ '^[0-9]+$'
            THEN CAST(SUBSTRING(raw_line, 70, 15) AS NUMERIC) / 100.0
            ELSE 0
          END as net_deposit
        FROM (
          SELECT merchant_id, raw_line FROM dev_tddf1_file_vermntsb_6759_tddf_2400_07312025_002725 WHERE record_type = 'BH'
          UNION ALL
          SELECT merchant_id, raw_line FROM dev_tddf1_file_vermntsb_6759_tddf_830_07312025_083327 WHERE record_type = 'BH'
        ) combined
      )
      SELECT 
        merchant_id,
        COUNT(*) as batch_count,
        SUM(net_deposit) as total_net_deposits
      FROM july31_bh
      GROUP BY merchant_id
    `;
    
    console.log('📋 Getting BH data...');
    const bhResult = await pool.query(bhQuery);
    console.log(`Found ${bhResult.rows.length} merchants with BH records`);
    
    // Step 2: Get DT data for July 31st  
    const dtQuery = `
      WITH july31_dt AS (
        SELECT 
          merchant_id,
          terminal_id,
          CASE 
            WHEN LENGTH(raw_line) >= 104 AND SUBSTRING(raw_line, 94, 11) ~ '^[0-9]+$'
            THEN CAST(SUBSTRING(raw_line, 94, 11) AS NUMERIC) / 100.0
            ELSE 0
          END as auth_amount
        FROM (
          SELECT merchant_id, terminal_id, raw_line FROM dev_tddf1_file_vermntsb_6759_tddf_2400_07312025_002725 WHERE record_type = 'DT'
          UNION ALL
          SELECT merchant_id, terminal_id, raw_line FROM dev_tddf1_file_vermntsb_6759_tddf_830_07312025_083327 WHERE record_type = 'DT'
        ) combined
      )
      SELECT 
        merchant_id,
        COUNT(*) as dt_count,
        COUNT(DISTINCT terminal_id) as unique_terminals,
        SUM(auth_amount) as total_auth_amount
      FROM july31_dt
      GROUP BY merchant_id
    `;
    
    console.log('📋 Getting DT data...');
    const dtResult = await pool.query(dtQuery);
    console.log(`Found ${dtResult.rows.length} merchants with DT records`);
    
    // Step 3: Combine and insert data
    const merchantMap = new Map();
    
    // Add BH data
    for (const row of bhResult.rows) {
      merchantMap.set(row.merchant_id, {
        merchantId: row.merchant_id,
        batchCount: parseInt(row.batch_count),
        netDeposits: parseFloat(row.total_net_deposits),
        authAmount: 0,
        dtCount: 0,
        uniqueTerminals: 0
      });
    }
    
    // Add DT data
    for (const row of dtResult.rows) {
      if (!merchantMap.has(row.merchant_id)) {
        merchantMap.set(row.merchant_id, {
          merchantId: row.merchant_id,
          batchCount: 0,
          netDeposits: 0,
          authAmount: 0,
          dtCount: 0,
          uniqueTerminals: 0
        });
      }
      
      const merchant = merchantMap.get(row.merchant_id);
      merchant.authAmount = parseFloat(row.total_auth_amount);
      merchant.dtCount = parseInt(row.dt_count);
      merchant.uniqueTerminals = parseInt(row.unique_terminals);
    }
    
    console.log(`💰 Combined data for ${merchantMap.size} merchants`);
    
    // Step 4: Insert into merchants table
    let insertCount = 0;
    for (const [merchantId, data] of merchantMap) {
      try {
        await pool.query(`
          INSERT INTO dev_tddf1_merchants (
            merchant_id,
            merchant_name,
            batch_count,
            total_net_deposits,
            total_amount,
            total_transactions,
            unique_terminals,
            last_seen_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          merchantId,
          `MERCHANT_${merchantId.slice(-6)}`, // Simple merchant name
          data.batchCount,
          data.netDeposits,
          data.authAmount,
          data.dtCount,
          data.uniqueTerminals,
          '2025-07-31'
        ]);
        
        insertCount++;
        
        if (insertCount <= 5) {
          console.log(`✅ Inserted ${merchantId}: BH=${data.batchCount}, Net=$${data.netDeposits.toFixed(2)}, Auth=$${data.authAmount.toFixed(2)}, DT=${data.dtCount}`);
        }
      } catch (error) {
        console.error(`❌ Error inserting ${merchantId}:`, error.message);
      }
    }
    
    console.log(`🎉 Successfully inserted ${insertCount} merchants`);
    
    // Step 5: Verify totals
    const totalsResult = await pool.query(`
      SELECT 
        COUNT(*) as merchant_count,
        SUM(batch_count) as total_bh,
        SUM(total_net_deposits) as total_net_deposits,
        SUM(total_amount) as total_auth,
        SUM(total_transactions) as total_dt
      FROM dev_tddf1_merchants
    `);
    
    const totals = totalsResult.rows[0];
    console.log('\n📊 Final Verification:');
    console.log(`Merchants: ${totals.merchant_count}`);
    console.log(`BH Records: ${totals.total_bh}`);
    console.log(`Net Deposits: $${parseFloat(totals.total_net_deposits).toFixed(2)}`);
    console.log(`Authorization: $${parseFloat(totals.total_auth).toFixed(2)}`);
    console.log(`DT Records: ${totals.total_dt}`);
    
    console.log('\n🎯 PowerShell Comparison:');
    console.log('Expected: BH=2,512, Net=$893,361.78, Auth=$897,358.84, DT=11,397');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

populateJuly31Merchants();