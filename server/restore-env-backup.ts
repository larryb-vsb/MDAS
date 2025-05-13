import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabaseUrl, getEnvPath, getFilePath, NODE_ENV } from './env-config';

/**
 * Restores a backup to the environment-specific database
 * @param backupFilePath Path to the backup file
 * @returns Promise that resolves to a boolean indicating success
 */
export async function restoreBackupToEnvironment(backupFilePath: string): Promise<boolean> {
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
      
      // Drop all existing tables first
      console.log('Dropping existing tables...');
      await client.query(`
        DROP TABLE IF EXISTS transactions CASCADE;
        DROP TABLE IF EXISTS merchants CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS uploaded_files CASCADE;
        DROP TABLE IF EXISTS backup_history CASCADE;
        DROP TABLE IF EXISTS backup_schedules CASCADE;
        DROP TABLE IF EXISTS schema_versions CASCADE;
      `);
      
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
  
  console.log(`Creating table ${tableName}...`);
  await client.query(createTableSQL);
}

/**
 * Insert a row into a table
 */
async function insertRow(client: any, tableName: string, data: any) {
  const columns = Object.keys(data);
  const values = columns.map(key => data[key]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  
  const insertSQL = `
    INSERT INTO "${tableName}" ("${columns.join('", "')}") 
    VALUES (${placeholders.join(', ')})
  `;
  
  await client.query(insertSQL, values);
}

/**
 * Update file paths to be environment-specific
 */
async function updateFilePaths(client: any) {
  // Update uploaded_files storage paths
  await client.query(`
    UPDATE uploaded_files
    SET storage_path = REPLACE(storage_path, '/uploads/', '/uploads/${NODE_ENV}/')
    WHERE storage_path NOT LIKE '%${NODE_ENV}/%'
  `);
  
  // Update backup_history file paths
  await client.query(`
    UPDATE backup_history
    SET file_path = REPLACE(file_path, '/backups/', '/backups/${NODE_ENV}/')
    WHERE file_path NOT LIKE '%${NODE_ENV}/%'
  `);
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