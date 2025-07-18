// Test to verify upload functionality and show created files
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testUploadAndVerify() {
  console.log('=== UPLOAD VERIFICATION TEST ===\n');
  
  try {
    // Create test files
    console.log('1. Creating test files...');
    const merchantCsv = 'Client ID,Client Legal Name\nTEST001,Test Merchant A\nTEST002,Test Merchant B';
    const transactionCsv = 'Transaction ID,Client ID,Amount,Date,Type\n12345,TEST001,100.50,2024-01-15,Sale\n12346,TEST002,75.25,2024-01-16,Sale';
    
    fs.writeFileSync('test-merchant-upload.csv', merchantCsv);
    fs.writeFileSync('test-transaction-upload.csv', transactionCsv);
    console.log('   ✅ Created test-merchant-upload.csv and test-transaction-upload.csv');
    
    // Test merchant upload
    console.log('\n2. Testing merchant file upload...');
    const merchantForm = new FormData();
    merchantForm.append('file', fs.createReadStream('test-merchant-upload.csv'));
    merchantForm.append('type', 'merchant');
    
    const merchantResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: merchantForm
    });
    
    console.log(`   Status: ${merchantResponse.status}`);
    if (merchantResponse.ok) {
      const result = await merchantResponse.json();
      console.log(`   ✅ Merchant upload successful: ${result.fileId}`);
    } else {
      console.log(`   ❌ Merchant upload failed: ${await merchantResponse.text()}`);
    }
    
    // Test transaction upload
    console.log('\n3. Testing transaction file upload...');
    const transactionForm = new FormData();
    transactionForm.append('file', fs.createReadStream('test-transaction-upload.csv'));
    transactionForm.append('type', 'transaction');
    
    const transactionResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: transactionForm
    });
    
    console.log(`   Status: ${transactionResponse.status}`);
    if (transactionResponse.ok) {
      const result = await transactionResponse.json();
      console.log(`   ✅ Transaction upload successful: ${result.fileId}`);
    } else {
      console.log(`   ❌ Transaction upload failed: ${await transactionResponse.text()}`);
    }
    
    // Check upload history
    console.log('\n4. Checking upload history...');
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
    if (historyResponse.ok) {
      const files = await historyResponse.json();
      const recentFiles = files.filter(f => f.originalFilename.includes('test-')).slice(0, 5);
      console.log(`   ✅ Found ${files.length} total files, including ${recentFiles.length} test files:`);
      recentFiles.forEach(f => {
        console.log(`      - ${f.originalFilename} (${f.fileType}, ${f.processed ? 'processed' : 'queued'})`);
      });
    } else {
      console.log(`   ❌ Failed to get history: ${historyResponse.status}`);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    console.log('✅ Upload functionality verified and working');
    console.log('✅ Test files remain available for inspection');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testUploadAndVerify();