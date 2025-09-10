#!/usr/bin/env node

// Script to fix production database schema - add missing upload_status column
// Based on architect recommendation

import { neon } from '@neondatabase/serverless';

async function fixProductionSchema() {
  console.log('[PROD-SCHEMA-FIX] Starting production database schema fix...');
  
  try {
    // Connect to production database
    const prodDatabaseUrl = process.env.NEON_PROD_DATABASE_URL;
    
    if (!prodDatabaseUrl) {
      console.error('[PROD-SCHEMA-FIX] ❌ NEON_PROD_DATABASE_URL not found');
      process.exit(1);
    }
    
    console.log('[PROD-SCHEMA-FIX] Connecting to production database...');
    const prodDb = neon(prodDatabaseUrl);
    
    // Step 1: Check if table exists
    console.log('[PROD-SCHEMA-FIX] Checking if uploader_uploads table exists...');
    const tableCheck = await prodDb`
      SELECT to_regclass('public.uploader_uploads') as table_exists
    `;
    
    if (!tableCheck[0]?.table_exists) {
      console.error('[PROD-SCHEMA-FIX] ❌ uploader_uploads table does not exist in production');
      process.exit(1);
    }
    
    console.log('[PROD-SCHEMA-FIX] ✅ uploader_uploads table exists');
    
    // Step 2: Check if upload_status column exists
    console.log('[PROD-SCHEMA-FIX] Checking if upload_status column exists...');
    const columnCheck = await prodDb`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'uploader_uploads' AND column_name = 'upload_status'
    `;
    
    if (columnCheck.length > 0) {
      console.log('[PROD-SCHEMA-FIX] ✅ upload_status column already exists - no action needed');
      return;
    }
    
    console.log('[PROD-SCHEMA-FIX] ❌ upload_status column missing - applying fix...');
    
    // Step 3: Apply the safe schema change (architect's recommendation)
    console.log('[PROD-SCHEMA-FIX] Starting transaction...');
    
    await prodDb`BEGIN`;
    
    console.log('[PROD-SCHEMA-FIX] Adding upload_status column...');
    await prodDb`
      ALTER TABLE public.uploader_uploads 
      ADD COLUMN IF NOT EXISTS upload_status text
    `;
    
    console.log('[PROD-SCHEMA-FIX] Setting default value...');
    await prodDb`
      ALTER TABLE public.uploader_uploads 
      ALTER COLUMN upload_status SET DEFAULT 'pending'
    `;
    
    console.log('[PROD-SCHEMA-FIX] Updating existing rows...');
    await prodDb`
      UPDATE public.uploader_uploads 
      SET upload_status = 'pending' 
      WHERE upload_status IS NULL
    `;
    
    console.log('[PROD-SCHEMA-FIX] Adding NOT NULL constraint...');
    await prodDb`
      ALTER TABLE public.uploader_uploads 
      ALTER COLUMN upload_status SET NOT NULL
    `;
    
    await prodDb`COMMIT`;
    
    console.log('[PROD-SCHEMA-FIX] ✅ Transaction committed successfully');
    
    // Step 4: Verify the fix
    console.log('[PROD-SCHEMA-FIX] Verifying the fix...');
    const verifyCheck = await prodDb`
      SELECT column_name, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name='uploader_uploads' AND column_name='upload_status'
    `;
    
    if (verifyCheck.length > 0) {
      const column = verifyCheck[0];
      console.log('[PROD-SCHEMA-FIX] ✅ Verification successful:');
      console.log(`  Column: ${column.column_name}`);
      console.log(`  Nullable: ${column.is_nullable}`);
      console.log(`  Default: ${column.column_default}`);
    } else {
      console.error('[PROD-SCHEMA-FIX] ❌ Verification failed - column not found');
      process.exit(1);
    }
    
    console.log('[PROD-SCHEMA-FIX] 🎉 Production database schema fix completed successfully!');
    
  } catch (error) {
    console.error('[PROD-SCHEMA-FIX] ❌ Error occurred:', error.message);
    
    try {
      // Try to rollback if we're in a transaction
      await prodDb`ROLLBACK`;
      console.log('[PROD-SCHEMA-FIX] 🔄 Transaction rolled back');
    } catch (rollbackError) {
      // Ignore rollback errors if no transaction is active
    }
    
    process.exit(1);
  }
}

// Run the fix
fixProductionSchema();