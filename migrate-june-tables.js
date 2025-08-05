#!/usr/bin/env node

// Migration script to process all June 2025 TDDF1 tables
// This will migrate raw line data to object storage and free up ~3-4 GB of database space

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// June 2025 TDDF1 tables to migrate
const JUNE_TABLES = [
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06022025_001424',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06092025_001341',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06162025_001216',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06212025_003716',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06072025_002959',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06202025_003803',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06062025_004116',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06052025_003406',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06042025_003033',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06032025_004403',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06192025_002850',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06182025_002624',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06302025_001220',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06172025_004848',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06142025_003418',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06202025_083309',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06052025_083326',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06192025_083247',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06042025_083333',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06032025_083342',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06062025_083351',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06132025_003209',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06182025_083258',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06022025_083354',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06172025_083319',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06162025_083349',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06122025_003053',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06132025_083357',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06122025_083327',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06282025_003300',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06272025_003216',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06262025_002851',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06242025_003324',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06112025_003407',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06102025_003330',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06112025_083324',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06262025_083255',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06272025_083320',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06252025_083304',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06242025_083322',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06102025_083346',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06302025_083324',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06232025_083316',
  'dev_tddf1_file_vermntsb_6759_tddf_830_06092025_083342',
  'dev_tddf1_file_vermntsb_6759_tddf_2400_06252025_002904'
];

async function migrateTable(tableName) {
  try {
    console.log(`\n🚀 Starting migration for: ${tableName}`);
    
    const response = await fetch(`${BASE_URL}/api/tddf1/hybrid-migration/migrate-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3AtestSessionId.mockSignature'
      },
      body: JSON.stringify({ tableName })
    });

    const result = await response.json();
    
    if (result.success) {
      const { recordsProcessed, spaceSaved } = result.data;
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
  console.log(`🎯 Starting migration of ${JUNE_TABLES.length} June 2025 TDDF1 tables`);
  console.log(`📊 Expected to process ~7.4 GB of data and recover ~3-4 GB of database space\n`);
  
  let totalRecordsProcessed = 0;
  let totalSpaceSaved = 0;
  let successCount = 0;
  let failureCount = 0;
  
  const startTime = Date.now();

  // Process tables in batches of 3 to avoid overwhelming the system
  for (let i = 0; i < JUNE_TABLES.length; i += 3) {
    const batch = JUNE_TABLES.slice(i, i + 3);
    
    console.log(`\n📦 Processing batch ${Math.floor(i/3) + 1}/${Math.ceil(JUNE_TABLES.length/3)}: ${batch.length} tables`);
    
    const promises = batch.map(tableName => migrateTable(tableName));
    const results = await Promise.all(promises);
    
    // Aggregate results
    results.forEach(result => {
      if (result.success) {
        successCount++;
        totalRecordsProcessed += result.recordsProcessed || 0;
        totalSpaceSaved += result.spaceSaved || 0;
      } else {
        failureCount++;
      }
    });
    
    // Brief pause between batches
    if (i + 3 < JUNE_TABLES.length) {
      console.log(`⏱️  Pausing 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 1000 / 60 * 10) / 10;
  const totalSpaceSavedGB = Math.round(totalSpaceSaved / 1024 / 1024 / 1024 * 100) / 100;
  
  console.log(`\n🎉 MIGRATION COMPLETE`);
  console.log(`⏱️  Duration: ${durationMinutes} minutes`);
  console.log(`✅ Successful: ${successCount} tables`);
  console.log(`❌ Failed: ${failureCount} tables`);
  console.log(`📊 Records processed: ${totalRecordsProcessed.toLocaleString()}`);
  console.log(`💾 Database space saved: ~${totalSpaceSavedGB} GB`);
  console.log(`\n🚀 Raw line data moved to object storage for 90% cost savings!`);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}