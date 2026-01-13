// S3 Service for Object-Based File Upload
// Handles secure file upload to AWS S3 with Neon database metadata storage

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import crypto from 'crypto';

// S3 Configuration
const S3_BUCKET = process.env.AWS_S3_BUCKET || 'mms-uploader-files';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// Initialize S3 Client
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: S3_ACCESS_KEY && S3_SECRET_KEY ? {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  } : undefined,
});

export interface S3UploadResult {
  bucket: string;
  key: string;
  url: string;
  etag: string;
  size: number;
}

export interface PresignedUrlResult {
  uploadUrl: string;
  key: string;
  bucket: string;
}

export class S3Service {
  
  /**
   * Generate a unique S3 key for file storage
   */
  static generateS3Key(filename: string, uploadId: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const fileExtension = filename.split('.').pop();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `mms-uploads/${timestamp}/${uploadId}/${safeFilename}`;
  }

  /**
   * Upload file buffer directly to S3
   */
  static async uploadFile(
    fileBuffer: Buffer, 
    filename: string, 
    uploadId: string,
    contentType?: string
  ): Promise<S3UploadResult> {
    const key = this.generateS3Key(filename, uploadId);
    
    console.log(`[S3-UPLOAD] Starting upload: ${filename} (${fileBuffer.length} bytes) to s3://${S3_BUCKET}/${key}`);
    
    try {
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: S3_BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType || 'application/octet-stream',
          Metadata: {
            'original-filename': filename,
            'upload-id': uploadId,
            'upload-timestamp': new Date().toISOString(),
          }
        },
      });

      const result = await upload.done();
      
      console.log(`[S3-UPLOAD] Upload completed: ${filename} -> ${result.Location}`);
      
      return {
        bucket: S3_BUCKET,
        key: key,
        url: result.Location || `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`,
        etag: result.ETag?.replace(/"/g, '') || '',
        size: fileBuffer.length
      };
      
    } catch (error) {
      console.error(`[S3-UPLOAD] Upload failed for ${filename}:`, error);
      throw new Error(`S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate presigned URL for direct browser upload
   */
  static async generatePresignedUploadUrl(
    filename: string, 
    uploadId: string,
    contentType?: string,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<PresignedUrlResult> {
    const key = this.generateS3Key(filename, uploadId);
    
    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
        Metadata: {
          'original-filename': filename,
          'upload-id': uploadId,
          'upload-timestamp': new Date().toISOString(),
        }
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
      
      console.log(`[S3-PRESIGNED] Generated upload URL for ${filename}: ${key}`);
      
      return {
        uploadUrl,
        key,
        bucket: S3_BUCKET
      };
      
    } catch (error) {
      console.error(`[S3-PRESIGNED] Failed to generate presigned URL for ${filename}:`, error);
      throw new Error(`Presigned URL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve file content from S3
   */
  static async getFileContent(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      const response = await s3Client.send(command);
      
      if (!response.Body) {
        throw new Error('No file content returned from S3');
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const stream = response.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const fileBuffer = Buffer.concat(chunks);
      console.log(`[S3-DOWNLOAD] Retrieved file: ${key} (${fileBuffer.length} bytes)`);
      
      return fileBuffer;
      
    } catch (error) {
      console.error(`[S3-DOWNLOAD] Failed to retrieve file ${key}:`, error);
      throw new Error(`S3 download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete file from S3
   */
  static async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      });

      await s3Client.send(command);
      console.log(`[S3-DELETE] Deleted file: ${key}`);
      
    } catch (error) {
      console.error(`[S3-DELETE] Failed to delete file ${key}:`, error);
      throw new Error(`S3 deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if S3 is properly configured
   */
  static isConfigured(): boolean {
    return !!(S3_ACCESS_KEY && S3_SECRET_KEY && S3_BUCKET);
  }

  /**
   * Get S3 configuration status
   */
  static getConfigStatus() {
    return {
      configured: this.isConfigured(),
      bucket: S3_BUCKET,
      region: S3_REGION,
      hasCredentials: !!(S3_ACCESS_KEY && S3_SECRET_KEY)
    };
  }
}

export default S3Service;