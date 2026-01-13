import { Client } from 'pg';
import * as fs from 'fs';

// Table descriptions for COMMENT ON TABLE statements
const tableDescriptions: Record<string, string> = {
  merchants: 'Core merchant data with TSYS MCC fields, risk assessment, and pre-cached TDDF tracking',
  api_merchants: 'ACH merchant imports from file uploads',
  api_terminals: 'Terminal data from API imports',
  transactions: 'VSB API transaction records',
  api_achtransactions: 'ACH transaction imports from file uploads',
  uploaded_files: 'File upload tracking and metadata',
  tddf_batch_headers: 'TDDF batch header records',
  tddf_transaction_records: 'TDDF transaction detail records',
  tddf_purchasing_extensions: 'TDDF P1 purchasing extension records',
  tddf_records: 'Unified TDDF records storage',
  tddf_jsonb: 'Partitioned TDDF JSONB storage (parent table)',
  'tddf_jsonb_2022_q4': 'TDDF JSONB partition: Q4 2022',
  'tddf_jsonb_2023_q1': 'TDDF JSONB partition: Q1 2023',
  'tddf_jsonb_2023_q2': 'TDDF JSONB partition: Q2 2023',
  'tddf_jsonb_2023_q3': 'TDDF JSONB partition: Q3 2023',
  'tddf_jsonb_2023_q4': 'TDDF JSONB partition: Q4 2023',
  'tddf_jsonb_2024_q1': 'TDDF JSONB partition: Q1 2024',
  'tddf_jsonb_2024_q2': 'TDDF JSONB partition: Q2 2024',
  'tddf_jsonb_2024_q3': 'TDDF JSONB partition: Q3 2024',
  'tddf_jsonb_2024_q4': 'TDDF JSONB partition: Q4 2024',
  'tddf_jsonb_2025_q1': 'TDDF JSONB partition: Q1 2025',
  'tddf_jsonb_2025_q2': 'TDDF JSONB partition: Q2 2025',
  'tddf_jsonb_2025_q3': 'TDDF JSONB partition: Q3 2025',
  'tddf_jsonb_2025_q4': 'TDDF JSONB partition: Q4 2025',
  'tddf_jsonb_2026_q1': 'TDDF JSONB partition: Q1 2026',
  'tddf_jsonb_2026_q2': 'TDDF JSONB partition: Q2 2026',
  tddf_jsonb_default: 'TDDF JSONB partition: Default (catch-all)',
  tddf_other_records: 'TDDF other record types (E1, G2, etc.)',
  tddf_raw_import: 'Raw TDDF import data preservation',
  users: 'System user accounts with authentication',
  api_users: 'API key authentication for batch uploaders',
  connection_log: 'API request logging for security monitoring',
  ip_blocklist: 'Blocked IP addresses',
  host_approvals: 'Host + API key approval system for uploads',
  audit_logs: 'System audit trail',
  uploader_uploads: 'File uploader processing pipeline tracking',
  uploader_json: 'JSON file upload processing',
  uploader_tddf_jsonb_records: 'TDDF JSONB record processing queue',
  uploader_mastercard_di_edit_records: 'Mastercard DI edit record processing',
  cache_configuration: 'Cache settings and expiration policies',
  tddf1_merchants: 'TDDF1 merchant summary data',
  tddf1_monthly_cache: 'Monthly pre-cached TDDF1 data for instant dashboard loading',
  tddf1_totals: 'TDDF1 aggregated totals',
  system_logs: 'System-wide logging',
  system_settings: 'Application configuration settings',
  processing_metrics: 'File processing performance metrics',
  processing_timing_logs: 'Detailed processing timing data',
  security_logs: 'Security event logging',
  master_object_keys: 'Object storage key tracking and management',
  merchant_mcc_schema: 'Dynamic MCC schema configuration for merchant fields',
  sub_merchant_terminals: 'Sub-merchant terminal mappings',
  dashboard_cache: 'Dashboard data cache',
  session: 'User session storage',
  tddf_archive: 'Archived TDDF files',
  tddf_archive_records: 'Archived TDDF record details',
  tddf_datamaster: 'TDDF master data reference',
  terminals: 'Terminal configuration and tracking',
  pre_cache_runs: 'Pre-cache build job tracking',
  duplicate_finder_cache: 'Duplicate detection cache',
  charts_pre_cache: 'Pre-cached chart data',
  tddf_import_log: 'TDDF import processing log',
  tddf_api_files: 'TDDF API file metadata',
  tddf_api_keys: 'TDDF API authentication keys',
  tddf_api_queue: 'TDDF API processing queue',
  tddf_api_records: 'TDDF API record storage',
  tddf_api_request_logs: 'TDDF API request logging',
  tddf_api_schemas: 'TDDF API schema definitions',
  tddf1_activity_cache: 'TDDF1 activity data cache',
  tddf_object_totals_cache_2025: 'TDDF object totals cache for 2025',
  tddf_json_record_type_counts_pre_cache: 'Pre-cached record type counts for TDDF JSON',
  dev_uploads: 'Development environment file uploads'
};

function escapeIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sanitizeTableName(name: string): string {
  return name.replace(/[^a-z0-9_]/gi, '_');
}

async function dumpSchema() {
  console.log('🔨 Dumping PRODUCTION schema directly from production database...\n');

  const client = new Client({
    connectionString: process.env.NEON_PROD_DATABASE_URL
  });

  await client.connect();

  try {
    // Get all non-dev tables from production
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'dev_%'
      AND tablename NOT LIKE 'drizzle_%'
      ORDER BY tablename
    `);

    const tables = tablesResult.rows.map(r => r.tablename);
    console.log(`Found ${tables.length} production tables\n`);

    const now = new Date();
    const dateStamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStamp = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS

    let outputSQL = `-- =====================================================================
-- PRODUCTION DATABASE SCHEMA (Dumped from Production)
-- =====================================================================
-- Version: 3.0.0
-- Generated: ${dateStamp} ${now.toTimeString().split(' ')[0]}
--
-- ${tables.length} tables total
-- Safe to run on EMPTY or EXISTING database (uses IF NOT EXISTS)
-- Creates missing tables/indexes, skips existing ones, preserves data
-- Note: No transaction wrapper - each statement runs independently
-- =====================================================================

`;

    for (const tableName of tables) {
      console.log(`Processing: ${tableName}`);

      // Get table columns
      const columnsResult = await client.query(`
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default,
          udt_name
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);

      if (columnsResult.rows.length === 0) continue;

      // Start CREATE TABLE
      outputSQL += `-- Table: ${tableName}\n`;
      outputSQL += `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(tableName)} (\n`;

      const columnDefs = columnsResult.rows.map((col: any) => {
        let def = `  ${escapeIdentifier(col.column_name)} `;

        // Handle data type
        if (col.data_type === 'ARRAY') {
          def += col.udt_name.replace(/^_/, '') + '[]';
        } else if (col.data_type === 'USER-DEFINED') {
          def += col.udt_name;
        } else if (col.data_type === 'character varying') {
          def += col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
        } else if (col.data_type === 'character') {
          def += `char(${col.character_maximum_length})`;
        } else if (col.data_type === 'numeric') {
          if (col.numeric_precision && col.numeric_scale !== null) {
            def += `numeric(${col.numeric_precision},${col.numeric_scale})`;
          } else {
            def += 'numeric';
          }
        } else {
          def += col.data_type;
        }

        // Handle NOT NULL
        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }

        // Handle DEFAULT
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }

        return def;
      });

      outputSQL += columnDefs.join(',\n');
      outputSQL += '\n);\n\n';

      // Add table comment
      if (tableDescriptions[tableName]) {
        outputSQL += `COMMENT ON TABLE ${escapeIdentifier(tableName)} IS '${tableDescriptions[tableName]}';\n\n`;
      }

      // Get sequences owned by this table
      const sequencesResult = await client.query(`
        SELECT 
          pg_get_serial_sequence($1, column_name) as sequence_name,
          column_name
        FROM information_schema.columns
        WHERE table_name = $1 
        AND table_schema = 'public'
        AND column_default LIKE 'nextval%'
      `, [tableName]);

      for (const seq of sequencesResult.rows) {
        if (seq.sequence_name) {
          const seqName = seq.sequence_name.replace(/^public\./, '').replace(/"/g, '');
          outputSQL += `CREATE SEQUENCE IF NOT EXISTS ${escapeIdentifier(seqName)};\n`;
        }
      }

      if (sequencesResult.rows.length > 0) {
        outputSQL += '\n';
      }

      // Get indexes
      const indexesResult = await client.query(`
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE tablename = $1
        AND schemaname = 'public'
        ORDER BY indexname
      `, [tableName]);

      for (const idx of indexesResult.rows) {
        const indexDef = idx.indexdef.replace(/CREATE (UNIQUE )?INDEX/, 'CREATE $1INDEX IF NOT EXISTS');
        outputSQL += `${indexDef};\n`;
      }

      if (indexesResult.rows.length > 0) {
        outputSQL += '\n';
      }
    }

    // Write to timestamped file
    const timestampedFile = `sql/production-schema-${dateStamp}_${timeStamp}.sql`;
    fs.writeFileSync(timestampedFile, outputSQL);
    console.log(`\n✅ Generated: ${timestampedFile}`);

    // Also write to current reference file
    const currentFile = 'sql/production-schema.sql';
    fs.writeFileSync(currentFile, outputSQL);
    console.log(`📋 Also saved as: ${currentFile}`);

    // Show stats
    const sizeKB = (Buffer.byteLength(outputSQL) / 1024).toFixed(1);
    console.log(`\n📊 Schema size: ${sizeKB} KB`);
    console.log(`📊 Total tables: ${tables.length}`);

  } finally {
    await client.end();
  }
}

dumpSchema().catch(console.error);
