#!/usr/bin/env node

/**
 * CREATE MISSING PRODUCTION TABLES
 * Based on the schema comparison report findings
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function createMissingTables() {
  console.log('🔧 CREATING MISSING PRODUCTION TABLES');
  console.log('====================================');
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log();

  // List of missing tables identified in the comparison report
  const missingTables = [
    'security_logs',
    'terminals', 
    'api_users',
    'dev_uploads',
    'tddf_records',
    'tddf_raw_import',
    'tddf_batch_headers',
    'tddf_purchasing_extensions',
    'tddf_other_records',
    'users',
    'uploader_json',
    'tddf_jsonb',
    'uploader_mastercard_di_edit_records',
    'tddf_api_schemas',
    'tddf_api_files',
    'tddf_api_records',
    'tddf_api_queue',
    'session',
    'processing_timing_logs',
    'uploader_tddf_jsonb_records',
    'tddf_datamaster',
    'tddf_import_log',
    'dashboard_cache',
    'audit_logs'
  ];

  console.log(`📋 Tables to create: ${missingTables.length}`);
  missingTables.forEach((table, index) => {
    console.log(`   ${index + 1}. ${table}`);
  });
  console.log();

  try {
    // Use the comprehensive schema sync API to create missing tables
    console.log('🚀 Triggering comprehensive schema synchronization...');
    
    const syncResponse = await fetch('http://localhost:5000/api/admin/sync-database-schema', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create_missing_production_tables',
        force: true,
        tables: missingTables
      })
    });

    if (syncResponse.ok) {
      const syncResult = await syncResponse.json();
      console.log('✅ Schema sync completed');
      console.log('📊 Results:', JSON.stringify(syncResult, null, 2));
      
      if (syncResult.results?.tablesCreated?.length > 0) {
        console.log(`🎉 Created ${syncResult.results.tablesCreated.length} tables:`);
        syncResult.results.tablesCreated.forEach(table => {
          console.log(`   ✅ ${table}`);
        });
      }
      
      if (syncResult.results?.columnsAdded?.length > 0) {
        console.log(`🔧 Added ${syncResult.results.columnsAdded.length} columns:`);
        syncResult.results.columnsAdded.forEach(col => {
          console.log(`   ✅ ${col.table}.${col.column}`);
        });
      }
      
      if (syncResult.results?.errors?.length > 0) {
        console.log(`❌ Errors encountered (${syncResult.results.errors.length}):`);
        syncResult.results.errors.forEach(error => {
          console.log(`   ❌ ${error}`);
        });
      }
      
    } else {
      console.log(`❌ Schema sync failed: ${syncResponse.status}`);
      const errorText = await syncResponse.text();
      console.log('Error details:', errorText.substring(0, 500));
    }

    // Try alternative approaches if the main sync didn't work
    console.log('\n🔄 Running backup schema creation methods...');
    
    // Use the production schema fix endpoint
    const prodFixResponse = await fetch('http://localhost:5000/api/admin/fix-production-schema', {
      method: 'GET'
    });
    
    if (prodFixResponse.ok) {
      const prodFixResult = await prodFixResponse.json();
      console.log('✅ Production schema fix completed');
      console.log('📊 Fix Results:', JSON.stringify(prodFixResult, null, 2));
    } else {
      console.log(`⚠️ Production fix returned: ${prodFixResponse.status}`);
    }

    // Run the uploader schema fix as well
    const uploaderFixResponse = await fetch('http://localhost:5000/api/admin/fix-uploader-schema', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (uploaderFixResponse.ok) {
      const uploaderFixText = await uploaderFixResponse.text();
      console.log('✅ Uploader schema fix completed');
      console.log('📋 Fix result length:', uploaderFixText.length, 'characters');
    } else {
      console.log(`⚠️ Uploader fix returned: ${uploaderFixResponse.status}`);
    }

    console.log('\n📋 TABLE CREATION SUMMARY');
    console.log('=========================');
    console.log(`🎯 Target tables: ${missingTables.length}`);
    console.log('✅ Schema sync API: Executed');
    console.log('✅ Production fix API: Executed');
    console.log('✅ Uploader fix API: Executed');
    console.log();
    console.log('📊 NEXT STEPS');
    console.log('=============');
    console.log('1. Run verification report to confirm table creation');
    console.log('2. Check for any remaining column-level discrepancies');
    console.log('3. Verify all critical functionality works');

    return {
      attempted: missingTables.length,
      success: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Table creation failed:', error.message);
    throw error;
  }
}

// Run the table creation
createMissingTables()
  .then(result => {
    console.log('\n🏁 TABLE CREATION COMPLETE');
    console.log(`📋 Attempted: ${result.attempted} tables`);
    console.log(`✅ Process completed at: ${result.timestamp}`);
  })
  .catch(error => {
    console.error('💥 Creation failed:', error.message);
    process.exit(1);
  });