import type { Express } from "express";
import { db, pool } from "../db";
import { count, desc, eq, sql, and, isNull, isNotNull } from "drizzle-orm";
import { getTableName } from "../table-config";
import { logger } from "../../shared/logger";

// Middleware for authentication check
function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function registerStorageManagementRoutes(app: Express) {
  const tableName = getTableName('master_object_keys');
  const uploadsTable = getTableName('uploader_uploads');

  // ===== STATS ENDPOINT =====
  app.get('/api/storage/master-keys/stats', isAuthenticated, async (req, res) => {
    try {
      logger.info('[STORAGE-MGMT] Getting storage statistics');

      // Get master keys statistics
      const masterKeysStatsQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_objects,
          COUNT(upload_id) as linked_to_uploads,
          COALESCE(SUM(file_size_bytes) / 1024.0 / 1024.0, 0) as total_storage_mb,
          COALESCE(SUM(line_count), 0) as total_lines,
          COUNT(CASE WHEN status = 'orphaned' THEN 1 END) as orphaned_objects,
          COUNT(CASE WHEN mark_for_purge = true THEN 1 END) as marked_for_purge,
          COUNT(CASE WHEN status = 'complete' THEN 1 END) as processing_complete
        FROM ${sql.raw(tableName)}
      `);

      const masterKeys = (masterKeysStatsQuery.rows[0] as any) || {};

      // Get purge queue statistics
      const purgeQueueQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_queued,
          COALESCE(SUM(file_size_bytes) / 1024.0 / 1024.0, 0) as total_size_mb,
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry,
          COALESCE(AVG(file_size_bytes) / 1024.0 / 1024.0, 0) as avg_size_mb
        FROM ${sql.raw(tableName)}
        WHERE mark_for_purge = true
      `);

      const purgeQueue = (purgeQueueQuery.rows[0] as any) || {};

      // Get recent activity (last 10 operations)
      const recentActivityQuery = await db.execute(sql`
        SELECT 
          CASE 
            WHEN status = 'complete' THEN 'Completed Processing'
            WHEN status = 'orphaned' THEN 'Marked Orphaned'
            WHEN mark_for_purge THEN 'Marked for Purge'
            ELSE 'Created'
          END as action,
          object_key,
          updated_at as timestamp
        FROM ${sql.raw(tableName)}
        ORDER BY updated_at DESC
        LIMIT 10
      `);

      const stats = {
        masterKeys: {
          totalObjects: parseInt(masterKeys.total_objects || '0'),
          linkedToUploads: parseInt(masterKeys.linked_to_uploads || '0'),
          totalStorageMB: parseFloat(masterKeys.total_storage_mb || '0'),
          totalLines: parseInt(masterKeys.total_lines || '0'),
          orphanedObjects: parseInt(masterKeys.orphaned_objects || '0'),
          markedForPurge: parseInt(masterKeys.marked_for_purge || '0'),
          processingComplete: parseInt(masterKeys.processing_complete || '0')
        },
        purgeQueue: {
          totalQueued: parseInt(purgeQueue.total_queued || '0'),
          totalSizeMB: parseFloat(purgeQueue.total_size_mb || '0'),
          oldestEntry: purgeQueue.oldest_entry || null,
          newestEntry: purgeQueue.newest_entry || null,
          avgSizeMB: parseFloat(purgeQueue.avg_size_mb || '0')
        },
        recentActivity: recentActivityQuery.rows
      };

      logger.info('[STORAGE-MGMT] Stats retrieved successfully');
      res.json(stats);
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to get stats:', error);
      res.status(500).json({ error: 'Failed to retrieve storage statistics' });
    }
  });

  // ===== LIST ENDPOINT =====
  app.get('/api/storage/master-keys/list', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string || 'all';
      const search = req.query.search as string || '';

      logger.info('[STORAGE-MGMT] Listing objects', { limit, offset, status, search });

      let whereClause = '';
      const params: any[] = [];

      if (status !== 'all') {
        whereClause = 'WHERE status = $1';
        params.push(status);
      }

      if (search) {
        whereClause = whereClause ? `${whereClause} AND object_key ILIKE $${params.length + 1}` : `WHERE object_key ILIKE $${params.length + 1}`;
        params.push(`%${search}%`);
      }

      // Get total count
      const countQuery = await pool.query(`
        SELECT COUNT(*) as total
        FROM ${tableName}
        ${whereClause}
      `, params);

      const total = parseInt((countQuery.rows[0] as any).total || '0');

      // Get objects
      params.push(limit, offset);
      const objectsQuery = await pool.query(`
        SELECT 
          id,
          object_key,
          ROUND(file_size_bytes / 1024.0 / 1024.0, 2) || ' MB' as file_size_mb,
          line_count,
          created_at,
          status,
          upload_id,
          COALESCE(
            (SELECT current_phase FROM ${uploadsTable} WHERE id = ${tableName}.upload_id LIMIT 1),
            'N/A'
          ) as current_phase
        FROM ${tableName}
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);

      const objects = objectsQuery.rows.map((row: any) => ({
        id: row.id,
        objectKey: row.object_key,
        fileSizeMB: row.file_size_mb,
        lineCount: row.line_count || 0,
        createdAt: row.created_at,
        status: row.status,
        uploadId: row.upload_id,
        currentPhase: row.current_phase
      }));

      res.json({
        objects,
        pagination: {
          total,
          page: Math.floor(offset / limit),
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to list objects:', error);
      res.status(500).json({ error: 'Failed to retrieve objects list' });
    }
  });

  // ===== DUPLICATES ENDPOINT =====
  app.get('/api/storage/master-keys/duplicates', isAuthenticated, async (req, res) => {
    try {
      logger.info('[STORAGE-MGMT] Finding duplicates');

      // Find duplicate filenames
      const duplicatesQuery = await db.execute(sql`
        WITH duplicate_files AS (
          SELECT 
            SUBSTRING(object_key FROM '[^/]+$') as filename,
            COUNT(*) as occurrence_count,
            SUM(file_size_bytes) - MAX(file_size_bytes) as potential_savings_bytes
          FROM ${sql.raw(tableName)}
          GROUP BY filename
          HAVING COUNT(*) > 1
        )
        SELECT 
          df.filename,
          df.occurrence_count,
          df.potential_savings_bytes,
          ROUND(df.potential_savings_bytes / 1024.0 / 1024.0, 2) || ' MB' as potential_savings_mb,
          json_agg(
            json_build_object(
              'id', mk.id,
              'objectKey', mk.object_key,
              'fileSizeMB', ROUND(mk.file_size_bytes / 1024.0 / 1024.0, 2) || ' MB',
              'lineCount', mk.line_count,
              'createdAt', mk.created_at,
              'uploadId', mk.upload_id,
              'currentPhase', COALESCE(
                (SELECT current_phase FROM ${sql.raw(uploadsTable)} WHERE id = mk.upload_id LIMIT 1),
                'N/A'
              ),
              'isNewest', mk.created_at = MAX(mk.created_at) OVER (PARTITION BY SUBSTRING(mk.object_key FROM '[^/]+$'))
            )
            ORDER BY mk.created_at DESC
          ) as objects
        FROM duplicate_files df
        INNER JOIN ${sql.raw(tableName)} mk ON SUBSTRING(mk.object_key FROM '[^/]+$') = df.filename
        GROUP BY df.filename, df.occurrence_count, df.potential_savings_bytes
        ORDER BY df.occurrence_count DESC, df.potential_savings_bytes DESC
      `);

      const duplicateGroups = duplicatesQuery.rows.map((row: any) => ({
        filename: row.filename,
        occurrenceCount: parseInt(row.occurrence_count),
        potentialSavingsMB: row.potential_savings_mb,
        objects: row.objects
      }));

      // Calculate summary
      const totalDuplicateObjects = duplicateGroups.reduce((sum, g) => sum + g.occurrenceCount, 0);
      const totalDuplicatesRemovable = duplicateGroups.reduce((sum, g) => sum + (g.occurrenceCount - 1), 0);
      const totalSavingsBytes = duplicateGroups.reduce((sum, g) => {
        const matches = g.potentialSavingsMB.match(/[\d.]+/);
        return sum + (matches ? parseFloat(matches[0]) * 1024 * 1024 : 0);
      }, 0);

      const summary = {
        totalDuplicateGroups: duplicateGroups.length,
        totalDuplicateObjects,
        totalDuplicatesRemovable,
        totalSavingsBytes,
        totalSavingsMB: (totalSavingsBytes / 1024 / 1024).toFixed(2),
        totalSavingsGB: (totalSavingsBytes / 1024 / 1024 / 1024).toFixed(2)
      };

      res.json({ duplicateGroups, summary });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to find duplicates:', error);
      res.status(500).json({ error: 'Failed to detect duplicates' });
    }
  });

  // ===== SCAN ORPHANED ENDPOINT =====
  app.post('/api/storage/master-keys/scan-orphaned', isAuthenticated, async (req, res) => {
    try {
      logger.info('[STORAGE-MGMT] Scanning for orphaned objects');

      // Mark objects as orphaned if their upload_id doesn't exist or upload is deleted
      const scanResult = await db.execute(sql`
        UPDATE ${sql.raw(tableName)}
        SET 
          status = 'orphaned',
          mark_for_purge = true,
          updated_at = NOW()
        WHERE upload_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${sql.raw(uploadsTable)} 
            WHERE id = ${sql.raw(tableName)}.upload_id 
            AND deleted_at IS NULL
          )
          AND status != 'orphaned'
        RETURNING id
      `);

      const orphanedCount = scanResult.rows.length;
      logger.info(`[STORAGE-MGMT] Scan complete: ${orphanedCount} orphaned objects found`);

      res.json({ 
        success: true, 
        orphanedCount,
        message: `Scan complete: Found ${orphanedCount} orphaned objects`
      });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Scan failed:', error);
      res.status(500).json({ error: 'Failed to scan for orphaned objects' });
    }
  });

  // ===== PURGE ENDPOINT =====
  app.post('/api/storage/master-keys/purge', isAuthenticated, async (req, res) => {
    try {
      const dryRun = req.body.dryRun === true;
      
      logger.info('[STORAGE-MGMT] Purge operation', { dryRun });

      if (dryRun) {
        // Just count what would be purged
        const countQuery = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM ${sql.raw(tableName)}
          WHERE mark_for_purge = true
        `);

        const count = parseInt((countQuery.rows[0] as any).count || '0');
        
        res.json({
          success: true,
          dryRun: true,
          message: `Dry run: Would purge ${count} objects`
        });
      } else {
        // Actually delete the objects
        const deleteResult = await db.execute(sql`
          DELETE FROM ${sql.raw(tableName)}
          WHERE mark_for_purge = true
          RETURNING id
        `);

        const deletedCount = deleteResult.rows.length;
        logger.info(`[STORAGE-MGMT] Purge complete: ${deletedCount} objects deleted`);

        res.json({
          success: true,
          dryRun: false,
          deletedCount,
          message: `Purge complete: ${deletedCount} objects deleted`
        });
      }
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Purge failed:', error);
      res.status(500).json({ error: 'Failed to execute purge operation' });
    }
  });

  // ===== DELETE OBJECTS ENDPOINT =====
  app.post('/api/storage/master-keys/delete-objects', isAuthenticated, async (req, res) => {
    try {
      const { objectIds } = req.body;

      if (!objectIds || !Array.isArray(objectIds) || objectIds.length === 0) {
        return res.status(400).json({ error: 'Invalid object IDs provided' });
      }

      logger.info('[STORAGE-MGMT] Deleting objects', { count: objectIds.length });

      const placeholders = objectIds.map((_, i) => `$${i + 1}`).join(', ');
      const deleteResult = await pool.query(`
        DELETE FROM ${tableName}
        WHERE id IN (${placeholders})
        RETURNING id
      `, objectIds);

      const deletedCount = deleteResult.rows.length;
      logger.info(`[STORAGE-MGMT] Deleted ${deletedCount} objects`);

      res.json({
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} objects`
      });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Delete failed:', error);
      res.status(500).json({ error: 'Failed to delete objects' });
    }
  });

  // ===== REMOVE DUPLICATES ENDPOINT =====
  app.post('/api/storage/master-keys/remove-duplicates', isAuthenticated, async (req, res) => {
    try {
      const { objectIds } = req.body;

      if (!objectIds || !Array.isArray(objectIds) || objectIds.length === 0) {
        return res.status(400).json({ error: 'Invalid object IDs provided' });
      }

      logger.info('[STORAGE-MGMT] Removing duplicates', { count: objectIds.length });

      // Get size info before deletion for reporting
      const placeholders = objectIds.map((_, i) => `$${i + 1}`).join(', ');
      const sizeQuery = await pool.query(`
        SELECT COALESCE(SUM(file_size_bytes), 0) as total_bytes
        FROM ${tableName}
        WHERE id IN (${placeholders})
      `, objectIds);

      const totalBytes = parseFloat((sizeQuery.rows[0] as any).total_bytes || '0');

      // Delete the duplicates
      const deleteResult = await pool.query(`
        DELETE FROM ${tableName}
        WHERE id IN (${placeholders})
        RETURNING id
      `, objectIds);

      const removedCount = deleteResult.rows.length;
      const spaceFreed = `${(totalBytes / 1024 / 1024).toFixed(2)} MB`;

      logger.info(`[STORAGE-MGMT] Removed ${removedCount} duplicates, freed ${spaceFreed}`);

      res.json({
        success: true,
        removedCount,
        spaceFreed,
        message: `Removed ${removedCount} duplicates`
      });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Remove duplicates failed:', error);
      res.status(500).json({ error: 'Failed to remove duplicates' });
    }
  });

  logger.info('[STORAGE-MGMT] Storage management routes registered');
}
