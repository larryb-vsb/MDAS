import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { storage } from "../storage";
import schedule from "node-schedule";
import { getCachedServerId } from "../utils/server-id";
import { getTableName } from "../table-config";
import { systemLogger } from '../system-logger';

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
   * Get all unprocessed files from the database for the current environment
   * Uses database-level concurrency control to prevent multiple nodes from processing the same files
   */
  async fetchUnprocessedFiles(): Promise<any[]> {
    const currentEnvironment = process.env.NODE_ENV || 'production';
    const serverId = getCachedServerId();
    
    try {
      // Import table-config for environment-specific table names
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      console.log(`[FILE PROCESSOR] Using table: ${uploadsTableName} for environment: ${currentEnvironment}, server: ${serverId}`);
      
      // Database-level concurrency control: only fetch files that are NOT currently being processed
      // This prevents multiple nodes from picking up the same files
      const result = await db.execute(sql`
        SELECT 
          id,
          original_filename,
          storage_path,
          file_type,
          uploaded_at,
          processed,
          processing_errors,
          deleted,
          processing_status,
          processing_started_at,
          processing_server_id
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'queued'
          AND deleted = false
        ORDER BY 
          CASE 
            WHEN file_type = 'tddf' THEN 1 
            ELSE 2 
          END,
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
      console.log(`[${serverId}] File processor is paused, skipping this run`);
      return;
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
      
      // Process files one by one with atomic database locking
      for (const file of unprocessedFiles) {
        try {
          // Atomic database lock: try to claim this file for processing
          const claimed = await this.claimFileForProcessing(file.id);
          if (!claimed) {
            console.log(`[${serverId}] File ${file.originalFilename} already claimed by another server, skipping`);
            continue;
          }
          
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
          
          console.log(`✅ [${serverId}] COMPLETED: ${file.originalFilename} in ${processingTimeSec} seconds`);
          this.processedFileCount += 1;
          
          // Clear currently processing file
          this.currentlyProcessingFile = null;
          
        } catch (error) {
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
  private async claimFileForProcessing(fileId: string): Promise<boolean> {
    const serverId = getCachedServerId();
    const currentTime = new Date();
    
    try {
      const { getTableName } = await import("../table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      // Atomic update: only set processing status if it's not already processing
      const result = await db.execute(sql`
        UPDATE ${sql.identifier(uploadsTableName)}
        SET 
          processing_status = 'processing',
          processing_started_at = ${currentTime.toISOString()},
          processing_server_id = ${serverId}
        WHERE id = ${fileId}
          AND (processing_status IS NULL OR processing_status != 'processing')
        RETURNING id
      `);
      
      const claimed = result.rows.length > 0;
      if (claimed) {
        console.log(`[${serverId}] Successfully claimed file ${fileId} for processing`);
      }
      
      return claimed;
    } catch (error) {
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