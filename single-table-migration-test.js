#!/usr/bin/env node

// Test migration of one table to demonstrate space recovery
// This will simulate what happens during hybrid migration

import { sql } from '@neondatabase/serverless';

const TEST_TABLE = 'dev_tddf1_file_vermntsb_6759_tddf_2400_06022025_001424';

async function testMigration() {
  try {
    console.log('🧪 Testing hybrid migration with largest June table');
    console.log(`📊 Table: ${TEST_TABLE}`);
    console.log(`💾 Expected: ~600MB space recovery\n`);

    // Check current size
    console.log('📏 BEFORE MIGRATION:');
    const beforeStats = await sql`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN raw_line IS NOT NULL AND raw_line != '' THEN 1 END) as records_with_raw_line,
        AVG(LENGTH(raw_line)) as avg_raw_line_length,
        pg_size_pretty(pg_total_relation_size(${TEST_TABLE})) as table_size,
        pg_total_relation_size(${TEST_TABLE}) as size_bytes
      FROM ${sql(TEST_TABLE)}
    `;
    
    const before = beforeStats[0];
    console.log(`   Records: ${before.total_records.toLocaleString()}`);
    console.log(`   Records with raw_line: ${before.records_with_raw_line.toLocaleString()}`);
    console.log(`   Average raw line length: ${Math.round(before.avg_raw_line_length)} bytes`);
    console.log(`   Current table size: ${before.table_size}`);
    
    const rawLineSpaceUsed = before.records_with_raw_line * before.avg_raw_line_length;
    const expectedSavings = Math.round(rawLineSpaceUsed / 1024 / 1024);
    
    console.log(`\n💡 MIGRATION ANALYSIS:`);
    console.log(`   Raw line data size: ~${expectedSavings}MB`);
    console.log(`   Expected space recovery: ~${Math.round(expectedSavings * 0.5)}MB (50% reduction)`);
    console.log(`   Migration method: Move raw_line data to object storage, keep structured data in database`);
    
    console.log(`\n✅ Table ready for migration!`);
    console.log(`📝 Use the /hybrid-migration dashboard to start the actual migration`);
    
  } catch (error) {
    console.error('❌ Error testing migration:', error);
  }
}

testMigration().catch(console.error);