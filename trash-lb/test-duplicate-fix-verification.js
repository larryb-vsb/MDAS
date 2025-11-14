
// Test script to verify duplicate handling fix
const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyDuplicateFix() {
  const client = await pool.connect();
  try {
    console.log('=== DUPLICATE HANDLING FIX VERIFICATION ===');
    
    // Check the corrected duplicate records
    const result = await client.query(`
      SELECT 
        COUNT(*) as total_duplicates,
        processing_status,
        skip_reason
      FROM dev_tddf_raw_import 
      WHERE skip_reason = 'duplicate_record_updated'
      GROUP BY processing_status, skip_reason
    `);
    
    console.log('✅ Fixed duplicate records:', result.rows);
    
    // Verify no duplicates are still marked as skipped
    const skippedDuplicates = await client.query(`
      SELECT COUNT(*) as count 
      FROM dev_tddf_raw_import 
      WHERE processing_status = 'skipped' 
        AND skip_reason = 'duplicate_record_already_processed'
    `);
    
    console.log('✅ Remaining skipped duplicates (should be 0):', skippedDuplicates.rows[0].count);
    
    if (skippedDuplicates.rows[0].count === '0') {
      console.log('🎉 SUCCESS: All duplicate records now properly marked as processed!');
    } else {
      console.log('❌ ISSUE: Some duplicates still marked as skipped');
    }
    
  } catch (error) {
    console.error('Error in verification:', error);
  } finally {
    client.release();
  }
}

module.exports = { verifyDuplicateFix };
