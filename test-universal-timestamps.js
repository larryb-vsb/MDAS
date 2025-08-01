// Test Universal Timestamps Implementation
const { Pool } = require('@neondatabase/serverless');
const { backfillUniversalTimestamps } = require('./server/services/universal-timestamp.ts');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function testUniversalTimestamps() {
  console.log('🕐 Testing Universal Timestamp Implementation...');
  
  try {
    // Test with a small batch first
    const result = await backfillUniversalTimestamps(pool, 'dev_tddf_jsonb', 5);
    
    console.log('✅ Backfill test completed:');
    console.log(`   - Updated: ${result.updated} records`);
    console.log(`   - Errors: ${result.errors} errors`);
    
    // Check a few updated records
    const checkResult = await pool.query(`
      SELECT 
        id, 
        record_type, 
        line_number,
        filename,
        parsed_datetime,
        record_time_source,
        file_timestamp,
        extracted_fields->>'transactionDate' as transaction_date,
        extracted_fields->>'batchDate' as batch_date
      FROM dev_tddf_jsonb 
      WHERE parsed_datetime IS NOT NULL
      ORDER BY id 
      LIMIT 5
    `);
    
    console.log('\n📋 Sample Updated Records:');
    for (const record of checkResult.rows) {
      console.log(`   ${record.record_type} Line ${record.line_number}: ${record.parsed_datetime} (${record.record_time_source})`);
      console.log(`      Transaction Date: ${record.transaction_date || 'null'}, Batch Date: ${record.batch_date || 'null'}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testUniversalTimestamps();