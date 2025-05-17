import { db } from './db';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';
import { NODE_ENV } from './env-config';

/**
 * Migrates the database schema by checking for tables and creating them if they don't exist
 * This function checks each required table individually and creates only missing ones
 */
export async function migrateDatabase() {
  console.log(`Migrating ${NODE_ENV} database...`);
  
  try {
    // Individual table checking and creation
    const allTablesExist = await checkTablesExist();
    
    if (allTablesExist) {
      console.log('All required tables exist. Migration complete.');
      
      // Even if all tables exist, we still need to check for new columns
      await checkAndAddMerchantColumns();
    } else {
      console.log('Schema update completed. Missing tables have been created.');
    }
    
    return true;
  } catch (error) {
    console.error('Error migrating database:', error);
    return false;
  }
}

/**
 * Check if the core tables exist in the database and create missing tables
 */
async function checkTablesExist() {
  console.log('Checking for required database tables...');
  
  // Define all expected tables
  const requiredTables = [
    { name: 'users', createFunction: createUsersTable },
    { name: 'merchants', createFunction: createMerchantsTable },
    { name: 'transactions', createFunction: createTransactionsTable },
    { name: 'uploaded_files', createFunction: createUploadedFilesTable },
    { name: 'backup_history', createFunction: createBackupHistoryTable },
    { name: 'backup_schedules', createFunction: createBackupSchedulesTable },
    { name: 'schema_versions', createFunction: createSchemaVersionsTable },
    { name: 'audit_logs', createFunction: createAuditLogsTable },
    { name: 'system_logs', createFunction: createSystemLogsTable },
    { name: 'security_logs', createFunction: createSecurityLogsTable }
  ];
  
  try {
    // Check which tables exist
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN (${sql.join(requiredTables.map(t => t.name), sql`, `)})
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    console.log('Existing tables:', existingTables);
    
    // Create missing tables
    let tablesCreated = false;
    for (const table of requiredTables) {
      if (!existingTables.includes(table.name)) {
        console.log(`Creating missing table: ${table.name}`);
        await table.createFunction();
        tablesCreated = true;
      }
    }
    
    return !tablesCreated; // Return true if no tables needed to be created
  } catch (error: any) {
    console.error('Error checking tables:', error);
    // If there's an error, assume tables need to be created
    return false;
  }
}

/**
 * Create all database tables
 */
async function createSchema() {
  // Create tables in the correct order based on dependencies
  await createUsersTable();
  await createMerchantsTable();
  await createTransactionsTable();
  await createUploadedFilesTable();
  await createBackupHistoryTable();
  await createBackupSchedulesTable();
  await createSchemaVersionsTable();
  await createAuditLogsTable();
  await createSystemLogsTable();
  await createSecurityLogsTable();
}