import { db } from './db';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';
import { NODE_ENV } from './env-config';
import { ensureTddfCacheTables, ensureProductionDatabaseHealth } from './startup-cache-validation';

/**
 * Get environment-aware table name
 */
const getTableName = (baseName: string) => {
  const prefix = NODE_ENV === 'development' ? 'dev_' : '';
  return `${prefix}${baseName}`;
};

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
      
      // Fix production uploader_uploads table missing upload_status column
      await fixProductionUploaderUploadsTable(db);
      
      // Check and create TDDF cache tables for current environment
      await ensureTddfCacheTables();
      
      // Run production-specific health checks and self-corrections
      await ensureProductionDatabaseHealth();
    } else {
      console.log('Schema update completed. Missing tables have been created.');
      
      // Fix production uploader_uploads table missing upload_status column
      await fixProductionUploaderUploadsTable(db);
      
      // Always ensure TDDF cache tables exist after table creation
      await ensureTddfCacheTables();
      
      // Run production-specific health checks and self-corrections
      await ensureProductionDatabaseHealth();
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
  
  // Define all expected tables with environment-aware naming
  const getTableName = (baseName: string) => {
    const prefix = NODE_ENV === 'development' ? 'dev_' : '';
    return `${prefix}${baseName}`;
  };

  const requiredTables = [
    // Core system tables
    { name: getTableName('users'), createFunction: createUsersTable },
    { name: getTableName('merchants'), createFunction: createMerchantsTable },
    { name: getTableName('transactions'), createFunction: createTransactionsTable },
    { name: getTableName('uploaded_files'), createFunction: createUploadedFilesTable },
    { name: getTableName('audit_logs'), createFunction: createAuditLogsTable },
    { name: getTableName('system_logs'), createFunction: createSystemLogsTable },
    { name: getTableName('security_logs'), createFunction: createSecurityLogsTable },
    { name: getTableName('terminals'), createFunction: createTerminalsTable },
    { name: getTableName('api_users'), createFunction: createApiUsersTable },
    { name: getTableName('processing_metrics'), createFunction: createProcessingMetricsTable },
    { name: getTableName('dev_uploads'), createFunction: createDevUploadsTable },
    
    // TDDF Processing Infrastructure (Schema 2.5.0)
    { name: getTableName('tddf_records'), createFunction: createTddfRecordsTable },
    { name: getTableName('tddf_raw_import'), createFunction: createTddfRawImportTable },
    { name: getTableName('tddf_batch_headers'), createFunction: createTddfBatchHeadersTable },
    { name: getTableName('tddf_purchasing_extensions'), createFunction: createTddfPurchasingExtensionsTable },
    { name: getTableName('tddf_other_records'), createFunction: createTddfOtherRecordsTable },
    { name: getTableName('tddf_jsonb'), createFunction: createTddfJsonbTable },
    
    // MMS Uploader System Tables (Schema 2.7.1)  
    { name: getTableName('uploader_uploads'), createFunction: createUploaderUploadsTable },
    { name: getTableName('uploader_json'), createFunction: createUploaderJsonTable },
    { name: getTableName('uploader_tddf_jsonb_records'), createFunction: createUploaderTddfJsonbRecordsTable },
    { name: getTableName('uploader_mastercard_di_edit_records'), createFunction: createUploaderMastercardDiEditRecordsTable },
    
    // Shared system tables (no environment prefix)
    { name: 'backup_history', createFunction: createBackupHistoryTable },
    { name: 'backup_schedules', createFunction: createBackupSchedulesTable },
    { name: 'schema_versions', createFunction: createSchemaVersionsTable },
    { name: 'schema_content', createFunction: createSchemaContentTable }
  ];
  
  try {
    // Check which tables exist using simpler approach
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
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
 * Create all database tables in dependency order
 */
async function createSchema() {
  // Core system tables
  await createUsersTable();
  await createMerchantsTable();
  await createTransactionsTable();
  await createTerminalsTable();
  await createUploadedFilesTable();
  await createApiUsersTable();
  await createProcessingMetricsTable();
  
  // TDDF Processing Infrastructure (Schema 2.5.0)
  await createTddfRecordsTable();
  await createTddfRawImportTable();
  await createTddfBatchHeadersTable();
  await createTddfPurchasingExtensionsTable();
  await createTddfOtherRecordsTable();
  
  // Logging and audit tables
  await createAuditLogsTable();
  await createSystemLogsTable();
  await createSecurityLogsTable();
  
  // Shared system tables
  await createBackupHistoryTable();
  await createBackupSchedulesTable();
  await createSchemaVersionsTable();
  await createSchemaContentTable();
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
      merchant_type TEXT,
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
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      as_of_date TIMESTAMP WITH TIME ZONE,
      updated_by TEXT
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

// Audit logs table
async function createAuditLogsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      username TEXT NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      old_values JSONB,
      new_values JSONB,
      changed_fields TEXT[],
      ip_address TEXT,
      user_agent TEXT,
      notes TEXT
    )
  `);
  
  // Create indexes for better query performance
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx ON audit_logs (entity_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_entity_id_idx ON audit_logs (entity_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs (timestamp)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs (user_id)`);
}

// System logs table
async function createSystemLogsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_logs (
      id SERIAL PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      details JSONB,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      hostname TEXT,
      process_id TEXT,
      session_id TEXT,
      correlation_id TEXT,
      stack_trace TEXT
    )
  `);
  
  // Create indexes for better query performance
  await db.execute(sql`CREATE INDEX IF NOT EXISTS system_logs_level_idx ON system_logs (level)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS system_logs_source_idx ON system_logs (source)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS system_logs_timestamp_idx ON system_logs (timestamp)`);
}

// Security logs table
async function createSecurityLogsTable() {
  // Use environment-aware table naming for user reference
  const { getTableName } = await import('./table-config');
  const usersTable = getTableName('users');
  
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${getTableName('security_logs')} (
      id SERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id INTEGER REFERENCES ${usersTable}(id),
      username TEXT,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      resource_type TEXT,
      resource_id TEXT,
      action TEXT,
      result TEXT NOT NULL,
      details JSONB,
      session_id TEXT,
      reason TEXT
    )
  `));
  
  // Create indexes for better query performance
  const securityLogsTable = getTableName('security_logs');
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${securityLogsTable}_event_type_idx ON ${securityLogsTable} (event_type)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${securityLogsTable}_username_idx ON ${securityLogsTable} (username)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${securityLogsTable}_timestamp_idx ON ${securityLogsTable} (timestamp)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS ${securityLogsTable}_result_idx ON ${securityLogsTable} (result)`));
}

/**
 * Check for new merchant columns and add them if they don't exist
 */
async function checkAndAddMerchantColumns() {
  console.log('Checking if merchant_type and sales_channel columns exist...');
  
  const merchantsTable = getTableName('merchants');
  
  try {
    // Check for merchant_type column and its data type
    const merchantTypeResult = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = ${merchantsTable}
      AND column_name = 'merchant_type'
    `);
    
    if (merchantTypeResult.rows.length === 0) {
      console.log(`Adding merchant_type column to ${merchantsTable} table as TEXT`);
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        ADD COLUMN merchant_type TEXT
      `));
    } else if (merchantTypeResult.rows[0].data_type === 'integer') {
      // If the column exists but is integer type, alter it to TEXT
      console.log('Changing merchant_type column from INTEGER to TEXT');
      
      // First, create a temporary column to store the converted values
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        ADD COLUMN merchant_type_temp TEXT
      `));
      
      // Copy values from integer column to text column
      await db.execute(sql.raw(`
        UPDATE ${merchantsTable}
        SET merchant_type_temp = 
          CASE 
            WHEN merchant_type IS NULL THEN NULL
            ELSE merchant_type::TEXT 
          END
      `));
      
      // Drop the old integer column
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        DROP COLUMN merchant_type
      `));
      
      // Rename the temp column to the original name
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        RENAME COLUMN merchant_type_temp TO merchant_type
      `));
      
      console.log('Successfully converted merchant_type column to TEXT');
    }
    
    // Check for sales_channel column
    const salesChannelResult = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = ${merchantsTable}
      AND column_name = 'sales_channel'
    `);
    
    if (salesChannelResult.rows.length === 0) {
      console.log(`Adding sales_channel column to ${merchantsTable} table`);
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        ADD COLUMN sales_channel TEXT
      `));
    }
    
    // Make sure edit_date has default value
    const editDateResult = await db.execute(sql`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = ${merchantsTable}
      AND column_name = 'edit_date'
    `);
    
    if (editDateResult.rows.length > 0 && !editDateResult.rows[0].column_default) {
      console.log('Updating edit_date column to have a default value');
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        ALTER COLUMN edit_date SET DEFAULT CURRENT_TIMESTAMP
      `));
    }
    
    // Check for as_of_date column
    const asOfDateResult = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = ${merchantsTable}
      AND column_name = 'as_of_date'
    `);
    
    if (asOfDateResult.rows.length === 0) {
      console.log(`Adding as_of_date column to ${merchantsTable} table`);
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        ADD COLUMN as_of_date TIMESTAMP WITH TIME ZONE
      `));
    }
    
    // Check for updated_by column
    const updatedByResult = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = ${merchantsTable}
      AND column_name = 'updated_by'
    `);
    
    if (updatedByResult.rows.length === 0) {
      console.log(`Adding updated_by column to ${merchantsTable} table`);
      await db.execute(sql.raw(`
        ALTER TABLE ${merchantsTable}
        ADD COLUMN updated_by TEXT
      `));
    }
    
    console.log('Merchant columns check complete');
  } catch (error) {
    console.error('Error checking/adding merchant columns:', error);
  }
}

// Environment-aware table creation functions

// Terminals table
async function createTerminalsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_terminals' : 'terminals';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      v_number TEXT UNIQUE NOT NULL,
      pos_merchant_number TEXT,
      bin TEXT,
      dba_name TEXT,
      daily_auth TEXT,
      dial_pay TEXT,
      encryption TEXT,
      prr TEXT,
      mcc TEXT,
      ssl TEXT,
      tokenization TEXT,
      agent TEXT,
      chain TEXT,
      store TEXT,
      terminal_info TEXT,
      record_status TEXT,
      board_date DATE,
      terminal_visa TEXT,
      terminal_type TEXT DEFAULT 'unknown',
      status TEXT DEFAULT 'Active',
      location TEXT,
      m_type TEXT,
      m_location TEXT,
      installation_date DATE,
      hardware_model TEXT,
      manufacturer TEXT,
      firmware_version TEXT,
      network_type TEXT,
      ip_address TEXT,
      generic_field1 TEXT,
      generic_field2 TEXT,
      description TEXT,
      notes TEXT,
      internal_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT 'System Import',
      updated_by TEXT DEFAULT 'System Import',
      last_activity TIMESTAMP WITH TIME ZONE,
      last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      update_source TEXT DEFAULT 'System Import',
      last_sync_date TIMESTAMP WITH TIME ZONE,
      sync_status TEXT DEFAULT 'Pending'
    )
  `);
}

// API Users table
async function createApiUsersTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_api_users' : 'api_users';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      permissions JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP WITH TIME ZONE,
      description TEXT
    )
  `);
}

// Processing Metrics table
async function createProcessingMetricsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_processing_metrics' : 'processing_metrics';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      files_processed INTEGER DEFAULT 0,
      records_processed INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,
      processing_time_ms INTEGER DEFAULT 0,
      metric_type TEXT DEFAULT 'snapshot',
      dt_records_processed INTEGER DEFAULT 0,
      bh_records_processed INTEGER DEFAULT 0,
      p1_records_processed INTEGER DEFAULT 0,
      other_records_processed INTEGER DEFAULT 0,
      non_dt_records_skipped INTEGER DEFAULT 0,
      other_skipped INTEGER DEFAULT 0,
      system_status TEXT DEFAULT 'operational'
    )
  `);
}

// TDDF Records table (Schema 2.5.0)
async function createTddfRecordsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_tddf_records' : 'tddf_records';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      sequence_number TEXT,
      reference_number TEXT,
      merchant_name TEXT,
      transaction_amount NUMERIC(15,2),
      transaction_date DATE,
      terminal_id TEXT,
      card_type TEXT,
      authorization_number TEXT,
      merchant_account_number TEXT,
      mcc_code TEXT,
      transaction_type_identifier TEXT,
      association_number_1 TEXT,
      association_number_2 TEXT,
      transaction_code TEXT,
      cardholder_account_number TEXT,
      group_number TEXT,
      batch_julian_date TEXT,
      debit_credit_indicator TEXT,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      source_row_number INTEGER,
      raw_data TEXT,
      mms_raw_line TEXT
    )
  `);
  
  // Add index for performance
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_reference_number`)} 
    ON ${sql.identifier(tableName)} (reference_number)
  `);
}

// TDDF Raw Import table (Schema 2.5.0)
async function createTddfRawImportTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_tddf_raw_import' : 'tddf_raw_import';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      source_file_id TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      record_type TEXT,
      raw_line TEXT NOT NULL,
      processing_status TEXT DEFAULT 'pending',
      processed_at TIMESTAMP WITH TIME ZONE,
      skip_reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      target_table TEXT,
      error_message TEXT
    )
  `);
  
  // Add indexes for performance
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_processing_status`)} 
    ON ${sql.identifier(tableName)} (processing_status)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_source_file`)} 
    ON ${sql.identifier(tableName)} (source_file_id)
  `);
}

// TDDF Batch Headers table (Schema 2.5.0)
async function createTddfBatchHeadersTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_tddf_batch_headers' : 'tddf_batch_headers';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      bh_record_number TEXT,
      record_identifier TEXT DEFAULT 'BH',
      transaction_code TEXT,
      batch_date TEXT,
      batch_julian_date TEXT,
      net_deposit NUMERIC(15,2),
      reject_reason TEXT,
      merchant_account_number TEXT,
      source_file_id TEXT,
      source_row_number INTEGER,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      raw_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// TDDF Purchasing Extensions table (Schema 2.5.0)
async function createTddfPurchasingExtensionsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_tddf_purchasing_extensions' : 'tddf_purchasing_extensions';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      record_identifier TEXT DEFAULT 'P1',
      parent_dt_reference TEXT,
      tax_amount NUMERIC(15,2),
      discount_amount NUMERIC(15,2),
      freight_amount NUMERIC(15,2),
      duty_amount NUMERIC(15,2),
      purchase_identifier TEXT,
      source_file_id TEXT,
      source_row_number INTEGER,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      raw_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// TDDF Other Records table (Schema 2.5.0)
async function createTddfOtherRecordsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_tddf_other_records' : 'tddf_other_records';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      record_type TEXT NOT NULL,
      reference_number TEXT,
      merchant_account TEXT,
      transaction_date DATE,
      amount NUMERIC(15,2),
      description TEXT,
      source_file_id TEXT,
      source_row_number INTEGER,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      raw_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Schema Content table (Schema management)
async function createSchemaContentTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_content (
      id SERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      applied_by TEXT DEFAULT 'Alex-ReplitAgent'
    )
  `);
  
  // Add index for version lookups
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_schema_content_version 
    ON schema_content (version)
  `);
}

// Dev uploads table for compressed storage testing
async function createDevUploadsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_dev_uploads' : 'dev_uploads';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      compressed_payload JSONB NOT NULL,
      schema_info JSONB NOT NULL,
      upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      status TEXT DEFAULT 'uploaded' NOT NULL,
      processed_at TIMESTAMP WITH TIME ZONE,
      record_count INTEGER,
      processing_time_ms INTEGER,
      notes TEXT
    )
  `);
}

// MMS Uploader - TDDF JSONB Table (Schema 2.7.1)
async function createTddfJsonbTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      record_type TEXT NOT NULL, -- DT, BH, P1, etc.
      line_number INTEGER NOT NULL,
      raw_line TEXT NOT NULL,
      extracted_fields JSONB NOT NULL, -- All parsed fields as JSON
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create indexes for performance
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_upload_id`)} ON ${sql.identifier(tableName)} (upload_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_record_type`)} ON ${sql.identifier(tableName)} (record_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_extracted_fields`)} ON ${sql.identifier(tableName)} USING GIN (extracted_fields)`);
}

// MMS Uploader - Main Uploads Table (Schema 2.7.1)
async function createUploaderUploadsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_uploader_uploads' : 'uploader_uploads';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL, -- tddf, ach_merchant, etc.
      status TEXT DEFAULT 'started' NOT NULL, -- started, uploading, uploaded, identified, encoding, processing, completed, error
      session_id TEXT,
      started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      uploaded_at TIMESTAMP WITH TIME ZONE,
      identified_at TIMESTAMP WITH TIME ZONE,
      encoding_at TIMESTAMP WITH TIME ZONE,  
      processing_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      file_size BIGINT,
      line_count INTEGER,
      has_headers BOOLEAN,
      file_format TEXT,
      encoding_detected TEXT,
      storage_key TEXT,
      bucket_name TEXT,
      encoding_status TEXT,
      encoding_time_ms INTEGER,
      json_records_created INTEGER,
      processing_errors TEXT,
      keep_for_review BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_status`)} ON ${sql.identifier(tableName)} (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_file_type`)} ON ${sql.identifier(tableName)} (file_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_session_id`)} ON ${sql.identifier(tableName)} (session_id)`);
}

// MMS Uploader - JSON Processing Table (Schema 2.7.1)
async function createUploaderJsonTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_uploader_json' : 'uploader_json';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL,
      raw_line_data TEXT,
      processed_json JSONB,
      field_separation_data JSONB,
      processing_time_ms INTEGER,
      errors JSONB,
      source_file_name TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_upload_id`)} ON ${sql.identifier(tableName)} (upload_id)`);
}

// MMS Uploader - TDDF JSONB Records Table (Schema 2.7.1)  
async function createUploaderTddfJsonbRecordsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_uploader_tddf_jsonb_records' : 'uploader_tddf_jsonb_records';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL,
      record_type TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      raw_line TEXT NOT NULL,
      extracted_fields JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_upload_id`)} ON ${sql.identifier(tableName)} (upload_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_record_type`)} ON ${sql.identifier(tableName)} (record_type)`);
}

// MMS Uploader - MasterCard DI Edit Records Table (Schema 2.7.1)
async function createUploaderMastercardDiEditRecordsTable() {
  const tableName = NODE_ENV === 'development' ? 'dev_uploader_mastercard_di_edit_records' : 'uploader_mastercard_di_edit_records';
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (    
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL,
      record_data JSONB NOT NULL,
      processing_status TEXT DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`idx_${tableName}_upload_id`)} ON ${sql.identifier(tableName)} (upload_id)`);
}

/**
 * Fix missing upload_status column in production uploader_uploads table
 * This resolves the production upload failure: 500: {"error":"column \"upload_status\" of relation \"uploader_uploads\" does not exist"}
 */
async function fixProductionUploaderUploadsTable(db: any) {
  try {
    console.log('[SCHEMA FIX] Checking production uploader_uploads table for missing upload_status column...');
    
    // Check if production uploader_uploads table exists
    const tableCheck = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'uploader_uploads'
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('[SCHEMA FIX] Production uploader_uploads table does not exist, skipping column fix');
      return;
    }
    
    // Check if upload_status column exists
    const columnCheck = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'uploader_uploads' 
      AND column_name = 'upload_status'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('[SCHEMA FIX] upload_status column already exists in production uploader_uploads table');
      return;
    }
    
    console.log('[SCHEMA FIX] Adding missing upload_status column to production uploader_uploads table...');
    
    // Add the missing upload_status column with proper default and constraints
    await db.execute(sql`
      ALTER TABLE uploader_uploads 
      ADD COLUMN upload_status TEXT NOT NULL DEFAULT 'started'
    `);
    
    // Add constraint to ensure valid status values
    await db.execute(sql`
      ALTER TABLE uploader_uploads 
      ADD CONSTRAINT uploader_uploads_upload_status_check 
      CHECK (upload_status IN ('started', 'uploading', 'uploaded', 'failed'))
    `);
    
    // Create index for performance
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS uploader_uploads_upload_status_idx 
      ON uploader_uploads (upload_status)
    `);
    
    console.log('[SCHEMA FIX] ✅ Successfully added upload_status column to production uploader_uploads table');
    
    // Verify the fix worked
    const verifyCheck = await db.execute(sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'uploader_uploads' 
      AND column_name = 'upload_status'
    `);
    
    if (verifyCheck.rows.length > 0) {
      console.log('[SCHEMA FIX] ✅ Column verification successful:', verifyCheck.rows[0]);
    }
    
  } catch (error: any) {
    console.error('[SCHEMA FIX] ❌ Error fixing production uploader_uploads table:', error);
    // Don't throw - continue with other migrations
  }
}