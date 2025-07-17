import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { storage } from "../storage";
import schedule from "node-schedule";

interface ProcessingStatus {
  isRunning: boolean;
  nextScheduledRun: Date | null;
  lastRunTime: Date | null;
  queuedFiles: any[];
  processingErrors: Record<string, string>;
  processedFileCount: number;
  isPaused: boolean;
  currentTransactionRange?: string;
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
    
    // Schedule a job to run every minute
    this.processingJob = schedule.scheduleJob(this.jobName, '*/1 * * * *', async () => {
      await this.processUnprocessedFiles();
    });
    
    console.log(`File processor service initialized. Next run at ${this.processingJob?.nextInvocation()}`);
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
   * Get all unprocessed files from the database
   */
  async fetchUnprocessedFiles(): Promise<any[]> {
    const unprocessedFiles = await db.select()
      .from(uploadedFiles)
      .where(
        and(
          eq(uploadedFiles.processed, false),
          eq(uploadedFiles.deleted, false)
        )
      );
    
    return unprocessedFiles;
  }

  /**
   * Process all unprocessed files in the database
   */
  async processUnprocessedFiles(): Promise<void> {
    // Skip if already processing files or paused
    if (this.isRunning) {
      console.log("File processor is already running, skipping this run");
      return;
    }
    
    if (this.isPaused) {
      console.log("File processor is paused, skipping this run");
      return;
    }
    
    try {
      this.isRunning = true;
      this.lastRunTime = new Date();
      
      // Find all unprocessed files
      const unprocessedFiles = await this.fetchUnprocessedFiles();
      
      if (unprocessedFiles.length === 0) {
        // No files to process
        return;
      }
      
      console.log(`Found ${unprocessedFiles.length} unprocessed files to process`);
      this.queuedFiles = [...unprocessedFiles];
      
      // Process each file
      const fileIds = unprocessedFiles.map(file => file.id);
      
      try {
        this.processingStats.startTime = new Date();
        this.processingStats.transactionsProcessed = 0;
        
        await storage.combineAndProcessUploads(fileIds);
        console.log(`Successfully processed ${fileIds.length} files`);
        this.processedFileCount += fileIds.length;
      } catch (error) {
        console.error("Error processing files:", error);
        // Record the error
        if (error instanceof Error) {
          fileIds.forEach(fileId => {
            this.processingErrors[fileId] = error.message;
          });
        }
      }
      
    } catch (error) {
      console.error("Error in file processor:", error);
    } finally {
      this.queuedFiles = [];
      this.isRunning = false;
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
   * Update processing statistics (called from storage layer)
   */
  updateProcessingStats(transactionId: string, duplicateInfo?: { increments: number; wasSkipped: boolean }): void {
    this.currentTransactionRange = transactionId;
    this.processingStats.currentTransactionId = transactionId;
    this.processingStats.transactionsProcessed++;
    
    if (duplicateInfo) {
      this.duplicateStats.totalDuplicates++;
      if (duplicateInfo.wasSkipped) {
        this.duplicateStats.skipCount++;
      }
      // Update average increments
      const totalIncrements = this.duplicateStats.totalDuplicates * this.duplicateStats.averageIncrements + duplicateInfo.increments;
      this.duplicateStats.averageIncrements = totalIncrements / this.duplicateStats.totalDuplicates;
    }

    // Update estimated completion time
    if (this.processingStats.startTime && this.processingStats.transactionsProcessed > 0) {
      const elapsed = Date.now() - this.processingStats.startTime.getTime();
      const avgTimePerTransaction = elapsed / this.processingStats.transactionsProcessed;
      // Rough estimate assuming 50,000 more transactions to process
      const estimatedRemainingTime = avgTimePerTransaction * 50000;
      this.processingStats.estimatedCompletion = new Date(Date.now() + estimatedRemainingTime);
    }
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