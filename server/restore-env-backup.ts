import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabaseUrl, getEnvPath, getFilePath, NODE_ENV } from './env-config';

// Flag to determine if we should drop and recreate schema tables during restoration
const RECREATE_SCHEMA_TABLES = true;

// List of schema tables that might need to be recreated if they don't match our schema
const SCHEMA_TABLES = ['schema_versions', 'backup_schedules', 'backup_history'];

interface RestoreOptions {
  recreateSchema?: boolean;
}

/**
 * Restores a backup to the environment-specific database
 * @param backupFilePath Path to the backup file
 * @param options Additional options for restoration
 * @returns Promise that resolves to a boolean indicating success
 */
export async function restoreBackupToEnvironment(
  backupFilePath: string, 
  options: RestoreOptions = { recreateSchema: RECREATE_SCHEMA_TABLES }
): Promise<boolean> {
  try {
    console.log(`[${NODE_ENV}] Restoring backup from ${backupFilePath} to ${NODE_ENV} database...`);
    
    // Read the backup file
    const backupData = fs.readFileSync(backupFilePath, 'utf8');
    
    // Validate JSON format
    let backup;
    try {
      backup = JSON.parse(backupData);
    } catch (err) {
      throw new Error('Invalid JSON format in backup file');
    }
    
    // Validate backup structure
    if (!backup) {
      throw new Error('Invalid backup file: empty content');
    }
    
    // Check for tables property
    if (!backup.tables) {
      console.error('Backup content:', JSON.stringify(backup).substring(0, 500) + '...');
      throw new Error('Invalid backup file: missing tables property');
    }
    
    // Validate tables structure
    if (typeof backup.tables !== 'object') {
      throw new Error('Invalid backup file: tables is not an object');
    }
    
    // Log structure for debugging
    console.log('Backup file structure:', Object.keys(backup));
    console.log('Tables in backup:', Object.keys(backup.tables));
    
    // Connect to the database
    const databaseUrl = getDatabaseUrl();
    const pool = new Pool({ connectionString: databaseUrl });
    console.log(`Connected to database: ${databaseUrl.split('@')[1]}`);
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Decide which tables to drop based on options
      if (options.recreateSchema) {
        console.log('Dropping all existing tables...');
        await client.query(`
          DROP TABLE IF EXISTS transactions CASCADE;
          DROP TABLE IF EXISTS merchants CASCADE;
          DROP TABLE IF EXISTS users CASCADE;
          DROP TABLE IF EXISTS uploaded_files CASCADE;
          DROP TABLE IF EXISTS backup_history CASCADE;
          DROP TABLE IF EXISTS backup_schedules CASCADE;
          DROP TABLE IF EXISTS schema_versions CASCADE;
        `);
      } else {
        console.log('Selectively dropping tables, preserving schema tables...');
        await client.query(`
          DROP TABLE IF EXISTS transactions CASCADE;
          DROP TABLE IF EXISTS merchants CASCADE;
          DROP TABLE IF EXISTS users CASCADE;
          DROP TABLE IF EXISTS uploaded_files CASCADE;
        `);
        
        // If schema tables like backup_history, backup_schedules, and schema_versions exist but 
        // don't match our expected schema, we'll recreate them individually
        console.log('Checking schema tables for compatibility...');
        
        // Check backup_history table structure
        try {
          const backupHistoryResult = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'backup_history'
          `);
          
          // Check if required columns exist
          const requiredColumns = ['file_name', 'tables', 'size'];
          const existingColumns = backupHistoryResult.rows.map(row => row.column_name);
          const hasAllRequiredColumns = requiredColumns.every(col => existingColumns.includes(col));
          
          if (!hasAllRequiredColumns) {
            console.log('backup_history table exists but has incompatible schema, recreating...');
            await client.query('DROP TABLE IF EXISTS backup_history CASCADE;');
          } else {
            console.log('backup_history table has compatible schema, preserving...');
          }
        } catch (error) {
          console.log('Error checking backup_history structure, will create if needed:', error);
        }
        
        // Check schema_versions table structure
        try {
          const schemaVersionsResult = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'schema_versions'
          `);
          
          // Check if required columns exist based on our schema definition
          const requiredSVColumns = ['version', 'applied_at', 'description', 'changes', 'applied_by', 'script'];
          const existingSVColumns = schemaVersionsResult.rows.map(row => row.column_name);
          const hasAllRequiredColumns = requiredSVColumns.every(col => existingSVColumns.includes(col));
          
          if (!hasAllRequiredColumns) {
            console.log('schema_versions table exists but is missing required columns, recreating...');
            await client.query('DROP TABLE IF EXISTS schema_versions CASCADE;');
          } else {
            console.log('schema_versions table has compatible schema, preserving...');
          }
        } catch (error) {
          console.log('Error checking schema_versions structure, will create if needed:', error);
        }
        
        // Check backup_schedules table structure
        try {
          const backupSchedulesResult = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'backup_schedules'
          `);
          
          // Check if required columns exist
          const requiredBSColumns = ['frequency', 'time_of_day', 'use_s3', 'last_run'];
          const existingBSColumns = backupSchedulesResult.rows.map(row => row.column_name);
          const hasAllRequiredColumns = requiredBSColumns.every(col => existingBSColumns.includes(col));
          
          if (!hasAllRequiredColumns) {
            console.log('backup_schedules table exists but has incompatible schema, recreating...');
            await client.query('DROP TABLE IF EXISTS backup_schedules CASCADE;');
          } else {
            console.log('backup_schedules table has compatible schema, preserving...');
          }
        } catch (error) {
          console.log('Error checking backup_schedules structure, will create if needed:', error);
        }
      }
      
      // Recreate tables and insert data
      console.log('Recreating tables and restoring data...');
      
      // Process tables in the correct order (handling dependencies)
      const tableOrder = [
        'schema_versions',
        'users',
        'merchants',
        'transactions',
        'uploaded_files',
        'backup_history',
        'backup_schedules'
      ];
      
      for (const tableName of tableOrder) {
        const tableData = backup.tables[tableName];
        
        if (!tableData || !tableData.length) {
          console.log(`No data for table ${tableName}, skipping...`);
          continue;
        }
        
        // Create the table based on the first row of data
        const firstRow = tableData[0];
        await createTableFromData(client, tableName, firstRow);
        
        // Insert the data
        console.log(`Inserting ${tableData.length} records into ${tableName}...`);
        for (const row of tableData) {
          await insertRow(client, tableName, row);
        }
      }
      
      // Update file paths to be environment-specific
      console.log('Updating file paths to be environment-specific...');
      await updateFilePaths(client);
      
      // Commit the transaction
      await client.query('COMMIT');
      console.log('Backup restored successfully');
      
      return true;
    } catch (error) {
      // Rollback if there was an error
      await client.query('ROLLBACK');
      console.error('Error restoring backup:', error);
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('Error in restore process:', error);
    return false;
  }
}

/**
 * Create a table from a data object
 */
async function createTableFromData(client: any, tableName: string, data: any) {
  // Special case tables with fixed schema to ensure compatibility
  if (tableName === 'merchants') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "merchants" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "status" TEXT DEFAULT 'active',
        "address" TEXT,
        "city" TEXT,
        "state" TEXT,
        "zip" TEXT,
        "category" TEXT,
        "email" TEXT,
        "phone" TEXT,
        "client_mid" TEXT,
        "created_date" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "last_upload" TIMESTAMP WITH TIME ZONE,
        "edit_date" TIMESTAMP WITH TIME ZONE
      )
    `);
    return;
  } else if (tableName === 'transactions') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" TEXT PRIMARY KEY,
        "merchant_id" TEXT REFERENCES "merchants"("id") ON DELETE CASCADE,
        "amount" NUMERIC NOT NULL,
        "date" TIMESTAMP WITH TIME ZONE NOT NULL,
        "type" TEXT NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    return;
  } else if (tableName === 'users') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL PRIMARY KEY,
        "username" TEXT NOT NULL UNIQUE,
        "password" TEXT NOT NULL,
        "email" TEXT,
        "first_name" TEXT,
        "last_name" TEXT,
        "role" TEXT DEFAULT 'user',
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "last_login" TIMESTAMP WITH TIME ZONE
      )
    `);
    return;
  } else if (tableName === 'schema_versions') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_versions" (
        "id" SERIAL PRIMARY KEY,
        "version" TEXT NOT NULL,
        "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "description" TEXT NOT NULL,
        "changes" JSONB,
        "applied_by" TEXT,
        "script" TEXT
      )
    `);
    return;
  } else if (tableName === 'uploaded_files') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "uploaded_files" (
        "id" TEXT PRIMARY KEY,
        "original_filename" TEXT NOT NULL,
        "storage_path" TEXT NOT NULL,
        "upload_date" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "file_type" TEXT,
        "processed" BOOLEAN DEFAULT false,
        "processing_result" TEXT,
        "file_size" BIGINT
      )
    `);
    return;
  } else if (tableName === 'backup_history') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "backup_history" (
        "id" TEXT PRIMARY KEY,
        "file_name" TEXT NOT NULL,
        "file_path" TEXT,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "size" INTEGER NOT NULL,
        "tables" JSONB NOT NULL,
        "notes" TEXT,
        "downloaded" BOOLEAN NOT NULL DEFAULT FALSE,
        "deleted" BOOLEAN NOT NULL DEFAULT FALSE,
        "storage_type" TEXT NOT NULL DEFAULT 'local',
        "s3_bucket" TEXT,
        "s3_key" TEXT
      )
    `);
    return;
  } else if (tableName === 'backup_schedules') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "backup_schedules" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "frequency" TEXT NOT NULL,
        "time_of_day" TEXT NOT NULL,
        "day_of_week" INTEGER,
        "day_of_month" INTEGER,
        "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "use_s3" BOOLEAN NOT NULL DEFAULT FALSE,
        "retention_days" INTEGER NOT NULL DEFAULT 30, 
        "last_run" TIMESTAMP WITH TIME ZONE,
        "next_run" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "notes" TEXT
      )
    `);
    return;
  } else if (tableName === 'schema_versions') {
    console.log(`Creating table ${tableName} with fixed schema...`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_versions" (
        "id" SERIAL PRIMARY KEY,
        "version" TEXT NOT NULL,
        "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "description" TEXT NOT NULL,
        "changes" JSONB,
        "applied_by" TEXT,
        "script" TEXT
      )
    `);
    return;
  }
  
  // For other tables, use dynamic schema detection
  // Define column types based on the values
  const columns = Object.keys(data).map(key => {
    const value = data[key];
    let type = 'TEXT';
    
    if (typeof value === 'number') {
      // Check if it's an integer or float
      type = Number.isInteger(value) ? 'INTEGER' : 'NUMERIC';
    } else if (typeof value === 'boolean') {
      type = 'BOOLEAN';
    } else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
      type = 'TIMESTAMP WITH TIME ZONE';
    } else if (typeof value === 'object' && value !== null) {
      type = 'JSONB';
    }
    
    return `"${key}" ${type}`;
  });
  
  // Add primary key if 'id' column exists
  const primaryKey = data.id !== undefined ? ', PRIMARY KEY ("id")' : '';
  
  // Create the table
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      ${columns.join(',\n      ')}
      ${primaryKey}
    )
  `;
  
  console.log(`Creating table ${tableName} with dynamic schema...`);
  await client.query(createTableSQL);
}

/**
 * Insert a row into a table
 */
async function insertRow(client: any, tableName: string, data: any) {
  // Special case for merchants: normalize column names
  if (tableName === 'merchants') {
    // Handle normalized column names for merchants
    const normalizedData: any = {
      id: data.id || uuidv4(),
      name: data.name,
      status: data.status || 'active',
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip || data.zip_code,
      category: data.category,
      email: data.email,
      phone: data.phone,
      client_mid: data.client_mid || data.clientMid || data.client_number,
      created_date: data.created_date || data.createdDate || new Date().toISOString(),
      last_upload: data.last_upload || data.lastUpload,
      edit_date: data.edit_date || data.editDate
    };
    
    const columns = Object.keys(normalizedData).filter(key => normalizedData[key] !== undefined);
    const values = columns.map(key => normalizedData[key]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    
    const insertSQL = `
      INSERT INTO "${tableName}" ("${columns.join('", "')}") 
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (id) DO NOTHING
    `;
    
    await client.query(insertSQL, values);
    return;
  }
  
  // Special case for transactions: normalize column names
  else if (tableName === 'transactions') {
    // Handle normalized column names for transactions
    const normalizedData: any = {
      id: data.id || uuidv4(),
      merchant_id: data.merchant_id || data.merchantId,
      amount: data.amount,
      date: data.date,
      type: data.type,
      created_at: data.created_at || data.createdAt || new Date().toISOString()
    };
    
    const columns = Object.keys(normalizedData).filter(key => normalizedData[key] !== undefined);
    const values = columns.map(key => normalizedData[key]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    
    const insertSQL = `
      INSERT INTO "${tableName}" ("${columns.join('", "')}") 
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (id) DO NOTHING
    `;
    
    await client.query(insertSQL, values);
    return;
  }
  
  // Special case for backup_history: normalize column names
  else if (tableName === 'backup_history') {
    // Handle normalized column names for backup_history
    const normalizedData: any = {
      id: data.id || uuidv4(),
      file_name: data.file_name || data.fileName || data.filename || 'backup.json',
      file_path: data.file_path || data.filePath,
      timestamp: data.timestamp || data.created_at || data.createdAt || new Date().toISOString(),
      size: data.size || data.file_size || data.fileSize || 0,
      tables: data.tables || { merchants: true, transactions: true, users: true },
      notes: data.notes,
      downloaded: data.downloaded || false,
      deleted: data.deleted || false,
      storage_type: data.storage_type || data.storageType || 'local',
      s3_bucket: data.s3_bucket || data.s3Bucket,
      s3_key: data.s3_key || data.s3Key
    };
    
    const columns = Object.keys(normalizedData).filter(key => normalizedData[key] !== undefined);
    const values = columns.map(key => normalizedData[key]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    
    const insertSQL = `
      INSERT INTO "${tableName}" ("${columns.join('", "')}") 
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (id) DO NOTHING
    `;
    
    await client.query(insertSQL, values);
    return;
  }
  
  // Special case for backup_schedules: normalize column names
  else if (tableName === 'backup_schedules') {
    // Handle normalized column names for backup_schedules
    const normalizedData: any = {
      id: data.id || (typeof data.id === 'number' ? data.id : null), // Allow SERIAL to autogenerate if not present
      name: data.name,
      frequency: data.frequency || data.cron_expression || 'daily',
      time_of_day: data.time_of_day || data.timeOfDay || '00:00',
      day_of_week: data.day_of_week || data.dayOfWeek,
      day_of_month: data.day_of_month || data.dayOfMonth,
      enabled: data.enabled !== undefined ? data.enabled : true,
      use_s3: data.use_s3 || data.useS3 || false,
      retention_days: data.retention_days || data.retentionDays || data.retention_count || 30,
      last_run: data.last_run || data.lastRun,
      next_run: data.next_run || data.nextRun,
      created_at: data.created_at || data.createdAt || new Date().toISOString(),
      updated_at: data.updated_at || data.updatedAt || new Date().toISOString(),
      notes: data.notes
    };
    
    // Don't include id if null (let the sequence generate it)
    if (normalizedData.id === null) {
      delete normalizedData.id;
    }
    
    const columns = Object.keys(normalizedData).filter(key => normalizedData[key] !== undefined);
    const values = columns.map(key => normalizedData[key]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    
    let insertSQL;
    if (normalizedData.id !== undefined) {
      insertSQL = `
        INSERT INTO "${tableName}" ("${columns.join('", "')}") 
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (id) DO NOTHING
      `;
    } else {
      insertSQL = `
        INSERT INTO "${tableName}" ("${columns.join('", "')}") 
        VALUES (${placeholders.join(', ')})
      `;
    }
    
    await client.query(insertSQL, values);
    return;
  }
  
  // Special case for schema_versions: normalize column names
  else if (tableName === 'schema_versions') {
    // Handle normalized column names for schema_versions
    const normalizedData: any = {
      id: data.id, // Let SERIAL autogenerate if not present
      version: data.version,
      applied_at: data.applied_at || data.appliedAt || new Date().toISOString(),
      description: data.description || 'Schema update',
      changes: data.changes,
      applied_by: data.applied_by || data.appliedBy || 'system',
      script: data.script
    };
    
    // Don't include id if not provided (let the sequence generate it)
    if (normalizedData.id === undefined) {
      delete normalizedData.id;
    }
    
    const columns = Object.keys(normalizedData).filter(key => normalizedData[key] !== undefined);
    const values = columns.map(key => normalizedData[key]);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    
    let insertSQL;
    if (normalizedData.id !== undefined) {
      insertSQL = `
        INSERT INTO "${tableName}" ("${columns.join('", "')}") 
        VALUES (${placeholders.join(', ')})
        ON CONFLICT (id) DO NOTHING
      `;
    } else {
      insertSQL = `
        INSERT INTO "${tableName}" ("${columns.join('", "')}") 
        VALUES (${placeholders.join(', ')})
      `;
    }
    
    await client.query(insertSQL, values);
    return;
  }
  
  // Default behavior for other tables
  const columns = Object.keys(data);
  const values = columns.map(key => data[key]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  
  const insertSQL = `
    INSERT INTO "${tableName}" ("${columns.join('", "')}") 
    VALUES (${placeholders.join(', ')})
    ON CONFLICT DO NOTHING
  `;
  
  try {
    await client.query(insertSQL, values);
  } catch (error) {
    console.error(`Error inserting into ${tableName}:`, error);
    console.log('Problematic data:', data);
    // Continue anyway - don't let one bad row stop the whole process
  }
}

/**
 * Update file paths to be environment-specific
 */
async function updateFilePaths(client: any) {
  try {
    // Check if uploaded_files table exists
    const uploadedFilesResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'uploaded_files'
      );
    `);
    
    // Update uploaded_files storage paths if the table exists
    if (uploadedFilesResult.rows[0].exists) {
      console.log('Updating file paths in uploaded_files table...');
      await client.query(`
        UPDATE uploaded_files
        SET storage_path = REPLACE(storage_path, '/uploads/', '/uploads/${NODE_ENV}/')
        WHERE storage_path NOT LIKE '%${NODE_ENV}/%'
      `);
    } else {
      console.log('uploaded_files table does not exist, skipping path updates');
    }
    
    // Check if backup_history table exists
    const backupHistoryResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'backup_history'
      );
    `);
    
    // Update backup_history file paths if the table exists
    if (backupHistoryResult.rows[0].exists) {
      console.log('Updating file paths in backup_history table...');
      await client.query(`
        UPDATE backup_history
        SET file_path = REPLACE(file_path, '/backups/', '/backups/${NODE_ENV}/')
        WHERE file_path NOT LIKE '%${NODE_ENV}/%'
      `);
    } else {
      console.log('backup_history table does not exist, skipping path updates');
    }
  } catch (error) {
    console.error('Error updating file paths:', error);
    // Don't throw - let the restore continue regardless
  }
}

/**
 * Script to restore the most recent backup
 */
export async function restoreMostRecentBackup(): Promise<boolean> {
  try {
    // Find the most recent backup file
    const backupsDir = getFilePath('backups');
    
    // Check if backups directory exists
    if (!fs.existsSync(backupsDir)) {
      console.log(`No backups directory found at ${backupsDir}`);
      return false;
    }
    
    // Get backup files and sort them by modification time (newest first)
    const files = fs.readdirSync(backupsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(backupsDir, file);
        return {
          name: file,
          path: filePath,
          mtime: fs.statSync(filePath).mtime
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    
    if (files.length === 0) {
      console.log('No backup files found');
      return false;
    }
    
    const mostRecentBackup = files[0];
    console.log(`Most recent backup: ${mostRecentBackup.name} (${mostRecentBackup.mtime})`);
    
    // Restore from the most recent backup
    return await restoreBackupToEnvironment(mostRecentBackup.path);
  } catch (error) {
    console.error('Error restoring most recent backup:', error);
    return false;
  }
}

// Note: ESM doesn't support require.main === module check
// If you need to run this directly, use the following CLI:
// NODE_ENV=development tsx server/restore-env-backup.ts