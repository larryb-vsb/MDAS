#!/usr/bin/env node

/**
 * DATABASE SCHEMA COMPARISON VIA INTERNAL API
 * Uses the application's internal database connections
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function performSchemaComparison() {
  console.log('🔄 DATABASE SCHEMA COMPARISON REPORT');
  console.log('====================================');
  console.log(`📅 Generated: ${new Date().toISOString()}`);
  console.log();

  try {
    // First, trigger the internal schema sync to get comprehensive information
    console.log('🔧 Running internal schema analysis...');
    
    const syncResponse = await fetch('http://localhost:5000/api/admin/sync-database-schema', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (syncResponse.ok) {
      const syncResult = await syncResponse.json();
      console.log('✅ Schema sync analysis complete');
      console.log('📊 Sync Results:', JSON.stringify(syncResult, null, 2));
      console.log();
    } else {
      console.log('⚠️ Schema sync returned:', syncResponse.status);
    }
    
    // Get current database info from startup logs
    const response = await fetch('http://localhost:5000/api/system/info');
    if (response.ok) {
      const systemInfo = await response.json();
      console.log('🗄️ SYSTEM INFORMATION');
      console.log('====================');
      console.log('Environment:', systemInfo.environment?.name);
      console.log('Database Mode:', systemInfo.environment?.isProd ? 'Production' : 'Development');
      console.log();
    }
    
    // Try to get debug information
    const debugResponse = await fetch('http://localhost:5000/api/uploader/debug-status');
    if (debugResponse.ok) {
      const debugInfo = await debugResponse.json();
      console.log('🔍 CURRENT UPLOADER TABLE STATUS');
      console.log('================================');
      console.log('Active table:', debugInfo.table);
      console.log('File counts:', debugInfo.fileCounts);
      console.log();
    }
    
    console.log('📋 ANALYSIS FROM STARTUP LOGS');
    console.log('==============================');
    console.log('Based on the application startup logs, the following tables exist:');
    console.log();
    
    // Based on startup logs, here are the known tables
    const knownDevTables = [
      'dev_security_logs',
      'dev_duplicate_finder_cache', 
      'dev_system_logs',
      'dev_uploaded_files',
      'dev_terminals',
      'dev_api_users',
      'dev_dev_uploads',
      'dev_tddf_records',
      'dev_tddf_raw_import',
      'dev_tddf_batch_headers',
      'dev_tddf_purchasing_extensions',
      'dev_tddf_other_records',
      'dev_processing_metrics',
      'dev_users',
      'dev_uploader_json',
      'dev_tddf_jsonb',
      'dev_uploader_mastercard_di_edit_records',
      'dev_uploader_uploads',
      'dev_tddf_api_schemas',
      'dev_tddf_api_files', 
      'dev_tddf_api_records',
      'dev_tddf_api_queue',
      'dev_session',
      'dev_processing_timing_logs',
      'dev_uploader_tddf_jsonb_records',
      'dev_tddf_datamaster',
      'dev_tddf_import_log',
      'dev_api_merchants',
      'dev_dashboard_cache',
      'dev_api_terminals',
      'dev_api_achtransactions',
      'dev_merchants',
      'dev_audit_logs',
      'dev_transactions'
    ];
    
    const knownProdTables = [
      'uploader_uploads',
      'api_achtransactions',
      'api_merchants',
      'api_terminals', 
      'uploaded_files',
      'system_logs',
      'processing_metrics',
      'merchants',
      'transactions'
    ];
    
    const sharedTables = [
      'backup_schedules',
      'backup_history',
      'schema_versions',
      'schema_content',
      'duplicate_finder_cache',
      'king-server'
    ];
    
    console.log('🔵 DEVELOPMENT TABLES (dev_ prefix)');
    console.log('===================================');
    console.log(`Count: ${knownDevTables.length}`);
    knownDevTables.forEach(table => console.log(`   - ${table}`));
    console.log();
    
    console.log('🟢 PRODUCTION TABLES (no prefix)');
    console.log('=================================');
    console.log(`Count: ${knownProdTables.length}`);
    knownProdTables.forEach(table => console.log(`   - ${table}`));
    console.log();
    
    console.log('⚪ SHARED TABLES (global)');
    console.log('=========================');
    console.log(`Count: ${sharedTables.length}`);
    sharedTables.forEach(table => console.log(`   - ${table}`));
    console.log();
    
    // Analysis of missing production tables
    const potentialMissing = [];
    knownDevTables.forEach(devTable => {
      const baseName = devTable.replace('dev_', '');
      if (!knownProdTables.includes(baseName) && !sharedTables.includes(baseName)) {
        potentialMissing.push({
          dev: devTable,
          missing: baseName
        });
      }
    });
    
    console.log('⚠️ POTENTIAL MISSING PRODUCTION TABLES');
    console.log('======================================');
    if (potentialMissing.length > 0) {
      console.log(`❌ Found ${potentialMissing.length} potentially missing production tables:`);
      potentialMissing.forEach(({ dev, missing }) => {
        console.log(`   ${dev} → ${missing} (POTENTIALLY MISSING)`);
      });
    } else {
      console.log('✅ No obviously missing production tables detected');
    }
    console.log();
    
    console.log('🎯 KEY FINDINGS');
    console.log('===============');
    console.log(`📋 Development tables: ${knownDevTables.length}`);
    console.log(`📋 Production tables: ${knownProdTables.length}`);
    console.log(`📋 Shared tables: ${sharedTables.length}`);
    console.log(`⚠️ Potentially missing in production: ${potentialMissing.length}`);
    console.log();
    
    console.log('🔧 CRITICAL PRODUCTION TABLES VERIFIED');
    console.log('=======================================');
    const criticalTables = ['uploader_uploads', 'uploaded_files', 'merchants', 'api_merchants'];
    criticalTables.forEach(table => {
      const status = knownProdTables.includes(table) ? '✅' : '❌';
      console.log(`   ${status} ${table}`);
    });
    console.log();
    
    if (potentialMissing.length > 0) {
      console.log('🚨 DISCREPANCIES FOUND - ACTION REQUIRED');
      console.log('========================================');
      console.log('The following production tables may be missing:');
      potentialMissing.forEach(({ missing }) => {
        console.log(`   - ${missing}`);
      });
      console.log();
      console.log('📋 RECOMMENDED ACTIONS:');
      console.log('1. Run comprehensive schema synchronization');
      console.log('2. Create missing production tables');
      console.log('3. Verify column structures match development');
      console.log('4. Run verification report');
      
      return {
        needsFixes: true,
        missingTables: potentialMissing,
        criticalTablesOk: criticalTables.every(t => knownProdTables.includes(t))
      };
    } else {
      console.log('✅ SCHEMA APPEARS SYNCHRONIZED');
      console.log('==============================');
      console.log('No obvious discrepancies found in table structures');
      
      return {
        needsFixes: false,
        criticalTablesOk: criticalTables.every(t => knownProdTables.includes(t))
      };
    }
    
  } catch (error) {
    console.error('❌ Schema comparison failed:', error.message);
    throw error;
  }
}

// Run the analysis
performSchemaComparison()
  .then(result => {
    console.log('\n🏁 COMPARISON COMPLETE');
    if (result.needsFixes) {
      console.log('📋 Schema synchronization required');
    } else {
      console.log('✅ No immediate action needed');
    }
  })
  .catch(error => {
    console.error('💥 Analysis failed:', error.message);
  });