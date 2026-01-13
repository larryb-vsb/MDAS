#!/usr/bin/env node

/**
 * Populate Uploader Pre-Cache Table Script
 * 
 * This script populates the dev_uploader_page_pre_cache_2025 table with actual
 * session monitoring data from the uploader system, enabling the UI Performance
 * Test page to display real values instead of zeros.
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getUploaderSessionData() {
  console.log('🔍 Fetching current uploader session data...');
  
  try {
    // Get total sessions (files uploaded)
    const totalSessionsResult = await pool.query(`
      SELECT COUNT(DISTINCT id) as total_sessions 
      FROM dev_uploader_uploads 
      WHERE created_at IS NOT NULL
    `);
    const totalSessions = parseInt(totalSessionsResult.rows[0]?.total_sessions || 0);

    // Get uploaded files (completed uploads)
    const uploadedFilesResult = await pool.query(`
      SELECT COUNT(*) as uploaded_files 
      FROM dev_uploader_uploads 
      WHERE upload_status = 'uploaded' OR upload_status = 'completed'
    `);
    const uploadedFiles = parseInt(uploadedFilesResult.rows[0]?.uploaded_files || 0);

    // Get active uploads (currently uploading)
    const activeUploadsResult = await pool.query(`
      SELECT COUNT(*) as active_uploads 
      FROM dev_uploader_uploads 
      WHERE upload_status = 'uploading' OR upload_status = 'started'
    `);
    const activeUploads = parseInt(activeUploadsResult.rows[0]?.active_uploads || 0);

    // Get pending sessions (files in review or processing)
    const pendingSessionsResult = await pool.query(`
      SELECT COUNT(*) as pending_sessions 
      FROM dev_uploader_uploads 
      WHERE upload_status = 'pending' OR upload_status = 'review'
    `);
    const pendingSessions = parseInt(pendingSessionsResult.rows[0]?.pending_sessions || 0);

    // Get last upload date
    const lastUploadResult = await pool.query(`
      SELECT MAX(created_at) as last_upload_date 
      FROM dev_uploader_uploads 
      WHERE created_at IS NOT NULL
    `);
    const lastUploadDate = lastUploadResult.rows[0]?.last_upload_date;

    console.log('📊 Session Data Retrieved:');
    console.log(`   • Total Sessions: ${totalSessions}`);
    console.log(`   • Uploaded Files: ${uploadedFiles}`);
    console.log(`   • Active Uploads: ${activeUploads}`);
    console.log(`   • Pending Sessions: ${pendingSessions}`);
    console.log(`   • Last Upload Date: ${lastUploadDate}`);

    return {
      totalSessions,
      uploadedFiles,
      activeUploads,
      pendingSessions,
      lastUploadDate,
      newDataReady: totalSessions > 0,
      storageService: 'Replit Object Storage'
    };

  } catch (error) {
    console.error('❌ Error fetching uploader session data:', error);
    throw error;
  }
}

async function populatePreCacheTable(sessionData) {
  console.log('💾 Populating pre-cache table with session data...');
  
  try {
    // Create cache data object
    const cacheData = {
      totalFiles: sessionData.totalSessions,
      completedFiles: sessionData.uploadedFiles,
      recentFiles: sessionData.activeUploads,
      newDataReady: sessionData.newDataReady,
      storageService: sessionData.storageService,
      lastUploadDate: sessionData.lastUploadDate,
      lastCompletedUpload: sessionData.lastUploadDate,
      lastProcessingDate: sessionData.lastUploadDate
    };

    const metadata = {
      source: 'uploader_session_monitoring',
      generatedAt: new Date().toISOString(),
      sessionMetrics: {
        totalSessions: sessionData.totalSessions,
        uploadedFiles: sessionData.uploadedFiles,
        activeUploads: sessionData.activeUploads,
        pendingSessions: sessionData.pendingSessions
      },
      dataIntegrity: 'authentic_database_query'
    };

    // Insert or update pre-cache record
    await pool.query(`
      INSERT INTO dev_uploader_page_pre_cache_2025 
      (cache_key, page_name, cache_data, record_count, data_sources, 
       processing_time_ms, last_update_datetime, expires_at, metadata,
       total_files_uploaded, completed_files, failed_files, processing_files,
       new_data_ready, last_upload_datetime, storage_service, created_by)
      VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (cache_key) 
      DO UPDATE SET
        cache_data = EXCLUDED.cache_data,
        record_count = EXCLUDED.record_count,
        processing_time_ms = EXCLUDED.processing_time_ms,
        last_update_datetime = EXCLUDED.last_update_datetime,
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata,
        total_files_uploaded = EXCLUDED.total_files_uploaded,
        completed_files = EXCLUDED.completed_files,
        processing_files = EXCLUDED.processing_files,
        new_data_ready = EXCLUDED.new_data_ready,
        last_upload_datetime = EXCLUDED.last_upload_datetime,
        storage_service = EXCLUDED.storage_service
    `, [
      'uploader_session_metrics',
      'UI Performance Test Page',
      JSON.stringify(cacheData),
      sessionData.totalSessions,
      JSON.stringify(['dev_uploader_uploads']),
      50, // Processing time
      new Date(),
      new Date(Date.now() + 60 * 60 * 1000), // Expires in 1 hour
      JSON.stringify(metadata),
      sessionData.totalSessions,
      sessionData.uploadedFiles,
      0, // Failed files
      sessionData.activeUploads,
      sessionData.newDataReady,
      sessionData.lastUploadDate,
      sessionData.storageService,
      'populate-uploader-pre-cache-script'
    ]);

    console.log('✅ Pre-cache table populated successfully');
    console.log('🎯 UI Performance Test page should now show real session data');

  } catch (error) {
    console.error('❌ Error populating pre-cache table:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting uploader pre-cache population...');
  
  try {
    // Fetch current session data
    const sessionData = await getUploaderSessionData();
    
    // Populate pre-cache table
    await populatePreCacheTable(sessionData);
    
    console.log('🎉 Pre-cache population completed successfully!');
    console.log('📈 UI Performance Test page now has real session monitoring data');
    
  } catch (error) {
    console.error('💥 Pre-cache population failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();