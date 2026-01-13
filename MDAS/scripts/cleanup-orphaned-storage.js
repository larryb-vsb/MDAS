#!/usr/bin/env node

/**
 * Cleanup Orphaned Storage Objects
 * Removes object storage files that don't have corresponding database keys
 */

const { Client } = require('@replit/object-storage');

async function cleanupOrphanedStorage() {
  console.log('🧹 Starting orphaned storage cleanup...');
  
  try {
    // Initialize Replit Object Storage client
    const client = new Client();
    
    // List all objects in dev-uploader directory
    console.log('📋 Listing all objects in dev-uploader/ directory...');
    const objects = await client.list({ prefix: 'dev-uploader/' });
    
    console.log(`Found ${objects.length} objects in storage`);
    
    // Get all storage keys from database
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    const dbResult = await pool.query(`
      SELECT DISTINCT storage_key 
      FROM dev_uploader_uploads 
      WHERE storage_key IS NOT NULL AND storage_key != ''
    `);
    
    const validKeys = new Set(dbResult.rows.map(row => row.storage_key));
    console.log(`Found ${validKeys.size} valid storage keys in database`);
    
    // Find orphaned objects
    const orphanedObjects = objects.filter(obj => !validKeys.has(obj.key));
    console.log(`Found ${orphanedObjects.length} orphaned objects to delete`);
    
    if (orphanedObjects.length === 0) {
      console.log('✅ No orphaned objects found - storage is clean');
      await pool.end();
      return;
    }
    
    // Delete orphaned objects in batches
    let deletedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < orphanedObjects.length; i += batchSize) {
      const batch = orphanedObjects.slice(i, i + batchSize);
      console.log(`🗑️ Deleting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(orphanedObjects.length/batchSize)} (${batch.length} objects)`);
      
      for (const obj of batch) {
        try {
          await client.delete(obj.key);
          deletedCount++;
          console.log(`  ✅ Deleted: ${obj.key}`);
        } catch (error) {
          console.error(`  ❌ Failed to delete ${obj.key}:`, error.message);
        }
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`🎉 Cleanup complete: ${deletedCount}/${orphanedObjects.length} objects deleted`);
    await pool.end();
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  cleanupOrphanedStorage();
}

module.exports = { cleanupOrphanedStorage };