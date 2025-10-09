import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { storage } from "../storage";
import schedule from "node-schedule";
import { getCachedServerId } from "../utils/server-id";
import { getTableName } from "../table-config";
import { systemLogger } from '../system-logger';
import { NODE_ENV } from '../env-config';
import { FileTaggedLogger } from '../../shared/file-tagged-logger.js';

interface ProcessingStatus {
  isRunning: boolean;
  nextScheduledRun: Date | null;
  lastRunTime: Date | null;
  queuedFiles: any[];
  processingErrors: Record<string, string>;
  processedFileCount: number;
  isPaused: boolean;
  currentTransactionRange?: string;
  currentlyProcessingFile?: {
    id: string;
    filename: string;
    fileType: string;
    startTime: Date;
    transactionsProcessed: number;
    totalTransactions?: number;
    progress?: number;
  };
  duplicateResolutionStats?: {
    totalDuplicates: number;
    averageIncrements: number;
    skipCount: number;
  };
  processingStats?: {
    transactionsProcessed: number;
    processingSpeed: number;
    estimatedCompletion: Date | null;
    startTime: Date | null;
    duplicateResolutionRate: number;
  };
}

/**
 * Background file processor service that periodically checks for unprocessed files and processes them
 */
class FileProcessorService {
  private processingJob: schedule.Job | null = null;
  private isRunning = false;
  private isPaused = false;
  private jobName = 'file-processor';
  private lastRunTime: Date | null = null;
  private queuedFiles: any[] = [];
  private processingErrors: Record<string, string> = {};
  private processedFileCount = 0;
  private currentTransactionRange: string = '';
  private currentlyProcessingFile: {
    id: string;
    filename: string;
    fileType: string;
    startTime: Date;
    transactionsProcessed: number;
    totalTransactions?: number;
    progress?: number;
  } | null = null;
  private duplicateStats = {
    totalDuplicates: 0,
    averageIncrements: 0,
    skipCount: 0
  };
  private processingStats = {
    transactionsProcessed: 0,
    startTime: null as Date | null,
    currentTransactionId: '',
    estimatedCompletion: null as Date | null
  };
  
  /**
   * Initialize the file processor service
   */
  initialize(): void {
    console.log("Initializing file processor service...");
    
    // Clear any phantom processing locks from previous server instances on startup
    this.clearPhantomProcessingLocks();
    
    // Schedule a job to run every minute
    this.processingJob = schedule.scheduleJob(this.jobName, '*/1 * * * *', async () => {
      await this.processUnprocessedFiles();
    });
    
    console.log(`File processor service initialized. Next run at ${this.processingJob?.nextInvocation()}`);
    
    // Log file processor initialization
    systemLogger.info('Application', 'Background file processor initialized', {
      schedule: '*/1 * * * *',
      nextRun: this.processingJob?.nextInvocation()?.toISOString(),
      serverId: getCachedServerId()
    }).catch(console.error);
  }

  /**
   * Clear phantom processing locks from previous server instances
   * This prevents files from being stuck in processing after server restarts
   */
  private async clearPhantomProcessingLocks(): Promise<void> {
    try {
      const currentServerId = getCachedServerId();
      console.log(`[STARTUP CLEANUP] Current server ID: ${currentServerId}`);
      
      // Use environment-specific table name
      const tableName = getTableName('uploaded_files');
      
      // Find files stuck in processing from different server instances using raw SQL for environment support
      const stuckFilesResult = await db.execute(sql`
        SELECT * FROM ${sql.identifier(tableName)}
        WHERE processing_status = 'processing' 
        AND (processing_server_id != ${currentServerId} OR processing_server_id IS NULL)
      `);
      
      const stuckFiles = stuckFilesResult.rows;

      if (stuckFiles.length > 0) {
        console.log(`[STARTUP CLEANUP] Found ${stuckFiles.length} stuck files from previous server instances`);
        
        // Reset stuck files to queued status using raw SQL for environment support
        const result = await db.execute(sql`
          UPDATE ${sql.identifier(tableName)}
          SET processing_status = 'queued',
              processing_started_at = NULL,
              processing_completed_at = NULL,
              processing_server_id = NULL
          WHERE processing_status = 'processing' 
          AND (processing_server_id != ${currentServerId} OR processing_server_id IS NULL)
        `);

        console.log(`[STARTUP CLEANUP] ✅ Cleared phantom processing locks for ${stuckFiles.length} files`);
        
        // Log the cleared files for debugging
        stuckFiles.forEach((file: any) => {
          console.log(`[STARTUP CLEANUP] Cleared: ${file.original_filename} (Server: ${file.processing_server_id || 'NULL'})`);
        });
      } else {
        console.log(`[STARTUP CLEANUP] ✅ No phantom processing locks found`);
      }
    } catch (error) {
      console.error('[STARTUP CLEANUP] Error clearing phantom processing locks:', error);
    }
  }
  
  /**
   * Get the current processing status
   */
  getProcessingStatus(): ProcessingStatus {
    // Calculate processing speed
    const processingSpeed = this.calculateProcessingSpeed();
    
    // Calculate duplicate resolution rate
    const duplicateResolutionRate = this.duplicateStats.totalDuplicates > 0 
      ? ((this.duplicateStats.totalDuplicates - this.duplicateStats.skipCount) / this.duplicateStats.totalDuplicates) * 100
      : 0;

    return {
      isRunning: this.isRunning,
      nextScheduledRun: this.processingJob?.nextInvocation() || null,
      lastRunTime: this.lastRunTime,
      queuedFiles: this.queuedFiles,
      processingErrors: this.processingErrors,
      processedFileCount: this.processedFileCount,
      isPaused: this.isPaused,
      currentTransactionRange: this.currentTransactionRange,
      currentlyProcessingFile: this.currentlyProcessingFile,
      duplicateResolutionStats: this.duplicateStats,
      processingStats: {
        transactionsProcessed: this.processingStats.transactionsProcessed,
        processingSpeed,
        estimatedCompletion: this.processingStats.estimatedCompletion,
        startTime: this.processingStats.startTime,
        duplicateResolutionRate
      }
    };
  }

  /**
   * Calculate current processing speed (transactions per second)
   */
  private calculateProcessingSpeed(): number {
    if (!this.processingStats.startTime || this.processingStats.transactionsProcessed === 0) {
      return 0;
    }
    
    const elapsed = (Date.now() - this.processingStats.startTime.getTime()) / 1000; // seconds
    return this.processingStats.transactionsProcessed / elapsed;
  }
  
  /**
   * Update processing statistics for real-time KPI tracking
   */
  updateProcessingStats(transactionId: string, duplicateInfo?: { increments: number; wasSkipped: boolean }): void {
    // Initialize start time if not set
    if (!this.processingStats.startTime) {
      this.processingStats.startTime = new Date();
    }
    
    // Update basic stats
    this.processingStats.transactionsProcessed++;
    this.processingStats.currentTransactionId = transactionId;
    
    // Handle duplicate statistics
    if (duplicateInfo) {
      this.duplicateStats.totalDuplicates++;
      if (duplicateInfo.wasSkipped) {
        this.duplicateStats.skipCount++;
      }
      if (duplicateInfo.increments > 0) {
        // Update average increments calculation
        const totalIncrements = (this.duplicateStats.averageIncrements * (this.duplicateStats.totalDuplicates - 1)) + duplicateInfo.increments;
        this.duplicateStats.averageIncrements = totalIncrements / this.duplicateStats.totalDuplicates;
      }
    }
    
    // Update estimated completion time based on current processing speed
    const processingSpeed = this.calculateProcessingSpeed();
    if (processingSpeed > 0 && this.queuedFiles.length > 0) {
      // Rough estimate based on average transactions per file
      const estimatedRemainingTransactions = this.queuedFiles.length * 100; // Assume 100 transactions per file
      const estimatedSecondsRemaining = estimatedRemainingTransactions / processingSpeed;
      this.processingStats.estimatedCompletion = new Date(Date.now() + (estimatedSecondsRemaining * 1000));
    } else {
      this.processingStats.estimatedCompletion = null;
    }
  }
  
  /**
   * Force immediate processing of unprocessed files
   */
  async forceProcessing(): Promise<ProcessingStatus> {
    if (!this.isRunning) {
      this.processUnprocessedFiles();
    }
    return this.getProcessingStatus();
  }
  
  /**
   * Check if Auto Step 6 processing is enabled
   */
  private async isAutoStep6Enabled(): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT setting_value FROM ${sql.identifier(getTableName('system_settings'))}
        WHERE setting_key = 'auto_step6_enabled'
      `);
      
      return result.rows.length > 0 ? result.rows[0].setting_value === 'true' : false;
    } catch (error) {
      console.error('[AUTO-STEP6] Error checking Auto Step 6 setting:', error);
      return false;
    }
  }

  /**
   * Find files ready for automated Step 6 processing
   */
  private async getFilesReadyForStep6(): Promise<any[]> {
    try {
      const uploadsTableName = getTableName('uploader_uploads');
      
      console.log(`[AUTO-STEP6] Looking for files ready for Step 6 in table: ${uploadsTableName}`);
      
      const result = await db.execute(sql`
        SELECT 
          id,
          filename,
          storage_path,
          file_type,
          current_phase,
          uploaded_at,
          final_file_type
        FROM ${sql.identifier(uploadsTableName)}
        WHERE current_phase = 'encoded'
          AND final_file_type = 'tddf'
        ORDER BY uploaded_at ASC
        LIMIT 5
      `);
      
      const files = result.rows.map(row => ({
        id: row.id,
        filename: row.filename,
        storagePath: row.storage_path,
        fileType: row.file_type,
        currentPhase: row.current_phase,
        uploadedAt: row.uploaded_at,
        finalFileType: row.final_file_type
      }));
      
      console.log(`[AUTO-STEP6] Found ${files.length} TDDF files ready for Step 6 processing`);
      return files;
    } catch (error) {
      console.error('[AUTO-STEP6] Error finding files ready for Step 6:', error);
      return [];
    }
  }

  /**
   * Automatically process Step 6 for eligible files when Auto mode is enabled
   */
  private async processAutoStep6(): Promise<void> {
    const autoStep6Enabled = await this.isAutoStep6Enabled();
    if (!autoStep6Enabled) {
      return; // Auto Step 6 is disabled, skip
    }

    console.log('[AUTO-STEP6] Auto Step 6 processing is enabled, checking for eligible files...');
    
    const readyFiles = await this.getFilesReadyForStep6();
    if (readyFiles.length === 0) {
      return; // No files ready for Step 6
    }

    console.log(`[AUTO-STEP6] Starting automated Step 6 processing for ${readyFiles.length} files`);
    
    for (const file of readyFiles) {
      const startTime = new Date();
      let timingLogId: number | null = null;
      
      try {
        const context = FileTaggedLogger.createContext(file, 6, 'START');
        FileTaggedLogger.stepStart(context, 'Auto Step 6 processing initiated');
        
        // Import the Step 6 processing function and Replit storage service
        const { processAllRecordsToMasterTable } = await import("../tddf-json-encoder");
        const { ReplitStorageService } = await import("../replit-storage-service");
        
        // Create timing log entry for tracking
        try {
          const timingResult = await db.execute(sql`
            INSERT INTO ${sql.identifier(getTableName('processing_timing_logs'))} 
            (upload_id, operation_type, started_at, status, metadata)
            VALUES (${file.id}, 'auto-step6', ${startTime}, 'in_progress', ${JSON.stringify({ filename: file.filename })})
            RETURNING id
          `);
          timingLogId = timingResult.rows[0]?.id as number;
          console.log(`[AUTO-STEP6-TIMING] Created timing log ${timingLogId} for upload ${file.id}`);
        } catch (timingError: any) {
          console.warn(`[AUTO-STEP6-TIMING] Could not create timing log: ${timingError.message}`);
        }
        
        // Get the file content from Replit storage
        const fileContent = await ReplitStorageService.getFileContent(file.storagePath);
        if (!fileContent) {
          throw new Error(`Failed to load file content from ${file.storagePath}`);
        }
        
        // Update to processing phase with encoding start time
        await db.execute(sql`
          UPDATE ${sql.identifier(getTableName('uploader_uploads'))}
          SET current_phase = 'processing', 
              processing_at = NOW(),
              encoding_at = ${startTime}
          WHERE id = ${file.id}
        `);
        
        // Process the file - this calls the existing Step 6 processing logic
        const step6Result = await processAllRecordsToMasterTable(fileContent, file);
        
        // Calculate encoding time
        const endTime = new Date();
        const encodingTimeMs = endTime.getTime() - startTime.getTime();
        const recordsCreated = step6Result?.totalRecords || 0;
        
        // Update to completed phase with full timing data
        await db.execute(sql`
          UPDATE ${sql.identifier(getTableName('uploader_uploads'))}
          SET current_phase = 'completed', 
              completed_at = NOW(),
              encoding_complete = ${endTime},
              encoding_time_ms = ${encodingTimeMs},
              json_records_created = ${recordsCreated}
          WHERE id = ${file.id}
        `);
        
        // Update timing log to completed
        if (timingLogId) {
          try {
            await db.execute(sql`
              UPDATE ${sql.identifier(getTableName('processing_timing_logs'))}
              SET completed_at = ${endTime},
                  status = 'completed',
                  records_processed = ${recordsCreated},
                  processing_time_ms = ${encodingTimeMs}
              WHERE id = ${timingLogId}
            `);
          } catch (timingError: any) {
            console.warn(`[AUTO-STEP6-TIMING] Could not update timing log ${timingLogId}: ${timingError.message}`);
          }
        }
        
        const successContext = FileTaggedLogger.createContext(file, 6, 'COMPLETE');
        FileTaggedLogger.success(successContext, 'Auto Step 6 completed', { 
          recordsCreated, 
          processingTimeMs: encodingTimeMs,
          recordsPerSecond: recordsCreated / (encodingTimeMs / 1000) 
        });
        
      } catch (error) {
        const failureContext = FileTaggedLogger.createContext(file, 6, 'FAILED');
        FileTaggedLogger.failure(failureContext, 'Auto Step 6 processing failed', error);
        
        // Calculate failure time
        const failureTime = new Date();
        const failureTimeMs = failureTime.getTime() - startTime.getTime();
        
        // Mark file as failed with timing data
        await db.execute(sql`
          UPDATE ${sql.identifier(getTableName('uploader_uploads'))}
          SET current_phase = 'error', 
              processing_errors = ${error instanceof Error ? error.message : 'Auto Step 6 processing failed'},
              encoding_complete = ${failureTime},
              encoding_time_ms = ${failureTimeMs}
          WHERE id = ${file.id}
        `);
        
        // Update timing log to failed
        if (timingLogId) {
          try {
            await db.execute(sql`
              UPDATE ${sql.identifier(getTableName('processing_timing_logs'))}
              SET completed_at = ${failureTime},
                  status = 'failed',
                  processing_time_ms = ${failureTimeMs},
                  error_message = ${error instanceof Error ? error.message : 'Auto Step 6 processing failed'}
              WHERE id = ${timingLogId}
            `);
          } catch (timingError: any) {
            console.warn(`[AUTO-STEP6-TIMING] Could not update failed timing log ${timingLogId}: ${timingError.message}`);
          }
        }
      }
    }
    
    console.log('[AUTO-STEP6] Automated Step 6 processing completed');
  }

  /**
   * Get all unprocessed files from the database for the current environment
   * Uses database-level concurrency control to prevent multiple nodes from processing the same files
   */
  async fetchUnprocessedFiles(): Promise<any[]> {
    const currentEnvironment = NODE_ENV;
    const serverId = getCachedServerId();
    
    try {
      // Import table-config for environment-specific table names
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploader_uploads');
      
      console.log(`[FILE PROCESSOR] Using table: ${uploadsTableName} for environment: ${currentEnvironment}, server: ${serverId}`);
      
      // First check if the table exists and what records are in it
      try {
        const tableCheck = await db.execute(sql`
          SELECT COUNT(*) as count FROM ${sql.identifier(uploadsTableName)}
        `);
        console.log(`[FILE PROCESSOR] Total records in ${uploadsTableName}: ${tableCheck.rows[0]?.count || 0}`);
      } catch (error) {
        console.log(`[FILE PROCESSOR] Error checking table ${uploadsTableName}:`, error.message);
      }
      
      // Database-level concurrency control: only fetch files that are NOT currently being processed
      // This prevents multiple nodes from picking up the same files
      // CRITICAL: Exclude TDDF files - they are handled separately by processAutoStep6()
      const result = await db.execute(sql`
        SELECT 
          id,
          filename as original_filename,
          storage_path,
          file_type,
          uploaded_at,
          CASE WHEN current_phase IN ('encoded', 'completed') THEN true ELSE false END as processed,
          processing_errors,
          false as deleted,
          current_phase as processing_status,
          started_at as processing_started_at,
          processing_server_id
        FROM ${sql.identifier(uploadsTableName)}
        WHERE current_phase IN ('uploaded', 'identified', 'encoding')
          AND (final_file_type IS NULL OR final_file_type != 'tddf')
        ORDER BY 
          uploaded_at ASC
        LIMIT 10
      `);
      
      const unprocessedFiles = result.rows.map(row => ({
        id: row.id,
        originalFilename: row.original_filename,
        storagePath: row.storage_path,
        fileType: row.file_type,
        uploadedAt: row.uploaded_at,
        processed: row.processed,
        processingErrors: row.processing_errors,
        deleted: row.deleted,
        processingStatus: row.processing_status,
        processingStartedAt: row.processing_started_at,
        processingServerId: row.processing_server_id
      }));
      
      console.log(`[FILE PROCESSOR] Found ${unprocessedFiles.length} unprocessed files available for processing (server: ${serverId})`);
      return unprocessedFiles;
    } catch (error: any) {
      console.error('[FILE PROCESSOR] Error fetching unprocessed files:', error);
      return [];
    }
  }

  /**
   * Process all unprocessed files in the database with database-level concurrency control
   */
  async processUnprocessedFiles(): Promise<void> {
    const serverId = getCachedServerId();
    
    // DATABASE-LEVEL GLOBAL LOCK: Check if ANY server is currently processing
    // This prevents multiple servers AND multiple triggers on same server from running simultaneously
    const isGloballyProcessing = await this.checkGlobalProcessingStatus();
    if (isGloballyProcessing) {
      console.log(`[${serverId}] Another server or process is currently processing files globally, skipping this run`);
      return;
    }
    
    // Skip if already processing files or paused (in-memory check)
    if (this.isRunning) {
      console.log(`[${serverId}] File processor is already running locally, skipping this run`);
      return;
    }
    
    if (this.isPaused) {
      console.log(`[${serverId}] File processor is paused locally, skipping this run`);
      return;
    }
    
    // Check if processing is globally paused by user
    try {
      const { isProcessingPaused } = await import("../routes");
      if (isProcessingPaused()) {
        console.log(`[${serverId}] 🛑 Processing is globally paused by user - skipping this run`);
        return;
      }
    } catch (error) {
      console.error(`[${serverId}] Error checking global pause state:`, error);
    }
    
    try {
      this.isRunning = true;
      this.lastRunTime = new Date();
      
      // Find all unprocessed files using database-level concurrency control
      const unprocessedFiles = await this.fetchUnprocessedFiles();
      
      if (unprocessedFiles.length === 0) {
        // No files to process
        console.log(`[${serverId}] No files available for processing`);
        return;
      }
      
      console.log(`[${serverId}] Found ${unprocessedFiles.length} unprocessed files to process`);
      this.queuedFiles = [...unprocessedFiles];
      
      // Process Auto Step 6 first (if enabled and files are ready)
      await this.processAutoStep6();
      
      // Process files one by one with atomic database locking
      for (const file of unprocessedFiles) {
        try {
          // Atomic database lock: try to claim this file for processing with retry logic
          let claimed = false;
          let attemptNumber = 1;
          const maxRetries = 3;
          
          while (attemptNumber <= maxRetries && !claimed) {
            claimed = await this.claimFileForProcessing(file.id, file.originalFilename, attemptNumber);
            
            if (!claimed && attemptNumber < maxRetries) {
              // Exponential backoff: wait longer between retries to reduce contention
              const waitTimeMs = 100 * Math.pow(2, attemptNumber - 1); // 100ms, 200ms, 400ms
              const retryContext = FileTaggedLogger.createContext({ id: file.id, filename: file.originalFilename }, 6, 'RETRY');
              FileTaggedLogger.warn(retryContext, `File claim failed, retrying in ${waitTimeMs}ms`, { 
                attemptNumber, 
                maxRetries, 
                waitTimeMs,
                reason: 'concurrency_retry' 
              });
              
              await new Promise(resolve => setTimeout(resolve, waitTimeMs));
              attemptNumber++;
            }
          }
          
          if (!claimed) {
            const exhaustedContext = FileTaggedLogger.createContext({ id: file.id, filename: file.originalFilename }, 6, 'EXHAUSTED');
            FileTaggedLogger.warn(exhaustedContext, `File claim failed after ${maxRetries} attempts - potential duplicate risk`, { 
              attemptNumber: maxRetries, 
              reason: 'max_retries_exceeded',
              duplicateRisk: true
            });
            console.log(`[${serverId}] File ${file.originalFilename} could not be claimed after ${maxRetries} attempts, skipping`);
            continue;
          }
          
          const processingContext = FileTaggedLogger.createContext({ id: file.id, filename: file.originalFilename }, 6, 'START');
          FileTaggedLogger.stepStart(processingContext, 'File processing initiated');
          console.log(`\n=== [${serverId}] PROCESSING FILE: ${file.originalFilename} (ID: ${file.id}) ===`);
          const startTime = new Date();
          
          // Update currently processing file info
          this.currentlyProcessingFile = {
            id: file.id,
            filename: file.originalFilename,
            fileType: file.fileType,
            startTime: startTime,
            transactionsProcessed: 0
          };
          
          this.processingStats.startTime = startTime;
          this.processingStats.transactionsProcessed = 0;
          
          await storage.combineAndProcessUploads([file.id]);
          
          const endTime = new Date();
          const processingTimeMs = endTime.getTime() - startTime.getTime();
          const processingTimeSec = (processingTimeMs / 1000).toFixed(2);
          
          const completedContext = FileTaggedLogger.createContext({ id: file.id, filename: file.originalFilename }, 6, 'COMPLETE');
          FileTaggedLogger.success(completedContext, 'File processing completed', { processingTimeSeconds: processingTimeSec });
          console.log(`✅ [${serverId}] COMPLETED: ${file.originalFilename} in ${processingTimeSec} seconds`);
          this.processedFileCount += 1;
          
          // Clear currently processing file
          this.currentlyProcessingFile = null;
          
        } catch (error) {
          const failedContext = FileTaggedLogger.createContext({ id: file.id, filename: file.originalFilename }, 6, 'FAILED');
          FileTaggedLogger.failure(failedContext, 'File processing failed', error);
          console.error(`❌ [${serverId}] FAILED: ${file.originalFilename} - ${error.message}`);
          if (error instanceof Error) {
            this.processingErrors[file.id] = error.message;
          }
          
          // Mark file as failed in database
          await this.markFileAsFailed(file.id, error instanceof Error ? error.message : 'Unknown error');
          this.currentlyProcessingFile = null;
        }
      }
      
    } catch (error) {
      console.error(`[${serverId}] Error in file processor:`, error);
    } finally {
      this.queuedFiles = [];
      this.isRunning = false;
    }
  }

  /**
   * Check if any server is currently processing files globally
   * This prevents multiple processing instances from running simultaneously
   */
  private async checkGlobalProcessingStatus(): Promise<boolean> {
    try {
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      // Check if ANY files are currently being processed by any server
      const result = await db.execute(sql`
        SELECT COUNT(*) as processing_count
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'processing'
      `);
      
      const processingCount = parseInt(result.rows[0]?.processing_count || '0');
      return processingCount > 0;
    } catch (error) {
      console.error('Error checking global processing status:', error);
      // On error, assume processing is happening to be safe
      return true;
    }
  }

  /**
   * Atomically claim a file for processing using database-level locking
   * Returns true if successfully claimed, false if already claimed by another server
   */
  private async claimFileForProcessing(fileId: string, filename?: string, attemptNumber: number = 1): Promise<boolean> {
    const serverId = getCachedServerId();
    const currentTime = new Date();
    
    try {
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploader_uploads');
      
      // Atomic update: only set processing status if it's not already processing
      const result = await db.execute(sql`
        UPDATE ${sql.identifier(uploadsTableName)}
        SET 
          processing_status = 'processing',
          processing_at = ${currentTime.toISOString()},
          processing_server_id = ${serverId}
        WHERE id = ${fileId}
          AND upload_status = 'uploaded'
          AND processing_status = 'pending'
          AND (processing_server_id IS NULL OR processing_server_id = '')
        RETURNING id
      `);
      
      const claimed = result.rows.length > 0;
      
      if (claimed) {
        const claimContext = FileTaggedLogger.createContext({ id: fileId, filename: filename || fileId }, 6, 'CLAIM-SUCCESS');
        FileTaggedLogger.success(claimContext, `File claimed for processing (attempt ${attemptNumber})`, { serverId, attemptNumber });
        console.log(`[${serverId}] Successfully claimed file ${fileId} for processing`);
      } else {
        const claimContext = FileTaggedLogger.createContext({ id: fileId, filename: filename || fileId }, 6, 'CLAIM-FAILED');
        FileTaggedLogger.warn(claimContext, `File claim failed - likely already processing (attempt ${attemptNumber})`, { serverId, attemptNumber, reason: 'concurrency_conflict' });
      }
      
      return claimed;
    } catch (error) {
      const errorContext = FileTaggedLogger.createContext({ id: fileId, filename: filename || fileId }, 6, 'CLAIM-ERROR');
      FileTaggedLogger.error(errorContext, `Database error during file claim (attempt ${attemptNumber})`, error);
      console.error(`[${serverId}] Error claiming file ${fileId}:`, error);
      return false;
    }
  }

  /**
   * Mark a file as failed in the database
   */
  private async markFileAsFailed(fileId: string, errorMessage: string): Promise<void> {
    const serverId = getCachedServerId();
    
    try {
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      await db.execute(sql`
        UPDATE ${sql.identifier(uploadsTableName)}
        SET 
          processing_status = 'failed',
          processing_completed_at = ${new Date().toISOString()},
          processing_errors = ${errorMessage}
        WHERE id = ${fileId}
      `);
      
      console.log(`[${serverId}] Marked file ${fileId} as failed`);
    } catch (error) {
      console.error(`[${serverId}] Error marking file ${fileId} as failed:`, error);
    }
  }
  
  /**
   * Pause the file processor service
   */
  pause(): void {
    this.isPaused = true;
    console.log("File processor service paused");
  }

  /**
   * Resume the file processor service
   */
  resume(): void {
    this.isPaused = false;
    console.log("File processor service resumed");
  }

  /**
   * Set currently processing file information
   */
  setCurrentlyProcessingFile(fileId: string, filename: string, fileType: string): void {
    this.currentlyProcessingFile = {
      id: fileId,
      filename,
      fileType,
      startTime: new Date(),
      transactionsProcessed: 0,
      totalTransactions: undefined,
      progress: 0
    };
  }

  /**
   * Clear currently processing file information
   */
  clearCurrentlyProcessingFile(): void {
    this.currentlyProcessingFile = null;
  }

  /**
   * Stop the file processor service
   */
  stop(): void {
    if (this.processingJob) {
      schedule.cancelJob(this.jobName);
      this.processingJob = null;
      console.log("File processor service stopped");
    }
  }
}

export const fileProcessorService = new FileProcessorService();