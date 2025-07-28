
// Replit Object Storage Service for MMS Uploader
// Handles secure file upload to Replit Object Storage with Neon database metadata storage

import { Client } from '@replit/object-storage';
import crypto from 'crypto';

// Initialize Replit Object Storage Client
const replitClient = new Client();

export interface ReplitUploadResult {
  key: string;
  url: string;
  size: number;
}

export class ReplitStorageService {
  
  /**
   * Generate a unique key for file storage
   */
  static generateStorageKey(filename: string, uploadId: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `mms-uploads/${timestamp}/${uploadId}/${safeFilename}`;
  }

  /**
   * Upload file buffer to Replit Object Storage
   */
  static async uploadFile(
    fileBuffer: Buffer, 
    filename: string, 
    uploadId: string,
    contentType?: string
  ): Promise<ReplitUploadResult> {
    const key = this.generateStorageKey(filename, uploadId);
    
    console.log(`[REPLIT-UPLOAD] Starting upload: ${filename} (${fileBuffer.length} bytes) to ${key}`);
    
    try {
      // Convert buffer to base64 for upload
      const base64Content = fileBuffer.toString('base64');
      
      const { ok, error } = await replitClient.uploadFromText(key, base64Content);
      
      if (!ok) {
        throw new Error(`Upload failed: ${error}`);
      }
      
      console.log(`[REPLIT-UPLOAD] Upload completed: ${filename} -> ${key}`);
      
      return {
        key: key,
        url: `replit-storage://${key}`,
        size: fileBuffer.length
      };
      
    } catch (error) {
      console.error(`[REPLIT-UPLOAD] Upload failed for ${filename}:`, error);
      throw new Error(`Replit storage upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve file content from Replit Object Storage
   */
  static async getFileContent(key: string): Promise<Buffer> {
    try {
      const { ok, value, error } = await replitClient.downloadAsText(key);
      
      if (!ok || !value) {
        throw new Error(`Download failed: ${error || 'No content returned'}`);
      }

      // Convert base64 back to buffer
      const fileBuffer = Buffer.from(value, 'base64');
      console.log(`[REPLIT-DOWNLOAD] Retrieved file: ${key} (${fileBuffer.length} bytes)`);
      
      return fileBuffer;
      
    } catch (error) {
      console.error(`[REPLIT-DOWNLOAD] Failed to retrieve file ${key}:`, error);
      throw new Error(`Replit storage download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete file from Replit Object Storage
   */
  static async deleteFile(key: string): Promise<void> {
    try {
      const { ok, error } = await replitClient.delete(key);
      
      if (!ok) {
        throw new Error(`Delete failed: ${error}`);
      }
      
      console.log(`[REPLIT-DELETE] Deleted file: ${key}`);
      
    } catch (error) {
      console.error(`[REPLIT-DELETE] Failed to delete file ${key}:`, error);
      throw new Error(`Replit storage deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all files in storage
   */
  static async listFiles(): Promise<string[]> {
    try {
      const { ok, value, error } = await replitClient.list();
      
      if (!ok || !value) {
        throw new Error(`List failed: ${error || 'No files returned'}`);
      }
      
      return value.map(obj => obj.name);
      
    } catch (error) {
      console.error(`[REPLIT-LIST] Failed to list files:`, error);
      throw new Error(`Replit storage list failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if Replit Object Storage is available
   */
  static isConfigured(): boolean {
    return true; // Replit Object Storage is always available in Replit environment
  }

  /**
   * Get storage configuration status
   */
  static getConfigStatus() {
    return {
      configured: true,
      provider: 'Replit Object Storage',
      available: true
    };
  }
}

export default ReplitStorageService;
