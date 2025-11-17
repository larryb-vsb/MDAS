import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

async function dumpSchema() {
  console.log('🔨 Generating production schema...\n');

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
-- Version: 2.8.0
-- Last Updated: ${dateStamp} ${timeStamp}
--
-- ${tables.rows.length} tables total
-- Run against EMPTY production database
-- =====================================================================

BEGIN;

`;

  for (const row of tables.rows) {
    const devTable = (row as any).tablename;
    const prodTable = devTable.replace(/^dev_/, '');

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

    outputSQL += `\n-- ${prodTable}\nCREATE TABLE IF NOT EXISTS ${prodTable} (\n`;
    
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
      if (col.column_default) def += ` DEFAULT ${col.column_default}`;
      
      colDefs.push(def);
    }

    outputSQL += colDefs.join(',\n') + '\n);\n';

    // Get indexes
    const indexes = await db.execute(sql.raw(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = '${devTable}' AND schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
    `));

    for (const idx of indexes.rows) {
      const idxRow = idx as any;
      const prodIdxDef = idxRow.indexdef
        .replace(new RegExp(devTable, 'g'), prodTable)
        .replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS');
      outputSQL += `${prodIdxDef};\n`;
    }
  }

  outputSQL += '\nCOMMIT;\n\n-- Schema complete\n';

  // Create timestamped filename (visible in file explorer)
  const timestamp = `${dateStamp}_${timeStamp.replace(/:/g, '-')}`; // YYYY-MM-DD_HH-MM-SS
  const timestampedFile = `production-schema-${timestamp}.sql`;
  
  // Write timestamped file (main versioned file)
  fs.writeFileSync(timestampedFile, outputSQL);
  
  // Also write to production-schema.sql (for easy reference)
  fs.writeFileSync('production-schema.sql', outputSQL);
  
  console.log(`\n✅ Generated: ${timestampedFile}`);
  console.log(`📋 Also saved as: production-schema.sql (for easy reference)`);
  console.log(`📊 ${tables.rows.length} tables`);
  console.log(`📝 ${(outputSQL.length/1024).toFixed(1)} KB`);
  console.log(`\n💡 Run against production: psql "$PROD_DB_URL" -f production-schema.sql`);
  process.exit(0);
}

dumpSchema().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
