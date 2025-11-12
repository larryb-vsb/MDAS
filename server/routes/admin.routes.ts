import { Express } from "express";
import { pool } from "../db";
import { isAuthenticated } from "./middleware";
import { getTableName } from "../table-config";

const STUCK_FILE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export function registerAdminRoutes(app: Express) {
  
  // Reset stuck Step 6 files
  app.post("/api/admin/reset-stuck-step6-files", isAuthenticated, async (req, res) => {
    try {
      const { fileIds, thresholdMinutes } = req.body;
      const username = (req.user as any)?.username || 'system';
      const thresholdMs = thresholdMinutes ? thresholdMinutes * 60 * 1000 : STUCK_FILE_THRESHOLD_MS;
      
      console.log(`[ADMIN-RESET] Starting stuck file reset - threshold: ${thresholdMs / 60000} minutes, requested by: ${username}`);
      
      let stuckFiles = [];
      
      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        // Reset specific files
        console.log(`[ADMIN-RESET] Resetting specific files: ${fileIds.join(', ')}`);
        const uploadTableName = getTableName('uploader_uploads');
        const result = await pool.query(`
          SELECT id, filename, current_phase, retry_count, start_time
          FROM ${uploadTableName}
          WHERE id = ANY($1::text[])
            AND current_phase = 'processing'
        `, [fileIds]);
        stuckFiles = result.rows;
      } else {
        // Find all stuck files
        const cutoffTime = new Date(Date.now() - thresholdMs);
        const uploadTableName = getTableName('uploader_uploads');
        const result = await pool.query(`
          SELECT id, filename, current_phase, retry_count, start_time
          FROM ${uploadTableName}
          WHERE current_phase = 'processing'
            AND start_time < $1
          ORDER BY start_time ASC
        `, [cutoffTime]);
        stuckFiles = result.rows;
        
        console.log(`[ADMIN-RESET] Found ${stuckFiles.length} stuck files older than ${thresholdMs / 60000} minutes`);
      }
      
      if (stuckFiles.length === 0) {
        return res.json({
          success: true,
          message: "No stuck files found",
          filesReset: 0,
          slotsCleared: 0
        });
      }
      
      // Reset each stuck file
      const uploadTableName = getTableName('uploader_uploads');
      const resetResults = [];
      
      for (const file of stuckFiles) {
        const currentRetries = file.retry_count || 0;
        const stuckDuration = Date.now() - new Date(file.start_time).getTime();
        const stuckMinutes = Math.floor(stuckDuration / 60000);
        
        console.log(`[ADMIN-RESET] Resetting ${file.filename} (stuck for ${stuckMinutes} minutes, retry ${currentRetries}/3)`);
        
        // Move back to encoded phase for retry (with phase guard to prevent race conditions)
        await pool.query(`
          UPDATE ${uploadTableName}
          SET 
            current_phase = 'encoded',
            processing_warnings = $1,
            last_warning_at = NOW(),
            warning_count = COALESCE(warning_count, 0) + 1,
            last_updated = NOW()
          WHERE id = $2
            AND current_phase = 'processing'
        `, [
          `Admin reset: File stuck in processing for ${stuckMinutes} minutes - moved back to encoded for retry (attempt ${currentRetries + 1}/3)`,
          file.id
        ]);
        
        resetResults.push({
          id: file.id,
          filename: file.filename,
          stuckMinutes,
          retryCount: currentRetries
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
  
  // Get stuck file statistics
  app.get("/api/admin/stuck-files-stats", isAuthenticated, async (req, res) => {
    try {
      const thresholdMinutes = parseInt(req.query.thresholdMinutes as string) || 10;
      const thresholdMs = thresholdMinutes * 60 * 1000;
      const cutoffTime = new Date(Date.now() - thresholdMs);
      
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
        WHERE current_phase = 'processing'
          AND start_time < $1
        ORDER BY start_time ASC
      `, [cutoffTime]);
      
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
}
