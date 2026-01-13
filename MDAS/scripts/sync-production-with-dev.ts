import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

async function syncProductionWithDev() {
  console.log('🔄 Syncing production schema with development...\n');

  const devSql = neon(process.env.DATABASE_URL!);
  const prodSql = neon(process.env.NEON_PROD_DATABASE_URL!);

  try {
    // Get all dev_ tables
    const devTables = await devSql(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'dev_%'
      ORDER BY tablename
    `);

    const migrations: string[] = [];

    for (const row of devTables) {
      const devTable = row.tablename;
      const prodTable = devTable.replace(/^dev_/, '');

      console.log(`\n📋 Checking: ${devTable} → ${prodTable}`);

      // Check if production table exists
      const prodTableExists = await prodSql(`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = $1
        )
      `, [prodTable]);

      if (!prodTableExists[0].exists) {
        console.log(`  ⚠️  Production table ${prodTable} doesn't exist - will be created by schema`);
        continue;
      }

      // Get dev columns
      const devColumns = await devSql(`
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
      `, [devTable]);

      // Get production columns
      const prodColumns = await prodSql(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
      `, [prodTable]);

      const prodColumnNames = new Set(prodColumns.map(r => r.column_name));

      // Find missing columns
      const missingColumns = devColumns.filter(col => !prodColumnNames.has(col.column_name));

      if (missingColumns.length === 0) {
        console.log(`  ✅ All columns exist`);
        continue;
      }

      console.log(`  🔧 Missing ${missingColumns.length} columns:`);

      for (const col of missingColumns) {
        console.log(`     - ${col.column_name}`);

        let dataType = col.data_type;
        
        // Handle array types
        if (col.data_type === 'ARRAY') {
          dataType = col.udt_name.replace(/^_/, '') + '[]';
        } 
        // Handle varchar
        else if (col.data_type === 'character varying') {
          dataType = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
        }
        // Handle char
        else if (col.data_type === 'character') {
          dataType = `char(${col.character_maximum_length})`;
        }
        // Handle numeric
        else if (col.data_type === 'numeric' && col.numeric_precision) {
          if (col.numeric_scale !== null) {
            dataType = `numeric(${col.numeric_precision},${col.numeric_scale})`;
          } else {
            dataType = 'numeric';
          }
        }
        // Handle user-defined types
        else if (col.data_type === 'USER-DEFINED') {
          dataType = col.udt_name;
        }

        let alterStatement = `ALTER TABLE "${prodTable}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${dataType}`;

        // Add NOT NULL constraint if applicable
        if (col.is_nullable === 'NO' && !col.column_default) {
          // Can't add NOT NULL without a default on existing table, so skip it
          console.log(`       (skipping NOT NULL - table has existing data)`);
        } else if (col.is_nullable === 'NO' && col.column_default) {
          alterStatement += ' NOT NULL';
        }

        // Add DEFAULT
        if (col.column_default) {
          alterStatement += ` DEFAULT ${col.column_default}`;
        }

        alterStatement += ';';
        migrations.push(alterStatement);
      }
    }

    // Write migration SQL file
    if (migrations.length > 0) {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
      
      let migrationSQL = `-- =====================================================================
-- PRODUCTION MIGRATION: Add Missing Columns
-- =====================================================================
-- Generated: ${now.toISOString()}
-- Missing columns: ${migrations.length}
-- =====================================================================

`;
      migrationSQL += migrations.join('\n\n') + '\n';

      const migrationFile = `sql/migration-add-columns-${timestamp}.sql`;
      fs.writeFileSync(migrationFile, migrationSQL);

      console.log(`\n✅ Generated migration: ${migrationFile}`);
      console.log(`📊 Total ALTER statements: ${migrations.length}`);
      console.log(`\n🚀 Run this migration first, then run production-schema.sql`);
      
      return migrationFile;
    } else {
      console.log(`\n✅ Production schema is in sync with development!`);
      return null;
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

syncProductionWithDev().catch(console.error);
