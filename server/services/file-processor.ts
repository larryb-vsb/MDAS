import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { storage } from "../storage";
import schedule from "node-schedule";

/**
 * Background file processor service that periodically checks for unprocessed files and processes them
 */
class FileProcessorService {
  private processingJob: schedule.Job | null = null;
  private isRunning = false;
  private jobName = 'file-processor';
  
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
      
      // Find all unprocessed files
      const unprocessedFiles = await db.select()
        .from(uploadedFiles)
        .where(
          and(
            eq(uploadedFiles.processed, false),
            eq(uploadedFiles.deleted, false),
            isNull(uploadedFiles.processingErrors)
          )
        );
      
      if (unprocessedFiles.length === 0) {
        // No files to process
        return;
      }
      
      console.log(`Found ${unprocessedFiles.length} unprocessed files to process`);
      
      // Process each file
      const fileIds = unprocessedFiles.map(file => file.id);
      
      try {
        await storage.combineAndProcessUploads(fileIds);
        console.log(`Successfully processed ${fileIds.length} files`);
      } catch (error) {
        console.error("Error processing files:", error);
      }
      
    } catch (error) {
      console.error("Error in file processor:", error);
    } finally {
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