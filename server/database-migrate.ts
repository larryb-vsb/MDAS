import { db } from './db';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';
import { NODE_ENV } from './env-config';

/**
 * Migrates the database schema by checking for tables and creating them if they don't exist
 */
export async function migrateDatabase() {
  console.log(`Migrating ${NODE_ENV} database...`);
  
  try {
    // Check if tables exist
    const tableExists = await checkTablesExist();
    
    if (!tableExists) {
      console.log('Tables do not exist. Creating schema...');
      await createSchema();
      console.log('Schema created successfully.');
      return true;
    } else {
      console.log('Tables already exist. No migration needed.');
      return true;
    }
  } catch (error) {
    console.error('Error migrating database:', error);
    return false;
  }
}

/**
 * Check if the core tables exist in the database
 */
async function checkTablesExist() {
  try {
    // Try to query a table to see if it exists
    await db.select().from(schema.users).limit(1);
    return true;
  } catch (error: any) {
    // If the table doesn't exist, we'll get a specific error
    if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
      return false;
    }
    // If it's another error, re-throw it
    throw error;
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
      status TEXT NOT NULL DEFAULT 'active',
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      phone TEXT,
      country TEXT,
      other_client_number1 TEXT,
      other_client_number2 TEXT,
      client_since_date TEXT,
      last_upload_date TIMESTAMP WITH TIME ZONE,
      edit_date TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Transactions table
async function createTransactionsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      account TEXT,
      name TEXT,
      code TEXT,
      descr TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE
    )
  `);
}

// Uploaded files table
async function createUploadedFilesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      records_processed INTEGER DEFAULT 0,
      records_added INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP WITH TIME ZONE
    )
  `);
}

// Backup history table
async function createBackupHistoryTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      record_count INTEGER,
      tables_included TEXT[],
      storage_type TEXT NOT NULL DEFAULT 'local',
      s3_bucket TEXT,
      s3_key TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'complete',
      is_scheduled BOOLEAN DEFAULT FALSE,
      schedule_id TEXT,
      created_by TEXT
    )
  `);
}

// Backup schedules table
async function createBackupSchedulesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS backup_schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      day_of_week INTEGER,
      day_of_month INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      storage_type TEXT NOT NULL DEFAULT 'local',
      s3_bucket TEXT,
      s3_key_prefix TEXT,
      retention_count INTEGER DEFAULT 5,
      last_run TIMESTAMP WITH TIME ZONE,
      next_run TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Schema versions table
async function createSchemaVersionsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_versions (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      description TEXT,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}