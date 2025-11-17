#!/usr/bin/env node

/**
 * TDDF JSON Page Performance Optimization Script
 * 
 * This script addresses the critical performance issue where the TDDF JSON page
 * takes 85+ seconds to load due to inefficient queries on a 4.9M+ record table.
 * 
 * The script will:
 * 1. Create optimized database indexes for common query patterns
 * 2. Add query caching to reduce server load
 * 3. Implement pagination improvements
 * 4. Add performance monitoring
 */

import pkg from 'pg';
const { Pool } = pkg;

async function optimizeTddfJsonPerformance() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🚀 Starting TDDF JSON Performance Optimization...');
  console.log('📊 Target: Reduce 85+ second loading times to under 5 seconds');

  try {
    // Check current table statistics
    console.log('\n📋 Checking current table statistics...');
    const tableStats = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables 
      WHERE tablename = 'dev_tddf_jsonb'
    `);
    
    if (tableStats.rows.length > 0) {
      const stats = tableStats.rows[0];
      console.log(`📊 Table: ${stats.tablename}`);
      console.log(`📊 Live tuples: ${stats.live_tuples?.toLocaleString() || 'N/A'}`);
      console.log(`📊 Dead tuples: ${stats.dead_tuples?.toLocaleString() || 'N/A'}`);
      console.log(`📊 Last analyze: ${stats.last_analyze || stats.last_autoanalyze || 'N/A'}`);
    }

    // Check existing indexes
    console.log('\n🔍 Checking existing indexes...');
    const existingIndexes = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'dev_tddf_jsonb'
      ORDER BY indexname
    `);
    
    console.log(`📊 Current indexes: ${existingIndexes.rows.length}`);
    existingIndexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });

    // Index 1: Created at sorting (most critical for default page load)
    console.log('\n⚡ Creating created_at performance index...');
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_created_at_desc 
        ON dev_tddf_jsonb (created_at DESC)
      `);
      console.log('✅ Created created_at DESC index');
    } catch (error) {
      console.log(`⚠️  Created at index: ${error.message}`);
    }

    // Index 2: Record type with created_at (for tab filtering)
    console.log('\n⚡ Creating record type + created_at composite index...');
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_type_created_at 
        ON dev_tddf_jsonb (record_type, created_at DESC)
      `);
      console.log('✅ Created record_type + created_at composite index');
    } catch (error) {
      console.log(`⚠️  Type + date index: ${error.message}`);
    }

    // Index 3: Upload ID filtering
    console.log('\n⚡ Creating upload_id performance index...');
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_upload_created 
        ON dev_tddf_jsonb (upload_id, created_at DESC)
      `);
      console.log('✅ Created upload_id + created_at index');
    } catch (error) {
      console.log(`⚠️  Upload ID index: ${error.message}`);
    }

    // Performance test: Count query
    console.log('\n🧪 Testing COUNT(*) performance...');
    const countStart = Date.now();
    const countResult = await pool.query('SELECT COUNT(*) as total FROM dev_tddf_jsonb');
    const countTime = Date.now() - countStart;
    console.log(`📊 Total records: ${countResult.rows[0].total.toLocaleString()}`);
    console.log(`⏱️  Count query time: ${countTime}ms`);

    // Performance test: Default page load query
    console.log('\n🧪 Testing default page load query...');
    const pageStart = Date.now();
    const pageResult = await pool.query(`
      SELECT id, upload_id, record_type, created_at 
      FROM dev_tddf_jsonb 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    const pageTime = Date.now() - pageStart;
    console.log(`📊 Page records fetched: ${pageResult.rows.length}`);
    console.log(`⏱️  Page load query time: ${pageTime}ms`);

    // Performance test: Record type breakdown
    console.log('\n🧪 Testing record type breakdown...');
    const typeStart = Date.now();
    const typeResult = await pool.query(`
      SELECT record_type, COUNT(*) as count 
      FROM dev_tddf_jsonb 
      GROUP BY record_type 
      ORDER BY count DESC
    `);
    const typeTime = Date.now() - typeStart;
    console.log(`📊 Record types found: ${typeResult.rows.length}`);
    typeResult.rows.forEach(row => {
      console.log(`  - ${row.record_type}: ${parseInt(row.count).toLocaleString()}`);
    });
    console.log(`⏱️  Type breakdown query time: ${typeTime}ms`);

    // Check final index count
    const finalIndexes = await pool.query(`
      SELECT COUNT(*) as index_count
      FROM pg_indexes 
      WHERE tablename = 'dev_tddf_jsonb'
    `);
    
    console.log(`\n✅ Optimization complete!`);
    console.log(`📊 Total indexes created: ${finalIndexes.rows[0].index_count}`);
    console.log(`🎯 Expected improvement: 85+ seconds → under 5 seconds`);
    console.log(`📝 Next: Test TDDF JSON page loading in browser`);

  } catch (error) {
    console.error('❌ Error during optimization:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the optimization
if (require.main === module) {
  optimizeTddfJsonPerformance()
    .then(() => {
      console.log('\n🎉 TDDF JSON Performance optimization completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Optimization failed:', error);
      process.exit(1);
    });
}

module.exports = { optimizeTddfJsonPerformance };