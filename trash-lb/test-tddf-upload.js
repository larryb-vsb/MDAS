// Test TDDF file upload functionality
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = process.env.REPLIT_DEV_DOMAIN ? 
  `https://${process.env.REPLIT_DEV_DOMAIN}` : 
  'http://localhost:3000';

async function testTddfUpload() {
  try {
    console.log('=== TESTING TDDF FILE UPLOAD ===\n');
    
    // 1. Upload TDDF file
    console.log('1. Uploading TDDF file...');
    const form = new FormData();
    form.append('file', fs.createReadStream('test-real-tddf.TSYSO'));
    form.append('type', 'tddf');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: form
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${await uploadResponse.text()}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`   ✅ TDDF file uploaded: ${uploadResult.fileId}`);
    
    // 2. Process the uploaded file
    console.log('\n2. Processing uploaded TDDF file...');
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileIds: [uploadResult.fileId]
      })
    });
    
    if (!processResponse.ok) {
      throw new Error(`Processing failed: ${await processResponse.text()}`);
    }
    
    const processResult = await processResponse.json();
    console.log(`   ✅ Processing initiated: ${processResult.message || 'Success'}`);
    
    // 3. Wait for processing to complete and check results
    console.log('\n3. Monitoring processing status...');
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      attempts++;
      
      const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (historyResponse.ok) {
        const files = await historyResponse.json();
        const uploadedFile = files.find(f => f.id === uploadResult.fileId);
        
        if (uploadedFile) {
          const status = uploadedFile.processingStatus || 'unknown';
          console.log(`   Status: ${status} (attempt ${attempts}/${maxAttempts})`);
          
          if (status === 'completed') {
            console.log(`   ✅ Processing completed successfully!`);
            break;
          } else if (status === 'failed') {
            console.log(`   ❌ Processing failed: ${uploadedFile.processingErrors || 'Unknown error'}`);
            break;
          }
        }
      }
      
      if (attempts === maxAttempts) {
        console.log(`   ⚠️  Processing timeout after ${maxAttempts} seconds`);
      }
    }
    
    // 4. Check TDDF records created
    console.log('\n4. Checking TDDF records...');
    const tddfResponse = await fetch(`${BASE_URL}/api/tddf`);
    
    if (tddfResponse.ok) {
      const tddfData = await tddfResponse.json();
      const records = tddfData.data || tddfData.records || tddfData;
      
      if (Array.isArray(records)) {
        console.log(`   ✅ TDDF records found: ${records.length} records`);
        
        // Show first record details
        if (records.length > 0) {
          const firstRecord = records[0];
          console.log(`   First record details:`);
          console.log(`   - Transaction ID: ${firstRecord.txnId}`);
          console.log(`   - Merchant ID: ${firstRecord.merchantId}`);
          console.log(`   - Amount: $${firstRecord.txnAmount}`);
          console.log(`   - Date: ${firstRecord.txnDate}`);
          console.log(`   - Type: ${firstRecord.txnType}`);
        }
      } else {
        console.log(`   ⚠️  Unexpected TDDF response format: ${JSON.stringify(tddfData)}`);
      }
    } else {
      console.log(`   ❌ Failed to fetch TDDF records: ${await tddfResponse.text()}`);
    }
    
    console.log('\n=== TDDF UPLOAD TEST COMPLETE ===');
    
  } catch (error) {
    console.error('❌ TDDF upload test failed:', error.message);
  }
}

// Run the test
testTddfUpload();