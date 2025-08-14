// Minimal TDDF API debug test
import { pool } from './server/db.js';

async function testApiQueries() {
  try {
    console.log('Testing TDDF API queries...');
    
    // Test 1: Direct schemas query
    console.log('\n--- Test 1: Schemas Query ---');
    const schemasResult = await pool.query('SELECT COUNT(*) as count FROM dev_tddf_api_schemas');
    console.log('Schemas count from DB:', schemasResult.rows[0].count);
    
    const schemasListResult = await pool.query('SELECT * FROM dev_tddf_api_schemas ORDER BY created_at DESC');
    console.log('Schemas from DB:', schemasListResult.rows);
    
    // Test 2: Test the files table
    console.log('\n--- Test 2: Files Table Test ---');
    const filesResult = await pool.query('SELECT COUNT(*) as count FROM dev_tddf_api_files');
    console.log('Files count from DB:', filesResult.rows[0].count);
    
    console.log('\n--- Test 3: Test Insert ---');
    const insertResult = await pool.query(`
      INSERT INTO dev_tddf_api_files 
      (filename, original_name, file_size, file_hash, storage_path, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, ['test.csv', 'test.csv', 100, 'abc123', 'test/path', 'admin']);
    console.log('Insert result:', insertResult.rows[0]);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testApiQueries();