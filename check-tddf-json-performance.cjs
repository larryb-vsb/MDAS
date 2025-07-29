#!/usr/bin/env node

/**
 * TDDF JSON Performance Testing Script
 * 
 * This script tests the performance optimizations applied to the TDDF JSON page
 * and provides metrics on the improvements achieved.
 */

const { Pool } = require('pg');

async function testTddfJsonPerformance() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🚀 Testing TDDF JSON Performance Optimizations...');
  console.log('📊 Target: Reduce 85+ second loading times to under 5 seconds\n');

  try {
    // Check table size first
    const tableSizeResult = await pool.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size('dev_tddf_jsonb')) as table_size,
        COUNT(*) as record_count
      FROM dev_tddf_jsonb
    `);
    
    console.log('📋 Table Information:');
    console.log(`   Size: ${tableSizeResult.rows[0]?.table_size || 'Unknown'}`);
    console.log(`   Records: ${parseInt(tableSizeResult.rows[0]?.record_count || 0).toLocaleString()}`);

    // Check existing indexes
    const indexResult = await pool.query(`
      SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes 
      WHERE tablename = 'dev_tddf_jsonb'
      ORDER BY pg_relation_size(indexname::regclass) DESC
    `);
    
    console.log('\n🔍 Current Indexes:');
    indexResult.rows.forEach(idx => {
      console.log(`   ${idx.indexname} (${idx.size})`);
    });

    console.log('\n🧪 Performance Tests:');
    
    // Test 1: Count query (stats API)
    console.log('\n1️⃣ Testing COUNT(*) query...');
    const countStart = Date.now();
    const countResult = await pool.query('SELECT COUNT(*) as total FROM dev_tddf_jsonb');
    const countTime = Date.now() - countStart;
    console.log(`   ⏱️  Query time: ${countTime}ms`);
    console.log(`   📊 Records: ${parseInt(countResult.rows[0].total).toLocaleString()}`);
    
    // Performance assessment for count query
    if (countTime < 1000) {
      console.log('   ✅ Excellent performance (<1 second)');
    } else if (countTime < 5000) {
      console.log('   ⚠️  Acceptable performance (1-5 seconds)');
    } else {
      console.log('   ❌ Poor performance (>5 seconds)');
    }

    // Test 2: Record type breakdown (stats API)
    console.log('\n2️⃣ Testing record type breakdown...');
    const typeStart = Date.now();
    const typeResult = await pool.query(`
      SELECT record_type, COUNT(*) as count 
      FROM dev_tddf_jsonb 
      GROUP BY record_type 
      ORDER BY count DESC
    `);
    const typeTime = Date.now() - typeStart;
    console.log(`   ⏱️  Query time: ${typeTime}ms`);
    console.log(`   📊 Record types: ${typeResult.rows.length}`);
    
    typeResult.rows.forEach(row => {
      console.log(`      ${row.record_type}: ${parseInt(row.count).toLocaleString()}`);
    });
    
    // Performance assessment for type breakdown
    if (typeTime < 2000) {
      console.log('   ✅ Excellent performance (<2 seconds)');
    } else if (typeTime < 10000) {
      console.log('   ⚠️  Acceptable performance (2-10 seconds)');
    } else {
      console.log('   ❌ Poor performance (>10 seconds)');
    }

    // Test 3: Default page load query (records API)
    console.log('\n3️⃣ Testing default page load query...');
    const pageStart = Date.now();
    const pageResult = await pool.query(`
      SELECT id, upload_id, record_type, created_at 
      FROM dev_tddf_jsonb 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    const pageTime = Date.now() - pageStart;
    console.log(`   ⏱️  Query time: ${pageTime}ms`);
    console.log(`   📊 Records fetched: ${pageResult.rows.length}`);
    
    // Performance assessment for page load
    if (pageTime < 500) {
      console.log('   ✅ Excellent performance (<500ms)');
    } else if (pageTime < 2000) {
      console.log('   ⚠️  Acceptable performance (500ms-2s)');
    } else {
      console.log('   ❌ Poor performance (>2 seconds)');
    }

    // Test 4: Activity heat map query (activity API)
    console.log('\n4️⃣ Testing activity heat map query...');
    const activityStart = Date.now();
    const activityResult = await pool.query(`
      SELECT 
        DATE(extracted_fields->>'transactionDate') as transaction_date,
        COUNT(*) as transaction_count
      FROM dev_tddf_jsonb
      WHERE record_type = 'DT'
        AND extracted_fields->>'transactionDate' IS NOT NULL
        AND extracted_fields->>'transactionDate' != ''
      GROUP BY DATE(extracted_fields->>'transactionDate')
      ORDER BY transaction_date DESC
      LIMIT 365
    `);
    const activityTime = Date.now() - activityStart;
    console.log(`   ⏱️  Query time: ${activityTime}ms`);
    console.log(`   📊 Activity days: ${activityResult.rows.length}`);
    
    // Performance assessment for activity query
    if (activityTime < 5000) {
      console.log('   ✅ Excellent performance (<5 seconds)');
    } else if (activityTime < 15000) {
      console.log('   ⚠️  Acceptable performance (5-15 seconds)');
    } else {
      console.log('   ❌ Poor performance (>15 seconds)');
    }

    // Test 5: Total amount calculation (stats API)
    console.log('\n5️⃣ Testing total amount calculation...');
    const amountStart = Date.now();
    const amountResult = await pool.query(`
      SELECT SUM(CAST(extracted_fields->>'transactionAmount' AS NUMERIC)) as total_amount
      FROM dev_tddf_jsonb
      WHERE record_type = 'DT' 
        AND extracted_fields->>'transactionAmount' IS NOT NULL
        AND extracted_fields->>'transactionAmount' != ''
    `);
    const amountTime = Date.now() - amountStart;
    console.log(`   ⏱️  Query time: ${amountTime}ms`);
    console.log(`   💰 Total amount: $${parseFloat(amountResult.rows[0]?.total_amount || 0).toLocaleString()}`);
    
    // Performance assessment for amount calculation
    if (amountTime < 10000) {
      console.log('   ✅ Excellent performance (<10 seconds)');
    } else if (amountTime < 30000) {
      console.log('   ⚠️  Acceptable performance (10-30 seconds)');
    } else {
      console.log('   ❌ Poor performance (>30 seconds)');
    }

    // Overall performance summary
    const totalTime = countTime + typeTime + pageTime + activityTime + amountTime;
    console.log('\n📊 Performance Summary:');
    console.log(`   Total test time: ${totalTime}ms (${(totalTime/1000).toFixed(1)}s)`);
    
    if (totalTime < 10000) {
      console.log('   🎉 Overall: EXCELLENT - Page should load quickly');
    } else if (totalTime < 30000) {
      console.log('   👍 Overall: GOOD - Acceptable page load times');
    } else if (totalTime < 60000) {
      console.log('   ⚠️  Overall: NEEDS IMPROVEMENT - Slow but usable');
    } else {
      console.log('   ❌ Overall: POOR - Page load will be very slow');
    }

    // Recommendations
    console.log('\n💡 Recommendations:');
    if (countTime > 5000) {
      console.log('   - Add index on created_at for faster counting');
    }
    if (typeTime > 10000) {
      console.log('   - Add index on record_type for faster grouping');
    }
    if (pageTime > 2000) {
      console.log('   - Add composite index (created_at DESC) for pagination');
    }
    if (activityTime > 15000) {
      console.log('   - Add index on record_type + JSONB date fields');
    }
    if (amountTime > 30000) {
      console.log('   - Add partial index for DT records with amounts');
    }

    console.log('\n✅ Performance testing completed!');

  } catch (error) {
    console.error('❌ Error during performance testing:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the performance test
if (require.main === module) {
  testTddfJsonPerformance()
    .then(() => {
      console.log('\n🎯 Test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testTddfJsonPerformance };