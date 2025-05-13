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
      edit_date TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
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