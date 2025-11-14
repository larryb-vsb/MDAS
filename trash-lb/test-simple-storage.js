#!/usr/bin/env node

/**
 * Simple Replit Object Storage Test
 * Test basic client initialization and upload
 */

import { Client } from '@replit/object-storage';

async function testStorage() {
  console.log('🧪 Testing Replit Object Storage Client');
  console.log('Environment variables:');
  console.log('- REPLIT_OBJECT_STORAGE_BUCKET_ID:', process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID);
  console.log('- REPLIT_DB_URL:', process.env.REPLIT_DB_URL?.substring(0, 30) + '...');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  
  try {
    // Try basic client initialization
    console.log('\n1. Testing basic client initialization...');
    const client = new Client();
    console.log('✅ Client created successfully');
    
    // Try uploading a small test file
    console.log('\n2. Testing file upload...');
    const testKey = `test-${Date.now()}.txt`;
    const testContent = Buffer.from('Hello from Replit Object Storage test!', 'utf8');
    
    const result = await client.uploadFromBytes(testKey, testContent);
    
    if (result.ok) {
      console.log('✅ Upload successful:', {
        key: testKey,
        size: testContent.length
      });
      
      // Test download
      console.log('\n3. Testing file download...');
      const downloadResult = await client.downloadAsBytes(testKey);
      
      if (downloadResult.ok) {
        const downloadedContent = downloadResult.value[0];
        console.log('✅ Download successful:', {
          key: testKey,
          downloadedSize: downloadedContent.length,
          contentMatch: downloadedContent.toString('utf8') === 'Hello from Replit Object Storage test!'
        });
        
        // Clean up
        console.log('\n4. Testing file deletion...');
        await client.delete(testKey);
        console.log('✅ Delete successful');
        
        console.log('\n🎉 All basic operations working!');
      } else {
        console.error('❌ Download failed:', downloadResult.error);
      }
    } else {
      console.error('❌ Upload failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testStorage().catch(console.error);