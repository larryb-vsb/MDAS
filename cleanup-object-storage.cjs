/**
 * Object Storage Cleanup Script - CommonJS format
 * Removes object storage files not linked to database records
 */

const { Client } = require('@neondatabase/serverless');

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

async function main() {
  console.log('=== Object Storage Cleanup Tool ===');
  console.log('Date:', new Date().toISOString());
  console.log('');

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('✅ Database connected');

    // Check what files are referenced in database
    const linkedFiles = new Set();

    // Check uploader uploads table
    console.log('📂 Checking dev_uploader_uploads table...');
    const uploaderResult = await client.query(`
      SELECT storage_path 
      FROM dev_uploader_uploads 
      WHERE storage_path IS NOT NULL
    `);
    
    uploaderResult.rows.forEach(row => {
      if (row.storage_path) {
        linkedFiles.add(row.storage_path);
      }
    });
    console.log(`   Found ${uploaderResult.rows.length} files in uploader uploads`);

    // Check TDDF hybrid storage paths
    console.log('📂 Checking TDDF1 file tables for hybrid storage...');
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
          SELECT COUNT(*) as count, 
                 COUNT(CASE WHEN raw_line_storage_path IS NOT NULL THEN 1 END) as with_storage
          FROM ${table.table_name}
        `);
        
        if (storagePathsResult.rows[0].with_storage > 0) {
          const pathsResult = await client.query(`
            SELECT DISTINCT raw_line_storage_path 
            FROM ${table.table_name} 
            WHERE raw_line_storage_path IS NOT NULL
          `);
          
          pathsResult.rows.forEach(row => {
            if (row.raw_line_storage_path) {
              linkedFiles.add(row.raw_line_storage_path);
              tddfLinkedCount++;
            }
          });
        }
      } catch (error) {
        // Ignore tables that don't have raw_line_storage_path column
      }
    }
    console.log(`   Found ${tddfLinkedCount} TDDF hybrid storage references`);

    console.log(`📂 Total files linked in database: ${linkedFiles.size}`);
    console.log('');

    // Get object storage configuration
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;

    console.log('🪣 Object Storage Configuration:');
    console.log(`   Bucket ID: ${bucketId}`);
    console.log(`   Private Dir: ${privateDir}`);
    console.log(`   Public Paths: ${publicPaths}`);
    console.log('');

    if (!bucketId) {
      console.log('❌ No bucket configured - cleanup not needed');
      return;
    }

    // List all objects in bucket
    console.log('📋 Listing objects in bucket...');
    const listRequest = {
      bucket_name: bucketId,
      prefix: "",
      max_results: 5000  // Increase to handle large buckets
    };

    const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/list-objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listRequest)
    });

    if (!response.ok) {
      console.log('❌ Failed to list objects:', response.status);
      return;
    }

    const listResult = await response.json();
    const allObjects = listResult.objects || [];
    console.log(`📋 Found ${allObjects.length} total objects in bucket`);

    // Analyze file prefixes
    const prefixCounts = {};
    allObjects.forEach(obj => {
      const parts = obj.name.split('/');
      const prefix = parts[0] || 'root';
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });

    console.log('📊 Objects by prefix:');
    Object.entries(prefixCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([prefix, count]) => {
        console.log(`   ${prefix}: ${count} files`);
      });
    console.log('');

    // Find orphaned objects
    const orphanedObjects = [];
    const linkedObjectPaths = Array.from(linkedFiles);

    for (const obj of allObjects) {
      const fullObjectPath = `/${bucketId}/${obj.name}`;
      
      // Check various path formats that might be stored in database
      const isLinked = linkedFiles.has(fullObjectPath) || 
                      linkedFiles.has(`/${obj.name}`) ||
                      linkedFiles.has(obj.name) ||
                      linkedObjectPaths.some(linkedPath => 
                        linkedPath.includes(obj.name) || 
                        obj.name.includes(linkedPath.replace(/^\/+/, ''))
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

    // Group orphaned files by prefix
    const orphanedByPrefix = {};
    orphanedObjects.forEach(obj => {
      const parts = obj.name.split('/');
      const prefix = parts[0] || 'root';
      if (!orphanedByPrefix[prefix]) orphanedByPrefix[prefix] = [];
      orphanedByPrefix[prefix].push(obj);
    });

    console.log('🗑️  Orphaned objects by prefix:');
    Object.entries(orphanedByPrefix).forEach(([prefix, objects]) => {
      const totalSize = objects.reduce((sum, obj) => sum + (obj.size || 0), 0);
      console.log(`   ${prefix}: ${objects.length} files (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    });

    console.log('\n📋 Sample orphaned objects:');
    orphanedObjects.slice(0, 10).forEach((obj, i) => {
      console.log(`   ${i + 1}. ${obj.name} (${(obj.size / 1024).toFixed(1)} KB)`);
    });
    
    if (orphanedObjects.length > 10) {
      console.log(`   ... and ${orphanedObjects.length - 10} more`);
    }

    const totalOrphanedSize = orphanedObjects.reduce((sum, obj) => sum + (obj.size || 0), 0);
    console.log(`\n💾 Total space to be freed: ${(totalOrphanedSize / 1024 / 1024).toFixed(2)} MB`);

    // Check for --execute flag
    const shouldExecute = process.argv.includes('--execute');
    
    if (!shouldExecute) {
      console.log('\n⚠️  DRY RUN COMPLETE - No objects were deleted');
      console.log('   Run with --execute to perform actual cleanup');
      console.log('   Example: node cleanup-object-storage.cjs --execute');
      return;
    }

    // Execute cleanup
    console.log('\n🗑️  EXECUTING CLEANUP...');
    let deletedCount = 0;
    let errorCount = 0;
    const batchSize = 50;

    for (let i = 0; i < orphanedObjects.length; i += batchSize) {
      const batch = orphanedObjects.slice(i, i + batchSize);
      
      for (const obj of batch) {
        try {
          const deleteRequest = {
            bucket_name: bucketId,
            object_name: obj.name
          };

          const deleteResponse = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/delete-object`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deleteRequest)
          });

          if (deleteResponse.ok) {
            deletedCount++;
          } else {
            errorCount++;
            console.log(`   ❌ Failed to delete ${obj.name}: HTTP ${deleteResponse.status}`);
          }
        } catch (error) {
          errorCount++;
          console.log(`   ❌ Error deleting ${obj.name}:`, error.message);
        }
      }

      if ((i + batchSize) % 100 === 0 || i + batchSize >= orphanedObjects.length) {
        console.log(`   Progress: ${Math.min(i + batchSize, orphanedObjects.length)}/${orphanedObjects.length} processed...`);
      }
    }

    console.log('\n✅ CLEANUP COMPLETE!');
    console.log(`   📊 Results:`);
    console.log(`      Deleted: ${deletedCount} objects`);
    console.log(`      Errors: ${errorCount} objects`);
    console.log(`      Freed space: ${(totalOrphanedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`      Success rate: ${((deletedCount / orphanedObjects.length) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

main().catch(console.error);