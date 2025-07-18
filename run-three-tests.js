// Run three test uploads: demo merchant, demo transaction, demo delete
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function uploadFile(filename, type, description) {
  console.log(`\n📁 Uploading ${description}...`);
  
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filename));
  formData.append('type', type);
  
  const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData
  });
  
  if (uploadResponse.ok) {
    const uploadData = await uploadResponse.json();
    console.log(`✅ Successfully uploaded: ${uploadData.fileId}`);
    
    // Test content viewing
    const contentResponse = await fetch(`${BASE_URL}/api/uploads/${uploadData.fileId}/content`);
    if (contentResponse.ok) {
      const contentData = await contentResponse.json();
      console.log(`📊 Content preview: ${contentData.totalRows} rows`);
      console.log(`Headers: ${contentData.headers?.slice(0, 3).join(', ')}...`);
      
      if (contentData.rows && contentData.rows.length > 0) {
        console.log(`Sample data: ${Object.entries(contentData.rows[0]).slice(0, 2).map(([k,v]) => `${k}=${v}`).join(', ')}`);
      }
    }
    
    return uploadData.fileId;
  } else {
    const error = await uploadResponse.json();
    console.log(`❌ Upload failed: ${error.error}`);
    return null;
  }
}

async function runThreeTests() {
  console.log('=== RUNNING THREE TEST UPLOADS ===');
  console.log('Testing: Demo Merchant → Demo Transaction → Demo Delete');
  
  const uploadedFiles = [];
  
  // 1. Demo Merchant Upload
  const merchantFileId = await uploadFile('test-demo-merchant.csv', 'merchant', 'Demo Merchant File');
  if (merchantFileId) uploadedFiles.push(merchantFileId);
  
  // 2. Demo Transaction Upload  
  const transactionFileId = await uploadFile('test-demo-transaction.csv', 'transaction', 'Demo Transaction File');
  if (transactionFileId) uploadedFiles.push(transactionFileId);
  
  // 3. Demo Delete Upload
  const deleteFileId = await uploadFile('test-demo-delete.csv', 'merchant', 'Demo Delete File');
  if (deleteFileId) uploadedFiles.push(deleteFileId);
  
  console.log(`\n📋 UPLOAD SUMMARY:`);
  console.log(`✅ Successfully uploaded ${uploadedFiles.length}/3 files`);
  uploadedFiles.forEach((fileId, index) => {
    console.log(`  ${index + 1}. ${fileId}`);
  });
  
  // Test processing
  if (uploadedFiles.length > 0) {
    console.log(`\n🔄 Starting file processing...`);
    
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: uploadedFiles })
    });
    
    if (processResponse.ok) {
      console.log(`✅ Processing initiated for all files`);
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log(`✅ Processing completed`);
    } else {
      console.log(`❌ Processing failed`);
    }
  }
  
  // Now test deletion of the delete demo file
  if (deleteFileId) {
    console.log(`\n🗑️  Testing file deletion...`);
    
    const deleteResponse = await fetch(`${BASE_URL}/api/uploads/${deleteFileId}`, {
      method: 'DELETE'
    });
    
    if (deleteResponse.ok) {
      console.log(`✅ Successfully deleted demo delete file: ${deleteFileId}`);
    } else {
      console.log(`❌ Failed to delete demo file`);
    }
  }
  
  console.log(`\n🎉 THREE TEST UPLOADS COMPLETE!`);
  console.log(`💡 Check the uploads page to see all files and their content`);
  
  // Clean up local files
  ['test-demo-merchant.csv', 'test-demo-transaction.csv', 'test-demo-delete.csv'].forEach(file => {
    try {
      fs.unlinkSync(file);
    } catch (e) {
      // File may not exist, ignore
    }
  });
}

runThreeTests().catch(console.error);