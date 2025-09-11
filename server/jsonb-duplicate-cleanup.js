/**
 * JSONB Duplicate Cleanup Service
 * Detects and logs duplicate records in dev_tddf_jsonb table
 * Runs during legacy file import to track duplicates without blocking encoding
 */

import { batchPool } from './db.js';

class JsonbDuplicateCleanup {
  constructor() {
    this.pool = batchPool;
    this.environment = process.env.NODE_ENV || 'development';
    this.tableName = this.environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
    this.logFile = `jsonb_duplicate_log_${new Date().toISOString().split('T')[0]}.log`;
  }

  /**
   * Find duplicate JSONB records based on business keys
   */
  async findDuplicates() {
    const client = await this.pool.connect();
    
    try {
      console.log(`[JSONB-CLEANUP] Scanning ${this.tableName} for duplicates...`);
      
      // Find duplicates based on extracted reference numbers for DT records
      const duplicateQuery = `
        WITH reference_duplicates AS (
          SELECT 
            extracted_fields->>'referenceNumber' as reference_number,
            COUNT(*) as duplicate_count,
            ARRAY_AGG(id ORDER BY created_at) as record_ids,
            ARRAY_AGG(upload_id ORDER BY created_at) as upload_ids,
            ARRAY_AGG(filename ORDER BY created_at) as filenames,
            ARRAY_AGG(created_at ORDER BY created_at) as created_times
          FROM ${this.tableName}
          WHERE record_type = 'DT' 
            AND extracted_fields->>'referenceNumber' IS NOT NULL
            AND extracted_fields->>'referenceNumber' != ''
          GROUP BY extracted_fields->>'referenceNumber'
          HAVING COUNT(*) > 1
        ),
        line_duplicates AS (
          SELECT 
            raw_line,
            record_type,
            COUNT(*) as duplicate_count,
            ARRAY_AGG(id ORDER BY created_at) as record_ids,
            ARRAY_AGG(upload_id ORDER BY created_at) as upload_ids,
            ARRAY_AGG(filename ORDER BY created_at) as filenames
          FROM ${this.tableName}
          GROUP BY raw_line, record_type
          HAVING COUNT(*) > 1
        )
        SELECT 
          'reference' as duplicate_type,
          reference_number as duplicate_key,
          duplicate_count,
          record_ids,
          upload_ids,
          filenames,
          created_times as timestamps
        FROM reference_duplicates
        
        UNION ALL
        
        SELECT 
          'raw_line' as duplicate_type,
          SUBSTRING(raw_line, 1, 50) || '...' as duplicate_key,
          duplicate_count,
          record_ids,
          upload_ids,
          filenames,
          NULL as timestamps
        FROM line_duplicates
        
        ORDER BY duplicate_count DESC, duplicate_type;
      `;

      const result = await client.query(duplicateQuery);
      
      console.log(`[JSONB-CLEANUP] Found ${result.rows.length} duplicate patterns`);
      
      return result.rows;
      
    } catch (error) {
      console.error('[JSONB-CLEANUP] Error finding duplicates:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log duplicate details for audit trail
   */
  async logDuplicates(duplicates) {
    const timestamp = new Date().toISOString();
    
    let logContent = `\n=== JSONB DUPLICATE SCAN - ${timestamp} ===\n`;
    logContent += `Environment: ${this.environment}\n`;
    logContent += `Table: ${this.tableName}\n`;
    logContent += `Total duplicate patterns found: ${duplicates.length}\n\n`;

    let totalDuplicateRecords = 0;
    let referenceBasedDuplicates = 0;
    let lineBasedDuplicates = 0;

    for (const dup of duplicates) {
      totalDuplicateRecords += (dup.duplicate_count - 1); // Exclude the original
      
      if (dup.duplicate_type === 'reference') {
        referenceBasedDuplicates += (dup.duplicate_count - 1);
        logContent += `[REFERENCE DUPLICATE] Key: ${dup.duplicate_key}\n`;
        logContent += `  Count: ${dup.duplicate_count} records\n`;
        logContent += `  Record IDs: ${dup.record_ids.join(', ')}\n`;
        logContent += `  Upload IDs: ${dup.upload_ids.join(', ')}\n`;
        logContent += `  Files: ${[...new Set(dup.filenames)].join(', ')}\n`;
        if (dup.timestamps) {
          logContent += `  Times: ${dup.timestamps.map(t => new Date(t).toISOString()).join(', ')}\n`;
        }
      } else {
        lineBasedDuplicates += (dup.duplicate_count - 1);
        logContent += `[RAW LINE DUPLICATE] Preview: ${dup.duplicate_key}\n`;
        logContent += `  Count: ${dup.duplicate_count} records\n`;
        logContent += `  Record IDs: ${dup.record_ids.join(', ')}\n`;
        logContent += `  Files: ${[...new Set(dup.filenames)].join(', ')}\n`;
      }
      logContent += `\n`;
    }

    logContent += `=== SUMMARY ===\n`;
    logContent += `Reference-based duplicates: ${referenceBasedDuplicates} records\n`;
    logContent += `Line-based duplicates: ${lineBasedDuplicates} records\n`;
    logContent += `Total duplicate records: ${totalDuplicateRecords} records\n`;
    logContent += `Legacy import status: ONGOING - duplicates expected during file processing\n`;
    logContent += `Action: LOGGED - no deletion during import phase\n\n`;

    console.log(`[JSONB-CLEANUP] Duplicate Summary:`);
    console.log(`  Reference duplicates: ${referenceBasedDuplicates} records`);
    console.log(`  Line duplicates: ${lineBasedDuplicates} records`);
    console.log(`  Total excess records: ${totalDuplicateRecords}`);

    // Store log in database for persistence
    await this.storeDuplicateLog(timestamp, {
      totalPatterns: duplicates.length,
      totalDuplicateRecords,
      referenceBasedDuplicates,
      lineBasedDuplicates,
      details: logContent
    });

    return {
      totalPatterns: duplicates.length,
      totalDuplicateRecords,
      referenceBasedDuplicates,
      lineBasedDuplicates,
      logContent
    };
  }

  /**
   * Store duplicate log in database
   */
  async storeDuplicateLog(timestamp, summary) {
    const client = await this.pool.connect();
    
    try {
      const logTableName = this.environment === 'development' ? 'dev_system_logs' : 'system_logs';
      
      await client.query(`
        INSERT INTO ${logTableName} (
          event_type, 
          event_description, 
          details, 
          created_at
        ) VALUES ($1, $2, $3, $4)
      `, [
        'jsonb_duplicate_scan',
        `JSONB duplicate scan: ${summary.totalDuplicateRecords} duplicate records found`,
        JSON.stringify({
          timestamp,
          environment: this.environment,
          table: this.tableName,
          ...summary
        }),
        new Date()
      ]);

      console.log(`[JSONB-CLEANUP] Duplicate log stored in ${logTableName}`);
      
    } catch (error) {
      console.error('[JSONB-CLEANUP] Error storing duplicate log:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Get duplicate statistics for monitoring
   */
  async getDuplicateStats() {
    const client = await this.pool.connect();
    
    try {
      const statsQuery = `
        SELECT 
          (SELECT COUNT(*) FROM ${this.tableName}) as total_records,
          COUNT(DISTINCT upload_id) as total_files,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) as dt_records,
          COUNT(DISTINCT CASE WHEN record_type = 'DT' THEN extracted_fields->>'referenceNumber' END) as unique_references,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) - 
          COUNT(DISTINCT CASE WHEN record_type = 'DT' THEN extracted_fields->>'referenceNumber' END) as potential_reference_duplicates
        FROM ${this.tableName}
        WHERE extracted_fields->>'referenceNumber' IS NOT NULL
          AND extracted_fields->>'referenceNumber' != '';
      `;

      const result = await client.query(statsQuery);
      const stats = result.rows[0];

      return {
        totalRecords: parseInt(stats.total_records),
        totalFiles: parseInt(stats.total_files),
        dtRecords: parseInt(stats.dt_records),
        uniqueReferences: parseInt(stats.unique_references),
        potentialDuplicates: parseInt(stats.potential_reference_duplicates)
      };
      
    } catch (error) {
      console.error('[JSONB-CLEANUP] Error getting duplicate stats:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Run full duplicate cleanup scan with actual removal
   */
  async runCleanupScan() {
    console.log(`[JSONB-CLEANUP] Starting duplicate cleanup scan with removal...`);
    
    try {
      // Get current stats
      const stats = await this.getDuplicateStats();
      if (stats) {
        console.log(`[JSONB-CLEANUP] Current JSONB stats:`, stats);
      }

      // Find duplicates
      const duplicates = await this.findDuplicates();
      
      // Perform actual cleanup (remove duplicates)
      const cleanupResult = await this.removeDuplicates(duplicates);
      
      // Log duplicates (now includes removal information)
      const summary = await this.logDuplicates(duplicates);
      
      console.log(`[JSONB-CLEANUP] Cleanup scan completed with ${cleanupResult.recordsRemoved} records removed`);
      console.log(`[JSONB-CLEANUP] Status: Duplicates removed - keeping earliest records`);
      
      return {
        success: true,
        stats,
        duplicates: {
          ...summary,
          recordsRemoved: cleanupResult.recordsRemoved,
          patternsProcessed: cleanupResult.patternsProcessed
        },
        message: `Duplicate cleanup completed - ${cleanupResult.recordsRemoved} duplicate records removed`
      };
      
    } catch (error) {
      console.error('[JSONB-CLEANUP] Cleanup scan failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove duplicate records (keeping the earliest record for each pattern)
   */
  async removeDuplicates(duplicates) {
    const client = await this.pool.connect();
    let totalRecordsRemoved = 0;
    let patternsProcessed = 0;
    
    try {
      console.log(`[JSONB-CLEANUP] Starting removal of ${duplicates.length} duplicate patterns...`);
      
      for (const duplicate of duplicates) {
        if (duplicate.record_ids && duplicate.record_ids.length > 1) {
          // Keep the first record (earliest), remove the rest
          const idsToRemove = duplicate.record_ids.slice(1);
          
          if (idsToRemove.length > 0) {
            const placeholders = idsToRemove.map((_, i) => `$${i + 1}`).join(',');
            
            const deleteResult = await client.query(
              `DELETE FROM ${this.tableName} WHERE id IN (${placeholders})`,
              idsToRemove
            );
            
            const removedCount = deleteResult.rowCount || 0;
            totalRecordsRemoved += removedCount;
            patternsProcessed++;
            
            console.log(`[JSONB-CLEANUP] Removed ${removedCount} duplicates for ${duplicate.duplicate_type} pattern: ${duplicate.duplicate_key.substring(0, 30)}...`);
          }
        }
      }
      
      console.log(`[JSONB-CLEANUP] Duplicate removal completed: ${totalRecordsRemoved} records removed from ${patternsProcessed} patterns`);
      
      return {
        recordsRemoved: totalRecordsRemoved,
        patternsProcessed: patternsProcessed
      };
      
    } catch (error) {
      console.error('[JSONB-CLEANUP] Error removing duplicates:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export { JsonbDuplicateCleanup };