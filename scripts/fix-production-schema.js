#!/usr/bin/env node

/**
 * Fix Production Database Schema
 * Adds missing processing_notes column to production uploader_uploads table
 */

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for Node.js environment
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

async function fixProductionSchema() {
  console.log('🔧 [PROD-SCHEMA-FIX] Starting production database schema repair...');
  
  // Use the same DATABASE_URL that the app uses
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable not found');
    process.exit(1);
  }
  
  console.log(`🔗 [PROD-SCHEMA-FIX] Connecting to: ${databaseUrl.substring(0, 80)}...`);
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    // Test connection
    console.log('🧪 [PROD-SCHEMA-FIX] Testing database connection...');
    const testResult = await pool.query('SELECT version()');
    console.log('✅ [PROD-SCHEMA-FIX] Database connection successful');
    
    // Check if production uploader_uploads table exists
    console.log('🔍 [PROD-SCHEMA-FIX] Checking production table existence...');
    const tableCheckResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'uploader_uploads'
      );
    `);
    
    const productionTableExists = tableCheckResult.rows[0].exists;
    console.log(`📋 [PROD-SCHEMA-FIX] Production table exists: ${productionTableExists}`);
    
    if (!productionTableExists) {
      console.log('⚠️ [PROD-SCHEMA-FIX] Production uploader_uploads table does not exist');
      console.log('📋 [PROD-SCHEMA-FIX] This needs to be created first using db:push');
      return;
    }
    
    // Check if processing_notes column exists in production table
    console.log('🔍 [PROD-SCHEMA-FIX] Checking processing_notes column...');
    const columnCheckResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'uploader_uploads'
        AND column_name = 'processing_notes'
      );
    `);
    
    const columnExists = columnCheckResult.rows[0].exists;
    console.log(`📋 [PROD-SCHEMA-FIX] processing_notes column exists: ${columnExists}`);
    
    if (!columnExists) {
      console.log('🛠️ [PROD-SCHEMA-FIX] Adding missing processing_notes column...');
      await pool.query(`
        ALTER TABLE uploader_uploads 
        ADD COLUMN processing_notes TEXT;
      `);
      console.log('✅ [PROD-SCHEMA-FIX] Successfully added processing_notes column');
    } else {
      console.log('✅ [PROD-SCHEMA-FIX] processing_notes column already exists');
    }
    
    // Verify the fix
    console.log('🔍 [PROD-SCHEMA-FIX] Verifying schema...');
    const verifyResult = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'uploader_uploads' 
      AND column_name = 'processing_notes'
      ORDER BY ordinal_position;
    `);
    
    if (verifyResult.rows.length > 0) {
      console.log('✅ [PROD-SCHEMA-FIX] Schema verification successful:');
      console.log('   Column:', verifyResult.rows[0].column_name);
      console.log('   Type:', verifyResult.rows[0].data_type);
      console.log('   Nullable:', verifyResult.rows[0].is_nullable);
    } else {
      console.log('❌ [PROD-SCHEMA-FIX] Schema verification failed');
    }
    
  } catch (error) {
    console.error('❌ [PROD-SCHEMA-FIX] Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔚 [PROD-SCHEMA-FIX] Connection closed');
  }
}

// Run the fix
fixProductionSchema().catch(console.error);