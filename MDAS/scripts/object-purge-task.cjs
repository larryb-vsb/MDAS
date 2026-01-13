#!/usr/bin/env node

/**
 * Object Purge Task
 * Handles scheduled purging of orphaned and expired objects from storage
 */

const { Pool } = require('pg');
const { Client } = require('@replit/object-storage');

class ObjectPurgeTask {
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.storageClient = new Client();
  }

  async getStats() {
    console.log('📊 Master Object Keys Database Statistics');
    console.log('==========================================');
    
    try {
      // Check if tables exist
      const tablesExist = await this.pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'dev_master_object_keys'
        ) as master_exists,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'dev_object_purge_queue'
        ) as queue_exists
      `);
      
      if (!tablesExist.rows[0].master_exists) {
        console.log('❌ Master object keys table does not exist');
        console.log('   Run the database migration first: psql $DATABASE_URL < add-master-object-key-database.sql');
        return;
      }
      
      // Get master object keys stats
      const masterStats = await this.pool.query(`
        SELECT 
          COUNT(*) as total_objects,
          COUNT(CASE WHEN marked_for_purge = true THEN 1 END) as marked_for_purge,
          COUNT(CASE WHEN processing_status = 'complete' THEN 1 END) as processing_complete,
          COUNT(CASE WHEN processing_status = 'orphaned' THEN 1 END) as orphaned_objects,
          SUM(COALESCE(file_size, 0)) as total_storage_bytes,
          SUM(COALESCE(line_count, 0)) as total_lines,
          COUNT(CASE WHEN upload_id IS NOT NULL THEN 1 END) as linked_to_uploads
        FROM dev_master_object_keys
      `);
      
      const stats = masterStats.rows[0];
      
      console.log(`📋 Master Object Keys:`);
      console.log(`   Total Objects: ${stats.total_objects}`);
      console.log(`   Linked to Uploads: ${stats.linked_to_uploads}`);
      console.log(`   Processing Complete: ${stats.processing_complete}`);
      console.log(`   Orphaned Objects: ${stats.orphaned_objects}`);
      console.log(`   Marked for Purge: ${stats.marked_for_purge}`);
      console.log(`   Total Storage: ${(stats.total_storage_bytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Total Lines: ${stats.total_lines?.toLocaleString() || 0}`);
      
      // Get purge queue stats if exists
      if (tablesExist.rows[0].queue_exists) {
        const queueStats = await this.pool.query(`
          SELECT 
            COUNT(*) as total_queued,
            COUNT(CASE WHEN purge_type = 'orphaned' THEN 1 END) as orphaned_queued,
            COUNT(CASE WHEN purge_type = 'expired' THEN 1 END) as expired_queued,
            COUNT(CASE WHEN scheduled_purge_date <= NOW() THEN 1 END) as ready_for_purge,
            COUNT(CASE WHEN purged_at IS NOT NULL THEN 1 END) as already_purged
          FROM dev_object_purge_queue
        `);
        
        const queue = queueStats.rows[0];
        console.log(`\n🗑️ Purge Queue:`);
        console.log(`   Total Queued: ${queue.total_queued}`);
        console.log(`   Orphaned: ${queue.orphaned_queued}`);
        console.log(`   Expired: ${queue.expired_queued}`);
        console.log(`   Ready for Purge: ${queue.ready_for_purge}`);
        console.log(`   Already Purged: ${queue.already_purged}`);
      }
      
      // Get recent activity
      const recentActivity = await this.pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as objects_created
        FROM dev_master_object_keys 
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 7
      `);
      
      if (recentActivity.rows.length > 0) {
        console.log(`\n📅 Recent Activity (Last 7 Days):`);
        recentActivity.rows.forEach(row => {
          console.log(`   ${row.date}: ${row.objects_created} objects created`);
        });
      }
      
      // Get storage connection status
      console.log(`\n🔗 Storage Connection:`);
      try {
        const storageObjects = await this.storageClient.list({ limit: 1 });
        console.log(`   ✅ Storage connection active`);
      } catch (error) {
        console.log(`   ❌ Storage connection failed: ${error.message}`);
      }
      
    } catch (error) {
      console.error('❌ Failed to get statistics:', error.message);
    }
  }

  async scanOrphanedObjects() {
    console.log('🔍 Scanning for orphaned objects in storage...');
    
    try {
      // Get all objects from storage
      const storageObjects = await this.storageClient.list({ prefix: 'dev-uploader/' });
      const objects = Array.isArray(storageObjects) ? storageObjects : [];
      
      console.log(`Found ${objects.length} objects in storage`);
      
      if (objects.length === 0) {
        console.log('✅ No objects found in storage - nothing to scan');
        return;
      }
      
      // Check which objects are not tracked in master keys
      let orphanedCount = 0;
      
      for (const obj of objects) {
        const existsResult = await this.pool.query(
          'SELECT id FROM dev_master_object_keys WHERE object_key = $1',
          [obj.key]
        );
        
        if (existsResult.rows.length === 0) {
          orphanedCount++;
          console.log(`🗑️ Orphaned: ${obj.key} (${obj.size || 0} bytes)`);
          
          // Add to master keys as orphaned
          const contentHash = require('crypto')
            .createHash('sha256')
            .update(`orphaned_${obj.key}_${obj.size || 0}`)
            .digest('hex');
          
          await this.pool.query(`
            INSERT INTO dev_master_object_keys (
              object_key, original_filename, file_type, file_size,
              current_phase, processing_status, content_hash,
              marked_for_purge, purge_after_date, purge_reason,
              processing_history, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (object_key) DO UPDATE SET
              marked_for_purge = TRUE,
              purge_after_date = NOW() + INTERVAL '1 day'
          `, [
            obj.key,
            obj.key.split('/').pop() || 'unknown',
            'tddf',
            obj.size || 0,
            'orphaned',
            'orphaned',
            contentHash,
            true,
            new Date(Date.now() + 24 * 60 * 60 * 1000),
            'orphaned_object_cleanup',
            JSON.stringify([{
              phase: 'orphaned',
              status: 'identified',
              timestamp: new Date().toISOString(),
              processor: 'purge_task_scanner'
            }]),
            JSON.stringify({
              source: 'orphaned_detection',
              size: obj.size,
              detected_date: new Date().toISOString()
            })
          ]);
        }
      }
      
      console.log(`\n📊 Scan Results:`);
      console.log(`   Total Objects Scanned: ${objects.length}`);
      console.log(`   Orphaned Objects Found: ${orphanedCount}`);
      console.log(`   Objects with Database Links: ${objects.length - orphanedCount}`);
      
    } catch (error) {
      console.error('❌ Orphaned object scan failed:', error.message);
    }
  }

  async executePurge(dryRun = true) {
    console.log(`🗑️ ${dryRun ? 'DRY RUN' : 'EXECUTING'} Purge Operation...`);
    
    try {
      // Get objects ready for purge
      const readyForPurge = await this.pool.query(`
        SELECT mok.id, mok.object_key, mok.file_size, mok.purge_reason
        FROM dev_master_object_keys mok
        WHERE mok.marked_for_purge = true 
          AND mok.purge_after_date <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM dev_object_purge_queue opq 
            WHERE opq.object_key_id = mok.id 
            AND opq.purged_at IS NOT NULL
          )
        ORDER BY mok.purge_after_date ASC
        LIMIT 50
      `);
      
      console.log(`Found ${readyForPurge.rows.length} objects ready for purge`);
      
      let purgeCount = 0;
      let totalSizeFreed = 0;
      
      for (const obj of readyForPurge.rows) {
        console.log(`${dryRun ? '🔍 WOULD PURGE' : '🗑️ PURGING'}: ${obj.object_key} (${obj.file_size || 0} bytes) - ${obj.purge_reason}`);
        
        if (!dryRun) {
          try {
            // Delete from storage
            await this.storageClient.delete(obj.object_key);
            
            // Mark as purged in queue
            await this.pool.query(`
              INSERT INTO dev_object_purge_queue (
                object_key_id, purge_type, purge_reason, 
                scheduled_purge_date, purged_at, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (object_key_id) DO UPDATE SET
                purged_at = NOW(),
                metadata = EXCLUDED.metadata
            `, [
              obj.id,
              'orphaned',
              obj.purge_reason,
              new Date(),
              new Date(),
              JSON.stringify({
                size_freed: obj.file_size || 0,
                purge_method: 'automated_task'
              })
            ]);
            
            // Update master object keys
            await this.pool.query(`
              UPDATE dev_master_object_keys 
              SET processing_status = 'purged', 
                  last_modified_at = NOW()
              WHERE id = $1
            `, [obj.id]);
            
            purgeCount++;
            totalSizeFreed += obj.file_size || 0;
            
          } catch (error) {
            console.error(`❌ Failed to purge ${obj.object_key}:`, error.message);
          }
        } else {
          purgeCount++;
          totalSizeFreed += obj.file_size || 0;
        }
      }
      
      console.log(`\n📊 Purge Summary:`);
      console.log(`   Objects ${dryRun ? 'Would Be' : ''} Purged: ${purgeCount}`);
      console.log(`   Storage ${dryRun ? 'Would Be' : ''} Freed: ${(totalSizeFreed / 1024 / 1024).toFixed(2)} MB`);
      
    } catch (error) {
      console.error('❌ Purge operation failed:', error.message);
    }
  }

  async close() {
    await this.pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'stats';
  
  const purgeTask = new ObjectPurgeTask();
  
  try {
    switch (command) {
      case 'stats':
        await purgeTask.getStats();
        break;
        
      case 'scan':
        await purgeTask.scanOrphanedObjects();
        break;
        
      case 'purge-dry':
        await purgeTask.executePurge(true);
        break;
        
      case 'purge':
        await purgeTask.executePurge(false);
        break;
        
      default:
        console.log('Usage: node object-purge-task.cjs [stats|scan|purge-dry|purge]');
        console.log('  stats     - Show database statistics');
        console.log('  scan      - Scan for orphaned objects');
        console.log('  purge-dry - Dry run purge operation');
        console.log('  purge     - Execute purge operation');
    }
  } finally {
    await purgeTask.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ObjectPurgeTask };