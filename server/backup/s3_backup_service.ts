import { s3Service } from "./s3_service";
import path from "path";

/**
 * S3BackupService provides specialized functions for backup operations using S3
 */
export class S3BackupService {
  /**
   * Check if S3 service is available and properly configured
   */
  public isAvailable(): boolean {
    const config = s3Service.getConfig();
    return !!(config?.enabled && config.bucket && 
      ((config.accessKeyId && config.secretAccessKey) || config.useEnvCredentials));
  }
  
  /**
   * Upload a backup file to S3
   * @param localFilePath Path to the local backup file
   * @param s3Path Desired path/key in S3
   * @returns Upload result with bucket and key
   */
  public async uploadBackup(localFilePath: string, s3Path: string): Promise<{ bucket: string; key: string; url?: string }> {
    const result = await s3Service.uploadFile(localFilePath, s3Path);
    
    if (!result.success) {
      throw new Error(result.error || "Failed to upload backup to S3");
    }
    
    const config = s3Service.getConfig();
    
    if (!config || !config.bucket) {
      throw new Error("S3 configuration is missing bucket");
    }
    
    return {
      bucket: config.bucket,
      key: s3Path,
      url: result.url
    };
  }
  
  /**
   * Download a backup file from S3
   * @param s3Key S3 key of the backup file
   * @param localFilePath Destination path for the downloaded file
   */
  public async downloadBackup(s3Key: string, localFilePath: string): Promise<void> {
    const result = await s3Service.downloadFile(s3Key, localFilePath);
    
    if (!result.success) {
      throw new Error(result.error || "Failed to download backup from S3");
    }
  }
  
  /**
   * Delete a backup file from S3
   * @param s3Key S3 key of the backup file to delete
   */
  public async deleteBackup(s3Key: string): Promise<void> {
    const result = await s3Service.deleteFile(s3Key);
    
    if (!result.success) {
      throw new Error(result.error || "Failed to delete backup from S3");
    }
  }
}

// Export a singleton instance
export const s3BackupService = new S3BackupService();