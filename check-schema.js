#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment variables');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function checkSchema() {
  try {
    console.log('🔍 Checking current database schema...\n');
    
    // Get all tables
    const tables = await sql`
      SELECT table_name, table_schema 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;

    console.log('📊 CURRENT TABLES IN DATABASE:');
    console.log('================================');
    
    // Separate dev and prod tables
    const devTables = [];
    const prodTables = [];
    const systemTables = [];
    
    tables.forEach(table => {
      if (table.table_name.startsWith('dev_')) {
        devTables.push(table.table_name);
      } else if (table.table_name.includes('backup') || table.table_name.includes('schema') || table.table_name.includes('_pkey')) {
        systemTables.push(table.table_name);
      } else {
        prodTables.push(table.table_name);
      }
    });

    console.log('\n🛠️  DEVELOPMENT TABLES (dev_ prefix):');
    devTables.forEach(table => console.log(`  ✓ ${table}`));
    
    console.log('\n🚀 PRODUCTION TABLES (no prefix):');
    prodTables.forEach(table => console.log(`  ✓ ${table}`));
    
    console.log('\n⚙️  SYSTEM TABLES:');
    systemTables.forEach(table => console.log(`  ✓ ${table}`));
    
    console.log(`\n📈 SUMMARY:`);
    console.log(`  Development tables: ${devTables.length}`);
    console.log(`  Production tables: ${prodTables.length}`);
    console.log(`  System tables: ${systemTables.length}`);
    console.log(`  Total tables: ${tables.length}`);

    // Now let's check what tables should exist according to schema.ts
    console.log('\n🎯 EXPECTED TABLES FROM SCHEMA:');
    console.log('==============================');
    
    // List of tables that should exist based on schema.ts
    const expectedTables = [
      'merchants',
      'api_merchants', 
      'api_terminals',
      'transactions',
      'uploaded_files',
      'tddf_batch_headers',
      'tddf_transaction_records',
      // Add more tables here based on your schema
    ];
    
    console.log('\nFor DEVELOPMENT (with dev_ prefix):');
    expectedTables.forEach(table => {
      const devTable = `dev_${table}`;
      const exists = devTables.includes(devTable);
      console.log(`  ${exists ? '✅' : '❌'} ${devTable} ${exists ? '' : '(MISSING)'}`);
    });
    
    console.log('\nFor PRODUCTION (no prefix):');
    expectedTables.forEach(table => {
      const exists = prodTables.includes(table);
      console.log(`  ${exists ? '✅' : '❌'} ${table} ${exists ? '' : '(MISSING)'}`);
    });

    // Check for missing columns in existing tables
    console.log('\n🔍 CHECKING FOR COLUMN ISSUES...');
    console.log('================================');
    
    // Check uploaded_files table structure (both dev and prod)
    for (const tableVariant of ['dev_uploaded_files', 'uploaded_files']) {
      try {
        const columns = await sql`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = ${tableVariant}
          ORDER BY ordinal_position
        `;
        
        if (columns.length > 0) {
          console.log(`\n📋 Columns in ${tableVariant}:`);
          columns.forEach(col => {
            console.log(`  • ${col.column_name} (${col.data_type}${col.is_nullable === 'YES' ? ', nullable' : ', not null'})`);
          });
          
          // Check for the missing storage_path column that's causing errors
          const hasStoragePath = columns.some(col => col.column_name === 'storage_path');
          if (!hasStoragePath) {
            console.log(`  ❌ MISSING: storage_path column (causing file processor errors)`);
          }
        }
      } catch (error) {
        console.log(`  ⚠️  ${tableVariant} does not exist`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking schema:', error);
    process.exit(1);
  }
}

checkSchema();