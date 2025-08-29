import { Pool } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL;
console.log('App DATABASE_URL:', dbUrl);

const pool = new Pool({ connectionString: dbUrl });

try {
  const result = await pool.query(`
    SELECT 
      table_name,
      column_name, 
      data_type, 
      ordinal_position
    FROM information_schema.columns 
    WHERE column_name = 'column_1_test'
  `);
  
  console.log('Found column_1_test:', result.rows);
  
  const tablesResult = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_name LIKE '%uploader%tddf%'
  `);
  
  console.log('TDDF uploader tables:', tablesResult.rows);
  
} catch (error) {
  console.error('Connection error:', error.message);
} finally {
  await pool.end();
}
