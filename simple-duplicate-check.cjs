// Simple duplicate check for dev_tddf_jsonb table
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDuplicates() {
  try {
    console.log('=== DUPLICATE ANALYSIS ===');
    
    // Total records
    const total = await pool.query('SELECT COUNT(*) as total FROM dev_tddf_jsonb');
    console.log('Total JSONB records:', total.rows[0]?.total || 0);
    
    // Unique vs duplicate count by raw_line
    const summary = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT raw_line) as unique_raw_lines,
        COUNT(*) - COUNT(DISTINCT raw_line) as duplicate_count
      FROM dev_tddf_jsonb
    `);
    
    const stats = summary.rows[0];
    console.log('Unique raw lines:', stats.unique_raw_lines);
    console.log('Duplicate records (by raw line):', stats.duplicate_count);
    console.log('Duplicate percentage:', ((stats.duplicate_count / stats.total_records) * 100).toFixed(2) + '%');
    
    // Top 5 most duplicated raw lines
    if (stats.duplicate_count > 0) {
      console.log('\n=== TOP DUPLICATES ===');
      const topDups = await pool.query(`
        SELECT 
          raw_line,
          COUNT(*) as count
        FROM dev_tddf_jsonb 
        GROUP BY raw_line 
        HAVING COUNT(*) > 1
        ORDER BY count DESC
        LIMIT 5
      `);
      
      topDups.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.count} duplicates: ${row.raw_line.substring(0, 50)}...`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDuplicates();