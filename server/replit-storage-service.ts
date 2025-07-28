import { Client } from '@replit/object-storage';

export class ReplitStorageService {
  private static client: Client | null = null;
  private static bucketName = 'mms-uploader-files'; // For reference/logging only

  private static getClient(): Client {
    if (!this.client) {
      try {
        // Try to get bucket ID from environment or use default
        const bucketId = process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
        
        if (bucketId) {
          console.log(`[REPLIT-STORAGE] Initializing with bucket ID: ${bucketId}`);
          this.client = new Client({ bucket_id: bucketId });
        } else {
          console.log('[REPLIT-STORAGE] No bucket ID found, using default configuration');
          this.client = new Client();
        }
        
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
    const environment = process.env.NODE_ENV || 'development';
    const folderPrefix = environment === 'production' ? 'prod-uploader' : 'dev-uploader';
    
    return {
      available: this.isConfigured(),
      service: 'Replit Object Storage',
      bucket: 'default-replit-bucket',
      environment: environment,
      folderPrefix: folderPrefix
    };
  }

  // Generate storage key for uploads with environment-aware folder structure
  static generateUploadKey(filename: string, uploadId: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const environment = process.env.NODE_ENV || 'development';
    
    // Create environment-specific folder structure
    if (environment === 'production') {
      return `prod-uploader/${timestamp}/${uploadId}/${filename}`;
    } else {
      return `dev-uploader/${timestamp}/${uploadId}/${filename}`;
    }
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
    const key = this.generateUploadKey(originalFilename, uploadId);
    
    try {
      // Upload the file buffer
      const result = await client.uploadFromBytes(key, fileBuffer);
      
      if (!result.ok) {
        throw new Error(`Upload failed: ${result.error.message}`);
      }

      console.log(`[REPLIT-STORAGE] Uploaded file: ${key} (${fileBuffer.length} bytes)`);

      return {
        key,
        bucket: 'default-replit-bucket',
        url: `replit-object-storage://default/${key}`,
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

  // List files with optional prefix filter (environment-aware)
  static async listFiles(prefix?: string): Promise<string[]> {
    const client = this.getClient();
    
    try {
      // If no prefix provided, use environment-specific prefix
      let searchPrefix = prefix;
      if (!searchPrefix) {
        const environment = process.env.NODE_ENV || 'development';
        searchPrefix = environment === 'production' ? 'prod-uploader/' : 'dev-uploader/';
      }
      
      console.log(`[REPLIT-STORAGE] Listing files with prefix: ${searchPrefix}`);
      
      const result = await client.list({ prefix: searchPrefix });
      
      if (!result.ok) {
        throw new Error(`List failed: ${result.error.message}`);
      }
      
      const fileKeys = result.value.map((obj: any) => obj.name);
      console.log(`[REPLIT-STORAGE] Found ${fileKeys.length} files in ${searchPrefix}`);
      return fileKeys;
    } catch (error) {
      console.error('[REPLIT-STORAGE] List error:', error);
      throw new Error(`Failed to list files from Replit Object Storage: ${error}`);
    }
  }

  /**
   * Get file content from Replit Object Storage
   * @param key - Storage key/path of the file to read
   * @returns Promise<string> - File content as string
   */
  static async getFileContent(key: string): Promise<string> {
    try {
      const client = this.getClient();
      console.log(`[REPLIT-STORAGE] Reading file content: ${key}`);
      
      const result = await client.read(key);
      
      if (result.ok) {
        const content = result.value.toString('utf8');
        console.log(`[REPLIT-STORAGE] File content read successfully: ${key} (${content.length} chars)`);
        return content;
      } else {
        console.error('[REPLIT-STORAGE] Read failed:', result.error);
        throw new Error(`Failed to read file ${key}: ${result.error}`);
      }
    } catch (error) {
      console.error('[REPLIT-STORAGE] Read error:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Replit Object Storage
   * @param key - Storage key/path of the file to delete
   * @returns Promise<boolean> - Success status
   */
  static async deleteFile(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      console.log(`[REPLIT-STORAGE] Deleting file: ${key}`);
      
      const result = await client.delete(key);
      
      if (result.ok) {
        console.log(`[REPLIT-STORAGE] File deleted successfully: ${key}`);
        return true;
      } else {
        console.error('[REPLIT-STORAGE] Delete failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[REPLIT-STORAGE] Delete error:', error);
      return false;
    }
  }

}