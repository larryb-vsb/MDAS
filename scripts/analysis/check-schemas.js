#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';

// Get all database URLs from environment
const DATABASE_URL = process.env.DATABASE_URL;
const NEON_DEV_DATABASE_URL = process.env.NEON_DEV_DATABASE_URL;
const NEON_PROD_DATABASE_URL = process.env.NEON_PROD_DATABASE_URL;

console.log('🔍 COMPLETE DATABASE SCHEMA COMPARISON\n');
console.log('=====================================\n');

// Expected tables from schema.ts
const expectedTables = [
  'merchants',
  'api_merchants',
  'api_terminals', 
  'transactions',
  'uploaded_files',
  'tddf_batch_headers',
  'tddf_transaction_records',
  'backup_history',
  'backup_schedules',
  'schema_versions',
  'schema_content'
];

async function checkDatabase(name, url) {
  if (!url) {
    console.log(`❌ ${name}: No URL provided\n`);
    return null;
  }

  console.log(`🔍 Checking ${name}...`);
  console.log(`Database: ${url.split('@')[1]?.split('/')[0] || 'unknown'}`);

  try {
    const sql = neon(url);
    
    // Get all tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;

    const tableNames = tables.map(t => t.table_name);
    console.log(`Total tables found: ${tableNames.length}`);

    // Categorize tables
    const devTables = tableNames.filter(name => name.startsWith('dev_'));
    const prodTables = tableNames.filter(name => !name.startsWith('dev_') && !name.includes('backup') && !name.includes('schema'));
    const systemTables = tableNames.filter(name => name.includes('backup') || name.includes('schema'));

    console.log(`  Development tables (dev_*): ${devTables.length}`);
    console.log(`  Production tables: ${prodTables.length}`);
    console.log(`  System tables: ${systemTables.length}`);

    // Check for expected tables
    console.log('\n📋 Expected Production Tables Status:');
    const missingProdTables = [];
    expectedTables.forEach(table => {
      const exists = prodTables.includes(table);
      console.log(`  ${exists ? '✅' : '❌'} ${table} ${exists ? '' : '(MISSING)'}`);
      if (!exists) missingProdTables.push(table);
    });

    console.log('\n📋 Expected Development Tables Status:');
    const missingDevTables = [];
    expectedTables.forEach(table => {
      const devTable = `dev_${table}`;
      const exists = devTables.includes(devTable);
      console.log(`  ${exists ? '✅' : '❌'} ${devTable} ${exists ? '' : '(MISSING)'}`);
      if (!exists) missingDevTables.push(devTable);
    });

    // Check for column issues in critical tables
    const criticalTables = ['uploaded_files', 'dev_uploaded_files'];
    for (const tableName of criticalTables) {
      if (tableNames.includes(tableName)) {
        try {
          const columns = await sql`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = ${tableName}
            ORDER BY ordinal_position
          `;
          
          const hasStoragePath = columns.some(col => col.column_name === 'storage_path');
          if (!hasStoragePath && tableName.includes('uploaded_files')) {
            console.log(`  ⚠️  ${tableName}: Missing 'storage_path' column (causes file processor errors)`);
          }
        } catch (err) {
          // Table might not exist
        }
      }
    }

    return {
      name,
      totalTables: tableNames.length,
      devTables: devTables.length,
      prodTables: prodTables.length,
      systemTables: systemTables.length,
      missingProdTables,
      missingDevTables,
      allTables: tableNames
    };

  } catch (error) {
    console.log(`❌ ${name}: Connection failed`);
    console.log(`   Error: ${error.message}`);
    return null;
  }
}

async function main() {
  // Check all databases
  const results = [];
  
  if (NEON_DEV_DATABASE_URL) {
    const result = await checkDatabase('DEVELOPMENT DATABASE', NEON_DEV_DATABASE_URL);
    if (result) results.push(result);
    console.log('\n' + '='.repeat(50) + '\n');
  }

  if (NEON_PROD_DATABASE_URL) {
    const result = await checkDatabase('PRODUCTION DATABASE', NEON_PROD_DATABASE_URL);  
    if (result) results.push(result);
    console.log('\n' + '='.repeat(50) + '\n');
  }

  if (DATABASE_URL) {
    const result = await checkDatabase('FALLBACK DATABASE', DATABASE_URL);
    if (result) results.push(result);
    console.log('\n' + '='.repeat(50) + '\n');
  }

  // Summary comparison
  console.log('📊 SUMMARY COMPARISON');
  console.log('===================');
  
  results.forEach(result => {
    if (result) {
      console.log(`\n${result.name}:`);
      console.log(`  Total tables: ${result.totalTables}`);
      console.log(`  Production tables: ${result.prodTables}`);
      console.log(`  Development tables: ${result.devTables}`);
      
      if (result.missingProdTables.length > 0) {
        console.log(`  ❌ Missing production tables: ${result.missingProdTables.join(', ')}`);
      }
      
      if (result.missingDevTables.length > 0) {
        console.log(`  ❌ Missing development tables: ${result.missingDevTables.join(', ')}`);
      }
    }
  });

  console.log('\n🎯 RECOMMENDATIONS:');
  console.log('==================');
  
  const prodResult = results.find(r => r?.name.includes('PRODUCTION'));
  const devResult = results.find(r => r?.name.includes('DEVELOPMENT'));
  
  if (prodResult && prodResult.missingProdTables.length > 0) {
    console.log('🚨 PRODUCTION MISSING TABLES:');
    prodResult.missingProdTables.forEach(table => {
      console.log(`   • ${table} - Required for production functionality`);
    });
    console.log('   💡 Run: npm run db:push --force (with NODE_ENV=production)');
  }
  
  if (devResult && devResult.missingDevTables.length > 0) {
    console.log('⚠️  DEVELOPMENT MISSING TABLES:');
    devResult.missingDevTables.forEach(table => {
      console.log(`   • ${table} - Required for development functionality`);
    });
    console.log('   💡 Run: npm run db:push --force (with NODE_ENV=development)');
  }
}

main().catch(console.error);