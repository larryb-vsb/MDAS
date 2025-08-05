import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getTableName } from '../table-config';

export interface TableInfo {
  tableName: string;
  exists: boolean;
  rowCount?: number;
  sizeBytes?: number;
  sizeMB?: number;
  missingColumns: string[];
}

export interface CreateTableOptions {
  tableName: string;
  force?: boolean;
}

export class TableManager {
  /**
   * Check if a table exists and get its information
   */
  static async getTableInfo(baseTableName: string): Promise<TableInfo> {
    try {
      const tableName = getTableName(baseTableName);
      
      // Check if table exists
      const existsResult = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ) as table_exists
      `);
      
      const exists = (existsResult as any).rows?.[0]?.table_exists || false;
      
      if (!exists) {
        return {
          tableName,
          exists: false,
          missingColumns: []
        };
      }
      
      // Get table size and row count
      const sizeResult = await db.execute(sql`
        SELECT 
          pg_total_relation_size(${tableName}) as size_bytes,
          ROUND(pg_total_relation_size(${tableName}) / 1024.0 / 1024.0, 2) as size_mb,
          (SELECT n_tup_ins FROM pg_stat_all_tables WHERE schemaname = 'public' AND relname = ${tableName}) as row_count
      `);
      
      const sizeInfo = (sizeResult as any).rows?.[0];
      
      // Check for expected columns based on table type
      const missingColumns = await this.checkMissingColumns(tableName, baseTableName);
      
      return {
        tableName,
        exists: true,
        rowCount: parseInt(sizeInfo?.row_count as string) || 0,
        sizeBytes: parseInt(sizeInfo?.size_bytes as string) || 0,
        sizeMB: parseFloat(sizeInfo?.size_mb as string) || 0,
        missingColumns
      };
      
    } catch (error) {
      console.error(`[TABLE-MANAGER] Error getting table info for ${baseTableName}:`, error);
      return {
        tableName: getTableName(baseTableName),
        exists: false,
        missingColumns: []
      };
    }
  }
  
  /**
   * Check for missing columns in a table
   */
  private static async checkMissingColumns(tableName: string, baseTableName: string): Promise<string[]> {
    try {
      // Get existing columns
      const columnsResult = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = ${tableName}
      `);
      
      const existingColumns = (columnsResult as any).rows?.map((row: any) => row.column_name as string) || [];
      
      // Define expected columns for each table type
      const expectedColumns = this.getExpectedColumns(baseTableName);
      
      // Find missing columns
      const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));
      
      return missingColumns;
      
    } catch (error) {
      console.error(`[TABLE-MANAGER] Error checking columns for ${tableName}:`, error);
      return [];
    }
  }
  
  /**
   * Get expected columns for different table types
   */
  private static getExpectedColumns(baseTableName: string): string[] {
    switch (baseTableName) {
      case 'uploaded_files':
        return [
          'id', 'session_id', 'filename', 'original_filename', 'file_size',
          'upload_timestamp', 'file_type', 'current_phase', 'phase_started_at',
          'phase_completed_at', 'file_hash', 'upload_progress', 'error_message',
          'retry_count', 'last_updated', 'server_id', 'created_at', 'completed_at',
          'processing_status', 'processing_started', 'processing_completed',
          'processing_server_id', 'deleted', 'processing_errors', 'storage_path',
          'processing_time_ms'
        ];
      case 'transactions':
        return [
          'id', 'merchant_id', 'transaction_amount', 'transaction_date',
          'recorded_at', 'file_source'
        ];
      case 'tddf_records':
        return [
          'id', 'record_type', 'transaction_amount', 'recorded_at',
          'file_source', 'raw_data'
        ];
      case 'tddf_raw_import':
        return [
          'id', 'raw_line', 'line_number', 'file_source', 'processing_status',
          'created_at', 'processed_at'
        ];
      default:
        return [];
    }
  }
  
  /**
   * Create missing columns for a table
   */
  static async createMissingColumns(tableName: string, missingColumns: string[]): Promise<void> {
    try {
      for (const column of missingColumns) {
        const columnDefinition = this.getColumnDefinition(column);
        if (columnDefinition) {
          await sql`
            ALTER TABLE ${sql.identifier(tableName)} 
            ADD COLUMN IF NOT EXISTS ${sql.identifier(column)} ${sql.raw(columnDefinition)}
          `;
          console.log(`[TABLE-MANAGER] ✅ Added missing column ${column} to ${tableName}`);
        }
      }
    } catch (error) {
      console.error(`[TABLE-MANAGER] Error creating missing columns:`, error);
      throw error;
    }
  }
  
  /**
   * Get column definition for different column types
   */
  private static getColumnDefinition(columnName: string): string | null {
    const columnDefinitions: Record<string, string> = {
      'deleted': 'BOOLEAN DEFAULT FALSE',
      'processing_errors': 'TEXT',
      'storage_path': 'TEXT',
      'processing_time_ms': 'BIGINT',
      'processing_started': 'TIMESTAMP',
      'processing_completed': 'TIMESTAMP',
      'processing_server_id': 'VARCHAR(255)',
      'processing_status': 'VARCHAR(50) DEFAULT \'queued\'',
      'retry_count': 'INTEGER DEFAULT 0',
      'error_message': 'TEXT',
      'file_hash': 'VARCHAR(255)',
      'upload_progress': 'INTEGER DEFAULT 0'
    };
    
    return columnDefinitions[columnName] || null;
  }
  
  /**
   * Create a basic table structure
   */
  static async createBasicTable(baseTableName: string, options: CreateTableOptions = {}): Promise<void> {
    try {
      const tableName = options.tableName || getTableName(baseTableName);
      
      // Check if table already exists
      if (!options.force) {
        const tableInfo = await this.getTableInfo(baseTableName);
        if (tableInfo.exists) {
          throw new Error(`Table ${tableName} already exists. Use force: true to recreate.`);
        }
      }
      
      // Create table based on type
      await this.createTableByType(tableName, baseTableName);
      
      console.log(`[TABLE-MANAGER] ✅ Created table ${tableName}`);
      
    } catch (error) {
      console.error(`[TABLE-MANAGER] Error creating table ${baseTableName}:`, error);
      throw error;
    }
  }
  
  /**
   * Create table with appropriate schema based on table type
   */
  private static async createTableByType(tableName: string, baseTableName: string): Promise<void> {
    switch (baseTableName) {
      case 'uploaded_files':
        await sql`
          CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
            id SERIAL PRIMARY KEY,
            session_id VARCHAR(255),
            filename VARCHAR(255) NOT NULL,
            original_filename VARCHAR(255),
            file_size BIGINT,
            upload_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_type VARCHAR(50),
            current_phase VARCHAR(50) DEFAULT 'started',
            phase_started_at TIMESTAMP,
            phase_completed_at TIMESTAMP,
            file_hash VARCHAR(255),
            upload_progress INTEGER DEFAULT 0,
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            server_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            processing_status VARCHAR(50) DEFAULT 'queued',
            processing_started TIMESTAMP,
            processing_completed TIMESTAMP,
            processing_server_id VARCHAR(255),
            deleted BOOLEAN DEFAULT FALSE,
            processing_errors TEXT,
            storage_path TEXT,
            processing_time_ms BIGINT
          )
        `;
        break;
        
      case 'transactions':
        await sql`
          CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
            id SERIAL PRIMARY KEY,
            merchant_id VARCHAR(255),
            transaction_amount DECIMAL(12,2),
            transaction_date DATE,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_source VARCHAR(255)
          )
        `;
        break;
        
      case 'tddf_records':
        await sql`
          CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
            id SERIAL PRIMARY KEY,
            record_type VARCHAR(10),
            transaction_amount DECIMAL(12,2),
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_source VARCHAR(255),
            raw_data JSONB
          )
        `;
        break;
        
      case 'tddf_raw_import':
        await sql`
          CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
            id SERIAL PRIMARY KEY,
            raw_line TEXT,
            line_number INTEGER,
            file_source VARCHAR(255),
            processing_status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP
          )
        `;
        break;
        
      default:
        throw new Error(`Unknown table type: ${baseTableName}`);
    }
  }
  
  /**
   * Get health status for all core processing tables
   */
  static async getProcessingTablesStatus(): Promise<{
    tables: TableInfo[];
    allHealthy: boolean;
    summary: string;
  }> {
    const coreTableNames = ['uploaded_files', 'transactions', 'tddf_records', 'tddf_raw_import'];
    const tables: TableInfo[] = [];
    
    for (const tableName of coreTableNames) {
      const info = await this.getTableInfo(tableName);
      tables.push(info);
    }
    
    const missingTables = tables.filter(t => !t.exists);
    const tablesWithMissingColumns = tables.filter(t => t.exists && t.missingColumns.length > 0);
    
    const allHealthy = missingTables.length === 0 && tablesWithMissingColumns.length === 0;
    
    let summary = 'All processing tables are healthy';
    if (missingTables.length > 0) {
      summary = `${missingTables.length} tables missing: ${missingTables.map(t => t.tableName).join(', ')}`;
    } else if (tablesWithMissingColumns.length > 0) {
      summary = `${tablesWithMissingColumns.length} tables have missing columns`;
    }
    
    return {
      tables,
      allHealthy,
      summary
    };
  }
}