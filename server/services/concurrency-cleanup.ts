import { db } from "../db";
import { sql } from "drizzle-orm";
import { getCachedServerId } from "../utils/server-id";

/**
 * Cleanup service for stale file processing locks in multi-node environment
 */
export class ConcurrencyCleanupService {
  private static readonly PROCESSING_TIMEOUT_MINUTES = 60;
  
  /**
   * Clean up stale processing locks from crashed or disconnected servers
   * This prevents files from being stuck in "processing" state indefinitely
   */
  static async cleanupStaleProcessingLocks(): Promise<number> {
    const serverId = getCachedServerId();
    const timeoutThreshold = new Date(Date.now() - this.PROCESSING_TIMEOUT_MINUTES * 60 * 1000);
    
    try {
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      // Find and cleanup stale processing locks
      const result = await db.execute(sql`
        UPDATE ${sql.identifier(uploadsTableName)}
        SET 
          processing_status = 'failed',
          processing_completed_at = ${new Date().toISOString()},
          processing_errors = 'Processing timeout - server may have crashed or disconnected'
        WHERE processing_status = 'processing'
          AND processing_started_at < ${timeoutThreshold.toISOString()}
        RETURNING id, original_filename, processing_server_id, processing_started_at
      `);
      
      const cleanedFiles = result.rows;
      
      if (cleanedFiles.length > 0) {
        console.log(`[${serverId}] Cleaned up ${cleanedFiles.length} stale processing locks:`);
        cleanedFiles.forEach((file: any) => {
          console.log(`  - ${file.original_filename} (Server: ${file.processing_server_id}, Started: ${file.processing_started_at})`);
        });
      } else {
        console.log(`[${serverId}] No stale processing locks found`);
      }
      
      return cleanedFiles.length;
    } catch (error) {
      console.error(`[${serverId}] Error cleaning up stale processing locks:`, error);
      return 0;
    }
  }
  
  /**
   * Get statistics about current processing status across all servers
   */
  static async getProcessingStats(): Promise<{
    totalFiles: number;
    processingByServer: Record<string, number>;
    staleProcessingFiles: number;
    longestProcessingFile?: {
      filename: string;
      serverId: string;
      startedAt: string;
      durationMinutes: number;
    };
  }> {
    const serverId = getCachedServerId();
    
    try {
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      // Get overall statistics
      const statsResult = await db.execute(sql`
        SELECT 
          COUNT(*) as total_files,
          COUNT(CASE WHEN processing_status = 'processing' THEN 1 END) as currently_processing,
          COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed
        FROM ${sql.identifier(uploadsTableName)}
      `);
      
      // Get processing by server
      const serverStatsResult = await db.execute(sql`
        SELECT 
          processing_server_id,
          COUNT(*) as files_processing,
          MIN(processing_started) as earliest_start
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'processing'
        GROUP BY processing_server_id
      `);
      
      // Find stale processing files
      const timeoutThreshold = new Date(Date.now() - this.PROCESSING_TIMEOUT_MINUTES * 60 * 1000);
      const staleResult = await db.execute(sql`
        SELECT 
          original_filename,
          processing_server_id,
          processing_started,
          EXTRACT(EPOCH FROM (NOW() - processing_started))/60 as duration_minutes
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'processing'
          AND processing_started < ${timeoutThreshold.toISOString()}
        ORDER BY processing_started ASC
        LIMIT 1
      `);
      
      const totalFiles = parseInt(statsResult.rows[0]?.total_files || '0');
      const processingByServer: Record<string, number> = {};
      
      serverStatsResult.rows.forEach((row: any) => {
        processingByServer[row.processing_server_id] = parseInt(row.files_processing);
      });
      
      const staleFiles = staleResult.rows;
      const longestProcessingFile = staleFiles.length > 0 ? {
        filename: staleFiles[0].original_filename,
        serverId: staleFiles[0].processing_server_id,
        startedAt: staleFiles[0].processing_started_at,
        durationMinutes: parseFloat(staleFiles[0].duration_minutes)
      } : undefined;
      
      return {
        totalFiles,
        processingByServer,
        staleProcessingFiles: staleFiles.length,
        longestProcessingFile
      };
    } catch (error) {
      console.error(`[${serverId}] Error getting processing stats:`, error);
      return {
        totalFiles: 0,
        processingByServer: {},
        staleProcessingFiles: 0
      };
    }
  }
}