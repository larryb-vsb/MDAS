import { Express } from "express";
import { pool } from "../db";
import { isAuthenticated } from "./middleware";
import { getTableName } from "../table-config";

const STUCK_FILE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function registerAdminRoutes(app: Express) {
  
  // Reset stuck Step 6 files (supports multiple phases)
  app.post("/api/admin/reset-stuck-step6-files", isAuthenticated, async (req, res) => {
    try {
      const { fileIds, thresholdMinutes, phase } = req.body;
      const username = (req.user as any)?.username || 'system';
      const thresholdMs = thresholdMinutes ? thresholdMinutes * 60 * 1000 : STUCK_FILE_THRESHOLD_MS;
      
      // Default to 'processing' for backward compatibility
      const targetPhase = phase || 'processing';
      
      // Validate phase
      const validPhases = ['validating', 'identified', 'processing', 'error'];
      if (!validPhases.includes(targetPhase)) {
        return res.status(400).json({
          error: "Invalid phase",
          validPhases
        });
      }
      
      console.log(`[ADMIN-RESET] Starting stuck file reset - phase: ${targetPhase}, threshold: ${thresholdMs / 60000} minutes, requested by: ${username}`);
      
      let stuckFiles = [];
      
      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        // Reset specific files
        console.log(`[ADMIN-RESET] Resetting specific files: ${fileIds.join(', ')}`);
        const uploadTableName = getTableName('uploader_uploads');
        const result = await pool.query(`
          SELECT id, filename, current_phase, retry_count, start_time
          FROM ${uploadTableName}
          WHERE id = ANY($1::text[])
            AND current_phase = $2
        `, [fileIds, targetPhase]);
        stuckFiles = result.rows;
      } else {
        // Find all stuck files in the specified phase
        const cutoffTime = new Date(Date.now() - thresholdMs);
        const uploadTableName = getTableName('uploader_uploads');
        const result = await pool.query(`
          SELECT id, filename, current_phase, retry_count, start_time
          FROM ${uploadTableName}
          WHERE current_phase = $1
            AND start_time < $2
          ORDER BY start_time ASC
        `, [targetPhase, cutoffTime]);
        stuckFiles = result.rows;
        
        console.log(`[ADMIN-RESET] Found ${stuckFiles.length} stuck ${targetPhase} files older than ${thresholdMs / 60000} minutes`);
      }
      
      if (stuckFiles.length === 0) {
        return res.json({
          success: true,
          message: "No stuck files found",
          filesReset: 0,
          slotsCleared: 0
        });
      }
      
      // Determine reset target phase based on current stuck phase
      const phaseResetMap: Record<string, string> = {
        'validating': 'uploaded',
        'identified': 'uploaded',
        'processing': 'encoded',
        'error': 'encoded'
      };
      
      const resetToPhase = phaseResetMap[targetPhase];
      
      // Reset each stuck file
      const uploadTableName = getTableName('uploader_uploads');
      const resetResults = [];
      
      for (const file of stuckFiles) {
        const currentRetries = file.retry_count || 0;
        const stuckDuration = Date.now() - new Date(file.start_time).getTime();
        const stuckMinutes = Math.floor(stuckDuration / 60000);
        
        console.log(`[ADMIN-RESET] Resetting ${file.filename} (stuck for ${stuckMinutes} minutes, retry ${currentRetries}/3) from ${targetPhase} → ${resetToPhase}`);
        
        // Only increment warning_count for processing/error resets (actual failures)
        // validating/identified resets are normal flow retries, not warnings
        const isWarning = targetPhase === 'processing' || targetPhase === 'error';
        
        if (isWarning) {
          // Move back to appropriate phase for retry (with warning telemetry)
          await pool.query(`
            UPDATE ${uploadTableName}
            SET 
              current_phase = $1,
              processing_warnings = $2,
              last_warning_at = NOW(),
              warning_count = COALESCE(warning_count, 0) + 1,
              last_updated = NOW()
            WHERE id = $3
              AND current_phase = $4
          `, [
            resetToPhase,
            `Admin reset: File stuck in ${targetPhase} for ${stuckMinutes} minutes - moved back to ${resetToPhase} for retry (attempt ${currentRetries + 1}/3)`,
            file.id,
            targetPhase
          ]);
        } else {
          // Move back without incrementing warnings (normal retry for validating/identified)
          await pool.query(`
            UPDATE ${uploadTableName}
            SET 
              current_phase = $1,
              last_updated = NOW()
            WHERE id = $2
              AND current_phase = $3
          `, [
            resetToPhase,
            file.id,
            targetPhase
          ]);
        }
        
        resetResults.push({
          id: file.id,
          filename: file.filename,
          stuckMinutes,
          retryCount: currentRetries,
          fromPhase: targetPhase,
          toPhase: resetToPhase
        });
      }
      
      // Clear stuck files from active slots in MMSWatcher
      const uploadIds = stuckFiles.map((f: any) => f.id);
      const { getMmsWatcherInstance } = await import('../mms-watcher-instance') as any;
      const watcher = getMmsWatcherInstance();
      const slotResult = watcher ? watcher.clearStuckFilesFromSlots(uploadIds) : { cleared: 0 };
      
      console.log(`[ADMIN-RESET] ✅ Reset complete - ${resetResults.length} files moved to encoded, ${slotResult.cleared} slots cleared`);
      
      res.json({
        success: true,
        message: `Successfully reset ${resetResults.length} stuck file(s)`,
        filesReset: resetResults.length,
        slotsCleared: slotResult.cleared,
        remainingSlots: slotResult.remainingSlots,
        files: resetResults
      });
      
    } catch (error) {
      console.error('[ADMIN-RESET] Error resetting stuck files:', error);
      res.status(500).json({
        error: "Failed to reset stuck files",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get stuck file statistics (supports multiple phases)
  app.get("/api/admin/stuck-files-stats", isAuthenticated, async (req, res) => {
    try {
      const thresholdMinutes = parseInt(req.query.thresholdMinutes as string) || 10;
      const phase = req.query.phase as string || 'processing';
      const thresholdMs = thresholdMinutes * 60 * 1000;
      const cutoffTime = new Date(Date.now() - thresholdMs);
      
      // Validate phase
      const validPhases = ['validating', 'identified', 'processing', 'error'];
      if (!validPhases.includes(phase)) {
        return res.status(400).json({
          error: "Invalid phase",
          validPhases
        });
      }
      
      const uploadTableName = getTableName('uploader_uploads');
      const result = await pool.query(`
        SELECT 
          id,
          filename,
          current_phase,
          retry_count,
          start_time,
          EXTRACT(EPOCH FROM (NOW() - start_time)) / 60 as stuck_minutes
        FROM ${uploadTableName}
        WHERE current_phase = $1
          AND start_time < $2
        ORDER BY start_time ASC
      `, [phase, cutoffTime]);
      
      const stuckFiles = result.rows.map((row: any) => ({
        id: row.id,
        filename: row.filename,
        phase: row.current_phase,
        retryCount: row.retry_count || 0,
        stuckMinutes: Math.floor(row.stuck_minutes),
        startTime: row.start_time
      }));
      
      res.json({
        threshold: thresholdMinutes,
        stuckCount: stuckFiles.length,
        files: stuckFiles
      });
      
    } catch (error) {
      console.error('[ADMIN-RESET] Error getting stuck file stats:', error);
      res.status(500).json({
        error: "Failed to get stuck file statistics",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get Step 6 queue status
  app.get("/api/admin/step6-status", isAuthenticated, async (req, res) => {
    try {
      const mmsWatcher = (req.app.locals as any).mmsWatcher;
      
      if (!mmsWatcher) {
        return res.status(503).json({
          error: "MMS Watcher service not available"
        });
      }

      const status = mmsWatcher.getStep6Status();
      
      // Also fetch validating files from database (exclude deleted files)
      const uploadTableName = getTableName('uploader_uploads');
      const validatingResult = await pool.query(`
        SELECT id, filename, start_time
        FROM ${uploadTableName}
        WHERE current_phase = 'validating'
          AND deleted_at IS NULL
        ORDER BY start_time ASC
        LIMIT 50
      `);
      
      // Add validating files to the queue
      const validatingFiles = validatingResult.rows.map((row: any) => ({
        uploadId: row.id,
        filename: row.filename,
        queuedAt: new Date(row.start_time).getTime(),
        waitingMs: Date.now() - new Date(row.start_time).getTime(),
        status: 'validating'
      }));
      
      // Combine with existing queue files
      const combinedQueue = [...validatingFiles, ...status.queue.files];
      
      res.json({
        ...status,
        queue: {
          count: combinedQueue.length,
          files: combinedQueue
        }
      });
      
    } catch (error) {
      console.error('[ADMIN] Error getting Step 6 status:', error);
      res.status(500).json({
        error: "Failed to get Step 6 status",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clear Step 6 queue
  app.post("/api/admin/step6-clear-queue", isAuthenticated, async (req, res) => {
    try {
      const mmsWatcher = (req.app.locals as any).mmsWatcher;
      const username = (req.user as any)?.username || 'system';
      
      if (!mmsWatcher) {
        return res.status(503).json({
          error: "MMS Watcher service not available"
        });
      }

      console.log(`[ADMIN] Clearing Step 6 queue - requested by: ${username}`);
      const result = mmsWatcher.clearStep6Queue();
      
      res.json({
        success: true,
        message: `Cleared ${result.cleared} items from Step 6 queue`,
        ...result
      });
      
    } catch (error) {
      console.error('[ADMIN] Error clearing Step 6 queue:', error);
      res.status(500).json({
        error: "Failed to clear Step 6 queue",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Clear stuck files from Step 6 active slots
  app.post("/api/admin/step6-clear-slots", isAuthenticated, async (req, res) => {
    try {
      const { uploadIds } = req.body;
      const mmsWatcher = (req.app.locals as any).mmsWatcher;
      const username = (req.user as any)?.username || 'system';
      
      if (!mmsWatcher) {
        return res.status(503).json({
          error: "MMS Watcher service not available"
        });
      }

      console.log(`[ADMIN] Clearing stuck slots - requested by: ${username}, uploadIds:`, uploadIds);
      const result = mmsWatcher.clearStuckFilesFromSlots(uploadIds);
      
      res.json({
        success: true,
        message: `Cleared ${result.cleared} stuck file(s) from active slots`,
        ...result
      });
      
    } catch (error) {
      console.error('[ADMIN] Error clearing stuck slots:', error);
      res.status(500).json({
        error: "Failed to clear stuck slots",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
