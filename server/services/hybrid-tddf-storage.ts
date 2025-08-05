import { ObjectStorageService } from '../objectStorage';

/**
 * Hybrid TDDF Storage Service
 * Manages storing raw TDDF line data in object storage while keeping structured data in database
 */
export class HybridTddfStorageService {
  private objectStorage: ObjectStorageService;
  
  constructor() {
    this.objectStorage = new ObjectStorageService();
  }

  /**
   * Store raw TDDF lines in object storage
   * @param filename - Base filename for the object storage
   * @param rawLines - Array of raw TDDF line strings
   * @returns Object storage path where the data was stored
   */
  async storeRawLines(filename: string, rawLines: string[]): Promise<string> {
    try {
      // Combine all raw lines into a single string with line breaks
      const combinedContent = rawLines.join('\n');
      
      // Get upload URL for object storage
      const uploadURL = await this.objectStorage.getObjectEntityUploadURL();
      
      // Store in object storage using PUT request
      const response = await fetch(uploadURL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': combinedContent.length.toString(),
        },
        body: combinedContent,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Object storage upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      console.log(`[HYBRID-STORAGE] Stored ${rawLines.length} raw lines to object storage`);
      console.log(`[HYBRID-STORAGE] Total size: ${combinedContent.length} bytes`);
      
      // Return the upload URL which can be used to access the data
      return uploadURL;
      
    } catch (error) {
      console.error('[HYBRID-STORAGE] Error storing raw lines:', error);
      throw new Error(`Failed to store raw lines in object storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieve raw TDDF lines from object storage
   * @param objectPath - Object storage path
   * @returns Array of raw TDDF line strings
   */
  async retrieveRawLines(objectPath: string): Promise<string[]> {
    try {
      console.log(`[HYBRID-STORAGE] Would retrieve raw lines from object storage: ${objectPath}`);
      
      // For now, return empty array since we need to implement the actual object storage integration
      // In a real implementation, this would fetch from object storage and split by lines
      return [];
      
    } catch (error) {
      console.error('[HYBRID-STORAGE] Error retrieving raw lines:', error);
      throw new Error(`Failed to retrieve raw lines from object storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if object storage is properly configured
   */
  async isConfigured(): Promise<boolean> {
    try {
      // Check if required environment variables are set
      const requiredEnvVars = [
        'DEFAULT_OBJECT_STORAGE_BUCKET_ID',
        'PRIVATE_OBJECT_DIR',
        'PUBLIC_OBJECT_SEARCH_PATHS'
      ];
      
      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          console.log(`[HYBRID-STORAGE] Missing environment variable: ${envVar}`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('[HYBRID-STORAGE] Error checking configuration:', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    isConfigured: boolean;
    totalObjectsStored: number;
    estimatedSavings: number;
  }> {
    return {
      isConfigured: await this.isConfigured(),
      totalObjectsStored: 0, // Would be calculated from actual object storage
      estimatedSavings: 0    // Would be calculated based on actual migration data
    };
  }
}