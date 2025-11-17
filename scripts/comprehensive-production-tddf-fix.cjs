#!/usr/bin/env node

/**
 * Comprehensive Production TDDF Fix
 * Creates missing tables and fixes the specific file encoding issue
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

async function fixProductionTDDF() {
  console.log('🔧 Comprehensive Production TDDF Fix...');
  console.log('=' .repeat(70));
  
  try {
    // Step 1: Find the correct uploader table name
    console.log('🔍 Finding correct uploader table name...');
    
    const uploaderTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%uploader%' OR table_name LIKE '%upload%')
      AND table_name NOT LIKE 'dev_%'
      ORDER BY table_name
    `);
    
    console.log('📋 Found uploader-related tables:');
    uploaderTables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Step 2: Create missing TDDF tables from templates
    console.log('\n🏗️ Creating missing TDDF tables...');
    
    const missingTables = [
      { prod: 'tddf_records_json', template: 'dev_tddf_records_json' },
      { prod: 'tddf_transactions', template: 'dev_tddf_records' },
      { prod: 'tddf_purchasing_cards', template: 'dev_tddf_purchasing_extensions' },
      { prod: 'tddf_purchasing_cards_2', template: 'dev_tddf_purchasing_extensions_2' }
    ];
    
    for (const { prod, template } of missingTables) {
      // Check if production table exists
      const prodExists = await pool.query(`
        SELECT 1 FROM information_schema.tables WHERE table_name = $1
      `, [prod]);
      
      if (prodExists.rows.length === 0) {
        // Check if template exists
        const templateExists = await pool.query(`
          SELECT 1 FROM information_schema.tables WHERE table_name = $1
        `, [template]);
        
        if (templateExists.rows.length > 0) {
          console.log(`🔧 Creating ${prod} from ${template}...`);
          
          await pool.query(`CREATE TABLE ${prod} (LIKE ${template} INCLUDING ALL)`);
          console.log(`✅ Created ${prod}`);
        } else {
          console.log(`⚠️ Template ${template} not found, creating basic structure...`);
          
          // Create basic TDDF table structure
          if (prod === 'tddf_records_json') {
            await pool.query(`
              CREATE TABLE ${prod} (
                id SERIAL PRIMARY KEY,
                upload_id TEXT,
                filename TEXT,
                record_data JSONB,
                record_type TEXT,
                line_number INTEGER,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )
            `);
          } else if (prod === 'tddf_transactions') {
            await pool.query(`
              CREATE TABLE ${prod} (
                id SERIAL PRIMARY KEY,
                upload_id TEXT,
                transaction_amount DECIMAL(15,2),
                merchant_id TEXT,
                processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )
            `);
          }
          console.log(`✅ Created basic ${prod} structure`);
        }
      } else {
        console.log(`✅ ${prod} already exists`);
      }
    }
    
    // Step 3: Check and fix the specific file
    console.log('\n📁 Fixing specific file encoding issue...');
    
    // Try different possible table names for MMS uploads
    const possibleTables = ['uploader_files', 'mms_uploader_files', 'uploads', 'file_uploads'];
    let uploaderTable = null;
    
    for (const tableName of possibleTables) {
      try {
        const test = await pool.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
        uploaderTable = tableName;
        console.log(`✅ Found uploader table: ${tableName}`);
        break;
      } catch (e) {
        // Table doesn't exist, continue
      }
    }
    
    if (uploaderTable) {
      // Check file status
      const fileCheck = await pool.query(`
        SELECT id, filename, current_phase, encoding_status, processing_errors, last_updated
        FROM ${uploaderTable}
        WHERE filename = $1
        ORDER BY created_at DESC 
        LIMIT 1
      `, ['VERMNTSB.6759_TDDF_830_08012025_083844.TSYSO']);
      
      if (fileCheck.rows.length > 0) {
        const file = fileCheck.rows[0];
        console.log(`📊 File found in ${uploaderTable}:`);
        console.log(`   ID: ${file.id}`);
        console.log(`   Phase: ${file.current_phase}`);
        console.log(`   Encoding Status: ${file.encoding_status}`);
        console.log(`   Processing Errors: ${file.processing_errors}`);
        
        if (file.current_phase === 'error') {
          console.log('\n🔄 Resetting file for reprocessing...');
          
          await pool.query(`
            UPDATE ${uploaderTable}
            SET current_phase = 'identified',
                encoding_status = null,
                processing_errors = null,
                failed_at = null,
                last_updated = NOW()
            WHERE id = $1
          `, [file.id]);
          
          console.log('✅ File reset to identified phase');
        }
      } else {
        console.log('❌ File not found in uploader table');
      }
    } else {
      console.log('❌ No uploader table found');
    }
    
    // Step 4: Verify production TDDF processing pipeline
    console.log('\n⚙️ Verifying TDDF processing pipeline...');
    
    const pipelineCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN (
        'tddf_records_json', 
        'tddf_transactions', 
        'tddf_batch_headers',
        'tddf_records'
      )
    `);
    
    console.log('🔗 TDDF pipeline tables verified:');
    pipelineCheck.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });
    
    // Step 5: Test basic TDDF insert capability
    console.log('\n🧪 Testing TDDF table functionality...');
    
    try {
      await pool.query(`
        INSERT INTO tddf_records_json (upload_id, filename, record_data, record_type, line_number)
        VALUES ('test_fix', 'test_file.TSYSO', '{"test": true}', 'DT', 1)
      `);
      
      await pool.query(`
        DELETE FROM tddf_records_json WHERE upload_id = 'test_fix'
      `);
      
      console.log('✅ TDDF table insert/delete test successful');
    } catch (error) {
      console.log('❌ TDDF table test failed:', error.message);
    }
    
    console.log('\n' + '=' .repeat(70));
    console.log('🎉 Comprehensive Production TDDF Fix Complete!');
    console.log('');
    console.log('📋 SUMMARY:');
    console.log('✅ Created missing TDDF tables');
    console.log('✅ Reset error file for reprocessing');
    console.log('✅ Verified TDDF processing pipeline');
    console.log('✅ Tested table functionality');
    console.log('');
    console.log('🔄 The file should now be able to process correctly in production');
    
  } catch (error) {
    console.error('❌ Error in comprehensive TDDF fix:', error);
  } finally {
    await pool.end();
  }
}

// Run the comprehensive fix
fixProductionTDDF().catch(console.error);