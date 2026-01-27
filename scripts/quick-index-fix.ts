import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.NEON_DEV_DATABASE_URL,
});

async function fixIndex() {
  const client = await pool.connect();
  try {
    console.log('Checking current indexes...');
    
    // First check what indexes exist
    const indexResult = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'dev_tddf_jsonb'
      ORDER BY indexname
    `);
    
    console.log('Current indexes on dev_tddf_jsonb:');
    indexResult.rows.forEach(r => console.log('  -', r.indexname));
    
    // Check if there's a unique constraint we can use
    const constraintResult = await client.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'dev_tddf_jsonb'
    `);
    console.log('\nConstraints:', constraintResult.rows);
    
    // Count records to see the scale
    const countResult = await client.query(`SELECT COUNT(*) FROM dev_tddf_jsonb LIMIT 1`);
    console.log('\nTotal records:', countResult.rows[0].count);
    
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

fixIndex();
