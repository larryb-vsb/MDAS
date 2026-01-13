#!/usr/bin/env node

/**
 * Object Storage Cleanup Script
 * Removes object storage files not linked to database records
 */

import { Client } from '@neondatabase/serverless';

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

async function main() {
  console.log('=== Object Storage Cleanup Script ===');
  console.log('Date:', new Date().toISOString());
  console.log('');

  // Initialize database connection
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Database connected');

    // Get all file references from database tables
    const linkedFiles = new Set();

    // Check dev_uploaded_files table
    const uploadedFilesResult = await client.query(`
      SELECT storage_path 
      FROM dev_uploaded_files 
      WHERE storage_path IS NOT NULL
    `);
    
    uploadedFilesResult.rows.forEach(row => {
      if (row.storage_path) {
        linkedFiles.add(row.storage_path);
      }
    });

    console.log(`📂 Found ${linkedFiles.size} files linked in dev_uploaded_files`);

    // Check for TDDF raw line storage paths (hybrid storage)
    const tddfTablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'dev_tddf1_file_%' 
        AND table_schema = 'public'
    `);

    let tddfLinkedCount = 0;
    for (const table of tddfTablesResult.rows) {
      try {
        const storagePathsResult = await client.query(`
          SELECT DISTINCT raw_line_storage_path 
          FROM ${table.table_name} 
          WHERE raw_line_storage_path IS NOT NULL
        `);
        
        storagePathsResult.rows.forEach(row => {
          if (row.raw_line_storage_path) {
            linkedFiles.add(row.raw_line_storage_path);
            tddfLinkedCount++;
          }
        });
      } catch (error) {
        // Ignore tables that don't have raw_line_storage_path column
      }
    }

    console.log(`📂 Found ${tddfLinkedCount} files linked in TDDF tables`);
    console.log(`📂 Total linked files: ${linkedFiles.size}`);
    console.log('');

    // Get bucket configuration
    const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    const publicObjectSearchPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;

    if (!privateObjectDir) {
      console.log('❌ PRIVATE_OBJECT_DIR not set - cannot proceed');
      return;
    }

    console.log('🪣 Object Storage Configuration:');
    console.log(`   Private Dir: ${privateObjectDir}`);
    console.log(`   Public Paths: ${publicObjectSearchPaths || 'None'}`);
    console.log('');

    // Parse bucket name from private object dir
    const bucketMatch = privateObjectDir.match(/^\/([^\/]+)\//);
    if (!bucketMatch) {
      console.log('❌ Could not parse bucket name from PRIVATE_OBJECT_DIR');
      return;
    }

    const bucketName = bucketMatch[1];
    console.log(`🪣 Target bucket: ${bucketName}`);
    console.log('');

    // List all objects in the bucket
    console.log('📋 Listing all objects in bucket...');
    
    const listRequest = {
      bucket_name: bucketName,
      prefix: "",
      max_results: 1000
    };

    const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/list-objects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listRequest)
    });

    if (!response.ok) {
      console.log('❌ Failed to list objects:', response.status);
      return;
    }

    const listResult = await response.json();
    const allObjects = listResult.objects || [];
    
    console.log(`📋 Found ${allObjects.length} objects in bucket`);
    console.log('');

    // Find orphaned objects
    const orphanedObjects = [];
    const linkedObjectPaths = Array.from(linkedFiles).map(path => {
      // Convert database storage paths to object storage paths
      if (path.startsWith('/')) {
        return path.substring(1); // Remove leading slash
      }
      return path;
    });

    for (const obj of allObjects) {
      const objectPath = `/${bucketName}/${obj.name}`;
      const isLinked = linkedFiles.has(objectPath) || 
                      linkedFiles.has(obj.name) ||
                      linkedObjectPaths.some(linkedPath => 
                        linkedPath.includes(obj.name) || obj.name.includes(linkedPath)
                      );

      if (!isLinked) {
        orphanedObjects.push(obj);
      }
    }

    console.log(`🗑️  Found ${orphanedObjects.length} orphaned objects`);
    
    if (orphanedObjects.length === 0) {
      console.log('✅ No orphaned objects found - cleanup not needed');
      return;
    }

    // Show sample of orphaned objects
    console.log('\n📋 Sample orphaned objects:');
    orphanedObjects.slice(0, 10).forEach((obj, i) => {
      console.log(`   ${i + 1}. ${obj.name} (${(obj.size / 1024).toFixed(1)} KB)`);
    });
    
    if (orphanedObjects.length > 10) {
      console.log(`   ... and ${orphanedObjects.length - 10} more`);
    }

    console.log('\n⚠️  SAFETY CHECK: This is a dry run');
    console.log('To actually delete orphaned objects, run with --execute flag');
    console.log('');

    // Check if execute flag is provided
    const shouldExecute = process.argv.includes('--execute');
    
    if (!shouldExecute) {
      console.log('🔍 Dry run complete - no objects were deleted');
      console.log('Run with --execute to perform actual cleanup');
      return;
    }

    // Execute cleanup
    console.log('🗑️  Executing cleanup...');
    let deletedCount = 0;
    let errorCount = 0;

    for (const obj of orphanedObjects) {
      try {
        const deleteRequest = {
          bucket_name: bucketName,
          object_name: obj.name
        };

        const deleteResponse = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/delete-object`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(deleteRequest)
        });

        if (deleteResponse.ok) {
          deletedCount++;
          if (deletedCount % 10 === 0) {
            console.log(`   Deleted ${deletedCount}/${orphanedObjects.length} objects...`);
          }
        } else {
          errorCount++;
          console.log(`   ❌ Failed to delete ${obj.name}: ${deleteResponse.status}`);
        }
      } catch (error) {
        errorCount++;
        console.log(`   ❌ Error deleting ${obj.name}:`, error.message);
      }
    }

    console.log('');
    console.log('✅ Cleanup complete!');
    console.log(`   Deleted: ${deletedCount} objects`);
    console.log(`   Errors: ${errorCount} objects`);
    console.log(`   Total freed space: ${(orphanedObjects.reduce((sum, obj) => sum + obj.size, 0) / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

main().catch(console.error);