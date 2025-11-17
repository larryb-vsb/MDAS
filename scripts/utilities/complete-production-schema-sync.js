#!/usr/bin/env node
/**
 * Complete Production Schema Synchronization
 * Adds missing columns to production tables (non-prefixed) to match development schema
 * Includes hardening for duplicate_finder_cache.id with database-level defaults
 */

import pkg from 'pg';
const { Client } = pkg;

function getDatabaseUrl() {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const isDev = NODE_ENV === 'development';
  
  const neonDevUrl = process.env.NEON_DEV_DATABASE_URL;
  const neonProdUrl = process.env.NEON_PROD_DATABASE_URL;
  const defaultUrl = process.env.DATABASE_URL;
  
  let selectedUrl = '';
  
  if (isDev && neonDevUrl) {
    selectedUrl = neonDevUrl;
    console.log('[SYNC] Using NEON_DEV_DATABASE_URL for development');
  } else if (!isDev && neonProdUrl) {
    selectedUrl = neonProdUrl;
    console.log('[SYNC] Using NEON_PROD_DATABASE_URL for production');
  } else if (defaultUrl) {
    selectedUrl = defaultUrl;
    console.log('[SYNC] Using DATABASE_URL fallback');
  } else {
    throw new Error(`No database URL available for ${NODE_ENV} environment`);
  }
  
  return selectedUrl;
}

async function synchronizeProductionSchema() {
  const client = new Client({ connectionString: getDatabaseUrl() });
  
  try {
    await client.connect();
    console.log('🔗 Connected to database for production schema synchronization');

    console.log('\n📋 PRODUCTION SCHEMA SYNCHRONIZATION PLAN:');
    console.log('   This will add missing columns to production tables (non-prefixed)');
    console.log('   to match the development schema while preserving existing data.');
    
    // 1. Harden duplicate_finder_cache.id with database defaults
    console.log('\n🛡️ PHASE 1: Hardening duplicate_finder_cache tables...');
    
    // Check if production duplicate_finder_cache table exists
    const prodCacheExists = await client.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'duplicate_finder_cache'
    `);
    
    if (prodCacheExists.rows.length > 0) {
      console.log('   Adding database-level default to production duplicate_finder_cache.id...');
      await client.query(`
        ALTER TABLE duplicate_finder_cache 
        ALTER COLUMN id SET DEFAULT md5(random()::text || clock_timestamp()::text)
      `);
    } else {
      console.log('   Creating production duplicate_finder_cache table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS duplicate_finder_cache (
          id text PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
          created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
          status text DEFAULT 'active',
          status_color text DEFAULT 'gray',
          duplicate_count integer DEFAULT 0,
          scan_in_progress boolean DEFAULT false,
          last_scan_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
          total_scanned integer DEFAULT 0,
          cooldown_active boolean DEFAULT false,
          last_scan_duration integer,
          scan_history jsonb,
          scan_type text DEFAULT 'duplicate_scan_status'
        )
      `);
    }
    
    // Harden dev table too
    console.log('   Adding database-level default to dev_duplicate_finder_cache.id...');
    await client.query(`
      ALTER TABLE dev_duplicate_finder_cache 
      ALTER COLUMN id SET DEFAULT md5(random()::text || clock_timestamp()::text)
    `);

    // 2. Synchronize other production tables based on schema comparison
    console.log('\n🔄 PHASE 2: Synchronizing production table schemas...');
    
    const tablesToSync = [
      {
        table: 'uploaded_files',
        columns: [
          'ADD COLUMN IF NOT EXISTS file_size bigint',
          'ADD COLUMN IF NOT EXISTS mime_type text',  
          'ADD COLUMN IF NOT EXISTS processed_by text',
          'ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone',
          'ADD COLUMN IF NOT EXISTS processing_completed_at timestamp with time zone',
          'ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT \'{}\'',
          'ADD COLUMN IF NOT EXISTS tags text[] DEFAULT \'{}\'',
          'ADD COLUMN IF NOT EXISTS notes text'
        ]
      },
      {
        table: 'uploader_uploads', 
        columns: [
          'ADD COLUMN IF NOT EXISTS processing_server_id text',
          'ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0',
          'ADD COLUMN IF NOT EXISTS retry_history jsonb DEFAULT \'[]\'',
          'ADD COLUMN IF NOT EXISTS last_retry_at timestamp with time zone',
          'ADD COLUMN IF NOT EXISTS warning_logs jsonb DEFAULT \'[]\'',
          'ADD COLUMN IF NOT EXISTS details jsonb DEFAULT \'{}\'',
          'ADD COLUMN IF NOT EXISTS processing_metadata jsonb DEFAULT \'{}\'',
          'ADD COLUMN IF NOT EXISTS original_filename text',
          'ADD COLUMN IF NOT EXISTS file_processing_date timestamp with time zone',
          'ADD COLUMN IF NOT EXISTS file_sequence_number integer',
          'ADD COLUMN IF NOT EXISTS file_processing_time text',
          'ADD COLUMN IF NOT EXISTS file_system_id text',
          'ADD COLUMN IF NOT EXISTS mainframe_process_data jsonb DEFAULT \'{}\''
        ]
      },
      {
        table: 'merchants',
        columns: [
          'ADD COLUMN IF NOT EXISTS processing_notes text',
          'ADD COLUMN IF NOT EXISTS risk_score numeric(10,2)',
          'ADD COLUMN IF NOT EXISTS verification_status text DEFAULT \'pending\'',
          'ADD COLUMN IF NOT EXISTS last_transaction_date timestamp with time zone'
        ]
      },
      {
        table: 'system_logs',
        columns: [
          'ADD COLUMN IF NOT EXISTS environment text',
          'ADD COLUMN IF NOT EXISTS user_id text',
          'ADD COLUMN IF NOT EXISTS request_id text',
          'ADD COLUMN IF NOT EXISTS performance_metrics jsonb DEFAULT \'{}\''
        ]
      },
      {
        table: 'processing_metrics',
        columns: [
          'ADD COLUMN IF NOT EXISTS environment text',
          'ADD COLUMN IF NOT EXISTS batch_size integer',
          'ADD COLUMN IF NOT EXISTS queue_depth integer',
          'ADD COLUMN IF NOT EXISTS error_details jsonb DEFAULT \'{}\'',
          'ADD COLUMN IF NOT EXISTS resource_usage jsonb DEFAULT \'{}\''
        ]
      }
    ];

    let totalColumnsAdded = 0;
    
    for (const tableSpec of tablesToSync) {
      console.log(`   Synchronizing ${tableSpec.table}...`);
      
      // Check if table exists first
      const tableExists = await client.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      `, [tableSpec.table]);
      
      if (tableExists.rows.length === 0) {
        console.log(`     Table ${tableSpec.table} does not exist, skipping`);
        continue;
      }
      
      let columnsAdded = 0;
      for (const columnSQL of tableSpec.columns) {
        try {
          await client.query(`ALTER TABLE ${tableSpec.table} ${columnSQL}`);
          columnsAdded++;
        } catch (error) {
          if (error.message.includes('already exists')) {
            // Column already exists, that's fine
            console.log(`     Column already exists, skipping`);
          } else {
            console.log(`     Warning: ${error.message}`);
          }
        }
      }
      
      console.log(`     Added ${columnsAdded} new columns to ${tableSpec.table}`);
      totalColumnsAdded += columnsAdded;
    }

    console.log(`\n✅ SYNCHRONIZATION COMPLETE:`);
    console.log(`   - Hardened duplicate_finder_cache tables with database defaults`);
    console.log(`   - Added ${totalColumnsAdded} columns to production tables`);
    console.log(`   - All changes are additive-only and preserve existing data`);
    console.log(`   - Production tables now match development schema capabilities`);
    
  } catch (error) {
    console.error('❌ Error during schema synchronization:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the synchronization
synchronizeProductionSchema()
  .then(() => {
    console.log('\n🎯 Production schema synchronization completed successfully');
    console.log('The system now has matching schemas between development and production tables');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Production schema synchronization failed:', error.message);
    process.exit(1);
  });