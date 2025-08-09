import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function populateMerchantsTableForJuly31() {
  console.log('🔄 Populating dev_tddf1_merchants table with July 31st data only...');
  
  try {
    // Get list of July 31st tables only
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'dev_tddf1_file_%07312025%'
      ORDER BY table_name
    `);
    
    const july31Tables = tablesResult.rows.map(row => row.table_name);
    console.log(`📋 Found ${july31Tables.length} July 31st tables:`, july31Tables);
    
    if (july31Tables.length === 0) {
      console.log('❌ No July 31st tables found!');
      return;
    }
    
    const merchantTotals = new Map();
    
    // Process each July 31st table
    for (const tableName of july31Tables) {
      console.log(`📋 Processing table: ${tableName}`);
      
      try {
        // Get BH records (net deposits and batch counts)
        const bhQuery = `
          SELECT 
            merchant_id,
            merchant_name,
            COUNT(*) as batch_count,
            SUM(CAST(SUBSTRING(record_data, 70, 15) AS NUMERIC) / 100.0) as net_deposits
          FROM ${tableName}
          WHERE record_type = 'BH'
          AND LENGTH(record_data) >= 84
          GROUP BY merchant_id, merchant_name
        `;
        
        const bhResult = await pool.query(bhQuery);
        console.log(`  📈 Found ${bhResult.rows.length} merchants with BH records`);
        
        for (const row of bhResult.rows) {
          const merchantId = row.merchant_id;
          if (!merchantTotals.has(merchantId)) {
            merchantTotals.set(merchantId, {
              merchantId,
              merchantName: row.merchant_name,
              batchCount: 0,
              netDeposits: 0,
              authAmount: 0,
              dtRecords: 0,
              uniqueTerminals: new Set()
            });
          }
          
          const merchant = merchantTotals.get(merchantId);
          merchant.batchCount += parseInt(row.batch_count || 0);
          merchant.netDeposits += parseFloat(row.net_deposits || 0);
        }
        
        // Get DT records (authorization amounts and transaction counts)
        const dtQuery = `
          SELECT 
            merchant_id,
            merchant_name,
            terminal_id,
            COUNT(*) as dt_count,
            SUM(CAST(SUBSTRING(record_data, 94, 11) AS NUMERIC) / 100.0) as auth_amount
          FROM ${tableName}
          WHERE record_type = 'DT'
          AND LENGTH(record_data) >= 104
          GROUP BY merchant_id, merchant_name, terminal_id
        `;
        
        const dtResult = await pool.query(dtQuery);
        console.log(`  📈 Found ${dtResult.rows.length} merchant/terminal combinations with DT records`);
        
        for (const row of dtResult.rows) {
          const merchantId = row.merchant_id;
          if (!merchantTotals.has(merchantId)) {
            merchantTotals.set(merchantId, {
              merchantId,
              merchantName: row.merchant_name,
              batchCount: 0,
              netDeposits: 0,
              authAmount: 0,
              dtRecords: 0,
              uniqueTerminals: new Set()
            });
          }
          
          const merchant = merchantTotals.get(merchantId);
          merchant.authAmount += parseFloat(row.auth_amount || 0);
          merchant.dtRecords += parseInt(row.dt_count || 0);
          
          // Track unique terminals
          if (row.terminal_id) {
            merchant.uniqueTerminals.add(row.terminal_id);
          }
        }
      } catch (tableError) {
        console.error(`❌ Error processing table ${tableName}:`, tableError.message);
      }
    }
    
    console.log(`💰 Calculated totals for ${merchantTotals.size} merchants (July 31st only)`);
    
    // Insert merchants into the table
    let insertCount = 0;
    for (const [merchantId, data] of merchantTotals) {
      try {
        await pool.query(`
          INSERT INTO dev_tddf1_merchants (
            merchant_id,
            merchant_name,
            batch_count,
            total_net_deposits,
            total_amount,
            dt_record_count,
            total_transactions,
            unique_terminals,
            last_seen_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          merchantId,
          data.merchantName,
          data.batchCount,
          data.netDeposits,
          data.authAmount,
          data.dtRecords,
          data.dtRecords, // total_transactions same as dt_record_count for now
          data.uniqueTerminals.size,
          '2025-07-31' // July 31st date
        ]);
        
        insertCount++;
        
        if (insertCount <= 10) {
          console.log(`✅ Inserted ${merchantId}: BH=${data.batchCount}, Net=${data.netDeposits.toFixed(2)}, Auth=${data.authAmount.toFixed(2)}, DT=${data.dtRecords}, Terminals=${data.uniqueTerminals.size}`);
        }
      } catch (insertError) {
        console.error(`❌ Error inserting merchant ${merchantId}:`, insertError.message);
      }
    }
    
    console.log(`🎉 Successfully inserted ${insertCount} merchants into dev_tddf1_merchants table`);
    
    // Verify totals
    const totalsResult = await pool.query(`
      SELECT 
        COUNT(*) as merchant_count,
        SUM(batch_count) as total_bh,
        SUM(total_net_deposits) as total_net_deposits,
        SUM(total_amount) as total_auth,
        SUM(dt_record_count) as total_dt
      FROM dev_tddf1_merchants
    `);
    
    const totals = totalsResult.rows[0];
    console.log('\n📊 Final Totals in Merchants Table:');
    console.log(`Merchants: ${totals.merchant_count}`);
    console.log(`BH Records: ${totals.total_bh}`);
    console.log(`Net Deposits: $${parseFloat(totals.total_net_deposits).toFixed(2)}`);
    console.log(`Authorization: $${parseFloat(totals.total_auth).toFixed(2)}`);
    console.log(`DT Records: ${totals.total_dt}`);
    
  } catch (error) {
    console.error('❌ Error populating merchants table:', error);
  } finally {
    await pool.end();
  }
}

populateMerchantsTableForJuly31();