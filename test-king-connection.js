// Direct test to verify King server connection
import { Pool } from '@neondatabase/serverless';

const KING_SERVER_URL = "postgresql://neondb_owner:npg_Dzy4oGqcr3SH@ep-shy-king-aasxdlh7-pooler.westus3.azure.neon.tech/neondb?sslmode=require&channel_binding=require";

async function testKingConnection() {
  const pool = new Pool({ connectionString: KING_SERVER_URL });
  
  try {
    console.log('🔍 Testing direct connection to King server...');
    
    // Test basic connection
    const connTest = await pool.query('SELECT current_database(), version()');
    console.log('✅ Connected to database:', connTest.rows[0].current_database);
    
    // Test for your test column
    const columnTest = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'dev_uploader_tddf_jsonb_records' 
      AND column_name = 'column_1_test'
    `);
    
    if (columnTest.rows.length > 0) {
      console.log('✅ Found column_1_test - Connected to King server!');
    } else {
      console.log('❌ column_1_test not found - Not connected to King server');
    }
    
    // Check merchant data
    const merchantTest = await pool.query(`
      SELECT merchant_account_number, COUNT(*) as count
      FROM dev_uploader_tddf_jsonb_records 
      WHERE merchant_account_number = '0675900000002881'
      GROUP BY merchant_account_number
    `);
    
    console.log('📊 Merchant data results:', merchantTest.rows);
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await pool.end();
  }
}

testKingConnection();