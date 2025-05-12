import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

/**
 * Service for handling S3 backup operations
 */
export class S3BackupService {
  private s3Client: S3Client;
  private bucket: string;
  
  /**
   * Create a new S3 backup service
   * 
   * @param options S3 options including bucket name and region
   */
  constructor(options: {
    bucket?: string,
    region?: string
  }) {
    // Get configuration from options or environment variables
    const region = options.region || process.env.AWS_REGION || "us-east-1";
    this.bucket = options.bucket || process.env.S3_BACKUP_BUCKET || "app-backups";
    
    // Initialize S3 client
    this.s3Client = new S3Client({
      region
    });
  }
  
  /**
   * Upload backup data to S3
   * 
   * @param data The backup data to upload
   * @param filename The filename to use in S3
   * @returns Object with bucket and key information
   */
  async uploadBackup(data: any, filename: string): Promise<{ bucket: string, key: string }> {
    try {
      // Convert data to JSON string
      const jsonData = JSON.stringify(data);
      
      // Create buffer from JSON
      const buffer = Buffer.from(jsonData, "utf8");
      
      // Define the S3 key (path within bucket)
      const key = `backups/${filename}`;
      
      // Create multipart upload for large files
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: "application/json"
        }
      });
      
      // Execute the upload
      await upload.done();
      
      return {
        bucket: this.bucket,
        key
      };
    } catch (error) {
      console.error("Error uploading backup to S3:", error);
      throw error;
    }
  }
  
  /**
   * Download a backup file from S3
   * 
   * @param key The S3 key (path) of the backup
   * @returns The backup data as an object
   */
  async downloadBackup(key: string): Promise<any> {
    try {
      // Get the object from S3
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      });
      
      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new Error(`No body in S3 response for key: ${key}`);
      }
      
      // Convert readable stream to string
      let responseDataString = "";
      for await (const chunk of response.Body as any) {
        responseDataString += chunk.toString();
      }
      
      // Parse JSON string to object
      return JSON.parse(responseDataString);
    } catch (error) {
      console.error(`Error downloading backup from S3 (key: ${key}):`, error);
      throw error;
    }
  }
}