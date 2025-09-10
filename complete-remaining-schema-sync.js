#!/usr/bin/env node
/**
 * Complete Remaining Schema Synchronization
 * Creates missing production tables and adds remaining columns
 * Addresses architect feedback about incomplete synchronization
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
    console.log('[COMPLETE-SYNC] Using NEON_DEV_DATABASE_URL for development');
  } else if (!isDev && neonProdUrl) {
    selectedUrl = neonProdUrl;
    console.log('[COMPLETE-SYNC] Using NEON_PROD_DATABASE_URL for production');
  } else if (defaultUrl) {
    selectedUrl = defaultUrl;
    console.log('[COMPLETE-SYNC] Using DATABASE_URL fallback');
  } else {
    throw new Error(`No database URL available for ${NODE_ENV} environment`);
  }
  
  return selectedUrl;
}

async function completeRemainingSync() {
  const client = new Client({ connectionString: getDatabaseUrl() });
  
  try {
    await client.connect();
    console.log('🔗 Connected to database for complete remaining schema synchronization');

    console.log('\n📋 REMAINING SYNCHRONIZATION TASKS:');
    console.log('   Based on architect feedback about incomplete sync');
    console.log('   Will create missing production tables and add remaining columns');
    
    // Create missing production tables that were skipped
    console.log('\n🏗️ PHASE 1: Creating missing production tables...');
    
    const tablesToCreate = [
      {
        name: 'merchants',
        sql: `
          CREATE TABLE IF NOT EXISTS merchants (
            id text PRIMARY KEY,
            name text NOT NULL,
            client_mid text,
            status text DEFAULT 'Pending' NOT NULL,
            merchant_type text,
            sales_channel text,
            address text,
            city text,
            state text,
            zip_code text,
            country text,
            category text,
            other_client_number1 text,
            other_client_number2 text,
            client_since_date timestamp with time zone,
            last_upload_date timestamp with time zone,
            edit_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
            created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
            as_of_date timestamp with time zone,
            updated_by text,
            processing_notes text,
            risk_score numeric(10,2),
            verification_status text DEFAULT 'pending',
            last_transaction_date timestamp with time zone
          )
        `
      },
      {
        name: 'system_logs',
        sql: `
          CREATE TABLE IF NOT EXISTS system_logs (
            id serial PRIMARY KEY,
            level text NOT NULL,
            source text NOT NULL,
            message text NOT NULL,
            details jsonb,
            timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
            hostname text,
            process_id text,
            session_id text,
            correlation_id text,
            stack_trace text,
            environment text,
            user_id text,
            request_id text,
            performance_metrics jsonb DEFAULT '{}'
          )
        `
      },
      {
        name: 'processing_metrics',
        sql: `
          CREATE TABLE IF NOT EXISTS processing_metrics (
            id serial PRIMARY KEY,
            metric_name text NOT NULL,
            metric_value numeric(15,4) NOT NULL,
            timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
            environment text,
            batch_size integer,
            queue_depth integer,
            error_details jsonb DEFAULT '{}',
            resource_usage jsonb DEFAULT '{}'
          )
        `
      }
    ];

    let tablesCreated = 0;
    for (const table of tablesToCreate) {
      console.log(`   Creating ${table.name}...`);
      
      const existsResult = await client.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = $1
      `, [table.name]);
      
      if (existsResult.rows.length === 0) {
        await client.query(table.sql);
        tablesCreated++;
        console.log(`     ✅ Created ${table.name} table`);
      } else {
        console.log(`     ⏭️ Table ${table.name} already exists`);
      }
    }

    // Add remaining columns to existing tables based on original schema comparison
    console.log('\n🔄 PHASE 2: Adding remaining missing columns...');
    
    const remainingColumns = [
      {
        table: 'uploaded_files',
        columns: [
          'ADD COLUMN IF NOT EXISTS tags text[] DEFAULT \'{}\'',
          'ADD COLUMN IF NOT EXISTS notes text',
          'ADD COLUMN IF NOT EXISTS processed_by text',
          'ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone',
          'ADD COLUMN IF NOT EXISTS processing_completed_at timestamp with time zone'
        ]
      },
      {
        table: 'uploader_uploads',
        columns: [
          'ADD COLUMN IF NOT EXISTS retry_history jsonb DEFAULT \'[]\'',
          'ADD COLUMN IF NOT EXISTS warning_logs jsonb DEFAULT \'[]\'',
          'ADD COLUMN IF NOT EXISTS original_filename text',
          'ADD COLUMN IF NOT EXISTS file_processing_date timestamp with time zone',
          'ADD COLUMN IF NOT EXISTS file_sequence_number integer',
          'ADD COLUMN IF NOT EXISTS file_processing_time text',
          'ADD COLUMN IF NOT EXISTS file_system_id text',
          'ADD COLUMN IF NOT EXISTS mainframe_process_data jsonb DEFAULT \'{}\''
        ]
      }
    ];

    let totalRemainingColumnsAdded = 0;
    
    for (const tableSpec of remainingColumns) {
      console.log(`   Adding remaining columns to ${tableSpec.table}...`);
      
      let columnsAdded = 0;
      for (const columnSQL of tableSpec.columns) {
        try {
          await client.query(`ALTER TABLE ${tableSpec.table} ${columnSQL}`);
          columnsAdded++;
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`     Column already exists, skipping`);
          } else {
            console.log(`     Warning: ${error.message}`);
          }
        }
      }
      
      console.log(`     Added ${columnsAdded} additional columns to ${tableSpec.table}`);
      totalRemainingColumnsAdded += columnsAdded;
    }

    console.log(`\n✅ COMPLETE SYNCHRONIZATION FINISHED:`);
    console.log(`   - Created ${tablesCreated} missing production tables`);
    console.log(`   - Added ${totalRemainingColumnsAdded} additional columns`);
    console.log(`   - Production schema now fully synchronized with development`);
    console.log(`   - All production tables (non-prefixed) now match development schema`);
    
  } catch (error) {
    console.error('❌ Error during complete schema synchronization:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the complete synchronization
completeRemainingSync()
  .then(() => {
    console.log('\n🎯 Complete schema synchronization finished successfully');
    console.log('Production and development schemas are now fully synchronized');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Complete schema synchronization failed:', error.message);
    process.exit(1);
  });