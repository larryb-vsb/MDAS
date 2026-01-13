#!/usr/bin/env node

/**
 * Check Object Storage Browser Contents
 * Direct check of what's visible in Replit Object Storage
 */

import { Client } from '@replit/object-storage';

async function checkObjectStorage() {
  console.log('🔍 Checking Replit Object Storage Browser Contents');
  console.log('=' .repeat(50));

  try {
    // Initialize client with default configuration
    const client = new Client();
    console.log('✅ Client initialized successfully');

    // List all objects without any prefix filter
    console.log('\n📂 LISTING ALL OBJECTS IN BUCKET...');
    const allObjectsResult = await client.list();
    
    if (!allObjectsResult.ok) {
      console.error('❌ Failed to list objects:', allObjectsResult.error);
      return;
    }

    const allObjects = allObjectsResult.value;
    console.log(`📊 Total objects found: ${allObjects.length}`);
    
    if (allObjects.length === 0) {
      console.log('📁 Bucket is empty - no files in Object Storage browser');
      
      // Create a test file to verify the bucket works
      console.log('\n🧪 Creating test file to verify bucket functionality...');
      const testKey = 'browser-test/test-file.txt';
      const testContent = Buffer.from('Test file for Object Storage browser verification', 'utf8');
      
      const uploadResult = await client.upload(testKey, testContent);
      if (uploadResult.ok) {
        console.log(`✅ Test file created: ${testKey}`);
        
        // List again to see if it appears
        const updatedList = await client.list();
        if (updatedList.ok) {
          console.log(`📊 Objects after test upload: ${updatedList.value.length}`);
          updatedList.value.forEach((obj, i) => {
            console.log(`  ${i + 1}. ${obj.name || obj.key} (${obj.size || 'unknown'} bytes)`);
          });
        }
        
        // Clean up test file
        await client.delete(testKey);
        console.log(`🧹 Test file cleaned up: ${testKey}`);
      } else {
        console.error('❌ Failed to create test file:', uploadResult.error);
      }
      
    } else {
      console.log('\n📋 OBJECTS IN BUCKET:');
      allObjects.forEach((obj, i) => {
        const name = obj.name || obj.key;
        const size = obj.size || 'unknown size';
        console.log(`  ${i + 1}. ${name} (${size} bytes)`);
      });

      // Analyze folder structure
      console.log('\n📁 FOLDER STRUCTURE ANALYSIS:');
      const folders = new Set();
      allObjects.forEach(obj => {
        const name = obj.name || obj.key;
        const parts = name.split('/');
        if (parts.length > 1) {
          folders.add(parts[0]);
        }
      });
      
      if (folders.size > 0) {
        console.log('Top-level folders found:');
        folders.forEach(folder => {
          console.log(`  📂 ${folder}/`);
        });
      } else {
        console.log('No folder structure detected (all files in root)');
      }
    }

  } catch (error) {
    console.error('❌ Error checking Object Storage:', error);
    console.error('Stack:', error.stack);
  }
}

checkObjectStorage();