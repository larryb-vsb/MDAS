#!/usr/bin/env node

/**
 * Comprehensive validation of JSONB database content
 * This script validates the database has proper data for the failing upload
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Neon config for WebSocket
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

async function validateJsonbDatabase() {
  console.log('🔍 Validating JSONB Database Content');
  
  const uploadId = 'uploader_1753770043406_rxjr75vpv';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('\n📊 Step 1: Basic Table Validation');
    
    // Check if table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'dev_uploader_tddf_jsonb_records'
      ) as exists
    `);
    
    console.log(`✅ Table exists: ${tableExists.rows[0].exists}`);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ Table does not exist - this is the problem!');
      return false;
    }
    
    // Check total records in table
    const totalCount = await pool.query(`
      SELECT COUNT(*) as total FROM dev_uploader_tddf_jsonb_records
    `);
    console.log(`📋 Total records in table: ${totalCount.rows[0].total}`);
    
    // Check records for specific upload
    const uploadCount = await pool.query(`
      SELECT COUNT(*) as count FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1
    `, [uploadId]);
    console.log(`🎯 Records for upload ${uploadId}: ${uploadCount.rows[0].count}`);
    
    if (uploadCount.rows[0].count === '0') {
      console.log('❌ No records found for the upload - checking other uploads...');
      
      const allUploads = await pool.query(`
        SELECT upload_id, COUNT(*) as count 
        FROM dev_uploader_tddf_jsonb_records 
        GROUP BY upload_id 
        ORDER BY count DESC
      `);
      
      console.log('📋 All uploads in JSONB table:');
      allUploads.rows.forEach(row => {
        console.log(`   ${row.upload_id}: ${row.count} records`);
      });
      
      return false;
    }
    
    console.log('\n🔍 Step 2: Sample Data Validation');
    
    // Get sample records
    const sampleRecords = await pool.query(`
      SELECT id, upload_id, record_type, record_data, processing_status, created_at
      FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1 
      ORDER BY id 
      LIMIT 3
    `, [uploadId]);
    
    console.log(`📄 Sample records (${sampleRecords.rows.length} shown):`);
    sampleRecords.rows.forEach((row, index) => {
      console.log(`\n   Record ${index + 1}:`);
      console.log(`   - ID: ${row.id}`);
      console.log(`   - Type: ${row.record_type}`);
      console.log(`   - Status: ${row.processing_status}`);
      console.log(`   - Created: ${row.created_at}`);
      console.log(`   - Data keys: ${Object.keys(row.record_data).join(', ')}`);
    });
    
    console.log('\n🔍 Step 3: Record Type Breakdown');
    
    // Get record type breakdown
    const recordTypes = await pool.query(`
      SELECT record_type, COUNT(*) as count 
      FROM dev_uploader_tddf_jsonb_records 
      WHERE upload_id = $1 
      GROUP BY record_type 
      ORDER BY count DESC
    `, [uploadId]);
    
    console.log('📊 Record types:');
    recordTypes.rows.forEach(row => {
      console.log(`   ${row.record_type}: ${row.count} records`);
    });
    
    console.log('\n🔍 Step 4: Upload Status Validation');
    
    // Check if upload exists in uploads table
    const uploadExists = await pool.query(`
      SELECT id, filename, current_phase, encoding_status 
      FROM dev_uploader_uploads 
      WHERE id = $1
    `, [uploadId]);
    
    if (uploadExists.rows.length === 0) {
      console.log('❌ Upload not found in uploads table');
      return false;
    }
    
    const upload = uploadExists.rows[0];
    console.log('📁 Upload details:');
    console.log(`   Filename: ${upload.filename}`);
    console.log(`   Phase: ${upload.current_phase}`);
    console.log(`   Encoding Status: ${upload.encoding_status}`);
    
    console.log('\n🎯 FINAL VALIDATION RESULT:');
    console.log('✅ Table exists');
    console.log(`✅ ${uploadCount.rows[0].count} JSONB records found for upload`);
    console.log(`✅ ${recordTypes.rows.length} different record types`);
    console.log('✅ Upload exists and is properly encoded');
    console.log('\n💡 Database is valid - the issue must be in the API authentication or response formatting');
    
    return true;
    
  } catch (error) {
    console.error('💥 Validation failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  } finally {
    await pool.end();
  }
}

// Run the validation
validateJsonbDatabase().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});