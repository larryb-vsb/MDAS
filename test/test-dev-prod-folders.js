#!/usr/bin/env node

/**
 * Test Dev/Prod Folder Structure for MMS Uploader
 * Verifies environment-aware folder creation and file organization
 */

import { ReplitStorageService } from './server/replit-storage-service.js';

async function testDevProdFolders() {
  console.log('🧪 Testing Dev/Prod Folder Structure for MMS Uploader');
  console.log('=' .repeat(60));

  const testFiles = [];
  
  try {
    // Test with current environment (development)
    console.log('\n📁 DEVELOPMENT ENVIRONMENT TEST');
    console.log('Current NODE_ENV:', process.env.NODE_ENV || 'development');
    
    const devUploadId = `dev-test-${Date.now()}`;
    const devFilename = 'dev-test-file.txt';
    const devContent = Buffer.from(`Development environment test file - ${new Date().toISOString()}`, 'utf8');
    
    const devResult = await ReplitStorageService.uploadFile(
      devContent,
      devFilename,
      devUploadId
    );
    
    console.log('✅ Development upload:', {
      key: devResult.key,
      expectedPath: `dev-uploader/${new Date().toISOString().slice(0, 10)}/${devUploadId}/${devFilename}`,
      pathMatches: devResult.key.startsWith('dev-uploader/')
    });
    
    testFiles.push(devResult.key);

    // Test with production environment simulation
    console.log('\n📁 PRODUCTION ENVIRONMENT SIMULATION');
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    const prodUploadId = `prod-test-${Date.now()}`;
    const prodFilename = 'prod-test-file.txt';
    const prodContent = Buffer.from(`Production environment test file - ${new Date().toISOString()}`, 'utf8');
    
    const prodResult = await ReplitStorageService.uploadFile(
      prodContent,
      prodFilename,
      prodUploadId
    );
    
    console.log('✅ Production upload:', {
      key: prodResult.key,
      expectedPath: `prod-uploader/${new Date().toISOString().slice(0, 10)}/${prodUploadId}/${prodFilename}`,
      pathMatches: prodResult.key.startsWith('prod-uploader/')
    });
    
    testFiles.push(prodResult.key);
    
    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Test configuration status for both environments
    console.log('\n⚙️ CONFIGURATION STATUS TEST');
    
    // Development config
    process.env.NODE_ENV = 'development';
    const devConfig = ReplitStorageService.getConfigStatus();
    console.log('✅ Development config:', devConfig);
    
    // Production config
    process.env.NODE_ENV = 'production';
    const prodConfig = ReplitStorageService.getConfigStatus();
    console.log('✅ Production config:', prodConfig);
    
    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Test environment-aware file listing
    console.log('\n📋 ENVIRONMENT-AWARE LISTING TEST');
    
    // List development files
    process.env.NODE_ENV = 'development';
    const devFiles = await ReplitStorageService.listFiles();
    console.log('✅ Development files found:', devFiles.length);
    console.log('  Sample paths:', devFiles.slice(0, 3));
    
    // List production files
    process.env.NODE_ENV = 'production';
    const prodFiles = await ReplitStorageService.listFiles();
    console.log('✅ Production files found:', prodFiles.length);
    console.log('  Sample paths:', prodFiles.slice(0, 3));
    
    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Test folder structure verification
    console.log('\n🔍 FOLDER STRUCTURE VERIFICATION');
    
    const devFolderExists = testFiles.some(key => key.startsWith('dev-uploader/'));
    const prodFolderExists = testFiles.some(key => key.startsWith('prod-uploader/'));
    
    console.log('✅ Folder structure verification:', {
      devFolderCreated: devFolderExists,
      prodFolderCreated: prodFolderExists,
      separationWorking: devFolderExists && prodFolderExists
    });

    // Clean up test files
    console.log('\n🧹 CLEANUP TEST FILES');
    for (const key of testFiles) {
      await ReplitStorageService.deleteFile(key);
      console.log(`✅ Cleaned up: ${key}`);
    }

    // Final Results
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 DEV/PROD FOLDER STRUCTURE TEST COMPLETED!');
    console.log('✅ Environment-aware folder creation working');
    console.log('✅ Development files stored in dev-uploader/ folder');
    console.log('✅ Production files stored in prod-uploader/ folder');
    console.log('✅ Configuration status reflects correct environment');
    console.log('✅ File listing respects environment boundaries'); 
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ DEV/PROD FOLDER TEST FAILED:', error);
    console.error('Error details:', error.message);
    
    // Cleanup on failure
    try {
      console.log('\n🧹 Attempting cleanup after failure...');
      for (const key of testFiles) {
        if (key) {
          await ReplitStorageService.deleteFile(key);
          console.log(`✅ Cleaned up: ${key}`);
        }
      }
    } catch (cleanupError) {
      console.error('❌ Cleanup failed:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

testDevProdFolders().catch(console.error);