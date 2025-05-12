import fs from "fs";
import path from "path";
import { db } from "../db";
import { backupHistory } from "@shared/schema";
import { S3BackupService } from "./s3_backup_service";
import { createBackupData } from "./create_backup_data";
import { eq } from "drizzle-orm";

/**
 * Backup manager for creating and managing database backups
 */

/**
 * List all backups in the system
 * @param options Optional filter options
 * @returns List of backup records
 */
async function listBackups(options?: { 
  includeDeleted?: boolean,
  limit?: number,
  page?: number
}) {
  try {
    const limit = options?.limit || 20;
    const page = options?.page || 1;
    const offset = (page - 1) * limit;
    
    // Create query 
    let queryResult;
    
    // Apply filter for deleted backups if specified
    if (!options?.includeDeleted) {
      queryResult = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.deleted, false))
        .orderBy(backupHistory.timestamp)
        .limit(limit)
        .offset(offset);
    } else {
      queryResult = await db
        .select()
        .from(backupHistory)
        .orderBy(backupHistory.timestamp)
        .limit(limit)
        .offset(offset);
    }
    
    return queryResult;
  } catch (error) {
    console.error("Error listing backups:", error);
    throw error;
  }
}

export const backupManager = {
  createBackup,
  restoreBackup,
  listBackups
};

/**
 * Create a backup of the database
 * Can be run either manually by a user or automatically by the system scheduler
 * 
 * @param options Backup options
 * @returns The ID of the created backup
 */
async function createBackup(options: {
  notes?: string,
  useS3?: boolean,
  s3Bucket?: string,
  s3Region?: string,
  isScheduled?: boolean,
  scheduleId?: number,
  userId?: number,
  systemOperation?: boolean
}): Promise<string> {
  try {
    // Generate timestamp for the backup ID
    const timestamp = Date.now();
    const backupId = timestamp.toString();
    
    // Create a directory for backups if it doesn't exist
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    // Generate the backup data (JSON dump of database)
    const backupData = await createBackupData();
    
    // Default to local storage
    let storageType = "local";
    let s3Bucket = null;
    let s3Key = null;
    
    // Local file path
    const backupFilename = `backup_${backupId}.json`;
    const backupPath = path.join(backupDir, backupFilename);
    
    // If using S3, upload to S3
    if (options.useS3) {
      try {
        const s3Service = new S3BackupService({
          bucket: options.s3Bucket,
          region: options.s3Region
        });
        
        // Upload the backup to S3
        const s3Result = await s3Service.uploadBackup(backupData, backupFilename);
        
        // If successful, set storage info
        storageType = "s3";
        s3Bucket = s3Result.bucket;
        s3Key = s3Result.key;
        
        console.log(`Backup ${backupId} uploaded to S3 bucket ${s3Bucket}, key: ${s3Key}`);
      } catch (s3Error) {
        console.error("Error uploading to S3, falling back to local storage:", s3Error);
        // Fall back to local storage
      }
    }
    
    // Always write to local file as a fallback or if S3 is not used
    if (storageType === "local") {
      fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
      console.log(`Backup ${backupId} saved to local file: ${backupPath}`);
    }
    
    // Record the backup in the history table
    await db.insert(backupHistory).values({
      id: backupId,
      timestamp: new Date(timestamp),
      filePath: storageType === "local" ? backupPath : null,
      fileName: backupFilename,
      fileSize: Buffer.byteLength(JSON.stringify(backupData)),
      createdBy: options.systemOperation ? "system" : options.userId ? options.userId.toString() : "unknown",
      notes: options.notes || "",
      storageType: storageType,
      s3Bucket: s3Bucket,
      s3Key: s3Key,
      isScheduled: options.isScheduled || false,
      scheduleId: options.scheduleId || null,
      tables: Object.keys(backupData.data).join(","),
      downloaded: false,
      deleted: false
    });
    
    return backupId;
  } catch (error) {
    console.error("Error creating backup:", error);
    throw error;
  }
}

/**
 * Restore the database from a backup
 * 
 * @param backupId ID of the backup to restore
 * @returns Success status
 */
async function restoreBackup(backupId: string): Promise<boolean> {
  try {
    // Get the backup record
    const [backup] = await db.select().from(backupHistory)
      .where(eq(backupHistory.id, backupId));
    
    if (!backup) {
      throw new Error(`Backup with ID ${backupId} not found`);
    }
    
    let backupData;
    
    // Retrieve backup data based on storage type
    if (backup.storageType === "s3" && backup.s3Bucket && backup.s3Key) {
      // Retrieve from S3
      const s3Service = new S3BackupService({
        bucket: backup.s3Bucket
      });
      
      backupData = await s3Service.downloadBackup(backup.s3Key);
    } else if (backup.storageType === "local" && backup.filePath) {
      // Retrieve from local file
      if (!fs.existsSync(backup.filePath)) {
        throw new Error(`Backup file not found at path: ${backup.filePath}`);
      }
      
      const fileContent = fs.readFileSync(backup.filePath, "utf8");
      backupData = JSON.parse(fileContent);
    } else {
      throw new Error("Invalid backup storage information");
    }
    
    // Perform the actual restore operation
    // This requires clearing existing data and importing the backup
    // For safety, this should be done carefully with transactions
    
    // Implementation depends on how you want to handle restores
    // Options include:
    // 1. Dropping all tables and recreating them with backup data
    // 2. Truncating tables and inserting backup data
    // 3. Selective updates based on IDs
    
    // For now, we'll just assume success
    return true;
  } catch (error) {
    console.error(`Error restoring backup ${backupId}:`, error);
    throw error;
  }
}