import type { Express } from "express";
import { db, pool } from "../db";
import { count, desc, eq, sql, and, isNull, isNotNull } from "drizzle-orm";
import { getTableName } from "../table-config";
import { logger } from "../../shared/logger";
import { ReplitStorageService } from "../replit-storage-service";
import { extractBusinessDayFromFilename } from "../filename-parser";

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
      logger.info('[STORAGE-MGMT] Getting storage statistics from uploader_uploads');

      // Get uploader_uploads statistics (the actual files table)
      // Note: Column is 'filename' not 'original_filename', 'status' indicates deleted/active
      const uploadStatsQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_objects,
          COUNT(CASE WHEN storage_path IS NOT NULL THEN 1 END) as linked_to_storage,
          COALESCE(SUM(file_size) / 1024.0 / 1024.0, 0) as total_storage_mb,
          COALESCE(SUM(line_count), 0) as total_lines,
          COUNT(CASE WHEN status = 'deleted' THEN 1 END) as orphaned_objects,
          COUNT(CASE WHEN is_archived = true THEN 1 END) as archived_count,
          COUNT(CASE WHEN current_phase IN ('complete', 'step-6-complete') OR (is_archived = false AND current_phase NOT IN ('uploading', 'uploaded', 'identified', 'validating', 'encoding', 'processing', 'failed')) THEN 1 END) as processing_complete,
          COUNT(CASE WHEN current_phase = 'failed' OR failed_at IS NOT NULL THEN 1 END) as failed_count
        FROM ${sql.raw(uploadsTable)}
      `);

      const uploadStats = (uploadStatsQuery.rows[0] as any) || {};

      // Get archive queue statistics (files marked for archival or in archived state)
      const archiveQueueQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_queued,
          COALESCE(SUM(file_size) / 1024.0 / 1024.0, 0) as total_size_mb,
          MIN(start_time) as oldest_entry,
          MAX(start_time) as newest_entry,
          COALESCE(AVG(file_size) / 1024.0 / 1024.0, 0) as avg_size_mb
        FROM ${sql.raw(uploadsTable)}
        WHERE current_phase = 'archived'
      `);

      const archiveQueue = (archiveQueueQuery.rows[0] as any) || {};

      // Get archive statistics from uploader_uploads with is_archived = true (same as API Data page)
      const archiveStatsQuery = await db.execute(sql`
        SELECT 
          COUNT(*) as total_archived,
          COALESCE(SUM(file_size) / 1024.0 / 1024.0, 0) as total_size_mb,
          COALESCE(AVG(file_size) / 1024.0 / 1024.0, 0) as avg_size_mb
        FROM ${sql.raw(uploadsTable)}
        WHERE is_archived = true
      `);
      const archiveStats = (archiveStatsQuery.rows[0] as any) || {};

      // Get recent activity (last 10 file operations)
      const recentActivityQuery = await db.execute(sql`
        SELECT 
          CASE 
            WHEN current_phase = 'complete' OR current_phase = 'step-6-complete' THEN 'Completed Processing'
            WHEN current_phase = 'archived' THEN 'Archived'
            WHEN current_phase = 'uploaded' THEN 'Uploaded'
            WHEN current_phase = 'identified' THEN 'Identified'
            WHEN current_phase = 'encoded' THEN 'Encoded'
            WHEN current_phase LIKE 'processing%' THEN 'Processing'
            WHEN status = 'deleted' THEN 'Deleted'
            ELSE 'Created'
          END as action,
          filename as object_key,
          COALESCE(last_updated, start_time) as timestamp
        FROM ${sql.raw(uploadsTable)}
        ORDER BY COALESCE(last_updated, start_time) DESC
        LIMIT 10
      `);

      const stats = {
        masterKeys: {
          totalObjects: parseInt(uploadStats.total_objects || '0'),
          linkedToUploads: parseInt(uploadStats.linked_to_storage || '0'),
          totalStorageMB: parseFloat(uploadStats.total_storage_mb || '0'),
          totalLines: parseInt(uploadStats.total_lines || '0'),
          orphanedObjects: parseInt(uploadStats.orphaned_objects || '0'),
          markedForPurge: parseInt(uploadStats.archived_count || '0'),
          processingComplete: parseInt(uploadStats.processing_complete || '0'),
          failedCount: parseInt(uploadStats.failed_count || '0')
        },
        purgeQueue: {
          totalQueued: parseInt(archiveQueue.total_queued || '0'),
          totalSizeMB: parseFloat(archiveQueue.total_size_mb || '0'),
          oldestEntry: archiveQueue.oldest_entry || null,
          newestEntry: archiveQueue.newest_entry || null,
          avgSizeMB: parseFloat(archiveQueue.avg_size_mb || '0')
        },
        archiveStats: {
          totalArchived: parseInt(archiveStats.total_archived || '0'),
          totalSizeMB: parseFloat(archiveStats.total_size_mb || '0'),
          avgSizeMB: parseFloat(archiveStats.avg_size_mb || '0')
        },
        recentActivity: recentActivityQuery.rows
      };

      logger.info('[STORAGE-MGMT] Stats retrieved successfully from uploader_uploads');
      res.json(stats);
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to get stats:', error);
      res.status(500).json({ error: 'Failed to retrieve storage statistics' });
    }
  });

  // ===== BUSINESS DAYS ENDPOINT =====
  // Get unique business days from filenames for filter dropdown with counts
  app.get('/api/storage/master-keys/business-days', isAuthenticated, async (req, res) => {
    try {
      logger.info('[STORAGE-MGMT] Getting available business days with counts');
      
      // Get all filenames and extract business days
      const filesQuery = await pool.query(`
        SELECT filename
        FROM ${uploadsTable}
        WHERE status != 'deleted'
      `);
      
      // Count files per business day
      const businessDayCounts = new Map<string, number>();
      filesQuery.rows.forEach((row: any) => {
        const parsed = extractBusinessDayFromFilename(row.filename || '');
        if (parsed.business_day) {
          const dayStr = parsed.business_day.toISOString().split('T')[0];
          businessDayCounts.set(dayStr, (businessDayCounts.get(dayStr) || 0) + 1);
        }
      });
      
      // Sort in descending order (most recent first) and include counts
      const businessDays = Array.from(businessDayCounts.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, count]) => ({ date, count }));
      
      res.json({ businessDays });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to get business days:', error);
      res.status(500).json({ error: 'Failed to retrieve business days' });
    }
  });

  // ===== BUSINESS DAY HEATMAP ENDPOINT =====
  // Get file counts aggregated by business day for heatmap visualization
  app.get('/api/storage/master-keys/business-day-heatmap', isAuthenticated, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const months = req.query.months ? parseInt(req.query.months as string) : undefined;
      
      logger.info('[STORAGE-MGMT] Getting business day heatmap data', { year, months });
      
      // Get all filenames and extract business days
      const filesQuery = await pool.query(`
        SELECT filename
        FROM ${uploadsTable}
        WHERE status != 'deleted'
      `);
      
      // Count files per business day
      const businessDayCounts = new Map<string, number>();
      filesQuery.rows.forEach((row: any) => {
        const parsed = extractBusinessDayFromFilename(row.filename || '');
        if (parsed.business_day) {
          const dayStr = parsed.business_day.toISOString().split('T')[0];
          businessDayCounts.set(dayStr, (businessDayCounts.get(dayStr) || 0) + 1);
        }
      });
      
      // Filter by year or rolling months window
      const now = new Date();
      let filteredData: { date: string; count: number }[] = [];
      
      if (year) {
        // Filter for specific year
        filteredData = Array.from(businessDayCounts.entries())
          .filter(([date]) => date.startsWith(year.toString()))
          .map(([date, count]) => ({ date, count }));
      } else if (months) {
        // Rolling window of last N months
        const cutoffDate = new Date(now);
        cutoffDate.setMonth(cutoffDate.getMonth() - months);
        
        filteredData = Array.from(businessDayCounts.entries())
          .filter(([date]) => new Date(date) >= cutoffDate && new Date(date) <= now)
          .map(([date, count]) => ({ date, count }));
      } else {
        // Default: all data
        filteredData = Array.from(businessDayCounts.entries())
          .map(([date, count]) => ({ date, count }));
      }
      
      // Sort by date
      filteredData.sort((a, b) => a.date.localeCompare(b.date));
      
      res.json({ 
        data: filteredData,
        year: year || null,
        months: months || null
      });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to get business day heatmap:', error);
      res.status(500).json({ error: 'Failed to retrieve heatmap data' });
    }
  });

  // ===== LIST ENDPOINT =====
  app.get('/api/storage/master-keys/list', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string || 'all';
      const search = req.query.search as string || '';
      const businessDay = req.query.businessDay as string || '';

      logger.info('[STORAGE-MGMT] Listing files from uploader_uploads', { limit, offset, status, search, businessDay });

      let whereClause = "WHERE status != 'deleted'";
      const params: any[] = [];

      // Map status filter to current_phase values
      if (status !== 'all') {
        if (status === 'complete') {
          whereClause += ` AND (current_phase = 'complete' OR current_phase = 'step-6-complete')`;
        } else if (status === 'orphaned') {
          whereClause = "WHERE status = 'deleted'";
        } else if (status === 'processing') {
          whereClause += ` AND current_phase LIKE 'processing%'`;
        } else if (status === 'archived') {
          whereClause += ` AND current_phase = 'archived'`;
        } else if (status === 'failed') {
          whereClause += ` AND (current_phase = 'failed' OR current_phase LIKE 'error%' OR failed_at IS NOT NULL)`;
        } else {
          whereClause += ` AND current_phase = $${params.length + 1}`;
          params.push(status);
        }
      }

      if (search) {
        whereClause += ` AND filename ILIKE $${params.length + 1}`;
        params.push(`%${search}%`);
      }

      // Get total count
      const countQuery = await pool.query(`
        SELECT COUNT(*) as total
        FROM ${uploadsTable}
        ${whereClause}
      `, params);

      const total = parseInt((countQuery.rows[0] as any).total || '0');

      // Get objects (note: using 'filename' column, not 'original_filename')
      params.push(limit, offset);
      const objectsQuery = await pool.query(`
        SELECT 
          id,
          filename,
          storage_path,
          ROUND(COALESCE(file_size, 0) / 1024.0 / 1024.0, 2) as file_size_mb,
          line_count,
          start_time as created_at,
          current_phase as status,
          id as upload_id,
          current_phase,
          file_type,
          detected_file_type
        FROM ${uploadsTable}
        ${whereClause}
        ORDER BY start_time DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);

      let objects = objectsQuery.rows.map((row: any) => {
        // Parse business day from filename
        const parsedDate = extractBusinessDayFromFilename(row.filename || '');
        return {
          id: row.id,
          objectKey: row.storage_path || row.filename,
          filename: row.filename,
          fileSizeMB: `${row.file_size_mb || 0} MB`,
          lineCount: row.line_count || 0,
          createdAt: row.created_at,
          status: row.status,
          uploadId: row.upload_id,
          currentPhase: row.current_phase,
          fileType: row.file_type || row.detected_file_type,
          businessDay: parsedDate.business_day?.toISOString().split('T')[0] || null,
          fileSequence: parsedDate.file_sequence
        };
      });

      // Apply business day filter if specified (filters parsed dates)
      let filteredTotal = total;
      if (businessDay) {
        objects = objects.filter(obj => obj.businessDay === businessDay);
        filteredTotal = objects.length;
      }

      res.json({
        objects,
        pagination: {
          total: businessDay ? filteredTotal : total,
          page: Math.floor(offset / limit),
          limit,
          totalPages: Math.ceil((businessDay ? filteredTotal : total) / limit)
        }
      });
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to list files:', error);
      res.status(500).json({ error: 'Failed to retrieve files list' });
    }
  });

  // ===== DUPLICATES ENDPOINT =====
  app.get('/api/storage/master-keys/duplicates', isAuthenticated, async (req, res) => {
    try {
      logger.info('[STORAGE-MGMT] Finding duplicate filenames in uploader_uploads');

      // Find duplicate filenames in uploader_uploads
      const duplicatesQuery = await db.execute(sql`
        WITH duplicate_files AS (
          SELECT 
            filename,
            COUNT(*) as occurrence_count,
            SUM(COALESCE(file_size, 0)) - MAX(COALESCE(file_size, 0)) as potential_savings_bytes
          FROM ${sql.raw(uploadsTable)}
          WHERE status != 'deleted'
          GROUP BY filename
          HAVING COUNT(*) > 1
        ),
        ranked_files AS (
          SELECT 
            filename,
            id,
            start_time,
            current_phase,
            ROW_NUMBER() OVER (
              PARTITION BY filename 
              ORDER BY 
                CASE 
                  WHEN current_phase IN ('complete', 'step-6-complete', 'archived') THEN 0
                  ELSE 1
                END,
                start_time DESC
            ) as rank
          FROM ${sql.raw(uploadsTable)}
          WHERE filename IN (SELECT filename FROM duplicate_files)
            AND status != 'deleted'
        ),
        newest_per_file AS (
          SELECT 
            filename,
            id as best_id,
            start_time as max_created_at
          FROM ranked_files
          WHERE rank = 1
        )
        SELECT 
          df.filename,
          df.occurrence_count,
          df.potential_savings_bytes,
          ROUND(df.potential_savings_bytes / 1024.0 / 1024.0, 2) || ' MB' as potential_savings_mb,
          json_agg(
            json_build_object(
              'id', u.id,
              'objectKey', COALESCE(u.storage_path, u.filename),
              'filename', u.filename,
              'fileSizeMB', ROUND(COALESCE(u.file_size, 0) / 1024.0 / 1024.0, 2) || ' MB',
              'lineCount', u.line_count,
              'createdAt', u.start_time,
              'uploadId', u.id,
              'currentPhase', u.current_phase,
              'isNewest', u.id::text = npf.best_id::text
            )
            ORDER BY u.start_time DESC
          ) as objects
        FROM duplicate_files df
        INNER JOIN ${sql.raw(uploadsTable)} u ON u.filename = df.filename AND u.status != 'deleted'
        LEFT JOIN newest_per_file npf ON npf.filename = df.filename
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

      // Step 1: Mark objects as orphaned if their upload_id doesn't exist or upload is deleted
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
      logger.info(`[STORAGE-MGMT] DB scan complete: ${orphanedCount} orphaned objects marked`);

      // Step 2: Verify object existence in Replit Object Storage and clean up stale entries
      // Get all orphaned objects that are marked for purge
      const orphanedObjects = await db.execute(sql`
        SELECT id, object_key FROM ${sql.raw(tableName)}
        WHERE mark_for_purge = true AND status = 'orphaned'
      `);

      let staleRemoved = 0;
      let verified = 0;

      // Check each orphaned object exists in storage
      for (const obj of orphanedObjects.rows as { id: number; object_key: string }[]) {
        try {
          const exists = await ReplitStorageService.fileExists(obj.object_key);
          if (!exists) {
            // Object doesn't exist in storage - remove stale DB entry
            await db.execute(sql`
              DELETE FROM ${sql.raw(tableName)} WHERE id = ${obj.id}
            `);
            staleRemoved++;
            logger.info(`[STORAGE-MGMT] Removed stale entry: ${obj.object_key} (object not in storage)`);
          } else {
            verified++;
          }
        } catch (checkError) {
          // If we can't verify, assume it exists to be safe
          verified++;
          logger.warn(`[STORAGE-MGMT] Could not verify object existence: ${obj.object_key}`);
        }
      }

      logger.info(`[STORAGE-MGMT] Scan complete: ${orphanedCount} newly orphaned, ${staleRemoved} stale removed, ${verified} verified for purge`);

      res.json({ 
        success: true, 
        orphanedCount,
        staleRemoved,
        verified,
        message: `Scan complete: ${orphanedCount} newly orphaned, ${staleRemoved} stale entries removed, ${verified} ready for purge`
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

      logger.info('[STORAGE-MGMT] Deleting objects from uploader_uploads', { count: objectIds.length });

      // Delete from uploader_uploads table (text IDs like "uploader_1769435093568_f3dbasir1")
      const placeholders = objectIds.map((_, i) => `$${i + 1}`).join(', ');
      const deleteResult = await pool.query(`
        DELETE FROM ${uploadsTable}
        WHERE id IN (${placeholders})
        RETURNING id
      `, objectIds);

      const deletedCount = deleteResult.rows.length;
      logger.info(`[STORAGE-MGMT] Deleted ${deletedCount} objects from uploader_uploads`);

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

  // ===== REPLIT STORAGE INFO ENDPOINT =====
  app.get('/api/storage/replit-storage-info', isAuthenticated, async (req, res) => {
    try {
      logger.info('[STORAGE-MGMT] Getting Replit Storage info');

      // Get configuration status with error handling
      let configStatus;
      try {
        configStatus = ReplitStorageService.getConfigStatus();
      } catch (configError: any) {
        logger.error('[STORAGE-MGMT] Storage service configuration failed:', configError);
        return res.json({
          bucketName: 'N/A',
          environment: process.env.NODE_ENV || 'development',
          folderPrefix: 'N/A',
          available: false,
          totalObjects: 0,
          devUploaderObjects: 0,
          prodUploaderObjects: 0,
          databaseFiles: 0,
          syncStatus: 'unavailable',
          error: 'Storage service not configured'
        });
      }
      
      // Initialize response data
      let totalObjects = 0;
      let devUploaderObjects = 0;
      let prodUploaderObjects = 0;
      let storageError: string | null = null;
      
      // Try to list files if storage is configured
      if (configStatus.available) {
        try {
          // List files in both environments - use explicit prefixes
          // dev-uploader and prod-uploader are the actual folder structures used
          const devFiles = await ReplitStorageService.listFiles('dev-uploader/');
          devUploaderObjects = devFiles.length;
          
          const prodFiles = await ReplitStorageService.listFiles('prod-uploader/');
          prodUploaderObjects = prodFiles.length;
          
          totalObjects = devUploaderObjects + prodUploaderObjects;
          
          logger.info(`[STORAGE-MGMT] Object counts - Dev: ${devUploaderObjects}, Prod: ${prodUploaderObjects}, Total: ${totalObjects}`);
        } catch (listError: any) {
          logger.error('[STORAGE-MGMT] Failed to list storage files:', listError);
          storageError = listError.message || 'Failed to list storage objects';
        }
      }
      
      // Get database file counts - both total and per-environment
      const dbFilesQuery = await db.execute(sql`
        SELECT COUNT(*) as total_files
        FROM ${sql.raw(uploadsTable)}
      `);
      const dbFilesTotal = parseInt((dbFilesQuery.rows[0] as any)?.total_files || '0');
      
      // Get environment-specific database count
      // In the uploader_uploads table, files are stored with storage_path containing the environment prefix
      const currentEnv = configStatus.environment;
      const envPrefix = currentEnv === 'production' ? 'prod-uploader/' : 'dev-uploader/';
      
      const dbFilesEnvQuery = await db.execute(sql`
        SELECT COUNT(*) as env_files
        FROM ${sql.raw(uploadsTable)}
        WHERE storage_path LIKE ${envPrefix + '%'}
      `);
      const dbFilesEnv = parseInt((dbFilesEnvQuery.rows[0] as any)?.env_files || '0');
      
      // Calculate environment-specific sync status
      const envObjectCount = currentEnv === 'production' ? prodUploaderObjects : devUploaderObjects;
      
      // Determine sync status based on availability and counts
      let syncStatus: string;
      if (!configStatus.available || storageError) {
        syncStatus = 'unavailable';
      } else if (envObjectCount === dbFilesEnv) {
        syncStatus = 'synced';
      } else {
        syncStatus = 'out-of-sync';
      }
      
      logger.info(`[STORAGE-MGMT] Sync check - Env: ${currentEnv}, Storage: ${envObjectCount}, DB: ${dbFilesEnv}, Status: ${syncStatus}`);
      
      const storageInfo = {
        bucketName: configStatus.bucket,
        environment: configStatus.environment,
        folderPrefix: configStatus.folderPrefix,
        available: configStatus.available && !storageError,
        totalObjects,
        devUploaderObjects,
        prodUploaderObjects,
        databaseFiles: dbFilesEnv, // Use environment-specific count for display
        syncStatus,
        error: storageError
      };

      logger.info('[STORAGE-MGMT] Replit Storage info retrieved:', storageInfo);
      res.json(storageInfo);
    } catch (error: any) {
      logger.error('[STORAGE-MGMT] Failed to get Replit Storage info:', error);
      // Return graceful degradation instead of 500 error
      res.json({
        bucketName: 'N/A',
        environment: process.env.NODE_ENV || 'development',
        folderPrefix: 'N/A',
        available: false,
        totalObjects: 0,
        devUploaderObjects: 0,
        prodUploaderObjects: 0,
        databaseFiles: 0,
        syncStatus: 'error',
        error: error.message || 'Unknown error occurred'
      });
    }
  });

  logger.info('[STORAGE-MGMT] Storage management routes registered');
}
