import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import path from "path";
import { Stream } from "stream";
import { loadS3Config, S3Config } from "./s3_config";

/**
 * S3 Storage Service for backups
 */
export class S3BackupService {
  private s3Client: S3Client | null = null;
  private config: S3Config;

  constructor() {
    this.config = loadS3Config();
    this.initializeClient();
  }

  /**
   * Initialize S3 client with current configuration
   */
  private initializeClient(): void {
    // Skip if S3 is not enabled
    if (!this.config.enabled) {
      return;
    }

    try {
      const clientOptions: any = {
        region: this.config.region || 'us-east-1'
      };
      
      // Use custom endpoint if provided (for S3-compatible services)
      if (this.config.endpoint) {
        clientOptions.endpoint = this.config.endpoint;
      }
      
      // Add credentials if not using environment variables
      if (!this.config.useEnvCredentials) {
        if (!this.config.accessKeyId || !this.config.secretAccessKey) {
          console.warn("S3 is enabled but credentials are missing");
          return;
        }
        
        clientOptions.credentials = {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey
        };
      }
      
      this.s3Client = new S3Client(clientOptions);
    } catch (error) {
      console.error("Error initializing S3 client:", error);
      this.s3Client = null;
    }
  }

  /**
   * Check if S3 is configured and available
   */
  public isAvailable(): boolean {
    return this.config.enabled && !!this.s3Client && !!this.config.bucket;
  }

  /**
   * Update S3 configuration
   */
  public updateConfig(config: S3Config): void {
    this.config = config;
    this.initializeClient();
  }

  /**
   * Upload a backup file to S3
   * @param filePath Local file path
   * @param key S3 object key (path in bucket)
   * @returns Object with bucket and key information
   */
  public async uploadBackup(filePath: string, key: string): Promise<{ bucket: string, key: string }> {
    if (!this.isAvailable()) {
      throw new Error("S3 is not properly configured");
    }
    
    try {
      const fileStream = fs.createReadStream(filePath);
      const fileSize = fs.statSync(filePath).size;
      
      // Using Upload from @aws-sdk/lib-storage which handles multipart uploads
      const upload = new Upload({
        client: this.s3Client!,
        params: {
          Bucket: this.config.bucket!,
          Key: key,
          Body: fileStream,
          ContentType: "application/json"
        }
      });

      await upload.done();
      
      return {
        bucket: this.config.bucket!,
        key: key
      };
    } catch (error) {
      console.error("Error uploading backup to S3:", error);
      throw new Error(`Failed to upload backup to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download a backup file from S3
   * @param key S3 object key
   * @param destPath Local destination path
   */
  public async downloadBackup(key: string, destPath: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("S3 is not properly configured");
    }
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket!,
        Key: key
      });
      
      const response = await this.s3Client!.send(command);
      
      // Ensure the destination directory exists
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Write the file
      const writeStream = fs.createWriteStream(destPath);
      
      if (response.Body instanceof Stream) {
        await new Promise((resolve, reject) => {
          const stream = response.Body as Stream;
          stream.pipe(writeStream)
            .on('error', reject)
            .on('finish', resolve);
        });
      } else {
        throw new Error("Invalid response body");
      }
    } catch (error) {
      console.error("Error downloading backup from S3:", error);
      throw new Error(`Failed to download backup from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a backup file from S3
   * @param key S3 object key
   */
  public async deleteBackup(key: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error("S3 is not properly configured");
    }
    
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket!,
        Key: key
      });
      
      await this.s3Client!.send(command);
    } catch (error) {
      console.error("Error deleting backup from S3:", error);
      throw new Error(`Failed to delete backup from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export a singleton instance
export const s3BackupService = new S3BackupService();