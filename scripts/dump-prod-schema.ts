/**
 * Dump complete production schema SQL
 * Reads from dev database and generates production-ready CREATE statements
 */

import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import * as fs from 'fs';

neonConfig.webSocketConstructor = undefined as any;

const DATABASE_URL = process.env.DATABASE_URL || '';

async function dumpSchema() {
  console.log('🔨 Dumping production schema from development database...\n');

  const pool = new Pool({ connectionString: DATABASE_URL });

  // Get all dev_ tables
  const tablesResult = await pool.query(`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename LIKE 'dev_%'
    ORDER BY tablename
  `);

  console.log(`Found ${tablesResult.rows.length} development tables\n`);

  let sql = `-- =====================================================================
-- PRODUCTION DATABASE SCHEMA
-- =====================================================================
-- Version: 2.8.0
-- Last Updated: 2025-11-17
--
-- Complete production schema with all ${tablesResult.rows.length} tables
-- Auto-generated from development database
-- Safe to run multiple times (uses IF NOT EXISTS)
-- =====================================================================

BEGIN;

`;

  // For each table, get its CREATE TABLE statement
  for (const row of tablesResult.rows) {
    const devTableName = row.tablename;
    const prodTableName = devTableName.replace(/^dev_/, '');

    console.log(`Processing: ${devTableName} → ${prodTableName}`);

    // Get column definitions
    const columnsResult = await pool.query(`
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      ORDER BY ordinal_position
    `, [devTableName]);

    sql += `\n-- Table: ${prodTableName}\n`;
    sql += `CREATE TABLE IF NOT EXISTS ${prodTableName} (\n`;

    const columnDefs: string[] = [];
    for (const col of columnsResult.rows) {
      let def = `  ${col.column_name} `;
      
      // Map data type
      if (col.data_type === 'ARRAY') {
        def += `${col.udt_name.replace('_', '')}[]`;
      } else if (col.data_type === 'USER-DEFINED') {
        def += col.udt_name;
      } else {
        def += col.data_type;
        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }
      }

      // Add constraints
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }

      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }

      columnDefs.push(def);
    }

    sql += columnDefs.join(',\n');
    sql += `\n);\n`;

    // Get indexes
    const indexesResult = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = $1
      AND indexname NOT LIKE '%_pkey'
    `, [devTableName]);

    for (const idx of indexesResult.rows) {
      const prodIndexDef = idx.indexdef
        .replace(new RegExp(devTableName, 'g'), prodTableName)
        .replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS');
      sql += `${prodIndexDef};\n`;
    }
  }

  sql += `\nCOMMIT;\n\n`;
  sql += `-- =====================================================================\n`;
  sql += `-- SCHEMA CREATION COMPLETE\n`;
  sql += `-- ${tablesResult.rows.length} tables created\n`;
  sql += `-- =====================================================================\n`;

  fs.writeFileSync('production-schema.sql', sql);
  
  console.log(`\n✅ Generated: production-schema.sql`);
  console.log(`📊 ${tablesResult.rows.length} tables`);
  console.log(`📝 Size: ${(sql.length / 1024).toFixed(2)} KB`);

  await pool.end();
}

dumpSchema().catch(console.error);
