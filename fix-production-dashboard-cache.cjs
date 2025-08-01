#!/usr/bin/env node

/**
 * Fix Production Dashboard Cache Table
 * Resolves the ON CONFLICT constraint issue in dashboard_cache table
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Configure Neon for serverless
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixDashboardCacheTable() {
  console.log('🔧 Fixing Production Dashboard Cache Table...');
  console.log('=' .repeat(60));
  
  try {
    // Check current dashboard_cache table structure
    console.log('📊 Checking current dashboard_cache table structure...');
    
    const tableCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'dashboard_cache' 
      ORDER BY ordinal_position
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('❌ dashboard_cache table does not exist');
      return;
    }
    
    console.log('📋 Current table structure:');
    tableCheck.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Check for primary key or unique constraints
    const constraintCheck = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'dashboard_cache'
    `);
    
    console.log('\n🔒 Current constraints:');
    if (constraintCheck.rows.length === 0) {
      console.log('   - No constraints found (THIS IS THE PROBLEM!)');
    } else {
      constraintCheck.rows.forEach(row => {
        console.log(`   - ${row.constraint_name}: ${row.constraint_type}`);
      });
    }
    
    // Check if dev_dashboard_cache has the correct structure
    console.log('\n🔍 Checking dev_dashboard_cache structure for reference...');
    
    const devTableCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'dev_dashboard_cache' 
      ORDER BY ordinal_position
    `);
    
    if (devTableCheck.rows.length > 0) {
      console.log('📋 Dev table structure:');
      devTableCheck.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
      
      // Check dev constraints
      const devConstraints = await pool.query(`
        SELECT constraint_name, constraint_type 
        FROM information_schema.table_constraints 
        WHERE table_name = 'dev_dashboard_cache'
      `);
      
      console.log('\n🔒 Dev table constraints:');
      devConstraints.rows.forEach(row => {
        console.log(`   - ${row.constraint_name}: ${row.constraint_type}`);
      });
    }
    
    // Fix the table by recreating it with proper structure
    console.log('\n🔧 Recreating dashboard_cache table with correct structure...');
    
    // Backup existing data
    const existingData = await pool.query('SELECT * FROM dashboard_cache');
    console.log(`📦 Backing up ${existingData.rows.length} existing records...`);
    
    // Drop and recreate table with proper structure
    await pool.query('DROP TABLE IF EXISTS dashboard_cache CASCADE');
    console.log('🗑️  Dropped existing table');
    
    // Recreate with proper structure (copy from dev table)
    await pool.query(`
      CREATE TABLE dashboard_cache (LIKE dev_dashboard_cache INCLUDING ALL)
    `);
    console.log('✅ Recreated table with correct structure');
    
    // Restore data if any existed
    if (existingData.rows.length > 0) {
      console.log('📥 Restoring backed up data...');
      
      // Get column names for insert
      const columns = devTableCheck.rows.map(row => row.column_name);
      const columnList = columns.join(', ');
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      
      for (const row of existingData.rows) {
        const values = columns.map(col => row[col]);
        await pool.query(
          `INSERT INTO dashboard_cache (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
      }
      console.log(`✅ Restored ${existingData.rows.length} records`);
    }
    
    // Verify the fix
    console.log('\n🔍 Verifying the fix...');
    const finalCheck = await pool.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'dashboard_cache'
    `);
    
    console.log('🔒 Final constraints:');
    finalCheck.rows.forEach(row => {
      console.log(`   - ${row.constraint_name}: ${row.constraint_type}`);
    });
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Dashboard cache table fix complete!');
    console.log('✅ The ON CONFLICT constraint issue should now be resolved');
    
  } catch (error) {
    console.error('❌ Error fixing dashboard cache table:', error);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixDashboardCacheTable().catch(console.error);