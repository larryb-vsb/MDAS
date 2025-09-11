#!/usr/bin/env node

/**
 * Create Production Views on Development Database
 * This makes dev database "match" production by creating unprefixed views
 * that point to dev_ prefixed tables, allowing production code to work seamlessly
 */

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for Node.js environment
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

async function createProductionViews() {
  console.log('🔧 [PROD-VIEW-CREATOR] Starting production view creation on development database...');
  
  // Use NEON_DEV_DATABASE_URL - the working development database connection
  const devDatabaseUrl = process.env.NEON_DEV_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!devDatabaseUrl) {
    console.error('❌ NEON_DEV_DATABASE_URL or DATABASE_URL environment variable not found');
    process.exit(1);
  }
  
  console.log(`🔗 [PROD-VIEW-CREATOR] Connecting to dev database: ${devDatabaseUrl.substring(0, 80)}...`);
  
  const pool = new Pool({ connectionString: devDatabaseUrl });
  
  try {
    // Test connection to development database
    console.log('🧪 [PROD-VIEW-CREATOR] Testing database connection...');
    const testResult = await pool.query('SELECT current_user, current_database(), version()');
    console.log(`✅ [PROD-VIEW-CREATOR] Connected as ${testResult.rows[0].current_user} to ${testResult.rows[0].current_database}`);
    
    // Check if dev_uploader_uploads exists (our source table)
    console.log('🔍 [PROD-VIEW-CREATOR] Checking development table existence...');
    const devTableResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dev_uploader_uploads'
      );
    `);
    
    if (!devTableResult.rows[0].exists) {
      console.error('❌ [PROD-VIEW-CREATOR] dev_uploader_uploads table not found in development database');
      process.exit(1);
    }
    
    console.log('✅ [PROD-VIEW-CREATOR] Development dev_uploader_uploads table found');
    
    // Check if processing_notes column exists in dev table
    const columnCheckResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'dev_uploader_uploads'
      AND column_name = 'processing_notes';
    `);
    
    if (columnCheckResult.rows.length === 0) {
      console.error('❌ [PROD-VIEW-CREATOR] processing_notes column not found in dev_uploader_uploads');
      process.exit(1);
    }
    
    console.log('✅ [PROD-VIEW-CREATOR] processing_notes column confirmed in development table');
    
    // Check if uploader_uploads exists as a table or view
    console.log('🔍 [PROD-VIEW-CREATOR] Checking if uploader_uploads already exists...');
    const existingTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'uploader_uploads'
      );
    `);
    
    const existingView = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.views 
        WHERE table_schema = 'public' 
        AND table_name = 'uploader_uploads'
      );
    `);
    
    if (existingTable.rows[0].exists) {
      console.log('🔧 [PROD-VIEW-CREATOR] uploader_uploads table exists - renaming to uploader_uploads_backup');
      await pool.query('DROP TABLE IF EXISTS uploader_uploads_backup');
      await pool.query('ALTER TABLE uploader_uploads RENAME TO uploader_uploads_backup');
      console.log('✅ [PROD-VIEW-CREATOR] Existing table backed up');
    }
    
    if (existingView.rows[0].exists) {
      console.log('🔧 [PROD-VIEW-CREATOR] uploader_uploads view exists - dropping it');
      await pool.query('DROP VIEW uploader_uploads');
      console.log('✅ [PROD-VIEW-CREATOR] Existing view dropped');
    }
    
    // Create the production view that maps to dev table
    console.log('🛠️ [PROD-VIEW-CREATOR] Creating uploader_uploads view...');
    
    await pool.query(`
      CREATE VIEW uploader_uploads AS 
      SELECT * FROM dev_uploader_uploads;
    `);
    
    console.log('✅ [PROD-VIEW-CREATOR] Successfully created uploader_uploads view');
    
    // Verify the view works and has processing_notes
    console.log('🔍 [PROD-VIEW-CREATOR] Verifying view functionality...');
    const viewTestResult = await pool.query(`
      SELECT COUNT(*) as record_count
      FROM uploader_uploads;
    `);
    
    console.log(`✅ [PROD-VIEW-CREATOR] View test successful: ${viewTestResult.rows[0].record_count} records accessible`);
    
    // Check that processing_notes is accessible through the view
    const processingNotesTest = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'uploader_uploads'
      AND column_name = 'processing_notes';
    `);
    
    if (processingNotesTest.rows.length > 0) {
      console.log('✅ [PROD-VIEW-CREATOR] processing_notes column accessible through view');
    } else {
      console.log('⚠️ [PROD-VIEW-CREATOR] processing_notes column may not be accessible through view');
    }
    
    // Show view definition for verification
    const viewDefinition = await pool.query(`
      SELECT definition 
      FROM pg_views 
      WHERE schemaname = 'public' 
      AND viewname = 'uploader_uploads';
    `);
    
    if (viewDefinition.rows.length > 0) {
      console.log('📋 [PROD-VIEW-CREATOR] View definition:', viewDefinition.rows[0].definition);
    }
    
    console.log('🎉 [PROD-VIEW-CREATOR] Production view creation completed successfully!');
    console.log('📄 [PROD-VIEW-CREATOR] Production code can now access uploader_uploads (maps to dev_uploader_uploads)');
    
  } catch (error) {
    console.error('❌ [PROD-VIEW-CREATOR] Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔚 [PROD-VIEW-CREATOR] Connection closed');
  }
}

// Run the view creation
createProductionViews().catch(console.error);