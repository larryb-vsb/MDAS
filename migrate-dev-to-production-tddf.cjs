#!/usr/bin/env node

/**
 * Migrate Development TDDF Data to Production Tables
 * Safely transfers all TDDF JSONB records from development to production tables
 * for seamless re-publishing transition
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Neon config for WebSocket
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

async function migrateTddfData() {
  console.log('🚀 Starting Development → Production TDDF Data Migration');
  console.log('=' .repeat(60));
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Step 1: Verify table structure
    console.log('\n📋 Step 1: Verifying table structure...');
    
    const devTableCheck = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'dev_uploader_tddf_jsonb_records' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    const prodTableCheck = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'uploader_tddf_jsonb_records' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log(`✅ Development table columns: ${devTableCheck.rows.length}`);
    console.log(`✅ Production table columns: ${prodTableCheck.rows.length}`);
    
    if (devTableCheck.rows.length === 0) {
      throw new Error('❌ Development table dev_uploader_tddf_jsonb_records not found');
    }
    
    if (prodTableCheck.rows.length === 0) {
      throw new Error('❌ Production table uploader_tddf_jsonb_records not found');
    }
    
    // Step 2: Check current data counts
    console.log('\n📊 Step 2: Checking current data counts...');
    
    const devCount = await pool.query('SELECT COUNT(*) as count FROM dev_uploader_tddf_jsonb_records');
    const prodCount = await pool.query('SELECT COUNT(*) as count FROM uploader_tddf_jsonb_records');
    
    const devTotal = parseInt(devCount.rows[0].count);
    const prodTotal = parseInt(prodCount.rows[0].count);
    
    console.log(`📈 Development records: ${devTotal.toLocaleString()}`);
    console.log(`📈 Production records: ${prodTotal.toLocaleString()}`);
    
    if (devTotal === 0) {
      console.log('⚠️  No development data to migrate');
      return;
    }
    
    // Step 3: Check for upload ID conflicts
    console.log('\n🔍 Step 3: Checking for upload ID conflicts...');
    
    const conflictCheck = await pool.query(`
      SELECT d.upload_id, COUNT(*) as dev_count, 
             COALESCE(p.prod_count, 0) as prod_count
      FROM dev_uploader_tddf_jsonb_records d
      LEFT JOIN (
        SELECT upload_id, COUNT(*) as prod_count 
        FROM uploader_tddf_jsonb_records 
        GROUP BY upload_id
      ) p ON d.upload_id = p.upload_id
      GROUP BY d.upload_id, p.prod_count
      ORDER BY d.upload_id
    `);
    
    const conflicts = conflictCheck.rows.filter(row => row.prod_count > 0);
    
    if (conflicts.length > 0) {
      console.log(`⚠️  Found ${conflicts.length} upload IDs already in production:`);
      conflicts.forEach(conflict => {
        console.log(`   - ${conflict.upload_id}: ${conflict.dev_count} dev → ${conflict.prod_count} prod`);
      });
      console.log('\n🛡️  Migration will skip duplicate upload IDs to preserve existing production data');
    } else {
      console.log('✅ No conflicts detected - all development upload IDs are unique');
    }
    
    // Step 4: Migrate data with conflict handling
    console.log('\n📦 Step 4: Starting data migration...');
    
    // Get unique upload IDs from development that don't exist in production
    const uniqueUploads = await pool.query(`
      SELECT upload_id, COUNT(*) as record_count
      FROM dev_uploader_tddf_jsonb_records d
      WHERE NOT EXISTS (
        SELECT 1 FROM uploader_tddf_jsonb_records p 
        WHERE p.upload_id = d.upload_id
      )
      GROUP BY upload_id
      ORDER BY upload_id
    `);
    
    console.log(`🎯 Found ${uniqueUploads.rows.length} unique upload sessions to migrate`);
    
    if (uniqueUploads.rows.length === 0) {
      console.log('ℹ️  All development data already exists in production - no migration needed');
      return;
    }
    
    let totalMigrated = 0;
    
    // Migrate in batches by upload_id
    for (const upload of uniqueUploads.rows) {
      const { upload_id, record_count } = upload;
      console.log(`\n📁 Migrating ${upload_id}: ${record_count} records...`);
      
      try {
        // Copy all records for this upload_id
        const result = await pool.query(`
          INSERT INTO uploader_tddf_jsonb_records (
            upload_id, record_type, record_data, processing_status, created_at, processed_at
          )
          SELECT 
            upload_id, record_type, record_data, processing_status, created_at, processed_at
          FROM dev_uploader_tddf_jsonb_records 
          WHERE upload_id = $1
        `, [upload_id]);
        
        const insertedCount = result.rowCount;
        totalMigrated += insertedCount;
        
        console.log(`   ✅ Migrated ${insertedCount} records for ${upload_id}`);
        
      } catch (error) {
        console.error(`   ❌ Failed to migrate ${upload_id}:`, error.message);
      }
    }
    
    // Step 5: Verify migration results
    console.log('\n🔍 Step 5: Verifying migration results...');
    
    const finalProdCount = await pool.query('SELECT COUNT(*) as count FROM uploader_tddf_jsonb_records');
    const finalCount = parseInt(finalProdCount.rows[0].count);
    
    console.log(`📊 Final production record count: ${finalCount.toLocaleString()}`);
    console.log(`📈 Records migrated: ${totalMigrated.toLocaleString()}`);
    
    // Step 6: Sample data verification
    console.log('\n🧪 Step 6: Sample data verification...');
    
    const sampleData = await pool.query(`
      SELECT upload_id, record_type, COUNT(*) as count
      FROM uploader_tddf_jsonb_records
      GROUP BY upload_id, record_type
      ORDER BY upload_id, record_type
      LIMIT 10
    `);
    
    console.log('📋 Sample migrated data:');
    sampleData.rows.forEach(row => {
      console.log(`   - ${row.upload_id} (${row.record_type}): ${row.count} records`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('=' .repeat(60));
    console.log('✅ Your production TDDF data is now ready for re-publishing');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
if (require.main === module) {
  migrateTddfData();
}

module.exports = { migrateTddfData };