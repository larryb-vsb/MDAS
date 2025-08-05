import { neon } from '@neondatabase/serverless';
import { HybridTddfStorageService } from './hybrid-tddf-storage';

const sql = neon(process.env.DATABASE_URL!);

interface TableInfo {
  tablename: string;
  size_mb: number;
  size_bytes: number;
  row_count: number;
}

interface MigrationTableStatus {
  tablename: string;
  size_mb: number;
  total_records: number;
  migrated_records: number;
  migration_complete: boolean;
  object_storage_path?: string;
  migration_started_at?: Date;
  migration_completed_at?: Date;
}

interface MigrationResult {
  success: boolean;
  recordsProcessed: number;
  spaceSaved: number;
  error?: string;
}

interface BulkMigrationResult {
  success: boolean;
  tablesProcessed: number;
  totalRecords: number;
  totalSpaceSaved: number;
  errors: string[];
}

/**
 * TDDF Hybrid Migration Service
 * Manages the migration of raw TDDF line data from database to object storage
 * while maintaining structured data in the database for fast queries
 */
export class TddfHybridMigrationService {
  private hybridStorage: HybridTddfStorageService;
  private environment: string;
  
  constructor() {
    this.hybridStorage = new HybridTddfStorageService();
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Get all TDDF1 tables that exist in the current environment
   */
  async getTddf1Tables(): Promise<TableInfo[]> {
    try {
      const prefix = this.environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
      
      const query = `
        SELECT 
          schemaname,
          tablename,
          ROUND(pg_total_relation_size(schemaname||'.'||tablename) / 1024.0 / 1024.0, 2) as size_mb,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes,
          COALESCE(
            (SELECT n_tup_ins FROM pg_stat_all_tables WHERE schemaname = t.schemaname AND relname = t.tablename),
            0
          ) as row_count
        FROM pg_tables t
        WHERE schemaname = 'public' 
          AND tablename LIKE $1
          AND tablename NOT LIKE '%_totals'
          AND tablename NOT LIKE '%_cache'
        ORDER BY size_bytes DESC
      `;
      
      const result = await sql(query, [`${prefix}%`]);
      
      return result.map(row => ({
        tablename: row.tablename as string,
        size_mb: parseFloat(row.size_mb as string),
        size_bytes: parseInt(row.size_bytes as string),
        row_count: parseInt(row.row_count as string)
      }));
    } catch (error) {
      console.error('[HYBRID-MIGRATION] Error getting TDDF1 tables:', error);
      return [];
    }
  }

  /**
   * Get migration status for all TDDF1 tables
   */
  async getMigrationStatus(): Promise<MigrationTableStatus[]> {
    try {
      const tables = await this.getTddf1Tables();
      const migrationStatuses: MigrationTableStatus[] = [];
      
      for (const table of tables) {
        // Check if table has mms_raw_line column (indicates it needs migration)
        const hasRawLineColumn = await this.checkForRawLineColumn(table.tablename);
        
        if (!hasRawLineColumn) {
          // Table already migrated or doesn't have raw line data
          migrationStatuses.push({
            tablename: table.tablename,
            size_mb: table.size_mb,
            total_records: table.row_count,
            migrated_records: table.row_count,
            migration_complete: true,
            migration_completed_at: new Date() // Assume completed if no raw_line column
          });
          continue;
        }
        
        // Count total and migrated records
        const recordCounts = await this.getRecordCounts(table.tablename);
        
        const isComplete = recordCounts.totalRecords > 0 && 
          recordCounts.recordsWithoutRawLine === recordCounts.totalRecords;
        
        migrationStatuses.push({
          tablename: table.tablename,
          size_mb: table.size_mb,
          total_records: recordCounts.totalRecords,
          migrated_records: recordCounts.recordsWithoutRawLine,
          migration_complete: isComplete,
          object_storage_path: isComplete ? `/objects/tddf1_raw_lines/${table.tablename}_migrated.txt` : undefined
        });
      }
      
      return migrationStatuses;
    } catch (error) {
      console.error('[HYBRID-MIGRATION] Error getting migration status:', error);
      return [];
    }
  }

  /**
   * Migrate a specific table's raw line data to object storage
   */
  async migrateTable(tableName: string): Promise<MigrationResult> {
    try {
      console.log(`[HYBRID-MIGRATION] Starting migration for table: ${tableName}`);
      
      // Check if object storage is configured
      if (!(await this.hybridStorage.isConfigured())) {
        throw new Error('Object storage is not properly configured');
      }
      
      // Check if table has raw line column
      const hasRawLineColumn = await this.checkForRawLineColumn(tableName);
      if (!hasRawLineColumn) {
        return {
          success: true,
          recordsProcessed: 0,
          spaceSaved: 0,
          error: 'Table already migrated or has no raw line data'
        };
      }
      
      // Get records with raw line data in batches
      const batchSize = 1000;
      let offset = 0;
      let totalProcessed = 0;
      let totalSpaceSaved = 0;
      
      while (true) {
        const batch = await this.getRawLineBatch(tableName, batchSize, offset);
        if (batch.length === 0) break;
        
        // Extract raw lines and prepare for object storage
        const rawLines = batch.map(record => record.raw_line).filter(line => line);
        
        if (rawLines.length > 0) {
          // Store raw lines in object storage
          const objectPath = await this.hybridStorage.storeRawLines(
            `${tableName}_batch_${Math.floor(offset / batchSize)}`,
            rawLines
          );
          
          // Remove raw line data from database records (set to NULL to save space)
          await this.clearRawLineData(tableName, batch.map(r => r.id));
          
          // Calculate space saved (approximate 701 bytes per raw line)
          const spaceSaved = rawLines.length * 701;
          totalSpaceSaved += spaceSaved;
          
          console.log(`[HYBRID-MIGRATION] Migrated batch: ${rawLines.length} records, ~${Math.round(spaceSaved / 1024)}KB saved`);
        }
        
        totalProcessed += batch.length;
        offset += batchSize;
        
        // Progress logging
        if (totalProcessed % 5000 === 0) {
          console.log(`[HYBRID-MIGRATION] Progress: ${totalProcessed} records processed`);
        }
      }
      
      console.log(`[HYBRID-MIGRATION] Completed migration for ${tableName}: ${totalProcessed} records, ~${Math.round(totalSpaceSaved / 1024 / 1024)}MB saved`);
      
      return {
        success: true,
        recordsProcessed: totalProcessed,
        spaceSaved: totalSpaceSaved
      };
      
    } catch (error) {
      console.error(`[HYBRID-MIGRATION] Error migrating table ${tableName}:`, error);
      return {
        success: false,
        recordsProcessed: 0,
        spaceSaved: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Migrate all TDDF1 tables to hybrid storage
   */
  async migrateAllTables(): Promise<BulkMigrationResult> {
    try {
      console.log('[HYBRID-MIGRATION] Starting bulk migration for all TDDF1 tables');
      
      const tables = await this.getTddf1Tables();
      const results: MigrationResult[] = [];
      const errors: string[] = [];
      
      for (const table of tables) {
        console.log(`[HYBRID-MIGRATION] Processing table: ${table.tablename} (${table.size_mb}MB)`);
        
        const result = await this.migrateTable(table.tablename);
        results.push(result);
        
        if (!result.success) {
          errors.push(`${table.tablename}: ${result.error}`);
        }
        
        // Longer delay between table migrations to prevent overwhelming object storage
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const successfulResults = results.filter(r => r.success);
      const totalRecords = successfulResults.reduce((sum, r) => sum + r.recordsProcessed, 0);
      const totalSpaceSaved = successfulResults.reduce((sum, r) => sum + r.spaceSaved, 0);
      
      console.log(`[HYBRID-MIGRATION] Bulk migration completed: ${successfulResults.length}/${results.length} tables, ${totalRecords} records, ~${Math.round(totalSpaceSaved / 1024 / 1024)}MB saved`);
      
      return {
        success: errors.length === 0,
        tablesProcessed: successfulResults.length,
        totalRecords,
        totalSpaceSaved,
        errors
      };
      
    } catch (error) {
      console.error('[HYBRID-MIGRATION] Error in bulk migration:', error);
      return {
        success: false,
        tablesProcessed: 0,
        totalRecords: 0,
        totalSpaceSaved: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Check if a table has the raw_line column (or legacy mms_raw_line column)
   */
  private async checkForRawLineColumn(tableName: string): Promise<boolean> {
    try {
      const query = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name IN ('raw_line', 'mms_raw_line')
      `;
      const result = await sql(query, [tableName]);
      return result.length > 0;
    } catch (error) {
      console.error(`[HYBRID-MIGRATION] Error checking raw line column for ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Get record counts for migration status
   */
  private async getRecordCounts(tableName: string): Promise<{
    totalRecords: number;
    recordsWithoutRawLine: number;
    recordsWithRawLine: number;
  }> {
    try {
      // First determine which raw line column exists
      const rawLineColumn = await this.getRawLineColumnName(tableName);
      if (!rawLineColumn) {
        return { totalRecords: 0, recordsWithoutRawLine: 0, recordsWithRawLine: 0 };
      }

      const countQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN ${rawLineColumn} IS NULL OR ${rawLineColumn} = '' THEN 1 END) as without_raw_line,
          COUNT(CASE WHEN ${rawLineColumn} IS NOT NULL AND ${rawLineColumn} != '' THEN 1 END) as with_raw_line
        FROM ${tableName}
      `;
      
      const result = await sql(countQuery);
      const row = result[0];
      
      return {
        totalRecords: parseInt(row.total as string),
        recordsWithoutRawLine: parseInt(row.without_raw_line as string),
        recordsWithRawLine: parseInt(row.with_raw_line as string)
      };
    } catch (error) {
      console.error(`[HYBRID-MIGRATION] Error getting record counts for ${tableName}:`, error);
      return { totalRecords: 0, recordsWithoutRawLine: 0, recordsWithRawLine: 0 };
    }
  }

  /**
   * Get a batch of records with raw line data
   */
  private async getRawLineBatch(tableName: string, limit: number, offset: number): Promise<Array<{
    id: number;
    raw_line: string;
  }>> {
    try {
      // First determine which raw line column exists
      const rawLineColumn = await this.getRawLineColumnName(tableName);
      if (!rawLineColumn) {
        return [];
      }

      const query = `
        SELECT id, ${rawLineColumn} as raw_line
        FROM ${tableName}
        WHERE ${rawLineColumn} IS NOT NULL AND ${rawLineColumn} != ''
        ORDER BY id
        LIMIT $1 OFFSET $2
      `;
      
      const result = await sql(query, [limit, offset]);
      return result.map(row => ({
        id: parseInt(row.id as string),
        raw_line: row.raw_line as string
      }));
    } catch (error) {
      console.error(`[HYBRID-MIGRATION] Error getting raw line batch for ${tableName}:`, error);
      return [];
    }
  }

  /**
   * Clear raw line data from migrated records
   */
  private async clearRawLineData(tableName: string, recordIds: number[]): Promise<void> {
    try {
      if (recordIds.length === 0) return;
      
      // First determine which raw line column exists
      const rawLineColumn = await this.getRawLineColumnName(tableName);
      if (!rawLineColumn) {
        throw new Error(`No raw line column found for table ${tableName}`);
      }
      
      const placeholders = recordIds.map((_, i) => `$${i + 1}`).join(',');
      const query = `
        UPDATE ${tableName} 
        SET ${rawLineColumn} = NULL
        WHERE id IN (${placeholders})
      `;
      
      await sql(query, recordIds);
    } catch (error) {
      console.error(`[HYBRID-MIGRATION] Error clearing raw line data for ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get the actual raw line column name for a table
   */
  private async getRawLineColumnName(tableName: string): Promise<string | null> {
    try {
      const query = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name IN ('raw_line', 'mms_raw_line')
        ORDER BY CASE WHEN column_name = 'raw_line' THEN 1 ELSE 2 END
        LIMIT 1
      `;
      const result = await sql(query, [tableName]);
      return result.length > 0 ? result[0].column_name as string : null;
    } catch (error) {
      console.error(`[HYBRID-MIGRATION] Error getting raw line column name for ${tableName}:`, error);
      return null;
    }
  }
}