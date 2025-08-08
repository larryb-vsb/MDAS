/**
 * Populate TDDF1 Merchants Table with Real DBA Names from DT Records
 * 
 * This script extracts merchant DBA names and merchant account numbers from DT records
 * according to TDDF specification field positions:
 * - Merchant Account Number: positions 24-39 (16 characters)
 * - Merchant Name (DBA): positions 218-242 (25 characters)
 * 
 * Updates the tddf1_merchants table with authentic merchant data.
 */

import pkg from 'pg';
const { Client } = pkg;

// Environment detection
const NODE_ENV = process.env.NODE_ENV || 'development';
const tablePrefix = NODE_ENV === 'development' ? 'dev_' : '';

console.log(`🏪 Starting merchant DBA name extraction for ${NODE_ENV} environment`);
console.log(`📋 Using table prefix: ${tablePrefix}`);

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Database connected');

    // Get all TDDF1 file tables that contain DT records
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '${tablePrefix}tddf1_file_%' 
      AND table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    const fileTables = tablesResult.rows.map(row => row.table_name);
    
    console.log(`📁 Found ${fileTables.length} TDDF1 file tables to process`);

    const merchantData = new Map();
    let totalDTRecords = 0;
    let processedRecords = 0;

    // Process each file table
    for (const tableName of fileTables) {
      console.log(`🔍 Processing table: ${tableName}`);
      
      try {
        // Extract DT records from this table with raw line data
        const dtQuery = `
          SELECT 
            raw_line,
            merchant_id,
            source_filename,
            line_number
          FROM "${tableName}"
          WHERE record_type = 'DT' 
          AND raw_line IS NOT NULL 
          AND LENGTH(raw_line) >= 242
          LIMIT 10000;
        `;
        
        const dtResult = await client.query(dtQuery);
        const dtRecords = dtResult.rows;
        totalDTRecords += dtRecords.length;
        
        console.log(`  📊 Found ${dtRecords.length} DT records in ${tableName}`);

        // Extract merchant data from each DT record
        for (const record of dtRecords) {
          try {
            const rawLine = record.raw_line;
            
            // Extract fields according to TDDF specification
            const merchantAccountNumber = rawLine.substring(23, 39).trim(); // positions 24-39
            const merchantDBAName = rawLine.substring(217, 242).trim(); // positions 218-242
            
            // Validate extracted data
            if (merchantAccountNumber && merchantDBAName && merchantDBAName !== '' && merchantAccountNumber !== '') {
              
              // Store in map with merchant account as key
              if (!merchantData.has(merchantAccountNumber)) {
                merchantData.set(merchantAccountNumber, {
                  merchantId: merchantAccountNumber,
                  merchantName: merchantDBAName,
                  firstSeenFile: record.source_filename,
                  recordCount: 0,
                  sourceFiles: new Set()
                });
              }
              
              const existing = merchantData.get(merchantAccountNumber);
              existing.recordCount++;
              existing.sourceFiles.add(record.source_filename);
              
              // Update merchant name if we find a more complete/better name
              if (merchantDBAName.length > existing.merchantName.length) {
                existing.merchantName = merchantDBAName;
              }
              
              processedRecords++;
            }
          } catch (error) {
            console.warn(`  ⚠️ Error processing record in ${tableName}:`, error.message);
          }
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing table ${tableName}:`, error.message);
      }
    }

    console.log(`\n📈 Extraction Summary:`);
    console.log(`  Total DT records found: ${totalDTRecords}`);
    console.log(`  Records with valid merchant data: ${processedRecords}`);
    console.log(`  Unique merchants discovered: ${merchantData.size}`);

    if (merchantData.size === 0) {
      console.log('❌ No merchant data found. Exiting.');
      return;
    }

    // Update the tddf1_merchants table
    console.log(`\n🔄 Updating ${tablePrefix}tddf1_merchants table...`);
    
    let updatedCount = 0;
    let insertedCount = 0;
    
    for (const [merchantId, data] of merchantData) {
      try {
        // Check if merchant already exists
        const existsQuery = `
          SELECT merchant_id, merchant_name 
          FROM "${tablePrefix}tddf1_merchants" 
          WHERE merchant_id = $1;
        `;
        
        const existsResult = await client.query(existsQuery, [merchantId]);
        
        if (existsResult.rows.length > 0) {
          // Update existing merchant with real DBA name
          const existing = existsResult.rows[0];
          const updateQuery = `
            UPDATE "${tablePrefix}tddf1_merchants" 
            SET 
              merchant_name = $2,
              last_updated = NOW()
            WHERE merchant_id = $1;
          `;
          
          await client.query(updateQuery, [merchantId, data.merchantName]);
          console.log(`  ✅ Updated: ${merchantId} -> "${data.merchantName}"`);
          updatedCount++;
          
        } else {
          // Insert new merchant
          const insertQuery = `
            INSERT INTO "${tablePrefix}tddf1_merchants" (
              merchant_id, 
              merchant_name, 
              total_transactions, 
              total_amount, 
              total_net_deposits,
              unique_terminals,
              record_count,
              last_updated,
              created_at,
              source_files
            ) VALUES ($1, $2, 0, 0, 0, 0, $3, NOW(), NOW(), $4);
          `;
          
          const sourceFilesArray = Array.from(data.sourceFiles);
          await client.query(insertQuery, [
            merchantId, 
            data.merchantName, 
            data.recordCount,
            sourceFilesArray
          ]);
          console.log(`  ➕ Inserted: ${merchantId} -> "${data.merchantName}"`);
          insertedCount++;
        }
        
      } catch (error) {
        console.error(`  ❌ Error updating merchant ${merchantId}:`, error.message);
      }
    }

    console.log(`\n🎉 Merchant DBA update completed!`);
    console.log(`  Updated existing merchants: ${updatedCount}`);
    console.log(`  Inserted new merchants: ${insertedCount}`);
    console.log(`  Total merchants processed: ${updatedCount + insertedCount}`);
    
    // Show sample of updated merchants
    console.log(`\n📋 Sample of updated merchants:`);
    const sampleQuery = `
      SELECT merchant_id, merchant_name, record_count 
      FROM "${tablePrefix}tddf1_merchants" 
      WHERE merchant_name IS NOT NULL 
      AND merchant_name != ''
      ORDER BY record_count DESC 
      LIMIT 10;
    `;
    
    const sampleResult = await client.query(sampleQuery);
    sampleResult.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.merchant_id} - "${row.merchant_name}" (${row.record_count} records)`);
    });

  } catch (error) {
    console.error('❌ Error in main process:', error);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
}

main().catch(console.error);