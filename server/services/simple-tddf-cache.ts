/**
 * Simple TDDF Cache Service
 * Focused solution for large file pagination issues
 */

import { pool } from '../db';

interface SimpleCacheRecord {
  uploadId: string;
  lineNumber: number;
  recordType: string;
  recordData: any;
  totalRecords: number;
}

export class SimpleTddfCache {
  private getEnvironmentPrefix(): string {
    return process.env.NODE_ENV === 'production' ? '' : 'dev_';
  }

  private getCacheTableName(): string {
    return `${this.getEnvironmentPrefix()}simple_tddf_cache`;
  }

  /**
   * Ensure cache table exists
   */
  async ensureCacheTable(): Promise<void> {
    const tableName = this.getCacheTableName();
    
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          upload_id VARCHAR(255) NOT NULL,
          line_number INTEGER NOT NULL,
          record_type VARCHAR(10) NOT NULL,
          record_data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_upload_id ON ${tableName} (upload_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_line ON ${tableName} (upload_id, line_number)`);
      
      console.log(`[SIMPLE-CACHE] Table ${tableName} ensured`);
    } catch (error) {
      console.error('[SIMPLE-CACHE] Error creating table:', error);
    }
  }

  /**
   * Check if cache exists for upload
   */
  async isCacheBuilt(uploadId: string): Promise<boolean> {
    const tableName = this.getCacheTableName();
    
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count FROM ${tableName}
        WHERE upload_id = $1
      `, [uploadId]);
      
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('[SIMPLE-CACHE] Error checking cache:', error);
      return false;
    }
  }

  /**
   * Build cache for upload
   */
  async buildCache(uploadId: string, filename: string): Promise<{ success: boolean; totalRecords: number; error?: string }> {
    console.log(`[SIMPLE-CACHE] Building cache for ${uploadId}`);
    
    try {
      await this.ensureCacheTable();
      
      // Get storage service to read file
      const { ReplitStorageService } = await import('../replit-storage-service');
      const storageService = new ReplitStorageService();
      
      const fileContent = await storageService.readFileContent(uploadId, filename);
      if (!fileContent) {
        throw new Error('Failed to read file content');
      }

      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      console.log(`[SIMPLE-CACHE] Processing ${lines.length} lines`);

      const tableName = this.getCacheTableName();
      
      // Clear existing cache
      await pool.query(`DELETE FROM ${tableName} WHERE upload_id = $1`, [uploadId]);

      // Process in batches
      const batchSize = 500;
      let totalRecords = 0;

      for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, Math.min(i + batchSize, lines.length));
        const values = [];
        const params = [];
        
        for (let j = 0; j < batch.length; j++) {
          const lineIndex = i + j;
          const line = batch[j];
          const lineNumber = lineIndex + 1;
          
          // Extract record type
          const recordType = this.extractRecordType(line);
          
          // Create basic record data
          const recordData = {
            rawLine: line,
            length: line.length,
            recordType,
            lineNumber
          };
          
          const paramIndex = values.length * 4;
          values.push(`($${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
          params.push(uploadId, lineNumber, recordType, JSON.stringify(recordData));
          totalRecords++;
        }

        if (values.length > 0) {
          const query = `
            INSERT INTO ${tableName} (upload_id, line_number, record_type, record_data)
            VALUES ${values.join(', ')}
          `;
          
          await pool.query(query, params);
        }

        console.log(`[SIMPLE-CACHE] Processed ${Math.min(i + batchSize, lines.length)}/${lines.length} lines`);
      }

      console.log(`[SIMPLE-CACHE] Cache built successfully: ${totalRecords} records`);
      return { success: true, totalRecords };

    } catch (error) {
      console.error('[SIMPLE-CACHE] Build failed:', error);
      return { success: false, totalRecords: 0, error: error.message };
    }
  }

  /**
   * Get cached data with pagination
   */
  async getCachedData(uploadId: string, limit: number = 50, offset: number = 0): Promise<{
    data: any[];
    total: number;
    pagination: any;
  }> {
    const tableName = this.getCacheTableName();
    
    try {
      // Get total count
      const countResult = await pool.query(`
        SELECT COUNT(*) as total FROM ${tableName}
        WHERE upload_id = $1
      `, [uploadId]);
      
      const total = parseInt(countResult.rows[0].total);
      
      // Get paginated data
      const dataResult = await pool.query(`
        SELECT line_number, record_type, record_data
        FROM ${tableName}
        WHERE upload_id = $1
        ORDER BY line_number ASC
        LIMIT $2 OFFSET $3
      `, [uploadId, limit, offset]);
      
      const data = dataResult.rows.map(row => ({
        id: row.line_number,
        upload_id: uploadId,
        filename: '',
        record_type: row.record_type,
        line_number: row.line_number,
        raw_line: JSON.parse(row.record_data).rawLine,
        extracted_fields: JSON.parse(row.record_data),
        record_identifier: '',
        created_at: new Date().toISOString()
      }));

      return {
        data,
        total,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };

    } catch (error) {
      console.error('[SIMPLE-CACHE] Error getting cached data:', error);
      return { data: [], total: 0, pagination: { total: 0, limit, offset, hasMore: false } };
    }
  }

  /**
   * Extract record type from line
   */
  private extractRecordType(line: string): string {
    try {
      // Search for known patterns in first 30 characters
      const searchArea = line.substring(0, 30);
      const patterns = ['BH', 'DT', 'P1', 'P2', 'E1', 'G2', 'DR'];
      
      for (const pattern of patterns) {
        if (searchArea.includes(pattern)) {
          return pattern;
        }
      }
      
      // Fallback to positions 18-19
      if (line.length >= 20) {
        return line.substring(18, 20);
      }
      
      return 'UNK';
    } catch (error) {
      return 'UNK';
    }
  }
}