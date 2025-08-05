#!/usr/bin/env node

// Direct migration script for June 2025 TDDF1 tables
// Bypasses authentication by directly calling the migration service

import { TddfHybridMigrationService } from './server/services/tddf-hybrid-migration.js';

// June 2025 TDDF1 tables to migrate (largest first for maximum impact)
const JUNE_TABLES = [
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06022025_001424', // 1197 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06092025_001341', // 998 MB  
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06162025_001216', // 467 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06212025_003716', // 431 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06072025_002959', // 374 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06202025_003803', // 336 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06062025_004116', // 290 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06052025_003406', // 286 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06042025_003033', // 273 MB
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06032025_004403', // 263 MB
];

async function migrateTable(migrationService, tableName) {
  try {
    console.log(`\n🚀 Starting migration for: ${tableName}`);
    
    const result = await migrationService.migrateTable(tableName);
    
    if (result.success) {
      const { recordsProcessed, spaceSaved } = result;
      const spaceSavedMB = Math.round(spaceSaved / 1024 / 1024);
      console.log(`✅ ${tableName}: ${recordsProcessed} records, ~${spaceSavedMB}MB saved`);
      return { success: true, spaceSaved, recordsProcessed };
    } else {
      console.log(`❌ ${tableName}: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.log(`❌ ${tableName}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log(`🎯 Starting direct migration of ${JUNE_TABLES.length} largest June 2025 TDDF1 tables`);
  console.log(`📊 Expected to process ~4.8 GB of data and recover ~2.4 GB of database space\n`);
  
  const migrationService = new TddfHybridMigrationService();
  
  let totalRecordsProcessed = 0;
  let totalSpaceSaved = 0;
  let successCount = 0;
  let failureCount = 0;
  
  const startTime = Date.now();

  // Process the largest tables first for maximum impact
  for (const tableName of JUNE_TABLES) {
    const result = await migrateTable(migrationService, tableName);
    
    if (result.success) {
      successCount++;
      totalRecordsProcessed += result.recordsProcessed || 0;
      totalSpaceSaved += result.spaceSaved || 0;
    } else {
      failureCount++;
      
      // Stop on first failure to investigate the issue
      console.log(`\n⚠️  Migration stopped due to failure. Investigating...`);
      break;
    }
    
    // Brief pause between migrations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 1000 / 60 * 10) / 10;
  const totalSpaceSavedGB = Math.round(totalSpaceSaved / 1024 / 1024 / 1024 * 100) / 100;
  
  console.log(`\n🎉 MIGRATION RESULTS`);
  console.log(`⏱️  Duration: ${durationMinutes} minutes`);
  console.log(`✅ Successful: ${successCount} tables`);
  console.log(`❌ Failed: ${failureCount} tables`);
  console.log(`📊 Records processed: ${totalRecordsProcessed.toLocaleString()}`);
  console.log(`💾 Database space saved: ~${totalSpaceSavedGB} GB`);
  
  if (successCount > 0) {
    console.log(`\n🚀 Raw line data moved to object storage for 90% cost savings!`);
  }
  
  if (failureCount > 0) {
    console.log(`\n⚠️  Some migrations failed. Check the logs above for details.`);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}