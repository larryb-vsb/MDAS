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
      
      // Set a statement timeout to prevent long-running queries from hanging
      await client.query('SET statement_timeout = 30000'); // 30 seconds max
      
      // Use fast approximate count from pg_class for total records
      const approxCountResult = await client.query(`
        SELECT reltuples::bigint as approx_count
        FROM pg_class
        WHERE relname = $1
      `, [this.tableName]);
      
      const approxTotal = parseInt(approxCountResult.rows[0]?.approx_count) || 0;
      console.log(`[TDDF-CLEANUP] Approximate total records: ${approxTotal}`);
      
      // Get basic stats with a limit-based sampling approach for large tables
      let totalRecords = 0;
      let withHash = 0;
      let withoutHash = 0;
      let oldest: string | null = null;
      let newest: string | null = null;
      
      if (approxTotal > 0) {
        // For very large tables, use estimated counts
        if (approxTotal > 1000000) {
          console.log(`[TDDF-CLEANUP] Large table detected (${approxTotal} rows), using estimates`);
          
          // Get min/max dates quickly using index
          const dateResult = await client.query(`
            SELECT MIN(created_at) as oldest, MAX(created_at) as newest
            FROM ${this.tableName}
          `);
          oldest = dateResult.rows[0]?.oldest;
          newest = dateResult.rows[0]?.newest;
          
          // Sample-based hash count (check 10000 random records)
          const sampleResult = await client.query(`
            SELECT 
              COUNT(*) as total,
              COUNT(raw_line_hash) as with_hash
            FROM (
              SELECT raw_line_hash 
              FROM ${this.tableName} 
              TABLESAMPLE SYSTEM(1) 
              LIMIT 10000
            ) sample
          `);
          
          const sampleTotal = parseInt(sampleResult.rows[0]?.total) || 0;
          const sampleWithHash = parseInt(sampleResult.rows[0]?.with_hash) || 0;
          const hashRatio = sampleTotal > 0 ? sampleWithHash / sampleTotal : 0;
          
          totalRecords = approxTotal;
          withHash = Math.round(approxTotal * hashRatio);
          withoutHash = approxTotal - withHash;
        } else {
          // For smaller tables, use exact counts
          const statsResult = await client.query(`
            SELECT 
              COUNT(*) as total_records,
              COUNT(raw_line_hash) as with_hash,
              MIN(created_at) as oldest,
              MAX(created_at) as newest
            FROM ${this.tableName}
          `);
          
          const stats = statsResult.rows[0];
          totalRecords = parseInt(stats.total_records) || 0;
          withHash = parseInt(stats.with_hash) || 0;
          withoutHash = totalRecords - withHash;
          oldest = stats.oldest;
          newest = stats.newest;
        }
      }
      
      console.log(`[TDDF-CLEANUP] Stats: total=${totalRecords}, withHash=${withHash}, withoutHash=${withoutHash}`);
      
      // For duplicate counts, use a faster estimation approach
      let duplicateHashCount = 0;
      let recordsToDelete = 0;
      
      if (withHash > 0) {
        // Use a limited query to estimate duplicates - check first 100k hashes
        const dupEstResult = await client.query(`
          SELECT COUNT(*) as dup_groups, SUM(cnt - 1) as to_delete
          FROM (
            SELECT raw_line_hash, COUNT(*) as cnt
            FROM ${this.tableName}
            WHERE raw_line_hash IS NOT NULL
            GROUP BY raw_line_hash
            HAVING COUNT(*) > 1
            LIMIT 100000
          ) d
        `);
        
        duplicateHashCount = parseInt(dupEstResult.rows[0]?.dup_groups) || 0;
        recordsToDelete = parseInt(dupEstResult.rows[0]?.to_delete) || 0;
        console.log(`[TDDF-CLEANUP] Duplicates: groups=${duplicateHashCount}, toDelete=${recordsToDelete}`);
      }
      
      // Reset statement timeout
      await client.query('RESET statement_timeout');
      
      return {
        totalRecords,
        totalLines: totalRecords,
        recordsWithHash: withHash,
        recordsWithoutHash: withoutHash,
        duplicateHashCount,
        recordsToDelete,
        oldestRecord: oldest ? new Date(oldest).toISOString() : null,
        newestRecord: newest ? new Date(newest).toISOString() : null
      };
    } catch (error) {
      console.error('[TDDF-CLEANUP] Error fetching stats:', error);
      // Reset timeout on error
      try { await client.query('RESET statement_timeout'); } catch (e) {}
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

// Filename-based duplicate scanning service
interface FilenameDuplicateResult {
  filename: string;
  recordCount: number;
  oldestDate: string | null;
  newestDate: string | null;
  sampleIds: number[];
}

interface FilenameScanProgress {
  status: 'idle' | 'scanning' | 'cleaning' | 'completed' | 'error';
  totalFilenames: number;
  duplicateFilenames: number;
  totalDuplicateRecords: number;
  recordsToDelete: number;
  recordsDeleted: number;
  duplicates: FilenameDuplicateResult[];
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
}

class FilenameDuplicateService {
  private progress: FilenameScanProgress;
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private tableName: string;

  constructor() {
    this.tableName = getTableName('uploader_tddf_jsonb_records');
    this.progress = this.getInitialProgress();
  }

  private getInitialProgress(): FilenameScanProgress {
    return {
      status: 'idle',
      totalFilenames: 0,
      duplicateFilenames: 0,
      totalDuplicateRecords: 0,
      recordsToDelete: 0,
      recordsDeleted: 0,
      duplicates: [],
      startedAt: null,
      completedAt: null,
      lastError: null
    };
  }

  getProgress(): FilenameScanProgress {
    return { ...this.progress, duplicates: [...this.progress.duplicates] };
  }

  async scanForDuplicateFilenames(): Promise<FilenameScanProgress> {
    if (this.isRunning) {
      throw new Error('Scan is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.progress = {
      ...this.getInitialProgress(),
      status: 'scanning',
      startedAt: new Date().toISOString()
    };

    const client = await pool.connect();

    try {
      console.log(`[FILENAME-DUP] Starting duplicate filename scan on ${this.tableName}...`);
      
      // Set a reasonable timeout
      await client.query('SET statement_timeout = 60000'); // 60 seconds max

      // Count total unique filenames
      const totalResult = await client.query(`
        SELECT COUNT(DISTINCT source_filename) as cnt
        FROM ${this.tableName}
        WHERE source_filename IS NOT NULL AND source_filename != ''
      `);
      this.progress.totalFilenames = parseInt(totalResult.rows[0]?.cnt) || 0;
      console.log(`[FILENAME-DUP] Found ${this.progress.totalFilenames} unique filenames`);

      // Find filenames that appear more than once (with record counts)
      const dupResult = await client.query(`
        SELECT 
          source_filename,
          COUNT(*) as record_count,
          MIN(created_at) as oldest_date,
          MAX(created_at) as newest_date,
          ARRAY_AGG(id ORDER BY id LIMIT 5) as sample_ids
        FROM ${this.tableName}
        WHERE source_filename IS NOT NULL AND source_filename != ''
        GROUP BY source_filename
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 500
      `);

      const duplicates: FilenameDuplicateResult[] = dupResult.rows.map(row => ({
        filename: row.source_filename,
        recordCount: parseInt(row.record_count) || 0,
        oldestDate: row.oldest_date ? new Date(row.oldest_date).toISOString() : null,
        newestDate: row.newest_date ? new Date(row.newest_date).toISOString() : null,
        sampleIds: row.sample_ids || []
      }));

      this.progress.duplicates = duplicates;
      this.progress.duplicateFilenames = duplicates.length;
      this.progress.totalDuplicateRecords = duplicates.reduce((sum, d) => sum + d.recordCount, 0);
      
      // Calculate records to delete (keep 1 per filename)
      this.progress.recordsToDelete = duplicates.reduce((sum, d) => sum + (d.recordCount - 1), 0);

      console.log(`[FILENAME-DUP] Found ${duplicates.length} duplicate filenames with ${this.progress.totalDuplicateRecords} total records`);
      console.log(`[FILENAME-DUP] ${this.progress.recordsToDelete} records can be deleted (keeping 1 per filename)`);

      await client.query('RESET statement_timeout');

      this.progress.status = 'completed';
      this.progress.completedAt = new Date().toISOString();

    } catch (error) {
      console.error('[FILENAME-DUP] Scan error:', error);
      this.progress.status = 'error';
      this.progress.lastError = error instanceof Error ? error.message : 'Unknown error';
      try { await client.query('RESET statement_timeout'); } catch (e) {}
    } finally {
      client.release();
      this.isRunning = false;
    }

    return this.getProgress();
  }

  async cleanupDuplicateFilenames(filenames?: string[], batchSize: number = 5000): Promise<{ deleted: number }> {
    if (this.isRunning) {
      throw new Error('Cleanup is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.progress.status = 'cleaning';
    this.progress.recordsDeleted = 0;
    this.progress.startedAt = new Date().toISOString();
    this.progress.completedAt = null;

    const client = await batchPool.connect();
    let totalDeleted = 0;

    try {
      console.log(`[FILENAME-DUP] Starting cleanup of duplicate filenames...`);

      // Get the list of filenames to clean
      let targetFilenames: string[] = [];
      
      if (filenames && filenames.length > 0) {
        targetFilenames = filenames;
      } else {
        // Get all duplicate filenames from current scan
        targetFilenames = this.progress.duplicates.map(d => d.filename);
      }

      if (targetFilenames.length === 0) {
        console.log('[FILENAME-DUP] No filenames to clean up');
        this.progress.status = 'completed';
        this.progress.completedAt = new Date().toISOString();
        this.isRunning = false;
        return { deleted: 0 };
      }

      console.log(`[FILENAME-DUP] Processing ${targetFilenames.length} filenames...`);

      // Process each filename
      for (const filename of targetFilenames) {
        if (this.shouldStop) {
          console.log('[FILENAME-DUP] Stop requested');
          break;
        }

        // Find the oldest record ID to keep for this filename
        const keeperResult = await client.query(`
          SELECT id FROM ${this.tableName}
          WHERE source_filename = $1
          ORDER BY id ASC
          LIMIT 1
        `, [filename]);

        if (keeperResult.rows.length === 0) continue;
        
        const keeperId = keeperResult.rows[0].id;

        // Delete all other records with this filename in batches
        let hasMore = true;
        while (hasMore && !this.shouldStop) {
          const deleteResult = await client.query(`
            DELETE FROM ${this.tableName}
            WHERE id IN (
              SELECT id FROM ${this.tableName}
              WHERE source_filename = $1 AND id != $2
              LIMIT $3
            )
          `, [filename, keeperId, batchSize]);

          const deleted = deleteResult.rowCount || 0;
          totalDeleted += deleted;
          this.progress.recordsDeleted = totalDeleted;
          hasMore = deleted === batchSize;

          if (deleted > 0) {
            console.log(`[FILENAME-DUP] Deleted ${deleted} duplicates for ${filename} (total: ${totalDeleted})`);
          }

          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }

      if (this.shouldStop) {
        this.progress.status = 'idle';
      } else {
        this.progress.status = 'completed';
        this.progress.completedAt = new Date().toISOString();
      }

      console.log(`[FILENAME-DUP] Cleanup complete: ${totalDeleted} records deleted`);

    } catch (error) {
      console.error('[FILENAME-DUP] Cleanup error:', error);
      this.progress.status = 'error';
      this.progress.lastError = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      client.release();
      this.isRunning = false;
    }

    return { deleted: totalDeleted };
  }

  stopCleanup(): void {
    if (this.isRunning) {
      console.log('[FILENAME-DUP] Stop requested...');
      this.shouldStop = true;
    }
  }

  resetProgress(): void {
    if (!this.isRunning) {
      this.progress = this.getInitialProgress();
    }
  }
}

export const filenameDuplicateService = new FilenameDuplicateService();
