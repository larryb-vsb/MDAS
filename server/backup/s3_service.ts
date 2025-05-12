import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import path from "path";

interface S3Config {
  enabled: boolean;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  useEnvCredentials: boolean;
}

/**
 * S3Service is a utility class for interacting with AWS S3 storage
 */
export class S3Service {
  private s3Client: S3Client | null = null;
  private config: S3Config | null = null;
  
  /**
   * Initialize the S3 service with configuration
   * @param config S3 configuration details
   */
  public async initialize(config: S3Config): Promise<void> {
    this.config = config;
    
    if (!config.enabled) {
      this.s3Client = null;
      return;
    }
    
    try {
      // Create S3 client with credentials or using environment variables
      if (config.useEnvCredentials) {
        // Use environment credentials - will look for AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
        this.s3Client = new S3Client({ region: config.region });
      } else {
        // Use provided credentials
        this.s3Client = new S3Client({
          region: config.region,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
          }
        });
      }
    } catch (error) {
      console.error('Error initializing S3 client:', error);
      throw new Error('Failed to initialize S3 client');
    }
  }
  
  /**
   * Test the S3 connection by performing a simple operation
   * @returns Connection test result
   */
  public async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      if (!this.s3Client) {
        return { success: false, message: 'S3 client not initialized' };
      }
      
      if (!this.config?.bucket) {
        return { success: false, message: 'S3 bucket not specified' };
      }
      
      // Try a simple operation - list objects with a max of 1
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: 'test-connection.txt',
        Body: 'Connection test',
      });
      
      await this.s3Client.send(command);
      
      return { success: true, message: 'Successfully connected to S3' };
    } catch (error: any) {
      console.error('Error testing S3 connection:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to connect to S3'
      };
    }
  }
  
  /**
   * Upload a file to S3 storage
   * @param localFilePath Path to local file
   * @param s3Key Target key for the file in S3
   * @returns Upload result
   */
  public async uploadFile(localFilePath: string, s3Key: string): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      if (!this.s3Client || !this.config?.bucket) {
        return { success: false, error: 'S3 client not initialized or bucket not specified' };
      }
      
      const fileStream = fs.createReadStream(localFilePath);
      
      // Use the Upload utility which handles multipart uploads for large files
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.config.bucket,
          Key: s3Key,
          Body: fileStream,
          ContentType: 'application/json'
        }
      });
      
      await upload.done();
      
      // Return success with a generated URL
      const s3Url = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${s3Key}`;
      return { success: true, url: s3Url };
    } catch (error: any) {
      console.error('Error uploading file to S3:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to upload file to S3'
      };
    }
  }
  
  /**
   * Download a file from S3 to local storage
   * @param s3Key Source key of the file in S3
   * @param localFilePath Target path for the downloaded file
   * @returns Download result
   */
  public async downloadFile(s3Key: string, localFilePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.s3Client || !this.config?.bucket) {
        return { success: false, error: 'S3 client not initialized or bucket not specified' };
      }
      
      // Create directory if it doesn't exist
      const dirPath = path.dirname(localFilePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Get the object from S3
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });
      
      const response = await this.s3Client.send(command);
      
      // Create a write stream and pipe the S3 object body to it
      const writeStream = fs.createWriteStream(localFilePath);
      
      if (response.Body) {
        const responseBodyStream = response.Body as any;
        responseBodyStream.pipe(writeStream);
        
        return new Promise((resolve, reject) => {
          writeStream.on('finish', () => {
            resolve({ success: true });
          });
          
          writeStream.on('error', (err) => {
            reject({ success: false, error: err.message });
          });
        });
      } else {
        return { success: false, error: 'No response body from S3' };
      }
    } catch (error: any) {
      console.error('Error downloading file from S3:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to download file from S3'
      };
    }
  }
  
  /**
   * Delete a file from S3 storage
   * @param s3Key Key of the file to delete
   * @returns Deletion result
   */
  public async deleteFile(s3Key: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.s3Client || !this.config?.bucket) {
        return { success: false, error: 'S3 client not initialized or bucket not specified' };
      }
      
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: s3Key
      });
      
      await this.s3Client.send(command);
      
      return { success: true };
    } catch (error: any) {
      console.error('Error deleting file from S3:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to delete file from S3'
      };
    }
  }
  
  /**
   * Get configuration
   * @returns Current S3 configuration
   */
  public getConfig(): S3Config | null {
    return this.config;
  }
}

// Singleton instance
export const s3Service = new S3Service();