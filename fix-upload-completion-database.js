#!/usr/bin/env node

/**
 * COMPREHENSIVE FIX: Upload Completion Database Issue
 * 
 * PROBLEM: NODE_ENV undefined causes system to use dev_uploader_uploads but 
 * production uploads may be in uploader_uploads table, causing completion failures.
 * 
 * DATABASE-ONLY SOLUTION:
 * 1. Check which table has the stuck uploads
 * 2. Migrate uploads to the table the system is actually reading from
 * 3. Ensure processing pipeline can find and complete uploads
 * 
 * This fixes upload completion without requiring code changes.
 */

import pg from 'pg';
const { Pool } = pg;

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ ERROR: DATABASE_URL environment variable not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('🔧 COMPREHENSIVE UPLOAD COMPLETION DATABASE FIX');
    console.log('==============================================');
    console.log(`🌍 Current NODE_ENV: "${process.env.NODE_ENV}" (${process.env.NODE_ENV ? 'SET' : 'UNDEFINED = USES DEV TABLES'})\n`);
    
    // Step 1: Check which table contains stuck uploads
    let productionUploads = [];
    let developmentUploads = [];
    let productionExists = false;
    let developmentExists = false;
    
    console.log('📊 STEP 1: CHECKING TABLE STATUS\n');
    
    // Check production table
    try {
      const prodCheck = await pool.query(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_name = 'uploader_uploads'
      `);
      
      if (prodCheck.rows[0].count > 0) {
        productionExists = true;
        const prodUploads = await pool.query(`
          SELECT id, original_filename, current_phase, start_time, session_id
          FROM uploader_uploads 
          WHERE current_phase IN ('started', 'uploading', 'uploaded') 
            AND start_time > NOW() - INTERVAL '7 days'
          ORDER BY start_time DESC
        `);
        productionUploads = prodUploads.rows;
        console.log(`✅ Production table (uploader_uploads): EXISTS with ${productionUploads.length} incomplete uploads`);
      }
    } catch (prodError) {
      console.log(`❌ Production table (uploader_uploads): ${prodError.message}`);
    }
    
    // Check development table  
    try {
      const devCheck = await pool.query(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_name = 'dev_uploader_uploads'
      `);
      
      if (devCheck.rows[0].count > 0) {
        developmentExists = true;
        const devUploads = await pool.query(`
          SELECT id, original_filename, current_phase, start_time, session_id
          FROM dev_uploader_uploads 
          WHERE current_phase IN ('started', 'uploading', 'uploaded')
            AND start_time > NOW() - INTERVAL '7 days'
          ORDER BY start_time DESC
        `);
        developmentUploads = devUploads.rows;
        console.log(`✅ Development table (dev_uploader_uploads): EXISTS with ${developmentUploads.length} incomplete uploads`);
      }
    } catch (devError) {
      console.log(`❌ Development table (dev_uploader_uploads): ${devError.message}`);
    }
    
    console.log('\n🎯 DIAGNOSIS:');
    if (productionUploads.length > 0 && developmentUploads.length === 0) {
      console.log('🔍 CONFIRMED: Uploads stuck in PRODUCTION table but system reads DEVELOPMENT table');
      console.log('💡 SOLUTION: Migrate production uploads to development table for processing\n');
      
      // Show stuck uploads
      console.log('📋 STUCK UPLOADS IN PRODUCTION TABLE:');
      productionUploads.slice(0, 5).forEach(upload => {
        console.log(`   ${upload.id}: ${upload.original_filename} (${upload.current_phase}) - Session: ${upload.session_id}`);
      });
      
      console.log('\n🔧 STEP 2: MIGRATING UPLOADS TO DEVELOPMENT TABLE');
      console.log('This will allow the processing system to find and complete them.\n');
      
      let migratedCount = 0;
      for (const upload of productionUploads) {
        try {
          // Check if upload already exists in dev table
          const existsCheck = await pool.query(`
            SELECT id FROM dev_uploader_uploads WHERE id = $1
          `, [upload.id]);
          
          if (existsCheck.rows.length === 0) {
            // Get full upload record
            const fullRecord = await pool.query(`
              SELECT * FROM uploader_uploads WHERE id = $1
            `, [upload.id]);
            
            if (fullRecord.rows.length > 0) {
              const record = fullRecord.rows[0];
              
              // Insert into development table
              await pool.query(`
                INSERT INTO dev_uploader_uploads (
                  id, original_filename, file_size, file_type, current_phase,
                  start_time, end_time, line_count, session_id, file_format,
                  processing_server_id, server_claim_time, retry_count,
                  retry_warning_logs, processing_status, details, bucket_name,
                  bucket_key, file_data_sample, identified_file_type, bucket_directory
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
                ) ON CONFLICT (id) DO NOTHING
              `, [
                record.id, record.original_filename, record.file_size, record.file_type,
                record.current_phase, record.start_time, record.end_time, record.line_count,
                record.session_id, record.file_format, record.processing_server_id,
                record.server_claim_time, record.retry_count, record.retry_warning_logs,
                record.processing_status, record.details, record.bucket_name,
                record.bucket_key, record.file_data_sample, record.identified_file_type,
                record.bucket_directory
              ]);
              
              migratedCount++;
              console.log(`✅ Migrated: ${record.original_filename} (${record.current_phase})`);
            }
          } else {
            console.log(`⏩ Skipped: ${upload.original_filename} (already exists in dev table)`);
          }
        } catch (migrateError) {
          console.log(`❌ Failed to migrate ${upload.original_filename}: ${migrateError.message}`);
        }
      }
      
      console.log(`\n🎉 MIGRATION COMPLETE: ${migratedCount} uploads migrated to development table`);
      console.log('📈 The processing system should now be able to find and complete these uploads');
      
    } else if (developmentUploads.length > 0 && productionUploads.length === 0) {
      console.log('✅ Uploads are correctly in development table where system expects them');
      console.log('🔍 Issue may be elsewhere - check processing pipeline status');
      
    } else if (productionUploads.length > 0 && developmentUploads.length > 0) {
      console.log('⚠️  Uploads found in BOTH tables - potential duplication issue');
      console.log('🔧 Manual review recommended to prevent conflicts');
      
    } else {
      console.log('✅ No stuck uploads found in either table');
      console.log('🔍 Upload completion issue may be resolved or elsewhere in pipeline');
    }
    
    console.log('\n✨ DATABASE FIX COMPLETE');
    console.log('🔄 Restart your application to ensure changes take effect');
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR during fix:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);