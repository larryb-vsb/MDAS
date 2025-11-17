// Emergency TDDF Processing Restart Script - Using direct SQL to bypass imports

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Direct database connection for emergency restart
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Simple table name helper for development
function getTableName(baseName) {
  return `dev_${baseName}`;
}

async function emergencyTddfRestart() {
  console.log('🚨 EMERGENCY TDDF PROCESSING RESTART');
  console.log('=====================================');
  
  try {
    // Check current backlog
    const tableName = getTableName('tddf_raw_import');
    const backlogCheck = await pool.query(`
      SELECT 
        COUNT(CASE WHEN processing_status = 'pending' THEN 1 END) as total_pending,
        COUNT(CASE WHEN processing_status = 'pending' AND record_type = 'DT' THEN 1 END) as dt_pending,
        COUNT(CASE WHEN processing_status = 'pending' AND record_type = 'BH' THEN 1 END) as bh_pending
      FROM "${tableName}"
    `);
    
    const backlog = backlogCheck.rows[0];
    console.log(`📊 Current Backlog: ${backlog.total_pending} records (DT: ${backlog.dt_pending}, BH: ${backlog.bh_pending})`);
    
    if (backlog.total_pending === 0) {
      console.log('✅ No pending records found. Processing is up to date.');
      return;
    }
    
    console.log('🔧 Starting manual switch-based processing...');
    
    // Process with large batch size for efficiency
    const result = await storage.processPendingTddfRecordsSwitchBased(undefined, 1000);
    
    console.log('📈 Processing Results:');
    console.log(`  - Processed: ${result.totalProcessed} records`);
    console.log(`  - Skipped: ${result.totalSkipped} records`);
    console.log(`  - Errors: ${result.totalErrors} records`);
    console.log(`  - Processing Time: ${result.processingTime}ms`);
    console.log('  - Breakdown by Record Type:');
    
    Object.entries(result.breakdown).forEach(([type, stats]) => {
      console.log(`    ${type}: Processed: ${stats.processed}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
    });
    
    // Check remaining backlog
    const finalCheck = await pool.query(`
      SELECT COUNT(*) as remaining 
      FROM "${tableName}" 
      WHERE processing_status = 'pending'
    `);
    
    console.log(`\n✅ Processing Complete. Remaining backlog: ${finalCheck.rows[0].remaining} records`);
    
  } catch (error) {
    console.error('❌ Emergency restart failed:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run the emergency restart
emergencyTddfRestart();