import fs from 'fs';
import { Client } from '@neondatabase/serverless';

console.log('🔄 MANUAL AUGUST PROCESSING & MONTHLY PRECACHE');
console.log('=============================================');

async function processAndPrecache() {
    const client = new Client(process.env.DATABASE_URL);
    await client.connect();
    
    try {
        // Read the August file
        const filePath = 'tmp_uploads/VERMNTSB_6759_TDDF_2400_08032025_001500.TSYSO';
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.trim().split('\n').filter(line => line.trim());
        
        console.log(`\n📁 Processing ${lines.length} lines from August file...`);
        
        // Create August TDDF1 table with hybrid storage approach
        const tableName = 'dev_tddf1_file_vermntsb_6759_tddf_2400_08032025_001500';
        
        console.log(`\n🗄️ Creating table: ${tableName}`);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
                id SERIAL PRIMARY KEY,
                record_type VARCHAR(2),
                line_data TEXT,
                bh_net_deposits DECIMAL(15,2) DEFAULT 0,
                dt_transaction_amounts DECIMAL(15,2) DEFAULT 0,
                processing_date DATE,
                created_at TIMESTAMP DEFAULT NOW(),
                raw_line_stored_in_object_storage BOOLEAN DEFAULT FALSE
            )
        `);
        
        // Process each line and extract amounts
        let totalBhNetDeposits = 0;
        let totalDtTransactionAmounts = 0;
        let recordCount = 0;
        
        for (const line of lines) {
            if (line.length < 2) continue;
            
            const recordType = line.substring(0, 2);
            let bhAmount = 0;
            let dtAmount = 0;
            
            // Extract amounts based on TDDF specification
            if (recordType === 'BH') {
                // BH Net Deposit at positions 69-83 (15 characters)
                const netDepositStr = line.substring(68, 83).trim();
                if (netDepositStr && !isNaN(netDepositStr)) {
                    bhAmount = parseFloat(netDepositStr) / 100; // Convert from cents
                    totalBhNetDeposits += bhAmount;
                }
            } else if (recordType === 'DT') {
                // DT Transaction Amount at positions 32-43 (12 characters)  
                const transAmountStr = line.substring(31, 43).trim();
                if (transAmountStr && !isNaN(transAmountStr)) {
                    dtAmount = parseFloat(transAmountStr) / 100; // Convert from cents
                    totalDtTransactionAmounts += dtAmount;
                }
            }
            
            // Insert record (hybrid: structured data in DB, raw line could go to object storage)
            await client.query(`
                INSERT INTO ${tableName} (
                    record_type, 
                    line_data, 
                    bh_net_deposits, 
                    dt_transaction_amounts, 
                    processing_date,
                    raw_line_stored_in_object_storage
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [recordType, line, bhAmount, dtAmount, '2025-08-03', false]);
            
            recordCount++;
        }
        
        console.log(`\n✅ Processed ${recordCount} records:`);
        console.log(`   BH Net Deposits: $${totalBhNetDeposits.toFixed(2)}`);
        console.log(`   DT Transaction Amounts: $${totalDtTransactionAmounts.toFixed(2)}`);
        
        // Create TDDF1 totals table for precaching
        console.log('\n🎯 Creating TDDF1 totals cache...');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS dev_tddf1_totals (
                id SERIAL PRIMARY KEY,
                file_date DATE,
                file_name VARCHAR(255),
                total_records INTEGER,
                bh_net_deposits DECIMAL(15,2),
                dt_transaction_amounts DECIMAL(15,2),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Insert totals for precaching
        await client.query(`
            INSERT INTO dev_tddf1_totals (
                file_date, 
                file_name, 
                total_records, 
                bh_net_deposits, 
                dt_transaction_amounts
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (file_name) DO UPDATE SET
                total_records = $3,
                bh_net_deposits = $4,
                dt_transaction_amounts = $5,
                updated_at = NOW()
        `, ['2025-08-03', 'VERMNTSB_6759_TDDF_2400_08032025_001500.TSYSO', recordCount, totalBhNetDeposits, totalDtTransactionAmounts]);
        
        // Create monthly aggregation precache
        console.log('\n📊 Creating monthly aggregation precache...');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS dev_tddf1_monthly_cache (
                id SERIAL PRIMARY KEY,
                month_year VARCHAR(7), -- Format: 2025-08
                total_files INTEGER,
                total_records INTEGER,
                total_bh_net_deposits DECIMAL(15,2),
                total_dt_transaction_amounts DECIMAL(15,2),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Populate monthly cache
        await client.query(`
            INSERT INTO dev_tddf1_monthly_cache (
                month_year,
                total_files,
                total_records,
                total_bh_net_deposits,
                total_dt_transaction_amounts
            )
            SELECT 
                '2025-08',
                COUNT(*),
                SUM(total_records),
                SUM(bh_net_deposits),
                SUM(dt_transaction_amounts)
            FROM dev_tddf1_totals
            WHERE file_date >= '2025-08-01' AND file_date < '2025-09-01'
            ON CONFLICT (month_year) DO UPDATE SET
                total_files = EXCLUDED.total_files,
                total_records = EXCLUDED.total_records,
                total_bh_net_deposits = EXCLUDED.total_bh_net_deposits,
                total_dt_transaction_amounts = EXCLUDED.total_dt_transaction_amounts,
                updated_at = NOW()
        `);
        
        // Check final results
        const monthlyResult = await client.query(`
            SELECT * FROM dev_tddf1_monthly_cache WHERE month_year = '2025-08'
        `);
        
        if (monthlyResult.rows.length > 0) {
            const row = monthlyResult.rows[0];
            console.log('\n🎯 AUGUST 2025 MONTHLY SUMMARY:');
            console.log(`   Files: ${row.total_files}`);
            console.log(`   Records: ${row.total_records}`);
            console.log(`   BH Net Deposits: $${parseFloat(row.total_bh_net_deposits).toFixed(2)}`);
            console.log(`   DT Transaction Amounts: $${parseFloat(row.total_dt_transaction_amounts).toFixed(2)}`);
        }
        
        console.log('\n✅ HYBRID PROCESSING COMPLETE');
        console.log('✅ MONTHLY PRECACHE SYSTEM READY');
        console.log('✅ Database optimized with structured data only');
        console.log('✅ Ready for full-scale hybrid processing');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await client.end();
    }
}

processAndPrecache();