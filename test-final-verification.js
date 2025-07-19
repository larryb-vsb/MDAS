// Final test to verify green "Processed" status instead of red "Error" status
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function createTestFiles() {
  // Create merchant test file with spaced headers
  const merchantCSV = `Client ID,Client Legal Name,Client Primary Address,Client City,Client State,Client Zip Code,Client MID,As Of Date
FINAL001,Final Test Coffee LLC,123 Test Street,Portland,OR,97205,MID_FINAL_001,7/18/2025
FINAL002,Final Test Restaurant,456 Main Ave,Seattle,WA,98101,MID_FINAL_002,7/18/2025`;

  // Create transaction test file with spaced headers
  const transactionCSV = `Transaction ID,Client ID,Amount,Transaction Date,Transaction Type,Merchant ID,Description
TX_FINAL_001,FINAL001,99.99,2025-07-18,Sale,MID_FINAL_001,Final Test Purchase
TX_FINAL_002,FINAL002,150.00,2025-07-18,Sale,MID_FINAL_002,Final Test Order`;

  fs.writeFileSync('test-final-merchant.csv', merchantCSV);
  fs.writeFileSync('test-final-transaction.csv', transactionCSV);
}

async function uploadAndVerify(filename, type, description) {
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
    console.log(`✅ Upload successful: ${uploadData.fileId}`);
    return uploadData.fileId;
  } else {
    const error = await uploadResponse.json();
    console.log(`❌ Upload failed: ${error.error}`);
    return null;
  }
}

async function checkProcessingStatus(fileId) {
  // Wait a moment for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const response = await fetch(`${BASE_URL}/api/uploads/history`);
  const files = await response.json();
  
  const file = files.find(f => f.id === fileId);
  if (file) {
    const status = file.processed ? 'Processed ✅' : 'Error ❌';
    console.log(`Status: ${status} (${file.originalFilename})`);
    return file.processed;
  }
  
  console.log(`File not found in history: ${fileId}`);
  return false;
}

async function runFinalTest() {
  console.log('=== FINAL VERIFICATION TEST ===');
  console.log('Testing fixed field mappings and constraint handling...\n');
  
  // Create test files
  createTestFiles();
  
  // Upload merchant file
  const merchantFileId = await uploadAndVerify('test-final-merchant.csv', 'merchant', 'Final Merchant Test');
  
  // Upload transaction file
  const transactionFileId = await uploadAndVerify('test-final-transaction.csv', 'transaction', 'Final Transaction Test');
  
  if (merchantFileId && transactionFileId) {
    // Trigger processing
    console.log(`\n🔄 Starting processing...`);
    
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [merchantFileId, transactionFileId] })
    });
    
    if (processResponse.ok) {
      console.log(`✅ Processing initiated`);
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Check final status
      console.log(`\n📊 FINAL STATUS CHECK:`);
      const merchantProcessed = await checkProcessingStatus(merchantFileId);
      const transactionProcessed = await checkProcessingStatus(transactionFileId);
      
      if (merchantProcessed && transactionProcessed) {
        console.log(`\n🎉 SUCCESS! Both files show green "Processed" status!`);
        console.log(`✓ Field mapping fixes working correctly`);
        console.log(`✓ Database constraint violations resolved`);
      } else {
        console.log(`\n⚠️  Some files still showing red "Error" status`);
        console.log(`Merchant processed: ${merchantProcessed}`);
        console.log(`Transaction processed: ${transactionProcessed}`);
      }
    } else {
      console.log(`❌ Processing initiation failed`);
    }
  }
  
  // Cleanup
  ['test-final-merchant.csv', 'test-final-transaction.csv'].forEach(file => {
    try { fs.unlinkSync(file); } catch (e) {}
  });
  
  console.log(`\n💡 Check the uploads page to verify green "Processed" status!`);
}

runFinalTest().catch(console.error);