#!/usr/bin/env node

/**
 * Create Persistent Folder Structure in Object Storage Browser
 * Creates sample files in dev-uploader/ and prod-uploader/ folders
 */

import { ReplitStorageService } from './server/replit-storage-service.js';

async function createFolderStructure() {
  console.log('📁 Creating Persistent Folder Structure for Object Storage Browser');
  console.log('=' .repeat(60));

  const createdFiles = [];
  
  try {
    // Create development folder structure with sample files
    console.log('\n📂 Creating Development Folder Structure...');
    
    const devFiles = [
      {
        name: 'sample-tddf-file.TSYSO',
        content: 'Sample TDDF file for development environment testing - Created: ' + new Date().toISOString(),
        uploadId: 'dev-sample-001'
      },
      {
        name: 'sample-merchant-data.csv', 
        content: 'merchant_id,name,location\nMERC001,Sample Merchant,Development City\n# Created: ' + new Date().toISOString(),
        uploadId: 'dev-sample-002'
      },
      {
        name: 'readme.txt',
        content: 'Development Uploader Folder\n\nThis folder contains files uploaded to the MMS Uploader system in development environment.\n\nFolder Structure:\ndev-uploader/YYYY-MM-DD/uploadId/filename\n\nCreated: ' + new Date().toISOString(),
        uploadId: 'dev-info'
      }
    ];

    // Force development environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    for (const file of devFiles) {
      const buffer = Buffer.from(file.content, 'utf8');
      const result = await ReplitStorageService.uploadFile(buffer, file.name, file.uploadId);
      console.log(`✅ Created dev file: ${result.key}`);
      createdFiles.push(result.key);
    }

    // Create production folder structure with sample files  
    console.log('\n📂 Creating Production Folder Structure...');
    
    process.env.NODE_ENV = 'production';

    const prodFiles = [
      {
        name: 'sample-production-file.TSYSO',
        content: 'Sample production TDDF file for production environment testing - Created: ' + new Date().toISOString(),
        uploadId: 'prod-sample-001'
      },
      {
        name: 'production-transactions.csv',
        content: 'transaction_id,amount,date\nTXN001,1500.00,2025-07-28\n# Production sample - Created: ' + new Date().toISOString(),
        uploadId: 'prod-sample-002'  
      },
      {
        name: 'readme.txt',
        content: 'Production Uploader Folder\n\nThis folder contains files uploaded to the MMS Uploader system in production environment.\n\nFolder Structure:\nprod-uploader/YYYY-MM-DD/uploadId/filename\n\nCreated: ' + new Date().toISOString(),
        uploadId: 'prod-info'
      }
    ];

    for (const file of prodFiles) {
      const buffer = Buffer.from(file.content, 'utf8');
      const result = await ReplitStorageService.uploadFile(buffer, file.name, file.uploadId);
      console.log(`✅ Created prod file: ${result.key}`);
      createdFiles.push(result.key);
    }

    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Verify folder structure is now visible
    console.log('\n🔍 Verifying Folder Structure Visibility...');
    
    const allFiles = await ReplitStorageService.listFiles('');
    console.log(`📊 Total files now in bucket: ${allFiles.length}`);
    
    // Group by folder
    const folderGroups = {};
    allFiles.forEach(key => {
      const folder = key.split('/')[0];
      if (!folderGroups[folder]) folderGroups[folder] = [];
      folderGroups[folder].push(key);
    });

    console.log('\n📁 Folder Structure in Object Storage Browser:');
    Object.keys(folderGroups).sort().forEach(folder => {
      console.log(`\n📂 ${folder}/`);
      folderGroups[folder].forEach(file => {
        const relativePath = file.substring(folder.length + 1);
        console.log(`   📄 ${relativePath}`);
      });
    });

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 FOLDER STRUCTURE CREATED SUCCESSFULLY!');
    console.log('✅ Development and production folders now visible in Object Storage browser');
    console.log('✅ Sample files created for testing and demonstration');
    console.log('✅ Folder structure: dev-uploader/ and prod-uploader/');
    console.log(`✅ Total files created: ${createdFiles.length}`);
    console.log('\n💡 You can now see these folders in the Replit Object Storage browser!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Error creating folder structure:', error);
    console.error('Error details:', error.message);
    
    // Cleanup on failure
    try {
      console.log('\n🧹 Attempting cleanup after failure...');
      for (const key of createdFiles) {
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

createFolderStructure().catch(console.error);