/**
 * TDDF JSONB Pre-Cache Service
 * Handles large file processing with comprehensive caching for viewer performance
 */

import { pool } from '../db';
import { sql } from 'drizzle-orm';

interface TddfJsonbCacheRecord {
  id: string;
  uploadId: string;
  lineNumber: number;
  recordType: string;
  recordData: any;
  batchId?: string;
  transactionId?: string;
  hierarchyLevel: number;
  processingDatetime?: string;
  createdAt: Date;
}

interface CacheBuildResult {
  success: boolean;
  totalRecords: number;
  batchCount: number;
  recordTypes: string[];
  error?: string;
}

export class TddfJsonbCacheService {
  private getEnvironmentPrefix(): string {
    return process.env.NODE_ENV === 'production' ? '' : 'dev_';
  }

  private getCacheTableName(): string {
    return `${this.getEnvironmentPrefix()}tddf_jsonb_cache`;
  }

  private getStatsTableName(): string {
    return `${this.getEnvironmentPrefix()}tddf_jsonb_stats`;
  }

  /**
   * Create cache tables if they don't exist
   */
  async ensureCacheTables(): Promise<void> {
    const cacheTable = this.getCacheTableName();
    const statsTable = this.getStatsTableName();

    try {
      // Create main cache table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${cacheTable} (
          id VARCHAR(255) PRIMARY KEY,
          upload_id VARCHAR(255) NOT NULL,
          line_number INTEGER NOT NULL,
          record_type VARCHAR(10) NOT NULL,
          record_data JSONB NOT NULL,
          batch_id VARCHAR(255),
          transaction_id VARCHAR(255),
          hierarchy_level INTEGER DEFAULT 0,
          processing_datetime TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${cacheTable.replace('dev_', '')}_upload_line ON ${cacheTable} (upload_id, line_number)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${cacheTable.replace('dev_', '')}_upload_type ON ${cacheTable} (upload_id, record_type)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${cacheTable.replace('dev_', '')}_batch ON ${cacheTable} (batch_id)`);

      // Create stats table for quick lookups
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${statsTable} (
          upload_id VARCHAR(255) PRIMARY KEY,
          total_records INTEGER NOT NULL,
          batch_count INTEGER NOT NULL,
          record_types TEXT NOT NULL,
          processing_status VARCHAR(50) DEFAULT 'building',
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          build_started_at TIMESTAMP,
          build_completed_at TIMESTAMP,
          error_message TEXT
        )
      `);

      console.log(`[TDDF-CACHE] Cache tables ensured: ${cacheTable}, ${statsTable}`);
    } catch (error) {
      console.error('[TDDF-CACHE] Error creating cache tables:', error);
    }
  }

  /**
   * Check if cache exists for upload
   */
  async isCacheBuilt(uploadId: string): Promise<boolean> {
    const statsTable = this.getStatsTableName();
    
    try {
      const result = await pool.query(`
        SELECT processing_status FROM ${statsTable}
        WHERE upload_id = $1
      `, [uploadId]);
      
      return result.rows.length > 0 && result.rows[0].processing_status === 'completed';
    } catch (error) {
      console.error('[TDDF-CACHE] Error checking cache status:', error);
      return false;
    }
  }

  /**
   * Build comprehensive cache for TDDF upload
   */
  async buildCache(uploadId: string, filename: string): Promise<CacheBuildResult> {
    const cacheTable = this.getCacheTableName();
    const statsTable = this.getStatsTableName();
    
    console.log(`[TDDF-CACHE] Building cache for upload ${uploadId}`);
    
    try {
      // Mark as building
      await db.execute(sql`
        INSERT INTO ${sql.identifier(statsTable)} 
        (upload_id, total_records, batch_count, record_types, processing_status, build_started_at)
        VALUES (${uploadId}, 0, 0, '', 'building', CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE 
        processing_status = 'building', 
        build_started_at = CURRENT_TIMESTAMP
      `);

      // Get storage service and process file
      const { ReplitStorageService } = await import('../replit-storage-service');
      const storageService = new ReplitStorageService();
      
      // Read file content
      const fileContent = await storageService.readFileContent(uploadId, filename);
      if (!fileContent) {
        throw new Error('Failed to read file content from storage');
      }

      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      console.log(`[TDDF-CACHE] Processing ${lines.length} lines for cache`);

      let totalRecords = 0;
      let batchCount = 0;
      let currentBatchId = '';
      let transactionCounter = 0;
      const recordTypes = new Set<string>();
      const batchSize = 1000; // Process in batches

      // Clear existing cache for this upload
      await db.execute(sql`
        DELETE FROM ${sql.identifier(cacheTable)} WHERE upload_id = ${uploadId}
      `);

      for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, Math.min(i + batchSize, lines.length));
        const cacheRecords = [];

        for (let j = 0; j < batch.length; j++) {
          const lineIndex = i + j;
          const line = batch[j];
          const lineNumber = lineIndex + 1;

          if (line.trim().length === 0) continue;

          // Extract record type from positions 18-19
          const recordType = this.extractRecordType(line);
          recordTypes.add(recordType);

          // Track batches and transactions
          if (recordType === 'BH') {
            batchCount++;
            currentBatchId = `batch_${batchCount}_line_${lineNumber}`;
            transactionCounter = 0;
          }

          let transactionId = '';
          let hierarchyLevel = 0;
          
          if (recordType === 'BH') {
            hierarchyLevel = 0; // Root level
          } else if (recordType === 'DT') {
            transactionCounter++;
            transactionId = `${currentBatchId}_tx_${transactionCounter}`;
            hierarchyLevel = 1; // Transaction level
          } else {
            hierarchyLevel = 2; // Extension level
            transactionId = `${currentBatchId}_tx_${transactionCounter}`;
          }

          // Extract structured fields based on record type
          const recordData = this.extractStructuredFields(recordType, line);

          const cacheRecord = {
            id: `${uploadId}_line_${lineNumber}`,
            upload_id: uploadId,
            line_number: lineNumber,
            record_type: recordType,
            record_data: JSON.stringify(recordData),
            batch_id: currentBatchId || null,
            transaction_id: transactionId || null,
            hierarchy_level: hierarchyLevel,
            processing_datetime: null // Could extract from filename
          };

          cacheRecords.push(cacheRecord);
          totalRecords++;
        }

        // Insert batch to database
        if (cacheRecords.length > 0) {
          const values = cacheRecords.map(record => 
            `(${this.escapeValue(record.id)}, ${this.escapeValue(record.upload_id)}, ${record.line_number}, ${this.escapeValue(record.record_type)}, ${this.escapeValue(record.record_data)}, ${this.escapeValue(record.batch_id)}, ${this.escapeValue(record.transaction_id)}, ${record.hierarchy_level}, ${this.escapeValue(record.processing_datetime)})`
          ).join(', ');

          await db.execute(sql`
            INSERT INTO ${sql.identifier(cacheTable)} 
            (id, upload_id, line_number, record_type, record_data, batch_id, transaction_id, hierarchy_level, processing_datetime)
            VALUES ${sql.raw(values)}
          `);
        }

        // Update progress
        console.log(`[TDDF-CACHE] Processed ${Math.min(i + batchSize, lines.length)}/${lines.length} lines`);
      }

      // Update stats with final results
      const recordTypesArray = Array.from(recordTypes);
      await db.execute(sql`
        UPDATE ${sql.identifier(statsTable)} 
        SET total_records = ${totalRecords},
            batch_count = ${batchCount},
            record_types = ${recordTypesArray.join(',')},
            processing_status = 'completed',
            build_completed_at = CURRENT_TIMESTAMP
        WHERE upload_id = ${uploadId}
      `);

      console.log(`[TDDF-CACHE] Cache build completed: ${totalRecords} records, ${batchCount} batches`);
      
      return {
        success: true,
        totalRecords,
        batchCount,
        recordTypes: recordTypesArray
      };

    } catch (error) {
      console.error('[TDDF-CACHE] Error building cache:', error);
      
      // Mark as failed
      await db.execute(sql`
        UPDATE ${sql.identifier(statsTable)} 
        SET processing_status = 'failed',
            error_message = ${error.message}
        WHERE upload_id = ${uploadId}
      `);

      return {
        success: false,
        totalRecords: 0,
        batchCount: 0,
        recordTypes: [],
        error: error.message
      };
    }
  }

  /**
   * Get paginated cached data
   */
  async getCachedData(uploadId: string, limit: number = 50, offset: number = 0): Promise<{
    data: any[];
    total: number;
    pagination: any;
  }> {
    const cacheTable = this.getCacheTableName();
    const statsTable = this.getStatsTableName();

    try {
      // Get stats first
      const statsResult = await db.execute(sql`
        SELECT total_records, batch_count, record_types, processing_status
        FROM ${sql.identifier(statsTable)}
        WHERE upload_id = ${uploadId}
      `);

      if (statsResult.length === 0) {
        return { data: [], total: 0, pagination: { total: 0, limit, offset, hasMore: false } };
      }

      const stats = statsResult[0];
      
      // Get paginated records
      const records = await db.execute(sql`
        SELECT line_number, record_type, record_data, batch_id, transaction_id, hierarchy_level
        FROM ${sql.identifier(cacheTable)}
        WHERE upload_id = ${uploadId}
        ORDER BY line_number ASC
        LIMIT ${limit} OFFSET ${offset}
      `);

      const data = records.map(record => ({
        lineNumber: record.line_number,
        recordType: record.record_type,
        recordData: JSON.parse(record.record_data),
        batchId: record.batch_id,
        transactionId: record.transaction_id,
        hierarchyLevel: record.hierarchy_level
      }));

      return {
        data,
        total: stats.total_records,
        pagination: {
          total: stats.total_records,
          limit,
          offset,
          hasMore: offset + limit < stats.total_records
        }
      };

    } catch (error) {
      console.error('[TDDF-CACHE] Error getting cached data:', error);
      return { data: [], total: 0, pagination: { total: 0, limit, offset, hasMore: false } };
    }
  }

  /**
   * Get hierarchical tree view data
   */
  async getTreeViewData(uploadId: string, limit: number = 50): Promise<any[]> {
    const cacheTable = this.getCacheTableName();

    try {
      const records = await db.execute(sql`
        SELECT line_number, record_type, record_data, batch_id, transaction_id, hierarchy_level
        FROM ${sql.identifier(cacheTable)}
        WHERE upload_id = ${uploadId}
        ORDER BY line_number ASC
        LIMIT ${limit}
      `);

      // Build hierarchical structure
      const batches = [];
      let currentBatch = null;
      let currentTransaction = null;

      for (const record of records) {
        const recordData = JSON.parse(record.record_data);
        
        if (record.record_type === 'BH') {
          // Start new batch
          currentBatch = {
            id: record.batch_id,
            type: 'batch',
            recordType: record.record_type,
            lineNumber: record.line_number,
            data: recordData,
            transactions: []
          };
          batches.push(currentBatch);
          currentTransaction = null;
        } else if (record.record_type === 'DT' && currentBatch) {
          // Start new transaction
          currentTransaction = {
            id: record.transaction_id,
            type: 'transaction',
            recordType: record.record_type,
            lineNumber: record.line_number,
            data: recordData,
            extensions: []
          };
          currentBatch.transactions.push(currentTransaction);
        } else if (currentTransaction) {
          // Add extension to current transaction
          currentTransaction.extensions.push({
            type: 'extension',
            recordType: record.record_type,
            lineNumber: record.line_number,
            data: recordData
          });
        }
      }

      return batches;
    } catch (error) {
      console.error('[TDDF-CACHE] Error getting tree view data:', error);
      return [];
    }
  }

  /**
   * Extract record type from line
   */
  private extractRecordType(line: string): string {
    try {
      // Try to find known record types in first 30 characters
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

  /**
   * Extract structured fields based on record type
   */
  private extractStructuredFields(recordType: string, line: string): any {
    const fields = {
      rawLine: line,
      length: line.length,
      recordType
    };

    try {
      // Add basic field extraction based on record type
      if (recordType === 'BH') {
        fields['merchantId'] = line.substring(30, 45)?.trim() || '';
        fields['batchDate'] = line.substring(45, 53)?.trim() || '';
      } else if (recordType === 'DT') {
        fields['transactionAmount'] = line.substring(93, 103)?.trim() || '';
        fields['transactionDate'] = line.substring(53, 61)?.trim() || '';
      }
    } catch (error) {
      console.warn(`[TDDF-CACHE] Error extracting fields for ${recordType}:`, error);
    }

    return fields;
  }

  /**
   * Escape SQL values
   */
  private escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}