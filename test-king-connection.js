#!/usr/bin/env node

// Direct connection test to King server to see your actual table structure
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

async function testKingConnection() {
  // Use the exact same King server URL that the application uses
  const KING_SERVER_URL = "postgresql://neondb_owner:npg_Dzy4oGqcr3SH@ep-shy-king-aasxdlh7-pooler.westus3.azure.neon.tech/neondb?sslmode=require&channel_binding=require";
  
  console.log('🔍 Testing direct connection to King server...');
  console.log('Server: ep-shy-king-aasxdlh7');
  
  const pool = new Pool({ connectionString: KING_SERVER_URL });
  
  try {
    // Test 1: Check if we can see your column_1_test
    console.log('\n=== Test 1: Looking for column_1_test ===');
    const columnTest = await pool.query(`
      SELECT column_name, data_type, ordinal_position
      FROM information_schema.columns 
      WHERE table_name = 'dev_uploader_tddf_jsonb_records'
      AND column_name = 'column_1_test'
    `);
    
    if (columnTest.rows.length > 0) {
      console.log('✅ SUCCESS: Found your column_1_test!', columnTest.rows[0]);
    } else {
      console.log('❌ Cannot see column_1_test');
    }
    
    // Test 2: Check complete table structure
    console.log('\n=== Test 2: Complete Table Structure ===');
    const allColumns = await pool.query(`
      SELECT column_name, data_type, ordinal_position, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'dev_uploader_tddf_jsonb_records'
      ORDER BY ordinal_position
    `);
    
    console.log('Total columns found:', allColumns.rows.length);
    allColumns.rows.forEach((col, index) => {
      console.log(`${index + 1}. ${col.column_name} (${col.data_type})`);
    });
    
    // Test 3: Check for merchant data
    console.log('\n=== Test 3: Merchant Account Data ===');
    const merchantData = await pool.query(`
      SELECT COUNT(*) as total_records,
             COUNT(merchant_account_number) as records_with_merchant
      FROM dev_uploader_tddf_jsonb_records
    `);
    
    console.log('Records:', merchantData.rows[0]);
    
    // Test 4: Sample of merchant account numbers
    const sampleMerchants = await pool.query(`
      SELECT DISTINCT merchant_account_number
      FROM dev_uploader_tddf_jsonb_records
      WHERE merchant_account_number IS NOT NULL
      LIMIT 5
    `);
    
    console.log('Sample merchant account numbers:');
    sampleMerchants.rows.forEach(row => {
      console.log(`  - ${row.merchant_account_number}`);
    });
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testKingConnection().catch(console.error);