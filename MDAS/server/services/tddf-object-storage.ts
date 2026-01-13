import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * TDDF Object Storage Service
 * Manages raw line data storage in object storage to reduce database size
 */
export class TddfObjectStorageService {
  private readonly OBJECT_STORAGE_PREFIX = 'tddf-raw-lines';
  
  constructor() {}
  
  /**
   * Store raw lines for a TDDF file in object storage
   * @param filename Original TDDF filename
   * @param rawLines Array of raw line strings
   * @returns Object storage path reference
   */
  async storeRawLines(filename: string, rawLines: string[]): Promise<string> {
    const storageId = randomUUID();
    const objectPath = `${this.OBJECT_STORAGE_PREFIX}/${filename}/${storageId}.txt`;
    
    // Combine all raw lines into a single text blob
    const rawData = rawLines.join('\n');
    
    // For now, store in tmp directory until object storage is fully configured
    const tmpPath = path.join(process.cwd(), 'tmp_raw_lines');
    await fs.mkdir(tmpPath, { recursive: true });
    
    const filePath = path.join(tmpPath, `${storageId}.txt`);
    await fs.writeFile(filePath, rawData, 'utf-8');
    
    console.log(`[TDDF-OBJECT-STORAGE] Stored ${rawLines.length} raw lines for ${filename} at ${objectPath}`);
    return objectPath;
  }
  
  /**
   * Retrieve raw lines from object storage
   * @param objectPath Object storage path reference
   * @returns Array of raw line strings
   */
  async getRawLines(objectPath: string): Promise<string[]> {
    try {
      // Extract storage ID from path
      const storageId = objectPath.split('/').pop()?.replace('.txt', '');
      if (!storageId) {
        throw new Error('Invalid object path format');
      }
      
      // For now, read from tmp directory
      const tmpPath = path.join(process.cwd(), 'tmp_raw_lines');
      const filePath = path.join(tmpPath, `${storageId}.txt`);
      
      const rawData = await fs.readFile(filePath, 'utf-8');
      return rawData.split('\n');
    } catch (error) {
      console.error(`[TDDF-OBJECT-STORAGE] Error retrieving raw lines from ${objectPath}:`, error);
      throw error;
    }
  }
  
  /**
   * Get a specific raw line by line number
   * @param objectPath Object storage path reference
   * @param lineNumber 1-based line number
   * @returns Raw line string
   */
  async getRawLine(objectPath: string, lineNumber: number): Promise<string> {
    const rawLines = await this.getRawLines(objectPath);
    if (lineNumber < 1 || lineNumber > rawLines.length) {
      throw new Error(`Line number ${lineNumber} out of range (1-${rawLines.length})`);
    }
    return rawLines[lineNumber - 1];
  }
  
  /**
   * Calculate storage savings by moving raw lines to object storage
   * @param rawLines Array of raw line strings
   * @returns Storage statistics
   */
  calculateStorageSavings(rawLines: string[]): {
    totalRawSize: number;
    avgLineLength: number;
    estimatedDbSavings: string;
  } {
    const totalRawSize = rawLines.reduce((sum, line) => sum + line.length, 0);
    const avgLineLength = totalRawSize / rawLines.length;
    const estimatedDbSavings = this.formatBytes(totalRawSize);
    
    return {
      totalRawSize,
      avgLineLength: Math.round(avgLineLength),
      estimatedDbSavings
    };
  }
  
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export const tddfObjectStorage = new TddfObjectStorageService();