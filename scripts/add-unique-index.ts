import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for Node.js
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.NEON_DEV_DATABASE_URL,
});

async function addUniqueIndex() {
  const client = await pool.connect();
  try {
    console.log('Checking for existing unique index on dev_tddf_jsonb...');
    
    // Check if index already exists
    const checkResult = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename LIKE 'dev_tddf_jsonb%' 
      AND indexdef LIKE '%UNIQUE%'
    `);
    
    console.log('Existing unique indexes:', checkResult.rows);
    
    if (checkResult.rows.some((r: any) => r.indexname === 'idx_dev_tddf_jsonb_upload_line_date_unique')) {
      console.log('Index already exists!');
    } else {
      console.log('Creating unique index...');
      // Create the unique index
      await client.query(`
        CREATE UNIQUE INDEX idx_dev_tddf_jsonb_upload_line_date_unique 
        ON dev_tddf_jsonb (upload_id, line_number, tddf_processing_date)
      `);
      console.log('Unique index created successfully!');
    }
    
    // Verify the index
    const verifyResult = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes 
      WHERE tablename LIKE 'dev_tddf_jsonb%'
      AND indexdef LIKE '%UNIQUE%'
    `);
    console.log('Verified unique indexes:', verifyResult.rows);
    
  } catch (err: any) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

addUniqueIndex();
