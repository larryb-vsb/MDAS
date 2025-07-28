#!/usr/bin/env node

/**
 * Full CRUD Test for Replit Object Storage
 * Tests Create, Read, Update, Delete operations on mms-uploader-files bucket
 */

import { ReplitStorageService } from './server/replit-storage-service.js';

async function runCrudTest() {
  console.log('🧪 Starting Full CRUD Test on Replit Object Storage');
  console.log('📦 Bucket: mms-uploader-files');
  console.log('=' .repeat(60));

  const testUploadId = `crud-test-${Date.now()}`;
  const testFilename = 'test-crud-file.txt';
  const testKey = `test/${testUploadId}/${testFilename}`;
  
  try {
    // 1. CREATE - Upload a test file
    console.log('\n1️⃣ CREATE TEST - Uploading test file...');
    const testContent = `CRUD Test File
Upload ID: ${testUploadId}
Timestamp: ${new Date().toISOString()}
Test Data: This is a comprehensive CRUD test for Replit Object Storage
Content Length: ${Math.random().toString(36)}`;
    
    const testBuffer = Buffer.from(testContent, 'utf8');
    
    const uploadResult = await ReplitStorageService.uploadFile(
      testUploadId,
      testFilename,
      testBuffer
    );
    
    console.log('✅ CREATE SUCCESS:', {
      key: uploadResult.key,
      bucket: uploadResult.bucket,
      size: uploadResult.size,
      url: uploadResult.url
    });

    // 2. READ - Retrieve the file
    console.log('\n2️⃣ READ TEST - Retrieving uploaded file...');
    const retrievedContent = await ReplitStorageService.getFileContent(uploadResult.key);
    
    console.log('✅ READ SUCCESS:', {
      key: uploadResult.key,
      retrievedSize: retrievedContent.length,
      contentMatch: retrievedContent.toString('utf8') === testContent
    });
    
    if (retrievedContent.toString('utf8') !== testContent) {
      throw new Error('Content mismatch - retrieved content does not match uploaded content');
    }

    // 3. UPDATE - Upload updated version
    console.log('\n3️⃣ UPDATE TEST - Uploading updated version...');
    const updatedContent = testContent + '\n\nUPDATED: ' + new Date().toISOString();
    const updatedBuffer = Buffer.from(updatedContent, 'utf8');
    
    const updateResult = await ReplitStorageService.uploadFile(
      testUploadId,
      testFilename,
      updatedBuffer
    );
    
    console.log('✅ UPDATE SUCCESS:', {
      key: updateResult.key,
      newSize: updateResult.size,
      sizeIncrease: updateResult.size - uploadResult.size
    });

    // Verify update by reading again
    const updatedRetrievedContent = await ReplitStorageService.getFileContent(updateResult.key);
    if (updatedRetrievedContent.toString('utf8') !== updatedContent) {
      throw new Error('Update verification failed - content was not properly updated');
    }
    console.log('✅ UPDATE VERIFICATION: Content successfully updated');

    // 4. LIST - Check if file exists in listing
    console.log('\n4️⃣ LIST TEST - Checking file listing...');
    const fileExists = await ReplitStorageService.fileExists(updateResult.key);
    
    console.log('✅ LIST SUCCESS:', {
      key: updateResult.key,
      exists: fileExists
    });
    
    if (!fileExists) {
      throw new Error('File existence check failed - uploaded file not found');
    }

    // 5. DELETE - Remove the test file
    console.log('\n5️⃣ DELETE TEST - Removing test file...');
    await ReplitStorageService.deleteFile(updateResult.key);
    
    console.log('✅ DELETE SUCCESS: File removed from storage');

    // Verify deletion
    const existsAfterDelete = await ReplitStorageService.fileExists(updateResult.key);
    console.log('✅ DELETE VERIFICATION:', {
      key: updateResult.key,
      existsAfterDelete: existsAfterDelete
    });
    
    if (existsAfterDelete) {
      throw new Error('Delete verification failed - file still exists after deletion');
    }

    // 6. CONFIGURATION TEST
    console.log('\n6️⃣ CONFIGURATION TEST - Checking storage config...');
    const config = ReplitStorageService.getConfigStatus();
    
    console.log('✅ CONFIG SUCCESS:', config);

    // 7. BULK OPERATIONS TEST
    console.log('\n7️⃣ BULK OPERATIONS TEST - Testing multiple files...');
    const bulkTestFiles = [];
    
    for (let i = 1; i <= 3; i++) {
      const bulkFilename = `bulk-test-${i}.txt`;
      const bulkContent = `Bulk test file ${i}\nTimestamp: ${new Date().toISOString()}`;
      const bulkBuffer = Buffer.from(bulkContent, 'utf8');
      
      const bulkResult = await ReplitStorageService.uploadFile(
        `bulk-${testUploadId}`,
        bulkFilename,
        bulkBuffer
      );
      
      bulkTestFiles.push(bulkResult.key);
      console.log(`✅ BULK UPLOAD ${i}:`, bulkResult.key);
    }

    // List files with prefix
    const listedFiles = await ReplitStorageService.listFiles(`uploads/bulk-${testUploadId}/`);
    console.log('✅ BULK LIST:', {
      expectedCount: 3,
      actualCount: listedFiles.length,
      files: listedFiles
    });

    // Clean up bulk test files
    for (const key of bulkTestFiles) {
      await ReplitStorageService.deleteFile(key);
      console.log(`✅ BULK CLEANUP:`, key);
    }

    // Final Results
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 FULL CRUD TEST COMPLETED SUCCESSFULLY!');
    console.log('✅ All operations (Create, Read, Update, Delete) working correctly');
    console.log('✅ Replit Object Storage fully operational');
    console.log('✅ Bucket: mms-uploader-files accessible and functional');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ CRUD TEST FAILED:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Attempt cleanup on failure
    try {
      console.log('\n🧹 Attempting cleanup after failure...');
      await ReplitStorageService.deleteFile(testKey);
      console.log('✅ Cleanup successful');
    } catch (cleanupError) {
      console.error('❌ Cleanup failed:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

// Run the test
runCrudTest().catch(console.error);