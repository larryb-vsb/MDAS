import { db } from '../server/db';
import { sql } from 'drizzle-orm';
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
  tddf_json_record_type_counts_pre_cache: 'Pre-cached record type counts for TDDF JSON'
};

async function dumpSchema() {
  console.log('🔨 Generating production schema with table comments...\n');

  // Get current SchemaWatch version
  let schemaVersion = '2.9.0'; // Fallback version
  try {
    const versionResult = await db.execute(sql`
      SELECT version FROM schema_watch.current_version_mat
    `);
    if (versionResult.rows.length > 0) {
      schemaVersion = (versionResult.rows[0] as any).version.toString();
      console.log(`📌 Current SchemaWatch version: v${schemaVersion}\n`);
    }
  } catch (err) {
    console.warn('⚠️  Could not fetch SchemaWatch version, using fallback:', schemaVersion);
  }

  // Get all dev_ tables using raw SQL
  const tables = await db.execute(sql`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename LIKE 'dev_%'
    ORDER BY tablename
  `);

  console.log(`Found ${tables.rows.length} tables\n`);

  const now = new Date();
  const dateStamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStamp = now.toTimeString().split(' ')[0]; // HH:MM:SS

  let outputSQL = `-- =====================================================================
-- PRODUCTION DATABASE SCHEMA
-- =====================================================================
-- Version: ${schemaVersion} (Auto-tracked by SchemaWatch)
-- Generated: ${dateStamp} ${timeStamp}
--
-- ${tables.rows.length} tables total
-- Safe to run on EMPTY or EXISTING database (uses IF NOT EXISTS)
-- Creates missing tables/indexes, skips existing ones, preserves data
-- Note: No transaction wrapper - each statement runs independently
-- =====================================================================

`;

  for (const row of tables.rows) {
    const devTable = (row as any).tablename;
    const prodTable = devTable.replace(/^dev_/, '');
    
    // Quote table names if they contain hyphens or other special characters
    const needsQuoting = prodTable.includes('-') || prodTable.includes(' ');
    const quotedProdTable = needsQuoting ? `"${prodTable}"` : prodTable;

    console.log(`Processing: ${devTable} → ${prodTable}`);

    // Get columns
    const columns = await db.execute(sql.raw(`
      SELECT column_name, data_type, character_maximum_length,
             numeric_precision, numeric_scale, is_nullable, 
             column_default, udt_name
      FROM information_schema.columns
      WHERE table_name = '${devTable}' AND table_schema = 'public'
      ORDER BY ordinal_position
    `));

    outputSQL += `\n-- ${prodTable}\n`;
    
    // Check if table needs a sequence (for serial/integer primary keys)
    const sequenceName = needsQuoting ? `"${prodTable}_id_seq"` : `${prodTable}_id_seq`;
    const needsSequence = (await db.execute(sql.raw(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_name = '${devTable}' 
      AND column_name = 'id'
      AND column_default LIKE '%nextval%'
    `))).rows.length > 0;
    
    if (needsSequence) {
      outputSQL += `CREATE SEQUENCE IF NOT EXISTS ${sequenceName};\n`;
    }
    
    outputSQL += `CREATE TABLE IF NOT EXISTS ${quotedProdTable} (\n`;
    
    const colDefs: string[] = [];
    for (const c of columns.rows) {
      const col = c as any;
      let type = col.data_type;
      
      // Map types
      if (type === 'ARRAY') {
        type = `${col.udt_name.slice(1)}[]`;
      } else if (type === 'numeric' && col.numeric_precision) {
        type = `numeric(${col.numeric_precision}, ${col.numeric_scale || 0})`;
      } else if (type === 'character varying') {
        type = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'text';
      } else if (type === 'timestamp without time zone') {
        type = 'timestamp';
      } else if (type === 'USER-DEFINED') {
        type = col.udt_name;
      }

      let def = `  ${col.column_name} ${type}`;
      if (col.is_nullable === 'NO') def += ' NOT NULL';
      if (col.column_default) {
        // Replace dev_ sequence names in DEFAULT clauses (handle hyphens too)
        let prodDefault = col.column_default.replace(/dev_([a-z0-9_-]+)_seq/gi, '$1_seq');
        
        // If the prod table name needs quoting, quote the sequence name in the nextval() call
        // Pattern: nextval('sequence_name'::regclass) -> nextval('"sequence_name"'::regclass)
        if (needsQuoting) {
          const seqPattern = new RegExp(`'${prodTable}_id_seq'`, 'g');
          prodDefault = prodDefault.replace(seqPattern, `'"${prodTable}_id_seq"'`);
        }
        
        def += ` DEFAULT ${prodDefault}`;
      }
      
      colDefs.push(def);
    }

    outputSQL += colDefs.join(',\n') + '\n);\n';

    // Add table comment if available
    if (tableDescriptions[prodTable]) {
      outputSQL += `COMMENT ON TABLE ${quotedProdTable} IS '${tableDescriptions[prodTable]}';\n`;
    }

    // Get indexes
    const indexes = await db.execute(sql.raw(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = '${devTable}' AND schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
    `));

    for (const idx of indexes.rows) {
      const idxRow = idx as any;
      const devIdxName = idxRow.indexname;
      const prodIdxName = devIdxName.replace(/^dev_/, '');
      
      let prodIdxDef = idxRow.indexdef
        .replace(new RegExp(devTable, 'g'), prodTable)
        .replace(new RegExp(devIdxName, 'g'), prodIdxName)
        .replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS')
        .replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS');
      
      // Quote table name in index definition if needed
      if (needsQuoting) {
        const tablePattern = new RegExp(`ON ${prodTable}`, 'g');
        prodIdxDef = prodIdxDef.replace(tablePattern, `ON ${quotedProdTable}`);
      }
      
      outputSQL += `${prodIdxDef};\n`;
    }
  }

  outputSQL += '\n-- Schema complete\n';

  // Ensure sql directory exists
  if (!fs.existsSync('sql')) {
    fs.mkdirSync('sql');
  }

  // Create timestamped filename (visible in file explorer)
  const timestamp = `${dateStamp}_${timeStamp.replace(/:/g, '-')}`; // YYYY-MM-DD_HH-MM-SS
  const timestampedFile = `sql/production-schema-${timestamp}.sql`;
  
  // Write timestamped file (main versioned file)
  fs.writeFileSync(timestampedFile, outputSQL);
  
  // Also write to production-schema.sql (for easy reference)
  fs.writeFileSync('sql/production-schema.sql', outputSQL);
  
  console.log(`\n✅ Generated: ${timestampedFile}`);
  console.log(`📋 Also saved as: sql/production-schema.sql (for easy reference)`);
  console.log(`📊 ${tables.rows.length} tables`);
  console.log(`📝 ${(outputSQL.length/1024).toFixed(1)} KB`);
  console.log(`\n💡 Run against production: psql "$PROD_DB_URL" -f sql/production-schema.sql`);
  
  // Record schema generation event with current SchemaWatch version
  try {
    await db.execute(sql`
      INSERT INTO dev_schema_dump_tracking (version, environment, action, timestamp, performed_by, notes)
      VALUES (${schemaVersion}, 'development', 'schema_generated', NOW(), 'simple-schema-dump.ts', 
              ${`Generated ${tables.rows.length} tables, ${(outputSQL.length/1024).toFixed(1)} KB`})
    `);
    console.log(`\n📝 Schema generation tracked in dev_schema_dump_tracking (version ${schemaVersion})`);
  } catch (trackError) {
    console.warn(`⚠️  Could not track schema generation:`, trackError);
  }
  
  process.exit(0);
}

dumpSchema().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
