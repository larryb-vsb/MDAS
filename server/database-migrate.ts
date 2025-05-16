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
    { name: 'schema_versions', createFunction: createSchemaVersionsTable }
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
}

// Users table
async function createUsersTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP WITH TIME ZONE
    )
  `);
}

// Merchants table
async function createMerchantsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_mid TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      merchant_type INTEGER DEFAULT 0,
      sales_channel TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,
      category TEXT,
      other_client_number1 TEXT,
      other_client_number2 TEXT,
      client_since_date TIMESTAMP WITH TIME ZONE,
      last_upload_date TIMESTAMP WITH TIME ZONE,
      edit_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  
  // Check if the new columns exist, and add them if not
  await checkAndAddMerchantColumns();
}

// Transactions table
async function createTransactionsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      amount NUMERIC(10,2) NOT NULL,
      date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      type TEXT NOT NULL DEFAULT 'Sale'
    )
  `);
}

// Uploaded files table
async function createUploadedFilesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      processed BOOLEAN DEFAULT FALSE NOT NULL,
      processing_errors TEXT,
      deleted BOOLEAN DEFAULT FALSE NOT NULL
    )
  `);
}

// Backup history table
async function createBackupHistoryTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      size INTEGER NOT NULL,
      tables JSONB NOT NULL,
      notes TEXT,
      downloaded BOOLEAN DEFAULT FALSE NOT NULL,
      deleted BOOLEAN DEFAULT FALSE NOT NULL,
      storage_type TEXT DEFAULT 'local' NOT NULL,
      s3_bucket TEXT,
      s3_key TEXT
    )
  `);
}

// Backup schedules table
async function createBackupSchedulesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_schedules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      time_of_day TEXT NOT NULL,
      day_of_week INTEGER,
      day_of_month INTEGER,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      use_s3 BOOLEAN NOT NULL DEFAULT FALSE,
      retention_days INTEGER NOT NULL DEFAULT 30,
      last_run TIMESTAMP WITH TIME ZONE,
      next_run TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      notes TEXT
    )
  `);
}

// Schema versions table
async function createSchemaVersionsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_versions (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      description TEXT NOT NULL,
      changes JSONB,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      applied_by TEXT,
      script TEXT
    )
  `);
}

/**
 * Check for new merchant columns and add them if they don't exist
 */
async function checkAndAddMerchantColumns() {
  console.log('Checking if merchant_type and sales_channel columns exist...');
  
  try {
    // Check for merchant_type column
    const merchantTypeResult = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'merchants'
      AND column_name = 'merchant_type'
    `);
    
    if (merchantTypeResult.rows.length === 0) {
      console.log('Adding merchant_type column to merchants table');
      await db.execute(sql`
        ALTER TABLE merchants
        ADD COLUMN merchant_type INTEGER DEFAULT 0
      `);
    }
    
    // Check for sales_channel column
    const salesChannelResult = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'merchants'
      AND column_name = 'sales_channel'
    `);
    
    if (salesChannelResult.rows.length === 0) {
      console.log('Adding sales_channel column to merchants table');
      await db.execute(sql`
        ALTER TABLE merchants
        ADD COLUMN sales_channel TEXT
      `);
    }
    
    // Make sure edit_date has default value
    const editDateResult = await db.execute(sql`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'merchants'
      AND column_name = 'edit_date'
    `);
    
    if (editDateResult.rows.length > 0 && !editDateResult.rows[0].column_default) {
      console.log('Updating edit_date column to have a default value');
      await db.execute(sql`
        ALTER TABLE merchants
        ALTER COLUMN edit_date SET DEFAULT CURRENT_TIMESTAMP
      `);
    }
    
    console.log('Merchant columns check complete');
  } catch (error) {
    console.error('Error checking/adding merchant columns:', error);
  }
}