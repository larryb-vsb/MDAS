#!/usr/bin/env node

/**
 * Final Status Test - Fix file type and trigger encoding
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TARGET_FILE_ID = 'uploader_1754081113892_3b22z50d8';

async function fixFileType() {
  console.log('🔧 Fixing file type for TDDF encoding...');
  
  try {
    // Update file type to tddf for proper encoding
    await pool.query(`
      UPDATE uploader_uploads 
      SET file_type = 'tddf',
          final_file_type = 'tddf',
          detected_file_type = 'tddf'
      WHERE id = $1
    `, [TARGET_FILE_ID]);
    
    console.log('✅ File type set to TDDF');
    
    // Verify the update
    const verify = await pool.query(`
      SELECT file_type, final_file_type, detected_file_type, current_phase, status
      FROM uploader_uploads 
      WHERE id = $1
    `, [TARGET_FILE_ID]);
    
    if (verify.rows.length > 0) {
      const file = verify.rows[0];
      console.log('📊 Updated file details:');
      console.log(`   File Type: ${file.file_type}`);
      console.log(`   Final File Type: ${file.final_file_type}`);
      console.log(`   Detected File Type: ${file.detected_file_type}`);
      console.log(`   Current Phase: ${file.current_phase}`);
      console.log(`   Status: ${file.status}`);
    }
    
    console.log('✅ File is now ready for TDDF encoding in production');
    
  } catch (error) {
    console.error('❌ Error fixing file type:', error.message);
  } finally {
    await pool.end();
  }
}

fixFileType().catch(console.error);