import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { db } from "../db";
import { s3BackupService } from "./s3_backup_service";
import { loadS3Config } from "./s3_config";
import { backupHistory, type InsertBackupHistory } from "@shared/schema";
import { eq } from "drizzle-orm";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Backup directory path
const BACKUP_DIR = path.join(process.cwd(), "server", "backups");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * BackupManager handles creating, downloading, and managing backups
 */
export class BackupManager {
  
  /**
   * Create a backup of the database
   * @param notes Optional notes about the backup
   * @returns Backup record information
   */
  public async createBackup(notes?: string): Promise<any> {
    try {
      // Generate a unique backup ID based on timestamp
      const backupId = Date.now().toString();
      const fileName = `backup_${backupId}.json`;
      const filePath = path.join(BACKUP_DIR, fileName);
      
      // Get all data to back up
      const merchants = await db.query.merchants.findMany();
      const transactions = await db.query.transactions.findMany();
      const uploadedFiles = await db.query.uploadedFiles.findMany();
      
      // Create backup data object
      const backupData = {
        merchants,
        transactions,
        uploadedFiles,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
      
      // Write to local file
      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
      
      // Get file size
      const stats = fs.statSync(filePath);
      const fileSizeInBytes = stats.size;
      
      // Get table counts for metadata
      const tableData = {
        merchants: merchants.length,
        transactions: transactions.length,
        uploadedFiles: uploadedFiles.length
      };
      
      // Determine if we should use S3
      const s3Config = loadS3Config();
      let storageType = "local";
      let s3Bucket = null;
      let s3Key = null;
      
      // If S3 is enabled, upload backup to S3
      if (s3Config.enabled && s3BackupService.isAvailable()) {
        try {
          const s3Path = `backups/${fileName}`;
          const s3Result = await s3BackupService.uploadBackup(filePath, s3Path);
          
          storageType = "s3";
          s3Bucket = s3Result.bucket;
          s3Key = s3Result.key;
          
          // Keep the local copy as well for now
        } catch (s3Error) {
          console.error("Error uploading to S3, falling back to local storage:", s3Error);
          // Continue with local backup only
        }
      }
      
      // Record the backup in the database
      const backupRecord: InsertBackupHistory = {
        id: backupId,
        fileName: fileName,
        filePath: filePath,
        timestamp: new Date(),
        size: fileSizeInBytes,
        tables: tableData,
        notes: notes || null,
        downloaded: false,
        deleted: false,
        storageType,
        s3Bucket,
        s3Key
      };
      
      const [insertedRecord] = await db.insert(backupHistory).values(backupRecord).returning();
      
      return insertedRecord;
    } catch (error) {
      console.error("Error creating backup:", error);
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Get a list of all backups
   */
  public async getBackups(): Promise<any[]> {
    try {
      return await db.query.backupHistory.findMany({
        where: (backup, { eq }) => eq(backup.deleted, false),
        orderBy: (backup, { desc }) => [desc(backup.timestamp)]
      });
    } catch (error) {
      console.error("Error getting backups:", error);
      throw new Error(`Failed to get backups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Download a backup from S3 if needed and return the local file path
   */
  public async getBackupFilePath(backupId: string): Promise<string> {
    try {
      const [backup] = await db.select().from(backupHistory).where(
        eq(backupHistory.id, backupId)
      );
      
      if (!backup) {
        throw new Error(`Backup with ID ${backupId} not found`);
      }
      
      // If this is an S3 backup but we don't have a local copy, download it
      if (backup.storageType === "s3" && backup.s3Bucket && backup.s3Key) {
        // Check if the local file exists
        if (!fs.existsSync(backup.filePath)) {
          // Download from S3
          await s3BackupService.downloadBackup(backup.s3Key, backup.filePath);
        }
      }
      
      // Return the local file path
      return backup.filePath;
    } catch (error) {
      console.error(`Error getting backup ${backupId}:`, error);
      throw new Error(`Failed to get backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Mark a backup as downloaded
   */
  public async markBackupAsDownloaded(backupId: string): Promise<void> {
    try {
      await db.update(backupHistory)
        .set({ downloaded: true })
        .where(eq(backupHistory.id, backupId));
    } catch (error) {
      console.error("Error marking backup as downloaded:", error);
      throw new Error(`Failed to mark backup as downloaded: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Delete a backup
   */
  public async deleteBackup(backupId: string): Promise<void> {
    try {
      const [backup] = await db.select().from(backupHistory).where(
        eq(backupHistory.id, backupId)
      );
      
      if (!backup) {
        throw new Error(`Backup with ID ${backupId} not found`);
      }
      
      // If this is an S3 backup, delete it from S3
      if (backup.storageType === "s3" && backup.s3Bucket && backup.s3Key) {
        try {
          await s3BackupService.deleteBackup(backup.s3Key);
        } catch (s3Error) {
          console.error(`Error deleting backup from S3: ${s3Error}`);
          // Continue with local deletion
        }
      }
      
      // Delete local file if it exists
      if (fs.existsSync(backup.filePath)) {
        fs.unlinkSync(backup.filePath);
      }
      
      // Mark as deleted in the database
      await db.update(backupHistory)
        .set({ deleted: true })
        .where(eq(backupHistory.id, backupId));
    } catch (error) {
      console.error("Error deleting backup:", error);
      throw new Error(`Failed to delete backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export a singleton instance
export const backupManager = new BackupManager();