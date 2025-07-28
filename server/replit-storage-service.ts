import { Client } from '@replit/object-storage';

export class ReplitStorageService {
  private static client: Client | null = null;
  private static bucketName = 'mms-uploader-files'; // For reference/logging only

  private static getClient(): Client {
    if (!this.client) {
      // Replit Object Storage uses zero-configuration - no bucket name needed
      try {
        this.client = new Client();
        console.log('[REPLIT-STORAGE] Client initialized successfully');
      } catch (error) {
        console.error('[REPLIT-STORAGE] Client initialization failed:', error);
        throw error;
      }
    }
    return this.client;
  }

  static isConfigured(): boolean {
    try {
      // Test if we can create a client
      this.getClient();
      console.log('[REPLIT-STORAGE] Configuration check passed');
      return true;
    } catch (error) {
      console.error('[REPLIT-STORAGE] Configuration check failed:', error);
      return false;
    }
  }

  static getConfigStatus() {
    return {
      available: this.isConfigured(),
      service: 'Replit Object Storage',
      bucket: this.bucketName
    };
  }

  // Generate storage key for uploads
  static generateUploadKey(filename: string, uploadId: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `uploads/${timestamp}/${uploadId}/${filename}`;
  }

  // Upload file buffer to Replit Object Storage
  static async uploadFile(
    fileBuffer: Buffer, 
    originalFilename: string, 
    uploadId: string, 
    contentType?: string
  ): Promise<{
    key: string;
    bucket: string;
    url: string;
    etag?: string;
    size: number;
  }> {
    const client = this.getClient();
    const key = `uploads/${uploadId}/${originalFilename}`;
    
    try {
      // Upload the file buffer
      const result = await client.uploadFromBytes(key, fileBuffer);
      
      if (!result.ok) {
        throw new Error(`Upload failed: ${result.error.message}`);
      }

      console.log(`[REPLIT-STORAGE] Uploaded file: ${key} (${fileBuffer.length} bytes)`);

      return {
        key,
        bucket: this.bucketName,
        url: `replit-object-storage://${this.bucketName}/${key}`,
        size: fileBuffer.length
      };
    } catch (error) {
      console.error('[REPLIT-STORAGE] Upload error:', error);
      throw new Error(`Failed to upload to Replit Object Storage: ${error}`);
    }
  }

  // Get file content from Replit Object Storage
  static async getFileContent(key: string): Promise<Buffer> {
    const client = this.getClient();
    
    try {
      const result = await client.downloadAsBytes(key);
      
      if (!result.ok) {
        throw new Error(`Download failed: ${result.error.message}`);
      }
      
      const content = result.value[0]; // Result is [Buffer]
      console.log(`[REPLIT-STORAGE] Retrieved file: ${key} (${content.length} bytes)`);
      return content;
    } catch (error) {
      console.error('[REPLIT-STORAGE] Download error:', error);
      throw new Error(`Failed to retrieve file from Replit Object Storage: ${error}`);
    }
  }

  // Check if file exists
  static async fileExists(key: string): Promise<boolean> {
    const client = this.getClient();
    
    try {
      const result = await client.exists(key);
      
      if (!result.ok) {
        return false;
      }
      
      return result.value;
    } catch (error) {
      console.error('[REPLIT-STORAGE] Exists check error:', error);
      return false;
    }
  }

  // Delete file from Replit Object Storage
  static async deleteFile(key: string): Promise<void> {
    const client = this.getClient();
    
    try {
      await client.delete(key);
      console.log(`[REPLIT-STORAGE] Deleted file: ${key}`);
    } catch (error) {
      console.error('[REPLIT-STORAGE] Delete error:', error);
      throw new Error(`Failed to delete file from Replit Object Storage: ${error}`);
    }
  }

  // List files in a prefix (for debugging/admin purposes)
  static async listFiles(prefix?: string): Promise<string[]> {
    const client = this.getClient();
    
    try {
      const result = await client.list({ prefix });
      
      if (!result.ok) {
        throw new Error(`List failed: ${result.error.message}`);
      }
      
      return result.value.map((obj: any) => obj.name);
    } catch (error) {
      console.error('[REPLIT-STORAGE] List error:', error);
      throw new Error(`Failed to list files from Replit Object Storage: ${error}`);
    }
  }

  // Generate a simple upload key for direct uploads (no presigned URLs needed)
  static generateUploadKey(filename: string, uploadId: string): string {
    return `uploads/${uploadId}/${filename}`;
  }
}