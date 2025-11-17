/**
 * Generate complete production schema by executing SQL SHOW CREATE TABLE equivalent
 */
import { Pool } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as ws from 'ws';

// @ts-ignore
global.WebSocket = ws;

const DATABASE_URL = process.env.DATABASE_URL || '';

async function generateSchema() {
  console.log('🔨 Generating production schema...\n');

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Get all dev tables
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'dev_%'
      ORDER BY tablename
    `);

    console.log(`Found ${tablesResult.rows.length} tables\n`);

    let sql = `-- =====================================================================
-- PRODUCTION DATABASE SCHEMA
-- =====================================================================
-- Version: 2.8.0
-- Last Updated: 2025-11-17
--
-- Complete schema with ${tablesResult.rows.length} tables
-- Safe to run multiple times (uses IF NOT EXISTS)
-- =====================================================================

BEGIN;

`;

    for (const row of tablesResult.rows) {
      const devTable = row.tablename;
      const prodTable = devTable.replace(/^dev_/, '');

      console.log(`${devTable} → ${prodTable}`);

      // Get columns
      const cols = await pool.query(`
        SELECT 
          column_name, data_type, character_maximum_length,
          numeric_precision, numeric_scale,
          is_nullable, column_default, udt_name
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [devTable]);

      sql += `\nCREATE TABLE IF NOT EXISTS ${prodTable} (\n`;
      
      const colDefs: string[] = [];
      for (const c of cols.rows) {
        let type = c.data_type;
        
        if (type === 'ARRAY') {
          type = `${c.udt_name.slice(1)}[]`;
        } else if (type === 'numeric' && c.numeric_precision) {
          type = `numeric(${c.numeric_precision}, ${c.numeric_scale || 0})`;
        } else if (type === 'character varying') {
          type = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : 'text';
        } else if (type === 'timestamp without time zone') {
          type = 'timestamp';
        } else if (type === 'USER-DEFINED') {
          type = c.udt_name;
        }

        let def = `  ${c.column_name} ${type}`;
        
        if (c.is_nullable === 'NO') def += ' NOT NULL';
        if (c.column_default) def += ` DEFAULT ${c.column_default}`;
        
        colDefs.push(def);
      }

      sql += colDefs.join(',\n');
      sql += '\n);\n';

      // Get indexes
      const indexes = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1 AND schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
      `, [devTable]);

      for (const idx of indexes.rows) {
        const prodIdx = idx.indexdef
          .replace(new RegExp(devTable, 'g'), prodTable)
          .replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS');
        sql += `${prodIdx};\n`;
      }
    }

    sql += '\nCOMMIT;\n';

    fs.writeFileSync('production-schema.sql', sql);
    console.log(`\n✅ Generated production-schema.sql`);
    console.log(`📊 ${tablesResult.rows.length} tables, ${(sql.length/1024).toFixed(1)} KB`);

  } finally {
    await pool.end();
  }
}

generateSchema().catch(console.error);
