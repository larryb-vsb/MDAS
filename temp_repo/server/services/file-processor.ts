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
}

/**
 * Background file processor service that periodically checks for unprocessed files and processes them
 */
class FileProcessorService {
  private processingJob: schedule.Job | null = null;
  private isRunning = false;
  private jobName = 'file-processor';
  private lastRunTime: Date | null = null;
  private queuedFiles: any[] = [];
  private processingErrors: Record<string, string> = {};
  private processedFileCount = 0;
  
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
    return {
      isRunning: this.isRunning,
      nextScheduledRun: this.processingJob?.nextInvocation() || null,
      lastRunTime: this.lastRunTime,
      queuedFiles: this.queuedFiles,
      processingErrors: this.processingErrors,
      processedFileCount: this.processedFileCount
    };
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
    // Skip if already processing files
    if (this.isRunning) {
      console.log("File processor is already running, skipping this run");
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