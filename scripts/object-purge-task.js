#!/usr/bin/env node

/**
 * Object Purge Task
 * Handles scheduled purging of orphaned and expired objects from storage
 */

import { Pool } from 'pg';
import { Client } from '@replit/object-storage';

class ObjectPurgeTask {
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.storageClient = new Client();
    this.isRunning = false;
  }

  async executePurgeTask() {
    if (this.isRunning) {
      console.log('⏭️ Purge task already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('🗑️ Starting object purge task...');

    try {
      // Get objects scheduled for purging
      const purgeQueueResult = await this.pool.query(`
        SELECT 
          pq.id as queue_id,
          pq.object_key_id,
          pq.purge_type,
          pq.purge_reason,
          pq.scheduled_purge_date,
          mok.object_key,
          mok.original_filename,
          mok.file_size
        FROM dev_object_purge_queue pq
        JOIN dev_master_object_keys mok ON pq.object_key_id = mok.id
        WHERE pq.purge_status = 'scheduled' 
        AND pq.scheduled_purge_date <= NOW()
        ORDER BY pq.scheduled_purge_date ASC
        LIMIT 100
      `);

      const objectsToPurge = purgeQueueResult.rows;
      console.log(`Found ${objectsToPurge.length} objects scheduled for purging`);

      if (objectsToPurge.length === 0) {
        console.log('✅ No objects to purge at this time');
        return;
      }

      let successCount = 0;
      let failureCount = 0;

      // Process each object
      for (const obj of objectsToPurge) {
        console.log(`🗑️ Processing: ${obj.object_key} (${obj.purge_type})`);

        try {
          // Mark as in progress
          await this.pool.query(`
            UPDATE dev_object_purge_queue 
            SET purge_status = 'in_progress', purge_started_at = NOW()
            WHERE id = $1
          `, [obj.queue_id]);

          // Delete from storage
          await this.storageClient.delete(obj.object_key);
          console.log(`  ✅ Deleted from storage: ${obj.object_key}`);

          // Mark as completed
          await this.pool.query(`
            UPDATE dev_object_purge_queue 
            SET purge_status = 'completed', purge_completed_at = NOW()
            WHERE id = $1
          `, [obj.queue_id]);

          // Remove from master object keys
          await this.pool.query(`
            DELETE FROM dev_master_object_keys WHERE id = $1
          `, [obj.object_key_id]);

          successCount++;
          console.log(`  ✅ Completed purge: ${obj.original_filename}`);

        } catch (error) {
          console.error(`  ❌ Failed to purge ${obj.object_key}:`, error.message);

          // Mark as failed
          await this.pool.query(`
            UPDATE dev_object_purge_queue 
            SET purge_status = 'failed', 
                purge_error = $1,
                purge_completed_at = NOW()
            WHERE id = $2
          `, [error.message, obj.queue_id]);

          failureCount++;
        }

        // Small delay between deletions
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`\n📊 Purge Task Summary:`);
      console.log(`✅ Successfully purged: ${successCount} objects`);
      console.log(`❌ Failed to purge: ${failureCount} objects`);

      // Clean up completed purge queue entries older than 7 days
      const cleanupResult = await this.pool.query(`
        DELETE FROM dev_object_purge_queue 
        WHERE purge_status = 'completed' 
        AND purge_completed_at < NOW() - INTERVAL '7 days'
      `);

      if (cleanupResult.rowCount > 0) {
        console.log(`🧹 Cleaned up ${cleanupResult.rowCount} old purge queue entries`);
      }

    } catch (error) {
      console.error('❌ Purge task failed:', error);
    } finally {
      this.isRunning = false;
      console.log('🏁 Object purge task completed');
    }
  }

  async scheduleOrphanedObjectsForPurge() {
    console.log('🔍 Scanning for orphaned objects...');

    try {
      // Find objects in storage that don't have valid upload_id references
      const orphanedResult = await this.pool.query(`
        SELECT mok.id, mok.object_key, mok.original_filename, mok.file_size
        FROM dev_master_object_keys mok
        LEFT JOIN dev_uploader_uploads uu ON mok.upload_id = uu.id
        WHERE (uu.id IS NULL OR mok.upload_id IS NULL)
        AND mok.marked_for_purge = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM dev_object_purge_queue pq 
          WHERE pq.object_key_id = mok.id 
          AND pq.purge_status IN ('scheduled', 'in_progress')
        )
      `);

      const orphanedObjects = orphanedResult.rows;
      console.log(`Found ${orphanedObjects.length} orphaned objects`);

      if (orphanedObjects.length === 0) {
        console.log('✅ No new orphaned objects found');
        return;
      }

      // Schedule orphaned objects for purge
      for (const obj of orphanedObjects) {
        await this.pool.query(`
          INSERT INTO dev_object_purge_queue (
            object_key_id, purge_type, purge_reason, scheduled_purge_date, metadata
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          obj.id,
          'orphaned',
          'Object exists in storage but no valid upload reference found',
          new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
          JSON.stringify({ 
            detection_method: 'automated_scan',
            file_size: obj.file_size,
            filename: obj.original_filename 
          })
        ]);

        // Mark in master object keys
        await this.pool.query(`
          UPDATE dev_master_object_keys 
          SET marked_for_purge = TRUE, 
              purge_after_date = $1,
              purge_reason = 'orphaned_object_detected'
          WHERE id = $2
        `, [new Date(Date.now() + 24 * 60 * 60 * 1000), obj.id]);
      }

      console.log(`📋 Scheduled ${orphanedObjects.length} orphaned objects for purge`);

    } catch (error) {
      console.error('❌ Failed to schedule orphaned objects:', error);
    }
  }

  async getStatistics() {
    try {
      const statsResult = await this.pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE purge_status = 'scheduled') as scheduled,
          COUNT(*) FILTER (WHERE purge_status = 'in_progress') as in_progress,
          COUNT(*) FILTER (WHERE purge_status = 'completed') as completed,
          COUNT(*) FILTER (WHERE purge_status = 'failed') as failed,
          COUNT(*) as total
        FROM dev_object_purge_queue
      `);

      const objectStats = await this.pool.query(`
        SELECT 
          COUNT(*) as total_objects,
          COUNT(*) FILTER (WHERE marked_for_purge = TRUE) as marked_for_purge,
          SUM(file_size) FILTER (WHERE marked_for_purge = TRUE) as purge_size_bytes
        FROM dev_master_object_keys
      `);

      return {
        purgeQueue: statsResult.rows[0],
        objects: objectStats.rows[0]
      };
    } catch (error) {
      console.error('❌ Failed to get purge statistics:', error);
      return null;
    }
  }

  async close() {
    await this.pool.end();
  }
}

// CLI interface
async function main() {
  const purgeTask = new ObjectPurgeTask();
  const command = process.argv[2] || 'purge';

  try {
    switch (command) {
      case 'purge':
        await purgeTask.executePurgeTask();
        break;
      
      case 'scan':
        await purgeTask.scheduleOrphanedObjectsForPurge();
        break;
      
      case 'stats':
        const stats = await purgeTask.getStatistics();
        if (stats) {
          console.log('\n📊 Object Purge Statistics:');
          console.log(`Purge Queue: ${stats.purgeQueue.scheduled} scheduled, ${stats.purgeQueue.in_progress} in progress, ${stats.purgeQueue.completed} completed, ${stats.purgeQueue.failed} failed`);
          console.log(`Objects: ${stats.objects.total_objects} total, ${stats.objects.marked_for_purge} marked for purge`);
          if (stats.objects.purge_size_bytes > 0) {
            console.log(`Storage to purge: ${(stats.objects.purge_size_bytes / 1024 / 1024).toFixed(2)} MB`);
          }
        }
        break;
      
      case 'full':
        console.log('🔄 Running full purge cycle...');
        await purgeTask.scheduleOrphanedObjectsForPurge();
        await purgeTask.executePurgeTask();
        const finalStats = await purgeTask.getStatistics();
        if (finalStats) {
          console.log(`\n✅ Full cycle complete - ${finalStats.objects.marked_for_purge} objects remaining for purge`);
        }
        break;
      
      default:
        console.log('Usage: node object-purge-task.js [purge|scan|stats|full]');
        console.log('  purge - Execute scheduled purges');
        console.log('  scan  - Scan for orphaned objects and schedule for purge');
        console.log('  stats - Show purge statistics');
        console.log('  full  - Run scan and purge cycle');
    }
  } finally {
    await purgeTask.close();
  }
}

// Run if called directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { ObjectPurgeTask };