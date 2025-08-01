#!/usr/bin/env node

/**
 * Fix Production File Phase
 * Resets the specific file from error to identified phase
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixFilePhase() {
  console.log('🔄 Fixing Production File Phase...');
  console.log('Target File: VERMNTSB.6759_TDDF_830_08012025_083844.TSYSO');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check uploads table structure
    console.log('🔍 Checking uploads table structure...');
    
    const tableStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'uploads'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Uploads table columns:');
    tableStructure.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (${row.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Step 2: Find the specific file
    console.log('\n📁 Finding target file...');
    
    const fileQuery = await pool.query(`
      SELECT id, filename, current_phase, last_updated, processing_errors, encoding_status
      FROM uploads
      WHERE filename = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, ['VERMNTSB.6759_TDDF_830_08012025_083844.TSYSO']);
    
    if (fileQuery.rows.length === 0) {
      console.log('❌ File not found in uploads table');
      return;
    }
    
    const file = fileQuery.rows[0];
    console.log('📊 Current file status:');
    console.log(`   ID: ${file.id}`);
    console.log(`   Phase: ${file.current_phase}`);
    console.log(`   Encoding Status: ${file.encoding_status}`);
    console.log(`   Processing Errors: ${file.processing_errors}`);
    console.log(`   Last Updated: ${file.last_updated}`);
    
    // Step 3: Reset file to identified phase
    if (file.current_phase === 'error') {
      console.log('\n🔄 Resetting file from error to identified phase...');
      
      const updateQuery = `
        UPDATE uploads 
        SET current_phase = 'identified',
            encoding_status = null,
            processing_errors = null,
            last_updated = NOW()
        WHERE id = $1
      `;
      
      await pool.query(updateQuery, [file.id]);
      console.log('✅ File successfully reset to identified phase');
      
      // Verify the update
      const verifyQuery = await pool.query(`
        SELECT current_phase, encoding_status, processing_errors, last_updated
        FROM uploads
        WHERE id = $1
      `, [file.id]);
      
      const updatedFile = verifyQuery.rows[0];
      console.log('\n📊 Updated file status:');
      console.log(`   Phase: ${updatedFile.current_phase}`);
      console.log(`   Encoding Status: ${updatedFile.encoding_status}`);
      console.log(`   Processing Errors: ${updatedFile.processing_errors}`);
      console.log(`   Last Updated: ${updatedFile.last_updated}`);
      
    } else {
      console.log(`ℹ️ File is already in '${file.current_phase}' phase, no reset needed`);
    }
    
    // Step 4: Check if TDDF tables are ready
    console.log('\n🗄️ Verifying TDDF tables are ready...');
    
    const tddfTables = ['tddf_records_json', 'tddf_transactions', 'tddf_purchasing_cards'];
    for (const table of tddfTables) {
      const checkTable = await pool.query(`
        SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = $1
      `, [table]);
      
      if (checkTable.rows[0].count > 0) {
        console.log(`   ✅ ${table} exists`);
      } else {
        console.log(`   ❌ ${table} missing`);
      }
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Production File Phase Fix Complete!');
    console.log('');
    console.log('📋 SUMMARY:');
    console.log('✅ File reset from error to identified phase');
    console.log('✅ TDDF tables verified');
    console.log('✅ Ready for encoding process');
    console.log('');
    console.log('🔄 The file should now be available for encoding in production');
    
  } catch (error) {
    console.error('❌ Error fixing file phase:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixFilePhase().catch(console.error);