#!/usr/bin/env node

/**
 * FINAL UPLOAD COMPLETION FIX - Database Only Solution
 * 
 * ISSUE: Files get stuck in "processing" status after successful upload
 * SOLUTION: Reset stuck processing files to "uploaded" status so they can be processed normally
 * 
 * This script uses the development database connection pattern from the working application.
 */

// Import using the same patterns as the working application
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';

// Use development database connection
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DEV_DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ ERROR: No database URL found in environment');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

async function main() {
  try {
    console.log('🔧 FINAL UPLOAD COMPLETION FIX');
    console.log('===============================');
    console.log('🎯 Fixing stuck processing files to restore upload completion\n');
    
    // Step 1: Check current file status
    console.log('📊 CHECKING CURRENT FILE STATUS:\n');
    
    const currentFiles = await pool.query(`
      SELECT 
        id,
        COALESCE(original_filename, filename, 'unknown') as file_name,
        current_phase,
        upload_status,
        processing_server_id,
        server_claim_time,
        start_time,
        uploaded_at,
        processing_at,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(processing_at, server_claim_time, start_time))) as stuck_seconds
      FROM dev_uploader_uploads 
      WHERE current_phase IN ('started', 'processing', 'uploading')
        AND start_time > NOW() - INTERVAL '2 hours'
      ORDER BY start_time DESC
    `);
    
    if (currentFiles.rows.length > 0) {
      console.log(`🔍 Found ${currentFiles.rows.length} files needing attention:\n`);
      
      let fixedCount = 0;
      
      for (const file of currentFiles.rows) {
        console.log(`📁 ${file.file_name}:`);
        console.log(`   Phase: ${file.current_phase}`);
        console.log(`   Upload Status: ${file.upload_status || 'null'}`);
        console.log(`   Stuck for: ${Math.round(file.stuck_seconds || 0)} seconds`);
        
        // Fix logic: Files stuck in processing for more than 30 seconds should be reset
        if (file.current_phase === 'processing' && (file.stuck_seconds || 0) > 30) {
          console.log(`   🔧 FIXING: Resetting to 'uploaded' status`);
          
          await pool.query(`
            UPDATE dev_uploader_uploads 
            SET 
              current_phase = 'uploaded',
              upload_status = 'uploaded',
              processing_server_id = NULL,
              server_claim_time = NULL,
              last_updated = NOW()
            WHERE id = $1
          `, [file.id]);
          
          fixedCount++;
          console.log(`   ✅ Fixed: Now ready for normal processing`);
          
        } else if (file.current_phase === 'started' && (file.stuck_seconds || 0) > 60) {
          console.log(`   🔧 FIXING: Promoting stuck 'started' to 'uploaded' status`);
          
          await pool.query(`
            UPDATE dev_uploader_uploads 
            SET 
              current_phase = 'uploaded',
              upload_status = 'uploaded',
              uploaded_at = COALESCE(uploaded_at, NOW()),
              last_updated = NOW()
            WHERE id = $1
          `, [file.id]);
          
          fixedCount++;
          console.log(`   ✅ Fixed: Now ready for processing`);
          
        } else {
          console.log(`   ⏳ No action needed (recently created or normal state)`);
        }
        
        console.log('');
      }
      
      console.log(`🎉 COMPLETION: Fixed ${fixedCount} stuck upload files`);
      
    } else {
      console.log('✅ No stuck files found - system is healthy');
    }
    
    // Step 2: Verify final status
    console.log('\n📋 FINAL VERIFICATION:\n');
    
    const finalStatus = await pool.query(`
      SELECT 
        current_phase,
        COUNT(*) as count
      FROM dev_uploader_uploads 
      WHERE start_time > NOW() - INTERVAL '2 hours'
      GROUP BY current_phase
      ORDER BY current_phase
    `);
    
    if (finalStatus.rows.length > 0) {
      finalStatus.rows.forEach(status => {
        console.log(`   ${status.current_phase}: ${status.count} files`);
      });
    }
    
    console.log('\n✨ UPLOAD COMPLETION FIX COMPLETE!');
    console.log('🎯 Files should now progress normally: started → uploaded → identified → encoded');
    console.log('🔄 Try uploading a new file to test the fix');
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error.message);
    console.error('Details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);