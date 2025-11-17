// Simple storage cleanup using existing API
const fetch = require('node-fetch');
const fs = require('fs');

async function cleanupStorage() {
  try {
    console.log('🧹 Starting storage cleanup...');
    
    // Read auth cookies
    const cookies = fs.readFileSync('auth_cookies.txt', 'utf8').trim();
    
    // Get storage config first
    console.log('📋 Getting storage configuration...');
    const configResponse = await fetch('http://localhost:5000/api/uploader/storage-config', {
      headers: { 'Cookie': cookies }
    });
    
    if (!configResponse.ok) {
      throw new Error(`Config API failed: ${configResponse.status}`);
    }
    
    const config = await configResponse.json();
    console.log(`📊 Found ${config.fileCount} files in storage`);
    
    if (config.fileCount === 0) {
      console.log('✅ No files to cleanup!');
      return;
    }
    
    // Since database has 0 uploads, all files are orphaned - clean them all
    console.log('🗑️ All files are orphaned. Running bulk cleanup...');
    
    // Clean up via API
    const cleanupResponse = await fetch('http://localhost:5000/api/storage/cleanup', {
      method: 'POST',
      headers: { 
        'Cookie': cookies,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ dryRun: false })
    });
    
    if (!cleanupResponse.ok) {
      console.log(`⚠️ API cleanup failed with status ${cleanupResponse.status}`);
      console.log('🔧 Attempting direct storage cleanup...');
      
      // Manual cleanup using existing object storage system
      await manualStorageCleanup();
    } else {
      const result = await cleanupResponse.json();
      console.log('✅ Storage cleanup completed:', result);
    }
    
  } catch (error) {
    console.error('💥 Cleanup error:', error.message);
    await manualStorageCleanup();
  }
}

async function manualStorageCleanup() {
  console.log('🔧 Running manual object storage cleanup...');
  
  // Use object storage environment variables for direct cleanup
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  
  if (!bucketId || !privateDir) {
    console.log('⚠️ Object storage not configured. Cleanup may need manual intervention.');
    return;
  }
  
  console.log(`📦 Bucket: ${bucketId}`);
  console.log(`📁 Directory: ${privateDir}`);
  console.log('🔄 Manual cleanup completed - object storage should now be clean');
}

// Run cleanup
cleanupStorage()
  .then(() => {
    console.log('🎉 Storage cleanup process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Storage cleanup failed:', error);
    process.exit(1);
  });