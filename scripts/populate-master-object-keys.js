#!/usr/bin/env node

/**
 * Populate Master Object Keys Database
 * Migrates existing uploader data to master object keys system and cleans up orphaned storage
 */

import { Pool } from 'pg';
import { Client } from '@replit/object-storage';
import crypto from 'crypto';

async function populateMasterObjectKeys() {
  console.log('🔄 Starting master object keys population...');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const storageClient = new Client();
  
  try {
    // Step 1: Get all files from uploader_uploads
    console.log('📋 Fetching existing upload records...');
    const uploadsResult = await pool.query(`
      SELECT id, filename, final_file_type, file_size, line_count, 
             current_phase, created_at, storage_key
      FROM dev_uploader_uploads 
      WHERE final_file_type = 'tddf'
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${uploadsResult.rows.length} upload records`);
    
    // Step 2: Get all objects from storage
    console.log('🗂️ Listing objects in storage...');
    const storageObjects = await storageClient.list({ prefix: 'dev-uploader/' });
    console.log(`Found ${storageObjects.length} objects in storage`);
    
    // Create maps for efficient lookup
    const objectsByKey = new Map();
    storageObjects.forEach(obj => {
      objectsByKey.set(obj.key, obj);
    });
    
    // Step 3: Process each upload record
    let populatedCount = 0;
    let orphanedCount = 0;
    const orphanedObjects = [];
    
    for (const upload of uploadsResult.rows) {
      // Try to find matching storage object
      let storageKey = upload.storage_key;
      let storageObject = null;
      
      // If no storage key, try to find by filename pattern
      if (!storageKey) {
        const possibleKeys = [
          `dev-uploader/${upload.id}/${upload.filename}`,
          `dev-uploader/upload_${upload.id}_${upload.filename}`,
          `uploads/${upload.id}/${upload.filename}`
        ];
        
        for (const key of possibleKeys) {
          if (objectsByKey.has(key)) {
            storageKey = key;
            storageObject = objectsByKey.get(key);
            break;
          }
        }
      } else {
        storageObject = objectsByKey.get(storageKey);
      }
      
      if (storageKey && storageObject) {
        // Create content hash (simplified for now)
        const contentHash = crypto.createHash('sha256')
          .update(`${upload.filename}_${upload.file_size}_${upload.line_count}`)
          .digest('hex');
        
        // Insert into master object keys
        try {
          await pool.query(`
            INSERT INTO dev_master_object_keys (
              object_key, original_filename, file_type, file_size, line_count,
              upload_id, current_phase, processing_status, content_hash,
              created_at, last_accessed_at, last_modified_at,
              processing_history, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (object_key) DO UPDATE SET
              upload_id = EXCLUDED.upload_id,
              last_modified_at = NOW()
          `, [
            storageKey,
            upload.filename,
            upload.final_file_type,
            upload.file_size || 0,
            upload.line_count || 0,
            upload.id,
            upload.current_phase || 'encoded',
            upload.current_phase === 'encoded' ? 'complete' : 'processing',
            contentHash,
            upload.created_at,
            new Date(), // last_accessed_at
            new Date(), // last_modified_at
            JSON.stringify([
              {
                phase: upload.current_phase,
                status: 'completed',
                timestamp: upload.created_at,
                processor: 'migration_script'
              }
            ]),
            JSON.stringify({
              source: 'uploader_migration',
              original_upload_id: upload.id,
              migration_date: new Date().toISOString()
            })
          ]);
          
          populatedCount++;
          
          // Remove from available objects to track orphans
          objectsByKey.delete(storageKey);
          
        } catch (error) {
          console.error(`❌ Failed to insert ${storageKey}:`, error.message);
        }
      } else {
        console.log(`⚠️ No storage object found for upload ${upload.id}: ${upload.filename}`);
      }
    }
    
    // Step 4: Identify orphaned objects (objects in storage but not in database)
    console.log(`\n🔍 Identifying orphaned objects...`);
    for (const [key, obj] of objectsByKey.entries()) {
      orphanedObjects.push(obj);
      orphanedCount++;
    }
    
    console.log(`\n📊 Population Summary:`);
    console.log(`✅ Populated: ${populatedCount} objects with database links`);
    console.log(`🗑️ Orphaned: ${orphanedCount} objects without database links`);
    
    // Step 5: Mark orphaned objects for purge
    if (orphanedObjects.length > 0) {
      console.log(`\n🗑️ Marking ${orphanedObjects.length} orphaned objects for purge...`);
      
      for (const obj of orphanedObjects) {
        // Insert orphaned object into master keys for tracking
        const contentHash = crypto.createHash('sha256')
          .update(`orphaned_${obj.key}_${obj.size || 0}`)
          .digest('hex');
        
        try {
          await pool.query(`
            INSERT INTO dev_master_object_keys (
              object_key, original_filename, file_type, file_size, line_count,
              current_phase, processing_status, content_hash,
              marked_for_purge, purge_after_date, purge_reason,
              processing_history, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (object_key) DO UPDATE SET
              marked_for_purge = TRUE,
              purge_after_date = NOW() + INTERVAL '1 day',
              purge_reason = 'orphaned_object_cleanup'
          `, [
            obj.key,
            obj.key.split('/').pop() || 'unknown',
            'tddf',
            obj.size || 0,
            0, // unknown line count
            'orphaned',
            'orphaned',
            contentHash,
            true, // marked_for_purge
            new Date(Date.now() + 24 * 60 * 60 * 1000), // purge_after_date (1 day)
            'orphaned_object_cleanup',
            JSON.stringify([
              {
                phase: 'orphaned',
                status: 'identified',
                timestamp: new Date().toISOString(),
                processor: 'migration_script'
              }
            ]),
            JSON.stringify({
              source: 'orphaned_detection',
              size: obj.size,
              detected_date: new Date().toISOString()
            })
          ]);
          
          // Add to purge queue
          const masterKeyResult = await pool.query(
            'SELECT id FROM dev_master_object_keys WHERE object_key = $1',
            [obj.key]
          );
          
          if (masterKeyResult.rows.length > 0) {
            await pool.query(`
              INSERT INTO dev_object_purge_queue (
                object_key_id, purge_type, purge_reason, scheduled_purge_date, metadata
              ) VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT DO NOTHING
            `, [
              masterKeyResult.rows[0].id,
              'orphaned',
              'Object exists in storage but no corresponding database record found',
              new Date(Date.now() + 24 * 60 * 60 * 1000),
              JSON.stringify({ size: obj.size, detection_method: 'migration_cleanup' })
            ]);
          }
          
        } catch (error) {
          console.error(`❌ Failed to mark orphaned object ${obj.key}:`, error.message);
        }
      }
    }
    
    // Step 6: Create summary view
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_objects,
        COUNT(CASE WHEN marked_for_purge THEN 1 END) as marked_for_purge,
        COUNT(CASE WHEN processing_status = 'complete' THEN 1 END) as processing_complete,
        SUM(file_size) as total_storage_bytes,
        SUM(line_count) as total_lines
      FROM dev_master_object_keys
    `);
    
    const summary = summaryResult.rows[0];
    console.log(`\n📈 Master Object Keys Database Summary:`);
    console.log(`   Total Objects: ${summary.total_objects}`);
    console.log(`   Processing Complete: ${summary.processing_complete}`);
    console.log(`   Marked for Purge: ${summary.marked_for_purge}`);
    console.log(`   Total Storage: ${(summary.total_storage_bytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`   Total Lines: ${summary.total_lines?.toLocaleString() || 0}`);
    
    console.log(`\n✅ Master object keys population completed successfully!`);
    
  } catch (error) {
    console.error('❌ Population failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.argv[1] === __filename) {
  populateMasterObjectKeys();
}

export { populateMasterObjectKeys };