import { Client } from '@replit/object-storage';

export class ReplitStorageService {
  private static client: Client | null = null;
  private static bucketName = 'mms-uploader-files';

  private static getClient(): Client {
    if (!this.client) {
      // Replit Object Storage automatically handles authentication in Replit environment
      this.client = new Client();
    }
    return this.client;
  }

  static isConfigured(): boolean {
    try {
      // In Replit environment, object storage is always available
      return true;
    } catch (error) {
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
      await client.uploadFromBytes(key, fileBuffer, {
        contentType: contentType || 'application/octet-stream'
      });

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
      const content = await client.downloadAsBytes(key);
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
      return await client.exists(key);
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
      const objects = await client.list({ prefix });
      return objects.map(obj => obj.name);
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