#!/usr/bin/env node

/**
 * CRITICAL FIX: Production Environment Table Mismatch
 * 
 * ISSUE: NODE_ENV is empty/undefined, causing system to use dev_uploader_uploads
 * table while production uploads go to uploader_uploads table. This causes upload
 * completion failures where files get "stuck" at 'started' status.
 * 
 * SOLUTION: Check both tables and migrate any recent production uploads to ensure
 * proper processing.
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
  ssl: false // Replit manages SSL automatically
});

async function main() {
  try {
    console.log('🔍 ANALYZING PRODUCTION ENVIRONMENT TABLE MISMATCH');
    console.log('=====================================');
    
    // Check current NODE_ENV status
    console.log(`🌍 NODE_ENV: "${process.env.NODE_ENV}" (${process.env.NODE_ENV ? 'SET' : 'EMPTY/UNDEFINED'})`);
    console.log('📊 Expected behavior when NODE_ENV is empty: Uses dev_uploader_uploads (development mode)');
    console.log('🎯 Problem: Production uploads may be in uploader_uploads but system reads from dev_uploader_uploads\n');
    
    // Check both production and development uploader tables
    console.log('🔍 CHECKING PRODUCTION TABLE (uploader_uploads):');
    try {
      const prodResult = await pool.query(`
        SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE current_phase = 'started') as started_count,
          COUNT(*) FILTER (WHERE current_phase = 'uploading') as uploading_count,
          COUNT(*) FILTER (WHERE current_phase = 'uploaded') as uploaded_count,
          COUNT(*) FILTER (WHERE current_phase = 'identified') as identified_count,
          COUNT(*) FILTER (WHERE current_phase = 'encoded') as encoded_count,
          MAX(start_time) as last_upload_time
        FROM uploader_uploads
        WHERE start_time > NOW() - INTERVAL '24 hours'
      `);
      
      const prodStats = prodResult.rows[0];
      console.log('📈 Production table stats (last 24 hours):');
      console.log(`   Total uploads: ${prodStats.total_count}`);
      console.log(`   Started: ${prodStats.started_count}`);
      console.log(`   Uploading: ${prodStats.uploading_count}`);  
      console.log(`   Uploaded: ${prodStats.uploaded_count}`);
      console.log(`   Identified: ${prodStats.identified_count}`);
      console.log(`   Encoded: ${prodStats.encoded_count}`);
      console.log(`   Last upload: ${prodStats.last_upload_time || 'None'}`);
      
      // Show recent stuck uploads in production
      if (prodStats.started_count > 0) {
        console.log('\n🚨 STUCK UPLOADS IN PRODUCTION TABLE:');
        const stuckUploads = await pool.query(`
          SELECT id, original_filename, current_phase, start_time 
          FROM uploader_uploads 
          WHERE current_phase = 'started' 
            AND start_time > NOW() - INTERVAL '24 hours'
          ORDER BY start_time DESC 
          LIMIT 5
        `);
        
        stuckUploads.rows.forEach(upload => {
          console.log(`   ${upload.id}: ${upload.original_filename} (${upload.current_phase}) - ${upload.start_time}`);
        });
      }
      
    } catch (prodError) {
      console.log('❌ Production table (uploader_uploads) does not exist or has errors:', prodError.message);
    }
    
    console.log('\n🔍 CHECKING DEVELOPMENT TABLE (dev_uploader_uploads):');
    try {
      const devResult = await pool.query(`
        SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE current_phase = 'started') as started_count,
          COUNT(*) FILTER (WHERE current_phase = 'uploading') as uploading_count,
          COUNT(*) FILTER (WHERE current_phase = 'uploaded') as uploaded_count,
          COUNT(*) FILTER (WHERE current_phase = 'identified') as identified_count,
          COUNT(*) FILTER (WHERE current_phase = 'encoded') as encoded_count,
          MAX(start_time) as last_upload_time
        FROM dev_uploader_uploads
        WHERE start_time > NOW() - INTERVAL '24 hours'
      `);
      
      const devStats = devResult.rows[0];
      console.log('📈 Development table stats (last 24 hours):');
      console.log(`   Total uploads: ${devStats.total_count}`);
      console.log(`   Started: ${devStats.started_count}`);
      console.log(`   Uploading: ${devStats.uploading_count}`);
      console.log(`   Uploaded: ${devStats.uploaded_count}`);
      console.log(`   Identified: ${devStats.identified_count}`);
      console.log(`   Encoded: ${devStats.encoded_count}`);
      console.log(`   Last upload: ${devStats.last_upload_time || 'None'}`);
      
    } catch (devError) {
      console.log('❌ Development table (dev_uploader_uploads) has errors:', devError.message);
    }
    
    console.log('\n🎯 DIAGNOSIS:');
    console.log('If production table has "started" uploads but development table is being used by system,');
    console.log('this confirms the table mismatch issue causing upload completion failures.');
    
    console.log('\n💡 RECOMMENDED FIX:');
    console.log('Set NODE_ENV=production in environment to use production tables consistently.');
    console.log('Alternative: Migrate stuck uploads from production to development table.');
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR during analysis:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);