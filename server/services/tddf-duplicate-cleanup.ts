/**
 * TDDF JSONB Duplicate Cleanup Service
 * Background service that detects and removes duplicate DT records
 * Processes day-by-day to handle large datasets safely
 */

import { pool, batchPool } from '../db';
import { getTableName } from '../table-config';

interface CleanupProgress {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  totalRecords: number;
  recordsWithHash: number;
  duplicateHashCount: number;
  recordsToDelete: number;
  recordsDeleted: number;
  currentDate: string | null;
  startDate: string | null;
  endDate: string | null;
  processedDates: string[];
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  batchSize: number;
}

class TddfDuplicateCleanupService {
  private progress: CleanupProgress;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private tableName: string;
  
  constructor() {
    // Use the uploader JSONB records table which contains the actual TDDF data
    this.tableName = getTableName('uploader_tddf_jsonb_records');
    this.progress = this.getInitialProgress();
  }
  
  private getInitialProgress(): CleanupProgress {
    return {
      status: 'idle',
      totalRecords: 0,
      recordsWithHash: 0,
      duplicateHashCount: 0,
      recordsToDelete: 0,
      recordsDeleted: 0,
      currentDate: null,
      startDate: null,
      endDate: null,
      processedDates: [],
      startedAt: null,
      completedAt: null,
      lastError: null,
      batchSize: 10000
    };
  }
  
  getProgress(): CleanupProgress {
    return { ...this.progress };
  }
  
  async getStats(): Promise<{
    totalRecords: number;
    totalLines: number;
    recordsWithHash: number;
    recordsWithoutHash: number;
    duplicateHashCount: number;
    recordsToDelete: number;
    oldestRecord: string | null;
    newestRecord: string | null;
  }> {
    const client = await pool.connect();
    
    try {
      console.log(`[TDDF-CLEANUP] Fetching stats from ${this.tableName}...`);
      
      const statsResult = await client.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(*) as total_lines,
          COUNT(raw_line_hash) as with_hash,
          COUNT(*) - COUNT(raw_line_hash) as without_hash,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM ${this.tableName}
      `);
      
      const stats = statsResult.rows[0];
      
      const dupCountResult = await client.query(`
        SELECT COUNT(*) as dup_count
        FROM (
          SELECT raw_line_hash
          FROM ${this.tableName}
          WHERE raw_line_hash IS NOT NULL
          GROUP BY raw_line_hash
          HAVING COUNT(*) > 1
        ) d
      `);
      
      const toDeleteResult = await client.query(`
        WITH duplicates AS (
          SELECT id,
            ROW_NUMBER() OVER (PARTITION BY raw_line_hash ORDER BY id ASC) as rn
          FROM ${this.tableName}
          WHERE raw_line_hash IS NOT NULL
        )
        SELECT COUNT(*) as to_delete
        FROM duplicates WHERE rn > 1
      `);
      
      return {
        totalRecords: parseInt(stats.total_records) || 0,
        totalLines: parseInt(stats.total_lines) || 0,
        recordsWithHash: parseInt(stats.with_hash) || 0,
        recordsWithoutHash: parseInt(stats.without_hash) || 0,
        duplicateHashCount: parseInt(dupCountResult.rows[0]?.dup_count) || 0,
        recordsToDelete: parseInt(toDeleteResult.rows[0]?.to_delete) || 0,
        oldestRecord: stats.oldest ? new Date(stats.oldest).toISOString() : null,
        newestRecord: stats.newest ? new Date(stats.newest).toISOString() : null
      };
    } catch (error) {
      console.error('[TDDF-CLEANUP] Error fetching stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  async recalculateHashes(batchSize: number = 50000): Promise<{ updated: number }> {
    const client = await batchPool.connect();
    
    try {
      console.log(`[TDDF-CLEANUP] Recalculating hashes in batches of ${batchSize}...`);
      
      let totalUpdated = 0;
      let hasMore = true;
      
      while (hasMore && !this.shouldStop) {
        const result = await client.query(`
          UPDATE ${this.tableName}
          SET raw_line_hash = MD5(raw_line)
          WHERE id IN (
            SELECT id FROM ${this.tableName}
            WHERE raw_line_hash IS NULL OR raw_line_hash = ''
            LIMIT ${batchSize}
          )
        `);
        
        totalUpdated += result.rowCount || 0;
        hasMore = (result.rowCount || 0) === batchSize;
        
        if (hasMore) {
          console.log(`[TDDF-CLEANUP] Updated ${totalUpdated} hashes so far...`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`[TDDF-CLEANUP] Hash recalculation complete: ${totalUpdated} records updated`);
      return { updated: totalUpdated };
    } finally {
      client.release();
    }
  }
  
  async startCleanup(options: { 
    startDate?: string; 
    endDate?: string; 
    batchSize?: number;
    recalculateHashes?: boolean;
  } = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error('Cleanup is already running');
    }
    
    this.isRunning = true;
    this.shouldStop = false;
    
    const batchSize = options.batchSize || 10000;
    
    this.progress = {
      ...this.getInitialProgress(),
      status: 'running',
      startedAt: new Date().toISOString(),
      batchSize,
      startDate: options.startDate || null,
      endDate: options.endDate || null
    };
    
    try {
      console.log('[TDDF-CLEANUP] Starting cleanup process...');
      
      if (options.recalculateHashes) {
        console.log('[TDDF-CLEANUP] Step 1: Recalculating hashes...');
        await this.recalculateHashes(50000);
      }
      
      const stats = await this.getStats();
      this.progress.totalRecords = stats.totalRecords;
      this.progress.recordsWithHash = stats.recordsWithHash;
      this.progress.duplicateHashCount = stats.duplicateHashCount;
      this.progress.recordsToDelete = stats.recordsToDelete;
      
      console.log(`[TDDF-CLEANUP] Stats: ${stats.totalRecords} total, ${stats.recordsToDelete} to delete`);
      
      if (stats.recordsToDelete === 0) {
        console.log('[TDDF-CLEANUP] No duplicates to clean up');
        this.progress.status = 'completed';
        this.progress.completedAt = new Date().toISOString();
        this.isRunning = false;
        return;
      }
      
      await this.runDateByDateCleanup(batchSize, options.startDate, options.endDate);
      
      if (this.shouldStop) {
        this.progress.status = 'paused';
      } else {
        this.progress.status = 'completed';
        this.progress.completedAt = new Date().toISOString();
      }
      
    } catch (error) {
      console.error('[TDDF-CLEANUP] Cleanup error:', error);
      this.progress.status = 'error';
      this.progress.lastError = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      this.isRunning = false;
    }
  }
  
  private async runDateByDateCleanup(batchSize: number, startDate?: string, endDate?: string): Promise<void> {
    const client = await batchPool.connect();
    
    try {
      console.log('[TDDF-CLEANUP] Building global keeper list (oldest ID per hash)...');
      
      // Step 1: Create temp table with global keepers (oldest ID per hash)
      // This ensures we keep the same record across all dates
      await client.query(`
        CREATE TEMP TABLE IF NOT EXISTS tddf_keepers AS
        SELECT DISTINCT ON (raw_line_hash) id as keeper_id, raw_line_hash
        FROM ${this.tableName}
        WHERE raw_line_hash IS NOT NULL AND raw_line_hash != ''
        ORDER BY raw_line_hash, id ASC
      `);
      
      const keeperCountResult = await client.query(`SELECT COUNT(*) as cnt FROM tddf_keepers`);
      console.log(`[TDDF-CLEANUP] Found ${keeperCountResult.rows[0]?.cnt || 0} unique hashes with keepers`);
      
      // Step 2: Get dates to process with parameterized queries
      const dateParams: any[] = [];
      let dateQuery = `
        SELECT 
          DATE(created_at) as cleanup_date,
          COUNT(*) as record_count
        FROM ${this.tableName}
        WHERE raw_line_hash IS NOT NULL AND raw_line_hash != ''
      `;
      
      if (startDate) {
        dateParams.push(startDate);
        dateQuery += ` AND created_at >= $${dateParams.length}::date`;
      }
      if (endDate) {
        dateParams.push(endDate);
        dateQuery += ` AND created_at <= $${dateParams.length}::date`;
      }
      
      dateQuery += ` GROUP BY DATE(created_at) ORDER BY DATE(created_at) DESC`;
      
      const dateRangeResult = await client.query(dateQuery, dateParams);
      
      console.log(`[TDDF-CLEANUP] Found ${dateRangeResult.rows.length} dates to process`);
      
      // Step 3: Process each date, deleting records that are NOT the global keeper
      for (const row of dateRangeResult.rows) {
        if (this.shouldStop) {
          console.log('[TDDF-CLEANUP] Stop requested, pausing...');
          break;
        }
        
        const cleanupDate = row.cleanup_date;
        const dateStr = cleanupDate instanceof Date 
          ? cleanupDate.toISOString().split('T')[0]
          : String(cleanupDate).split('T')[0];
        this.progress.currentDate = dateStr;
        
        console.log(`[TDDF-CLEANUP] Processing date: ${dateStr} (${row.record_count} records)`);
        
        let hasMore = true;
        while (hasMore && !this.shouldStop) {
          // Delete records that are NOT the keeper for their hash (global deduplication)
          const deleteResult = await client.query(`
            DELETE FROM ${this.tableName}
            WHERE id IN (
              SELECT r.id
              FROM ${this.tableName} r
              JOIN tddf_keepers k ON r.raw_line_hash = k.raw_line_hash
              WHERE r.id != k.keeper_id
                AND DATE(r.created_at) = $1::date
              LIMIT $2
            )
          `, [dateStr, batchSize]);
          
          const deleted = deleteResult.rowCount || 0;
          this.progress.recordsDeleted += deleted;
          hasMore = deleted === batchSize;
          
          if (deleted > 0) {
            console.log(`[TDDF-CLEANUP] Deleted ${deleted} duplicates for ${dateStr} (total: ${this.progress.recordsDeleted})`);
          }
          
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        this.progress.processedDates.push(dateStr);
      }
      
      // Cleanup temp table
      await client.query(`DROP TABLE IF EXISTS tddf_keepers`);
      
    } finally {
      client.release();
    }
  }
  
  stopCleanup(): void {
    if (this.isRunning) {
      console.log('[TDDF-CLEANUP] Stop requested...');
      this.shouldStop = true;
    }
  }
  
  resetProgress(): void {
    if (!this.isRunning) {
      this.progress = this.getInitialProgress();
    }
  }
}

export const tddfDuplicateCleanupService = new TddfDuplicateCleanupService();
