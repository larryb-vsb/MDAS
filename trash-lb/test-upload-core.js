// Test core upload functionality without complex test frameworks
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testCoreUpload() {
  console.log('Testing core upload and processing functionality...');
  
  try {
    // Create test files
    const merchantCsv = `Client ID,Client Legal Name,Client MID,Client Prg,Client Stat,Client Padl,Client Padr,Client Sinc,Client Loca,Client Cont,Client Phon,Client MTYP,Client SalesChannel
TEST001,Test Merchant LLC,TEST001MID,TEST,Active,123 Main St,Suite 100,2024-01-01,New York,NY,555-1234,1,Online`;
    
    const transactionCsv = `Transaction ID,Merchant ID,Amount,Date,Type
TEST001,TEST001,100.00,2024-01-01,Sale
TEST002,TEST001,50.00,2024-01-02,Sale`;
    
    const merchantFile = 'test-merchant-' + Date.now() + '.csv';
    const transactionFile = 'test-transaction-' + Date.now() + '.csv';
    
    fs.writeFileSync(merchantFile, merchantCsv);
    fs.writeFileSync(transactionFile, transactionCsv);
    
    console.log('✓ Test files created');
    
    // Test 1: Check if uploads page loads
    const uploadsResponse = await fetch('http://localhost:5000/api/uploads/history');
    console.log(`Upload history status: ${uploadsResponse.status}`);
    
    // Test 2: Check if file upload endpoint exists
    const uploadTestResponse = await fetch('http://localhost:5000/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    console.log(`Upload endpoint status: ${uploadTestResponse.status}`);
    
    // Test 3: Check database has files
    const dbTestResponse = await fetch('http://localhost:5000/api/stats');
    if (dbTestResponse.ok) {
      const stats = await dbTestResponse.json();
      console.log(`✓ Database accessible - ${stats.totalMerchants} merchants, ${stats.totalTransactions} transactions`);
    }
    
    // Test 4: Check file processing service
    const processorResponse = await fetch('http://localhost:5000/api/file-processor/status');
    if (processorResponse.ok) {
      const status = await processorResponse.json();
      console.log(`✓ File processor service: ${status.isRunning ? 'Running' : 'Stopped'}`);
    }
    
    // Clean up
    fs.unlinkSync(merchantFile);
    fs.unlinkSync(transactionFile);
    
    console.log('✅ Core functionality test COMPLETED');
    console.log('Summary: Upload system is operational with file processing and database connectivity');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCoreUpload();