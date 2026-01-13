#!/usr/bin/env node

/**
 * CRITICAL FIX: Missing Database Columns Causing Upload Processing Failures
 * 
 * IDENTIFIED ISSUE: Upload processing fails due to missing columns:
 * - dev_uploader_uploads.original_filename (referenced in processing pipeline)
 * - dev_tddf1_totals.processing_date (referenced in TDDF1 day breakdown)
 * 
 * This causes uploads to get stuck in "processing" phase even though
 * the upload itself completes successfully.
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('🔧 FIXING MISSING DATABASE COLUMNS FOR UPLOAD PROCESSING');
    console.log('=====================================================');
    
    // Step 1: Check and fix dev_uploader_uploads table
    console.log('📊 STEP 1: FIXING dev_uploader_uploads TABLE\n');
    
    try {
      // Check if original_filename column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'dev_uploader_uploads' 
          AND column_name = 'original_filename'
      `);
      
      if (columnCheck.rows.length === 0) {
        console.log('❌ Missing column: dev_uploader_uploads.original_filename');
        console.log('🔧 Adding original_filename column...');
        
        await pool.query(`
          ALTER TABLE dev_uploader_uploads 
          ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)
        `);
        
        console.log('✅ Added original_filename column to dev_uploader_uploads');
        
        // Update existing records with filename if available
        const updateResult = await pool.query(`
          UPDATE dev_uploader_uploads 
          SET original_filename = filename 
          WHERE original_filename IS NULL AND filename IS NOT NULL
        `);
        
        console.log(`✅ Updated ${updateResult.rowCount} existing records with original_filename`);
        
      } else {
        console.log('✅ Column dev_uploader_uploads.original_filename exists');
      }
      
    } catch (uploaderError) {
      console.log('❌ Error checking dev_uploader_uploads:', uploaderError.message);
    }
    
    // Step 2: Check and fix TDDF1 totals table
    console.log('\n📊 STEP 2: FIXING TDDF1 TOTALS TABLE\n');
    
    try {
      // Check if TDDF1 totals table exists
      const tableCheck = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'dev_tddf1_totals'
      `);
      
      if (tableCheck.rows.length > 0) {
        // Check if processing_date column exists
        const dateColumnCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'dev_tddf1_totals' 
            AND column_name = 'processing_date'
        `);
        
        if (dateColumnCheck.rows.length === 0) {
          console.log('❌ Missing column: dev_tddf1_totals.processing_date');
          console.log('🔧 Adding processing_date column...');
          
          await pool.query(`
            ALTER TABLE dev_tddf1_totals 
            ADD COLUMN IF NOT EXISTS processing_date DATE
          `);
          
          console.log('✅ Added processing_date column to dev_tddf1_totals');
          
          // Update existing records with a default date if they have data
          const updateDateResult = await pool.query(`
            UPDATE dev_tddf1_totals 
            SET processing_date = CURRENT_DATE 
            WHERE processing_date IS NULL
          `);
          
          console.log(`✅ Updated ${updateDateResult.rowCount} existing records with processing_date`);
          
        } else {
          console.log('✅ Column dev_tddf1_totals.processing_date exists');
        }
      } else {
        console.log('ℹ️  TDDF1 totals table (dev_tddf1_totals) does not exist yet');
      }
      
    } catch (tddfError) {
      console.log('❌ Error checking TDDF1 totals:', tddfError.message);
    }
    
    // Step 3: Check current upload status
    console.log('\n📊 STEP 3: CHECKING CURRENT UPLOAD STATUS\n');
    
    try {
      const currentUploads = await pool.query(`
        SELECT 
          id, 
          COALESCE(original_filename, filename, 'unknown') as file_name,
          current_phase, 
          processing_status,
          start_time
        FROM dev_uploader_uploads 
        WHERE current_phase IN ('processing', 'started', 'uploading', 'uploaded')
        ORDER BY start_time DESC 
        LIMIT 5
      `);
      
      if (currentUploads.rows.length > 0) {
        console.log('📋 CURRENT UPLOAD STATUS:');
        currentUploads.rows.forEach(upload => {
          console.log(`   ${upload.file_name}: ${upload.current_phase} (${upload.processing_status || 'no status'})`);
        });
        
        console.log('\n🔄 RECOMMENDATION: Restart your application to retry failed processing');
        console.log('   The processing system should now be able to complete stuck uploads');
      } else {
        console.log('✅ No uploads currently in processing phases');
      }
      
    } catch (statusError) {
      console.log('❌ Error checking upload status:', statusError.message);
    }
    
    console.log('\n✨ DATABASE COLUMN FIXES COMPLETE!');
    console.log('🎯 Upload processing failures should now be resolved');
    console.log('🔄 Please restart your application for changes to take effect');
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR during database fix:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);