import * as schedule from 'node-schedule';
import { db } from '../db';
import { eq, sql, and, desc, asc } from 'drizzle-orm';
import { systemLogger } from '../system-logger';
import { getTableName } from '../table-config';
// Simple server ID generation
function getCachedServerId(): string {
  return process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`;
}

/**
 * TDDF API background processor service
 * Handles processing of files queued in the TDDF API system
 */
class TddfApiProcessorService {
  private processingJob: schedule.Job | null = null;
  private isRunning = false;
  private jobName = 'tddf-api-processor';

  /**
   * Initialize the TDDF API processor service
   */
  async initialize(): Promise<void> {
    console.log("[TDDF-API-PROCESSOR] Initializing TDDF API processor service...");
    
    // Perform startup health check
    const healthCheckPassed = await this.performStartupHealthCheck();
    if (!healthCheckPassed) {
      console.error("[TDDF-API-PROCESSOR] Startup health check failed - service will not be scheduled");
      return;
    }
    
    // Schedule a job to run every 30 seconds for responsive processing
    this.processingJob = schedule.scheduleJob(this.jobName, '*/30 * * * * *', async () => {
      await this.processQueuedFiles();
    });
    
    console.log(`[TDDF-API-PROCESSOR] TDDF API processor initialized. Next run at ${this.processingJob?.nextInvocation()}`);
    
    // Log processor initialization
    systemLogger.info('TDDF-API', 'Background TDDF API processor initialized', {
      schedule: '*/30 * * * * *',
      nextRun: this.processingJob?.nextInvocation()?.toISOString(),
      serverId: getCachedServerId()
    }).catch(console.error);
  }

  /**
   * Perform startup health check to verify required tables exist
   */
  private async performStartupHealthCheck(): Promise<boolean> {
    try {
      const requiredTables = ['tddf_api_queue', 'tddf_api_files', 'tddf_api_records', 'tddf_api_schemas'];
      const missingTables: string[] = [];
      
      for (const tableName of requiredTables) {
        const fullTableName = getTableName(tableName);
        try {
          await db.execute(sql.raw(`SELECT 1 FROM ${fullTableName} LIMIT 1`));
          console.log(`[TDDF-API-PROCESSOR] ✅ Health check: ${fullTableName} exists`);
        } catch (error) {
          console.error(`[TDDF-API-PROCESSOR] ❌ Health check: ${fullTableName} missing`);
          missingTables.push(fullTableName);
        }
      }
      
      if (missingTables.length > 0) {
        console.error(`[TDDF-API-PROCESSOR] FATAL: Missing required tables: ${missingTables.join(', ')}`);
        console.error(`[TDDF-API-PROCESSOR] Database: ${await this.getDatabaseInfo()}`);
        return false;
      }
      
      console.log(`[TDDF-API-PROCESSOR] ✅ All required tables verified`);
      return true;
      
    } catch (error) {
      console.error(`[TDDF-API-PROCESSOR] Health check failed:`, error);
      return false;
    }
  }

  /**
   * Get database connection info for debugging
   */
  private async getDatabaseInfo(): Promise<string> {
    try {
      const result = await db.execute(sql.raw(`
        SELECT current_database() as db_name, current_user as db_user, current_schemas(true) as schemas
      `));
      return JSON.stringify(result.rows[0]);
    } catch {
      return 'Unable to retrieve database info';
    }
  }

  /**
   * Process queued TDDF API files
   */
  async processQueuedFiles(): Promise<void> {
    if (this.isRunning) {
      console.log("[TDDF-API-PROCESSOR] Already running, skipping this cycle");
      return;
    }

    this.isRunning = true;
    const serverId = getCachedServerId();

    try {
      // Get next queued file with highest priority
      const queueTableName = getTableName('tddf_api_queue');
      const filesTableName = getTableName('tddf_api_files');
      const schemasTableName = getTableName('tddf_api_schemas');
      
      console.log(`[TDDF-API-PROCESSOR] Using table: ${queueTableName}`);
      
      const queuedFiles = await db.execute(sql.raw(`
        SELECT q.*, f.original_name, f.storage_path, f.schema_id, s.name as schema_name, s.schema_data
        FROM ${queueTableName} q
        JOIN ${filesTableName} f ON q.file_id = f.id
        LEFT JOIN ${schemasTableName} s ON f.schema_id = s.id
        WHERE q.status = 'queued'
        ORDER BY q.priority DESC, q.created_at ASC
        LIMIT 1
      `));

      if (queuedFiles.rows.length === 0) {
        return; // No files to process
      }

      const queueItem = queuedFiles.rows[0] as any;
      const fileId = queueItem.file_id;
      const queueId = queueItem.id;

      console.log(`[TDDF-API-PROCESSOR] Processing file: ${queueItem.original_name} (ID: ${fileId})`);

      // Mark as processing
      await db.execute(sql.raw(`
        UPDATE ${queueTableName} 
        SET status = 'processing'
        WHERE id = ${queueId}
      `));

      // Update file status
      await db.execute(sql.raw(`
        UPDATE ${filesTableName} 
        SET status = 'processing',
            processing_started = NOW()
        WHERE id = ${fileId}
      `));

      // Simulate processing (in a real system, this would parse the file)
      await this.processFile(queueItem);

      // Mark as completed
      await db.execute(sql.raw(`
        UPDATE ${queueTableName} 
        SET status = 'completed'
        WHERE id = ${queueId}
      `));

      await db.execute(sql.raw(`
        UPDATE ${filesTableName} 
        SET status = 'completed',
            processing_completed = NOW(),
            record_count = 100,
            processed_records = 100
        WHERE id = ${fileId}
      `));

      console.log(`[TDDF-API-PROCESSOR] Successfully processed file: ${queueItem.original_name}`);

      systemLogger.info('TDDF-API', 'File processed successfully', {
        fileId,
        fileName: queueItem.original_name,
        serverId
      }).catch(console.error);

    } catch (error) {
      console.error("[TDDF-API-PROCESSOR] Error processing queued files:", error);
      
      systemLogger.error('TDDF-API', 'Error processing queued files', {
        error: error instanceof Error ? error.message : String(error),
        serverId
      }).catch(console.error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process individual file
   */
  private async processFile(queueItem: any): Promise<void> {
    // This is where you would implement the actual file processing logic
    // For now, we'll simulate processing with a delay
    
    console.log(`[TDDF-API-PROCESSOR] Processing file content for: ${queueItem.original_name}`);
    console.log(`[TDDF-API-PROCESSOR] Schema: ${queueItem.schema_name || 'None'}`);
    console.log(`[TDDF-API-PROCESSOR] Storage path: ${queueItem.storage_path}`);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real implementation, you would:
    // 1. Read the file from storage_path
    // 2. Parse it according to the schema
    // 3. Extract records and store them
    // 4. Update record counts
    // 5. Handle any errors
  }

  /**
   * Shutdown the processor
   */
  shutdown(): void {
    if (this.processingJob) {
      this.processingJob.cancel();
      console.log("[TDDF-API-PROCESSOR] TDDF API processor shutdown");
    }
  }

  /**
   * Get processing status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.processingJob?.nextInvocation()?.toISOString()
    };
  }
}

// Export singleton instance
export const tddfApiProcessor = new TddfApiProcessorService();