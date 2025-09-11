#!/usr/bin/env node

/**
 * COMPREHENSIVE DATABASE SCHEMA COMPARISON TOOL
 * Compare development (dev_*) tables with production (non-prefixed) tables
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ No DATABASE_URL found');
  process.exit(1);
}

async function generateSchemaComparison() {
  const pool = new Pool({ connectionString: databaseUrl });
  
  console.log('🔄 DATABASE SCHEMA COMPARISON REPORT');
  console.log('====================================');
  console.log(`📅 Generated: ${new Date().toISOString()}`);
  console.log(`🗄️ Database: ${databaseUrl.split('@')[1]?.split('/')[0]}`);
  console.log();

  try {
    // Get all tables
    const tablesQuery = `
      SELECT table_name, table_schema
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    const allTables = tablesResult.rows.map(row => row.table_name);
    
    console.log('📊 ALL TABLES DISCOVERED');
    console.log('========================');
    console.log(`Total tables: ${allTables.length}`);
    console.log();
    
    // Separate dev vs production tables
    const devTables = allTables.filter(name => name.startsWith('dev_'));
    const prodTables = allTables.filter(name => !name.startsWith('dev_') && !['backup_schedules', 'backup_history', 'schema_versions', 'schema_content', 'duplicate_finder_cache', 'system_logs', 'processing_metrics', 'king-server'].includes(name));
    const sharedTables = allTables.filter(name => ['backup_schedules', 'backup_history', 'schema_versions', 'schema_content', 'duplicate_finder_cache', 'system_logs', 'processing_metrics'].includes(name));
    
    console.log('🔵 DEVELOPMENT TABLES (dev_ prefix)');
    console.log('===================================');
    console.log(`Count: ${devTables.length}`);
    devTables.forEach(table => console.log(`   - ${table}`));
    console.log();
    
    console.log('🟢 PRODUCTION TABLES (no prefix)');
    console.log('=================================');
    console.log(`Count: ${prodTables.length}`);
    prodTables.forEach(table => console.log(`   - ${table}`));
    console.log();
    
    console.log('⚪ SHARED TABLES (global)');
    console.log('=========================');
    console.log(`Count: ${sharedTables.length}`);
    sharedTables.forEach(table => console.log(`   - ${table}`));
    console.log();
    
    // Find missing production equivalents
    const missingProdTables = [];
    const extraProdTables = [];
    const existingPairs = [];
    
    devTables.forEach(devTable => {
      const baseName = devTable.replace('dev_', '');
      const prodEquivalent = baseName;
      
      if (prodTables.includes(prodEquivalent)) {
        existingPairs.push({ dev: devTable, prod: prodEquivalent });
      } else {
        missingProdTables.push({ dev: devTable, missing: prodEquivalent });
      }
    });
    
    prodTables.forEach(prodTable => {
      const devEquivalent = `dev_${prodTable}`;
      if (!devTables.includes(devEquivalent)) {
        extraProdTables.push(prodTable);
      }
    });
    
    console.log('⚠️ DISCREPANCY ANALYSIS');
    console.log('========================');
    
    if (missingProdTables.length > 0) {
      console.log(`❌ MISSING PRODUCTION TABLES: ${missingProdTables.length}`);
      missingProdTables.forEach(({ dev, missing }) => {
        console.log(`   ${dev} → ${missing} (MISSING)`);
      });
      console.log();
    }
    
    if (extraProdTables.length > 0) {
      console.log(`➕ EXTRA PRODUCTION TABLES: ${extraProdTables.length}`);
      extraProdTables.forEach(table => {
        console.log(`   ${table} (no dev equivalent)`);
      });
      console.log();
    }
    
    if (existingPairs.length > 0) {
      console.log(`✅ MATCHING TABLE PAIRS: ${existingPairs.length}`);
      existingPairs.forEach(({ dev, prod }) => {
        console.log(`   ${dev} ↔ ${prod}`);
      });
      console.log();
    }
    
    // Detailed column comparison for existing pairs
    console.log('🔍 DETAILED COLUMN COMPARISON');
    console.log('=============================');
    
    const columnDiscrepancies = [];
    
    for (const { dev, prod } of existingPairs) {
      console.log(`\n📋 Comparing: ${dev} vs ${prod}`);
      
      // Get columns for both tables
      const devColumnsQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      
      const prodColumnsQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      
      const devColumns = await pool.query(devColumnsQuery, [dev]);
      const prodColumns = await pool.query(prodColumnsQuery, [prod]);
      
      const devCols = devColumns.rows.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
        default: row.column_default
      }));
      
      const prodCols = prodColumns.rows.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
        default: row.column_default
      }));
      
      // Find missing columns in production
      const missingInProd = devCols.filter(devCol => 
        !prodCols.find(prodCol => prodCol.name === devCol.name)
      );
      
      // Find extra columns in production
      const extraInProd = prodCols.filter(prodCol => 
        !devCols.find(devCol => devCol.name === prodCol.name)
      );
      
      // Find type mismatches
      const typeMismatches = devCols.filter(devCol => {
        const prodCol = prodCols.find(p => p.name === devCol.name);
        return prodCol && (prodCol.type !== devCol.type || prodCol.nullable !== devCol.nullable);
      }).map(devCol => {
        const prodCol = prodCols.find(p => p.name === devCol.name);
        return {
          column: devCol.name,
          dev: `${devCol.type} ${devCol.nullable === 'NO' ? 'NOT NULL' : 'NULL'}`,
          prod: `${prodCol.type} ${prodCol.nullable === 'NO' ? 'NOT NULL' : 'NULL'}`
        };
      });
      
      if (missingInProd.length === 0 && extraInProd.length === 0 && typeMismatches.length === 0) {
        console.log(`   ✅ Schemas match perfectly`);
      } else {
        console.log(`   ❌ Schema differences found:`);
        
        if (missingInProd.length > 0) {
          console.log(`   📤 Missing in production (${missingInProd.length}):`);
          missingInProd.forEach(col => {
            console.log(`      - ${col.name} (${col.type})`);
          });
          
          columnDiscrepancies.push({
            table: prod,
            type: 'missing_columns',
            columns: missingInProd
          });
        }
        
        if (extraInProd.length > 0) {
          console.log(`   📥 Extra in production (${extraInProd.length}):`);
          extraInProd.forEach(col => {
            console.log(`      + ${col.name} (${col.type})`);
          });
        }
        
        if (typeMismatches.length > 0) {
          console.log(`   🔄 Type mismatches (${typeMismatches.length}):`);
          typeMismatches.forEach(({ column, dev, prod }) => {
            console.log(`      ~ ${column}: dev(${dev}) vs prod(${prod})`);
          });
        }
      }
    }
    
    console.log('\n\n📊 SUMMARY REPORT');
    console.log('=================');
    console.log(`📋 Total tables analyzed: ${allTables.length}`);
    console.log(`🔵 Development tables: ${devTables.length}`);
    console.log(`🟢 Production tables: ${prodTables.length}`);
    console.log(`⚪ Shared tables: ${sharedTables.length}`);
    console.log(`❌ Missing production tables: ${missingProdTables.length}`);
    console.log(`➕ Extra production tables: ${extraProdTables.length}`);
    console.log(`✅ Matching pairs: ${existingPairs.length}`);
    console.log(`🔧 Tables with column discrepancies: ${columnDiscrepancies.length}`);
    
    if (missingProdTables.length > 0 || columnDiscrepancies.length > 0) {
      console.log('\n🚨 ACTION REQUIRED: Schema synchronization needed');
      
      return {
        needsFixes: true,
        missingTables: missingProdTables,
        columnDiscrepancies: columnDiscrepancies,
        summary: {
          totalTables: allTables.length,
          devTables: devTables.length,
          prodTables: prodTables.length,
          missingProdTables: missingProdTables.length,
          columnIssues: columnDiscrepancies.length
        }
      };
    } else {
      console.log('\n✅ DATABASE SCHEMAS IN SYNC');
      
      return {
        needsFixes: false,
        summary: {
          totalTables: allTables.length,
          devTables: devTables.length,
          prodTables: prodTables.length,
          allInSync: true
        }
      };
    }
    
  } catch (error) {
    console.error('❌ Schema comparison failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the comparison
generateSchemaComparison()
  .then(result => {
    console.log('\n🎯 COMPARISON COMPLETE');
    if (result.needsFixes) {
      console.log('📋 Results saved for processing');
      process.exit(1); // Exit with error code to indicate fixes needed
    } else {
      console.log('✅ No action needed');
      process.exit(0);
    }
  })
  .catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });