#!/usr/bin/env node
/**
 * Critical Fix: Add missing ID column to duplicate_finder_cache tables
 * This addresses the NULL constraint violations causing 500 errors in the API
 */

import pkg from 'pg';
const { Client } = pkg;

// Use same environment-aware database selection as the application
function getDatabaseUrl() {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const isDev = NODE_ENV === 'development';
  
  // Get environment-specific Neon URLs (same logic as env-config.ts)
  const neonDevUrl = process.env.NEON_DEV_DATABASE_URL;
  const neonProdUrl = process.env.NEON_PROD_DATABASE_URL;
  const defaultUrl = process.env.DATABASE_URL;
  
  let selectedUrl = '';
  
  if (isDev && neonDevUrl) {
    selectedUrl = neonDevUrl;
    console.log('[FIX] Using NEON_DEV_DATABASE_URL for development');
  } else if (!isDev && neonProdUrl) {
    selectedUrl = neonProdUrl;
    console.log('[FIX] Using NEON_PROD_DATABASE_URL for production');
  } else if (defaultUrl) {
    selectedUrl = defaultUrl;
    console.log('[FIX] Using DATABASE_URL fallback');
  } else {
    throw new Error(`No database URL available for ${NODE_ENV} environment`);
  }
  
  return selectedUrl;
}

async function fixDuplicateFinderCache() {
  const client = new Client({ connectionString: getDatabaseUrl() });
  
  try {
    await client.connect();
    console.log('🔗 Connected to database');

    // Fix dev_duplicate_finder_cache table
    console.log('🔧 Fixing dev_duplicate_finder_cache table...');
    
    // Check if id column exists
    const devTableCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'dev_duplicate_finder_cache' AND column_name = 'id'
    `);
    
    if (devTableCheck.rows.length === 0) {
      console.log('   Adding id column...');
      await client.query('ALTER TABLE dev_duplicate_finder_cache ADD COLUMN id text');
    }
    
    // Generate unique IDs for existing NULL rows
    const updateResult = await client.query(`
      UPDATE dev_duplicate_finder_cache 
      SET id = md5(random()::text || clock_timestamp()::text) 
      WHERE id IS NULL
    `);
    console.log(`   Generated IDs for ${updateResult.rowCount} rows`);
    
    // Set NOT NULL constraint
    await client.query('ALTER TABLE dev_duplicate_finder_cache ALTER COLUMN id SET NOT NULL');
    console.log('   Set NOT NULL constraint on id column');

    // Fix production duplicate_finder_cache table (if it exists)
    const prodTableExists = await client.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'duplicate_finder_cache'
    `);
    
    if (prodTableExists.rows.length > 0) {
      console.log('🔧 Fixing duplicate_finder_cache table...');
      
      const prodTableCheck = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'duplicate_finder_cache' AND column_name = 'id'
      `);
      
      if (prodTableCheck.rows.length === 0) {
        console.log('   Adding id column...');
        await client.query('ALTER TABLE duplicate_finder_cache ADD COLUMN id text');
      }
      
      const prodUpdateResult = await client.query(`
        UPDATE duplicate_finder_cache 
        SET id = md5(random()::text || clock_timestamp()::text) 
        WHERE id IS NULL
      `);
      console.log(`   Generated IDs for ${prodUpdateResult.rowCount} rows`);
      
      await client.query('ALTER TABLE duplicate_finder_cache ALTER COLUMN id SET NOT NULL');
      console.log('   Set NOT NULL constraint on id column');
    }

    console.log('✅ Successfully fixed duplicate_finder_cache tables');
    
    // Verify the fix
    const verifyDev = await client.query('SELECT COUNT(*) FROM dev_duplicate_finder_cache WHERE id IS NULL');
    const nullCountDev = parseInt(verifyDev.rows[0].count);
    
    if (nullCountDev === 0) {
      console.log('✅ Verification passed: No NULL IDs in dev_duplicate_finder_cache');
    } else {
      console.log(`⚠️  Warning: Still ${nullCountDev} NULL IDs in dev_duplicate_finder_cache`);
    }

  } catch (error) {
    console.error('❌ Error fixing duplicate_finder_cache:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the fix
fixDuplicateFinderCache()
  .then(() => {
    console.log('\n🎯 Database fix completed successfully');
    console.log('The duplicate_finder_cache tables should now work without NULL constraint violations');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Database fix failed:', error.message);
    process.exit(1);
  });