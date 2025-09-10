#!/usr/bin/env node
/**
 * Schema Comparison Tool
 * Compares production and development database schemas to identify differences
 * for safe production database migration planning.
 */

import pkg from 'pg';
const { Client } = pkg;

const TABLES_TO_COMPARE = [
  'uploaded_files',
  'uploader_uploads', 
  'duplicate_finder_cache',
  'merchants',
  'transactions',
  'users',
  'audit_logs',
  'system_logs',
  'security_logs',
  'processing_metrics',
  'session'
];

async function getTableSchema(client, tableName) {
  const query = `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns 
    WHERE table_name = $1 
    ORDER BY ordinal_position;
  `;
  
  try {
    const result = await client.query(query, [tableName]);
    return result.rows;
  } catch (error) {
    if (error.code === '42P01') {
      // Table does not exist
      return null;
    }
    throw error;
  }
}

async function getTableConstraints(client, tableName) {
  const query = `
    SELECT 
      constraint_name,
      constraint_type,
      column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = $1
    ORDER BY constraint_name;
  `;
  
  try {
    const result = await client.query(query, [tableName]);
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function getTableIndexes(client, tableName) {
  const query = `
    SELECT 
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE tablename = $1
    ORDER BY indexname;
  `;
  
  try {
    const result = await client.query(query, [tableName]);
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function compareSchemas() {
  const devUrl = process.env.NEON_DEV_DATABASE_URL;
  const prodUrl = process.env.NEON_PROD_DATABASE_URL;
  
  if (!devUrl || !prodUrl) {
    console.error('❌ Missing database URLs:');
    console.error(`   NEON_DEV_DATABASE_URL: ${devUrl ? '✅ Set' : '❌ Missing'}`);
    console.error(`   NEON_PROD_DATABASE_URL: ${prodUrl ? '✅ Set' : '❌ Missing'}`);
    process.exit(1);
  }

  const devClient = new Client({ connectionString: devUrl });
  const prodClient = new Client({ connectionString: prodUrl });

  try {
    await devClient.connect();
    await prodClient.connect();
    
    console.log('🔍 DATABASE SCHEMA COMPARISON REPORT');
    console.log('=' .repeat(60));
    console.log(`📊 Comparing ${TABLES_TO_COMPARE.length} critical tables\n`);

    const report = {
      differences: [],
      missing_in_prod: [],
      missing_in_dev: [],
      column_differences: []
    };

    for (const baseTableName of TABLES_TO_COMPARE) {
      const devTableName = `dev_${baseTableName}`;
      const prodTableName = baseTableName;
      
      console.log(`🔍 Analyzing: ${prodTableName} vs ${devTableName}`);
      
      // Get schemas
      const devSchema = await getTableSchema(devClient, devTableName);
      const prodSchema = await getTableSchema(prodClient, prodTableName);
      
      if (!devSchema && !prodSchema) {
        console.log(`   ⚠️  Both tables missing - skipping\n`);
        continue;
      }
      
      if (!prodSchema) {
        console.log(`   ❌ Production table missing: ${prodTableName}`);
        report.missing_in_prod.push(prodTableName);
        continue;
      }
      
      if (!devSchema) {
        console.log(`   ❌ Development table missing: ${devTableName}`);
        report.missing_in_dev.push(devTableName);
        continue;
      }

      // Compare columns
      const devColumns = new Map(devSchema.map(col => [col.column_name, col]));
      const prodColumns = new Map(prodSchema.map(col => [col.column_name, col]));
      
      const missingInProd = [];
      const missingInDev = [];
      const differentTypes = [];
      
      // Check for columns in dev but not in prod
      for (const [colName, colDef] of devColumns) {
        if (!prodColumns.has(colName)) {
          missingInProd.push({
            table: baseTableName,
            column: colName,
            type: colDef.data_type,
            nullable: colDef.is_nullable,
            default: colDef.column_default
          });
        } else {
          // Check for type differences
          const prodCol = prodColumns.get(colName);
          if (colDef.data_type !== prodCol.data_type || 
              colDef.is_nullable !== prodCol.is_nullable ||
              colDef.column_default !== prodCol.column_default) {
            differentTypes.push({
              table: baseTableName,
              column: colName,
              dev: {
                type: colDef.data_type,
                nullable: colDef.is_nullable,
                default: colDef.column_default
              },
              prod: {
                type: prodCol.data_type,
                nullable: prodCol.is_nullable,
                default: prodCol.column_default
              }
            });
          }
        }
      }
      
      // Check for columns in prod but not in dev
      for (const [colName, colDef] of prodColumns) {
        if (!devColumns.has(colName)) {
          missingInDev.push({
            table: baseTableName,
            column: colName,
            type: colDef.data_type,
            nullable: colDef.is_nullable,
            default: colDef.column_default
          });
        }
      }
      
      if (missingInProd.length > 0) {
        console.log(`   🔍 Columns missing in production (${missingInProd.length}):`);
        missingInProd.forEach(col => {
          console.log(`      + ${col.column}: ${col.type}${col.nullable === 'NO' ? ' NOT NULL' : ''}${col.default ? ` DEFAULT ${col.default}` : ''}`);
        });
        report.column_differences.push({
          table: baseTableName,
          missing_in_prod: missingInProd
        });
      }
      
      if (missingInDev.length > 0) {
        console.log(`   🔍 Columns missing in development (${missingInDev.length}):`);
        missingInDev.forEach(col => {
          console.log(`      - ${col.column}: ${col.type}${col.nullable === 'NO' ? ' NOT NULL' : ''}${col.default ? ` DEFAULT ${col.default}` : ''}`);
        });
      }
      
      if (differentTypes.length > 0) {
        console.log(`   ⚠️  Column type differences (${differentTypes.length}):`);
        differentTypes.forEach(col => {
          console.log(`      ! ${col.column}:`);
          console.log(`         Dev:  ${col.dev.type}${col.dev.nullable === 'NO' ? ' NOT NULL' : ''}${col.dev.default ? ` DEFAULT ${col.dev.default}` : ''}`);
          console.log(`         Prod: ${col.prod.type}${col.prod.nullable === 'NO' ? ' NOT NULL' : ''}${col.prod.default ? ` DEFAULT ${col.prod.default}` : ''}`);
        });
      }

      if (missingInProd.length === 0 && missingInDev.length === 0 && differentTypes.length === 0) {
        console.log(`   ✅ Schemas match\n`);
      } else {
        console.log('');
      }
    }

    // Summary
    console.log('📋 MIGRATION SUMMARY');
    console.log('=' .repeat(40));
    
    if (report.missing_in_prod.length > 0) {
      console.log(`❌ Tables missing in production: ${report.missing_in_prod.length}`);
      report.missing_in_prod.forEach(table => console.log(`   - ${table}`));
      console.log('');
    }

    const totalColumnsMissingInProd = report.column_differences.reduce((sum, table) => 
      sum + (table.missing_in_prod?.length || 0), 0);
      
    if (totalColumnsMissingInProd > 0) {
      console.log(`🔧 Columns needing migration to production: ${totalColumnsMissingInProd}`);
      report.column_differences.forEach(table => {
        if (table.missing_in_prod?.length > 0) {
          console.log(`   ${table.table} (${table.missing_in_prod.length} columns)`);
        }
      });
      console.log('');
    }

    if (report.missing_in_prod.length === 0 && totalColumnsMissingInProd === 0) {
      console.log('✅ No critical differences found - production schema is up to date');
    } else {
      console.log('⚠️  Production database requires updates to match development schema');
    }

    return report;
    
  } catch (error) {
    console.error('❌ Error during schema comparison:', error.message);
    throw error;
  } finally {
    await devClient.end();
    await prodClient.end();
  }
}

// Run if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  compareSchemas()
    .then((report) => {
      console.log('\n🎯 Schema comparison completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Schema comparison failed:', error.message);
      process.exit(1);
    });
}

export { compareSchemas };