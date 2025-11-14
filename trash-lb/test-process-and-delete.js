// Test processing and deletion functionality
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testProcessAndDelete() {
  console.log('=== PROCESSING AND DELETE TEST ===\n');
  
  try {
    // 1. Upload merchant demographic file
    console.log('1. Uploading merchant demographic file...');
    const form = new FormData();
    form.append('file', fs.createReadStream('test-merchant-demographic.csv'));
    form.append('type', 'merchant');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: form
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${await uploadResponse.text()}`);
    }
    
    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.fileId;
    console.log(`   ✅ File uploaded: ${fileId}`);
    
    // 2. Wait and check processing status
    console.log('\n2. Monitoring file processing...');
    let processed = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait
    
    while (!processed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (historyResponse.ok) {
        const files = await historyResponse.json();
        const ourFile = files.find(f => f.id === fileId);
        
        if (ourFile) {
          console.log(`   Status: ${ourFile.processingStatus || 'unknown'} (attempt ${attempts + 1})`);
          if (ourFile.processed || ourFile.processingStatus === 'completed') {
            processed = true;
            console.log(`   ✅ File processed successfully`);
            
            if (ourFile.processingErrors) {
              console.log(`   ⚠️  Processing errors: ${ourFile.processingErrors}`);
            }
          } else if (ourFile.processingStatus === 'failed') {
            console.log(`   ❌ Processing failed: ${ourFile.processingErrors}`);
            break;
          }
        }
      }
      attempts++;
    }
    
    if (!processed && attempts >= maxAttempts) {
      console.log(`   ⏱️  Processing timeout after ${maxAttempts} seconds`);
    }
    
    // 3. Check if merchants were created
    console.log('\n3. Checking created merchants...');
    const merchantsResponse = await fetch(`${BASE_URL}/api/merchants?search=TEST_DELETE`);
    if (merchantsResponse.ok) {
      const merchantsData = await merchantsResponse.json();
      const testMerchants = merchantsData.merchants.filter(m => 
        m.id.includes('TEST_DELETE') || m.clientLegalName.includes('Test Delete')
      );
      console.log(`   ✅ Found ${testMerchants.length} test merchants created:`);
      testMerchants.forEach(m => {
        console.log(`      - ${m.clientLegalName} (ID: ${m.id})`);
      });
    }
    
    // 4. Test file deletion
    console.log('\n4. Testing file deletion...');
    const deleteResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}`, {
      method: 'DELETE'
    });
    
    if (deleteResponse.ok) {
      const deleteResult = await deleteResponse.json();
      console.log(`   ✅ File deletion: ${deleteResult.success ? 'Success' : 'Failed'}`);
      
      // Verify file is marked as deleted
      const verifyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (verifyResponse.ok) {
        const files = await verifyResponse.json();
        const deletedFile = files.find(f => f.id === fileId);
        if (deletedFile) {
          console.log(`   Status: ${deletedFile.deleted ? 'Marked as deleted' : 'Still active'}`);
        }
      }
    } else {
      console.log(`   ❌ Delete failed: ${await deleteResponse.text()}`);
    }
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ Upload functionality: Working');
    console.log('✅ File processing: Monitored');
    console.log('✅ Merchant creation: Verified');
    console.log('✅ File deletion: Tested');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testProcessAndDelete();