import { neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for Node.js
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.NEON_DEV_DATABASE_URL,
});

async function cleanupAndAddIndex() {
  const client = await pool.connect();
  try {
    console.log('Step 1: Counting duplicates in dev_tddf_jsonb...');
    
    // Count duplicates
    const countResult = await client.query(`
      SELECT COUNT(*) as duplicate_count FROM (
        SELECT upload_id, line_number, tddf_processing_date, COUNT(*) as cnt
        FROM dev_tddf_jsonb
        GROUP BY upload_id, line_number, tddf_processing_date
        HAVING COUNT(*) > 1
      ) dupes
    `);
    
    console.log('Found duplicate groups:', countResult.rows[0].duplicate_count);
    
    if (parseInt(countResult.rows[0].duplicate_count) > 0) {
      console.log('Step 2: Removing duplicate records (keeping first occurrence)...');
      
      // Delete duplicates, keeping the one with the lowest id
      const deleteResult = await client.query(`
        DELETE FROM dev_tddf_jsonb a
        USING (
          SELECT upload_id, line_number, tddf_processing_date, MIN(id) as min_id
          FROM dev_tddf_jsonb
          GROUP BY upload_id, line_number, tddf_processing_date
          HAVING COUNT(*) > 1
        ) b
        WHERE a.upload_id = b.upload_id 
        AND a.line_number = b.line_number 
        AND a.tddf_processing_date = b.tddf_processing_date
        AND a.id > b.min_id
      `);
      
      console.log('Deleted duplicate records:', deleteResult.rowCount);
    }
    
    console.log('Step 3: Creating unique index...');
    
    // Check if index already exists
    const checkResult = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename LIKE 'dev_tddf_jsonb%' 
      AND indexname LIKE '%upload_line_date_unique%'
    `);
    
    if (checkResult.rows.length > 0) {
      console.log('Index already exists!');
    } else {
      // Create the unique index
      await client.query(`
        CREATE UNIQUE INDEX idx_dev_tddf_jsonb_upload_line_date_unique 
        ON dev_tddf_jsonb (upload_id, line_number, tddf_processing_date)
      `);
      console.log('Unique index created successfully!');
    }
    
    // Verify
    const verifyResult = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename LIKE 'dev_tddf_jsonb%'
      AND indexname LIKE '%upload_line_date_unique%'
    `);
    console.log('Verified unique indexes:', verifyResult.rows.length > 0 ? 'Found' : 'Not found');
    
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupAndAddIndex();
