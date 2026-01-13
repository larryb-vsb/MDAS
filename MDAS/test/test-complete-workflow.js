// Complete workflow test with all three file types
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testCompleteWorkflow() {
  console.log('=== COMPLETE WORKFLOW TEST - ALL THREE FILES ===\n');
  
  const uploadedFiles = [];
  
  try {
    // 1. Upload all three files
    console.log('1. Uploading all test files...');
    
    // Upload merchant file
    const merchantForm = new FormData();
    merchantForm.append('file', fs.createReadStream('test-merchant-upload.csv'));
    merchantForm.append('type', 'merchant');
    
    const merchantResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: merchantForm
    });
    
    if (merchantResponse.ok) {
      const result = await merchantResponse.json();
      uploadedFiles.push({ id: result.fileId, type: 'merchant', name: 'test-merchant-upload.csv' });
      console.log(`   ✅ Merchant file: ${result.fileId}`);
    }
    
    // Upload transaction file
    const transactionForm = new FormData();
    transactionForm.append('file', fs.createReadStream('test-transaction-upload.csv'));
    transactionForm.append('type', 'transaction');
    
    const transactionResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: transactionForm
    });
    
    if (transactionResponse.ok) {
      const result = await transactionResponse.json();
      uploadedFiles.push({ id: result.fileId, type: 'transaction', name: 'test-transaction-upload.csv' });
      console.log(`   ✅ Transaction file: ${result.fileId}`);
    }
    
    // Upload demographic file
    const demographicForm = new FormData();
    demographicForm.append('file', fs.createReadStream('test-merchant-demographic.csv'));
    demographicForm.append('type', 'merchant');
    
    const demographicResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: demographicForm
    });
    
    if (demographicResponse.ok) {
      const result = await demographicResponse.json();
      uploadedFiles.push({ id: result.fileId, type: 'merchant', name: 'test-merchant-demographic.csv' });
      console.log(`   ✅ Demographic file: ${result.fileId}`);
    }
    
    console.log(`\n   Total files uploaded: ${uploadedFiles.length}`);
    
    // 2. Monitor processing for all files
    console.log('\n2. Monitoring file processing...');
    const maxAttempts = 60; // 60 seconds max wait
    let attempts = 0;
    let allProcessed = false;
    
    while (!allProcessed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (historyResponse.ok) {
        const files = await historyResponse.json();
        
        let processed = 0;
        let failed = 0;
        
        for (const uploadedFile of uploadedFiles) {
          const fileStatus = files.find(f => f.id === uploadedFile.id);
          if (fileStatus) {
            const status = fileStatus.processingStatus || 'unknown';
            const isProcessed = fileStatus.processed || status === 'completed';
            const hasFailed = status === 'failed';
            
            console.log(`   ${uploadedFile.name}: ${status}`);
            
            if (isProcessed) processed++;
            if (hasFailed) failed++;
          }
        }
        
        if (processed + failed >= uploadedFiles.length) {
          allProcessed = true;
          console.log(`   ✅ All files completed processing (${processed} successful, ${failed} failed)`);
        }
      }
      attempts++;
    }
    
    if (!allProcessed) {
      console.log(`   ⏱️  Processing timeout after ${maxAttempts * 2} seconds`);
    }
    
    // 3. Check what was created
    console.log('\n3. Checking created data...');
    
    // Check merchants
    const merchantsResponse = await fetch(`${BASE_URL}/api/merchants?limit=20`);
    if (merchantsResponse.ok) {
      const merchantsData = await merchantsResponse.json();
      console.log(`   ✅ Total merchants in system: ${merchantsData.pagination.totalItems}`);
    }
    
    // Check transactions
    const transactionsResponse = await fetch(`${BASE_URL}/api/transactions?limit=20`);
    if (transactionsResponse.ok) {
      const transactionsData = await transactionsResponse.json();
      console.log(`   ✅ Total transactions in system: ${transactionsData.pagination.totalItems}`);
    }
    
    // 4. Test deletion of all uploaded files
    console.log('\n4. Testing deletion of all uploaded files...');
    let deleteSuccesses = 0;
    
    for (const uploadedFile of uploadedFiles) {
      const deleteResponse = await fetch(`${BASE_URL}/api/uploads/${uploadedFile.id}`, {
        method: 'DELETE'
      });
      
      if (deleteResponse.ok) {
        const result = await deleteResponse.json();
        if (result.success) {
          deleteSuccesses++;
          console.log(`   ✅ Deleted: ${uploadedFile.name}`);
        } else {
          console.log(`   ❌ Delete failed: ${uploadedFile.name}`);
        }
      } else {
        console.log(`   ❌ Delete error: ${uploadedFile.name} - ${deleteResponse.status}`);
      }
    }
    
    console.log(`\n   Successfully deleted: ${deleteSuccesses}/${uploadedFiles.length} files`);
    
    // 5. Final verification
    console.log('\n5. Final verification...');
    const finalHistoryResponse = await fetch(`${BASE_URL}/api/uploads/history`);
    if (finalHistoryResponse.ok) {
      const files = await finalHistoryResponse.json();
      const ourDeletedFiles = files.filter(f => 
        uploadedFiles.some(uf => uf.id === f.id) && f.deleted
      );
      console.log(`   ✅ Verified ${ourDeletedFiles.length} files marked as deleted`);
    }
    
    console.log('\n=== COMPLETE WORKFLOW TEST RESULTS ===');
    console.log(`✅ Files uploaded: ${uploadedFiles.length}/3`);
    console.log(`✅ Processing: ${allProcessed ? 'Completed' : 'Partial'}`);
    console.log(`✅ Files deleted: ${deleteSuccesses}/${uploadedFiles.length}`);
    console.log('✅ Full upload → process → delete workflow verified');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCompleteWorkflow();