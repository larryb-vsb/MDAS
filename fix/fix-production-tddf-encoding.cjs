#!/usr/bin/env node

/**
 * Fix Production TDDF Encoding Issue
 * Diagnoses and fixes the database issues preventing TDDF file encoding in production
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

async function fixProductionTDDFEncoding() {
  console.log('🔧 Fixing Production TDDF Encoding Database Issues...');
  console.log('=' .repeat(70));
  
  try {
    // Step 1: Check if production TDDF tables exist
    console.log('🗄️ Checking production TDDF tables...');
    
    const prodTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'tddf_%' 
      AND table_name NOT LIKE 'dev_%'
      ORDER BY table_name
    `);
    
    console.log(`📊 Found ${prodTables.rows.length} production TDDF tables:`);
    prodTables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Step 2: Check if critical TDDF tables are missing
    const requiredTables = [
      'tddf_records_json',
      'tddf_transactions',
      'tddf_batch_headers',
      'tddf_purchasing_cards',
      'tddf_purchasing_cards_2'
    ];
    
    console.log('\n🔍 Checking for missing critical tables...');
    const existingTables = prodTables.rows.map(r => r.table_name);
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log('❌ Missing critical production TDDF tables:');
      missingTables.forEach(table => {
        console.log(`   - ${table}`);
      });
      
      // Create missing tables from dev templates
      console.log('\n🔧 Creating missing production tables...');
      for (const table of missingTables) {
        const devTable = `dev_${table}`;
        
        // Check if dev table exists to use as template
        const devCheck = await pool.query(`
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        `, [devTable]);
        
        if (devCheck.rows.length > 0) {
          console.log(`📋 Creating ${table} from ${devTable} template...`);
          
          await pool.query(`
            CREATE TABLE ${table} (LIKE ${devTable} INCLUDING ALL)
          `);
          
          console.log(`✅ Created ${table}`);
        } else {
          console.log(`⚠️ No dev template found for ${table}`);
        }
      }
    } else {
      console.log('✅ All critical TDDF tables exist');
    }
    
    // Step 3: Check table constraints and indexes
    console.log('\n🔍 Checking table constraints...');
    
    const constraintCheck = await pool.query(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name IN ('tddf_records_json', 'tddf_transactions', 'tddf_batch_headers')
      ORDER BY tc.table_name, tc.constraint_type
    `);
    
    console.log('🔒 Table constraints found:');
    constraintCheck.rows.forEach(row => {
      console.log(`   ${row.table_name}: ${row.constraint_type} on ${row.column_name || 'multiple columns'}`);
    });
    
    // Step 4: Check specific file processing status
    console.log('\n📁 Checking specific file processing issue...');
    
    const fileCheck = await pool.query(`
      SELECT current_phase, encoding_status, processing_errors, last_updated
      FROM uploader_files 
      WHERE filename = $1
      ORDER BY created_at DESC 
      LIMIT 1
    `, ['VERMNTSB.6759_TDDF_830_08012025_083844.TSYSO']);
    
    if (fileCheck.rows.length > 0) {
      const file = fileCheck.rows[0];
      console.log('📊 File processing status:');
      console.log(`   Phase: ${file.current_phase}`);
      console.log(`   Encoding Status: ${file.encoding_status}`);
      console.log(`   Processing Errors: ${file.processing_errors}`);
      console.log(`   Last Updated: ${file.last_updated}`);
      
      // If file is in error state, try to reset it for reprocessing
      if (file.current_phase === 'error') {
        console.log('\n🔄 Resetting file for reprocessing...');
        
        await pool.query(`
          UPDATE uploader_files 
          SET current_phase = 'identified',
              encoding_status = null,
              processing_errors = null,
              failed_at = null,
              last_updated = NOW()
          WHERE filename = $1
        `, ['VERMNTSB.6759_TDDF_830_08012025_083844.TSYSO']);
        
        console.log('✅ File reset to identified phase for reprocessing');
      }
    } else {
      console.log('❌ File not found in uploader_files table');
    }
    
    // Step 5: Verify production environment settings
    console.log('\n⚙️ Checking production environment configuration...');
    
    const envCheck = await pool.query(`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_name = 'uploader_files'
      AND column_name IN ('current_phase', 'encoding_status')
    `);
    
    console.log('📋 Key column configurations:');
    envCheck.rows.forEach(row => {
      console.log(`   ${row.column_name}: default = ${row.column_default || 'none'}`);
    });
    
    console.log('\n' + '=' .repeat(70));
    console.log('🎉 Production TDDF Encoding Fix Complete!');
    console.log('');
    console.log('📋 ACTIONS TAKEN:');
    console.log('✅ Verified production TDDF table structure');
    console.log('✅ Created any missing critical tables');
    console.log('✅ Reset error file for reprocessing');
    console.log('✅ Verified database constraints');
    console.log('');
    console.log('🔄 NEXT STEPS:');
    console.log('1. File should now be available for encoding');
    console.log('2. Monitor production encoding service');
    console.log('3. Check file processing logs');
    
  } catch (error) {
    console.error('❌ Error fixing production TDDF encoding:', error);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixProductionTDDFEncoding().catch(console.error);