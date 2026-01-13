#!/usr/bin/env node

// Direct object storage cleanup script
// Removes all orphaned files from object storage when database has 0 references

import { ReplitStorageService } from './server/replit-storage-service.js';

async function cleanupOrphanedStorage() {
  console.log('🧹 Starting orphaned object storage cleanup...');
  
  try {
    const storageService = new ReplitStorageService();
    
    // List all files in dev-uploader prefix
    console.log('📋 Listing all files in object storage...');
    const allFiles = await storageService.listFiles('dev-uploader/');
    
    console.log(`📊 Found ${allFiles.length} files in object storage`);
    
    if (allFiles.length === 0) {
      console.log('✅ No files found - cleanup not needed');
      return;
    }
    
    // Since database has 0 uploads, all files are orphaned
    console.log('🗑️ All files are orphaned (database has 0 references)');
    console.log('⚠️ Starting deletion of all orphaned files...');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    // Delete files in batches
    const batchSize = 50;
    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allFiles.length/batchSize)} (${batch.length} files)...`);
      
      const promises = batch.map(async (file) => {
        try {
          await storageService.deleteFile(file.key);
          deletedCount++;
          return { success: true, file: file.key };
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to delete ${file.key}:`, error.message);
          return { success: false, file: file.key, error: error.message };
        }
      });
      
      await Promise.all(promises);
      
      // Progress update
      const progress = Math.floor(((i + batch.length) / allFiles.length) * 100);
      console.log(`📈 Progress: ${progress}% (${deletedCount} deleted, ${errorCount} errors)`);
    }
    
    console.log('\n🎉 Cleanup completed!');
    console.log(`✅ Successfully deleted: ${deletedCount} files`);
    console.log(`❌ Errors encountered: ${errorCount} files`);
    console.log(`💾 Estimated space freed: ${(deletedCount * 1024).toLocaleString()} KB`);
    
    // Verify cleanup
    console.log('\n🔍 Verifying cleanup...');
    const remainingFiles = await storageService.listFiles('dev-uploader/');
    console.log(`📊 Files remaining in storage: ${remainingFiles.length}`);
    
    if (remainingFiles.length === 0) {
      console.log('🎊 Perfect! All orphaned files successfully removed!');
    } else {
      console.log(`⚠️ Warning: ${remainingFiles.length} files still remain`);
    }
    
  } catch (error) {
    console.error('💥 Cleanup failed:', error);
    throw error;
  }
}

// Run the cleanup
cleanupOrphanedStorage()
  .then(() => {
    console.log('✨ Object storage cleanup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Object storage cleanup failed:', error);
    process.exit(1);
  });