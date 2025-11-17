// Debug TDDF API endpoints
import { Pool } from '@neondatabase/serverless';

async function testEndpoints() {
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    console.log('Testing database connection...');
    
    // Test 1: Direct table access
    const schemasResult = await pool.query('SELECT COUNT(*) FROM dev_tddf_api_schemas');
    console.log('Schemas count:', schemasResult.rows[0].count);
    
    // Test 2: Get table name resolution
    function getTableName(baseName) {
      return `dev_${baseName}`;
    }
    
    const tableName = getTableName('tddf_api_schemas');
    console.log('Resolved table name:', tableName);
    
    // Test 3: Test the actual query from the endpoint
    const testQuery = `SELECT * FROM ${tableName} ORDER BY created_at DESC`;
    console.log('Test query:', testQuery);
    
    const result = await pool.query(testQuery);
    console.log('Query result:', result.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

testEndpoints();