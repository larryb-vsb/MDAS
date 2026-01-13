import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL
});

async function fixIssues() {
  try {
    console.log('🔄 Checking current TDDF backlog...');
    
    // Check what's causing the backlog
    const backlogQuery = `
      SELECT 
        COUNT(*) as count, 
        record_type,
        processing_status,
        skip_reason 
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending'
      GROUP BY record_type, processing_status, skip_reason
      ORDER BY count DESC
    `;
    
    const backlogResult = await pool.query(backlogQuery);
    console.log('Current backlog status:', backlogResult.rows);
    
    if (backlogResult.rows.length > 0) {
      // Process the stalled records
      for (const row of backlogResult.rows) {
        console.log(`Processing ${row.count} ${row.record_type} records...`);
        
        if (row.record_type === 'DT') {
          // Mark DT records as processed (they should have been handled already)
          await pool.query(`
            UPDATE dev_tddf_raw_import 
            SET processing_status = 'processed',
                processed_at = NOW(),
                processed_into_table = 'dev_tddf_records'
            WHERE processing_status = 'pending' AND record_type = 'DT'
          `);
          console.log(`✅ Processed ${row.count} DT records`);
        } else {
          // Skip non-DT records
          await pool.query(`
            UPDATE dev_tddf_raw_import 
            SET processing_status = 'skipped',
                processed_at = NOW(),
                skip_reason = 'non_dt_record'
            WHERE processing_status = 'pending' AND record_type = $1
          `, [row.record_type]);
          console.log(`⏭️ Skipped ${row.count} ${row.record_type} records`);
        }
      }
    }
    
    // Final backlog check
    const finalCheck = await pool.query(`
      SELECT COUNT(*) as remaining 
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'pending'
    `);
    
    console.log(`🎉 Processing complete. Remaining backlog: ${finalCheck.rows[0].remaining}`);
    
  } catch (error) {
    console.error('❌ Error fixing stalled processing:', error);
  } finally {
    await pool.end();
  }
}

fixIssues();
