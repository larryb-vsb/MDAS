// Final verification test for database-first processing fix
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function finalVerificationTest() {
  console.log('=== FINAL VERIFICATION TEST ===');
  console.log('Verifying complete fix for "File not found" error\n');
  
  // Create a comprehensive test transaction file
  const testCSV = `TransactionID,MerchantID,Amount,Date,Type
FIX_TEST_001,M888001,100.00,2024-01-01,Credit
FIX_TEST_002,M888002,250.50,2024-01-02,Debit
FIX_TEST_003,M888001,75.25,2024-01-03,Credit`;
  
  fs.writeFileSync('final-verification.csv', testCSV);
  
  try {
    // Step 1: Upload file
    console.log('📤 Step 1: Uploading test file...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream('final-verification.csv'));
    formData.append('type', 'transaction');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadData = await uploadResponse.json();
    const fileId = uploadData.fileId;
    console.log(`✅ File uploaded with ID: ${fileId}`);
    
    // Step 2: Wait for temporary file cleanup
    console.log('⏳ Step 2: Waiting for temporary file cleanup...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Verify database content exists
    console.log('🔍 Step 3: Verifying database content...');
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=5`);
    const historyData = await historyResponse.json();
    const ourFile = historyData.find(f => f.id === fileId);
    
    if (!ourFile?.file_content) {
      console.log('❌ CRITICAL: File content not found in database');
      return;
    }
    
    const decodedContent = Buffer.from(ourFile.file_content, 'base64').toString('utf8');
    console.log(`✅ Database content verified (${decodedContent.length} chars)`);
    
    // Step 4: Trigger processing manually
    console.log('🔧 Step 4: Triggering file processing...');
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [fileId] })
    });
    
    if (!processResponse.ok) {
      console.log(`❌ Processing failed: ${processResponse.status}`);
      return;
    }
    
    console.log('✅ Processing request successful');
    
    // Step 5: Wait for processing to complete
    console.log('⏳ Step 5: Waiting for processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 6: Check final status
    console.log('🔍 Step 6: Checking final processing status...');
    const finalHistoryResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=5`);
    const finalHistoryData = await finalHistoryResponse.json();
    const finalFile = finalHistoryData.find(f => f.id === fileId);
    
    console.log('📊 Final Results:');
    console.log(`   File ID: ${finalFile?.id}`);
    console.log(`   Status: ${finalFile?.processed ? 'PROCESSED' : 'PENDING'}`);
    console.log(`   Errors: ${finalFile?.processingErrors || 'None'}`);
    console.log(`   Has Content: ${finalFile?.file_content ? 'YES' : 'NO'}`);
    
    if (finalFile?.processed && !finalFile?.processingErrors) {
      console.log('\n🎉 SUCCESS: Complete database-first processing working!');
      console.log('✅ Files are processed from database content');
      console.log('✅ No "File not found" errors');
      console.log('✅ Temporary file cleanup does not break processing');
    } else if (finalFile?.processingErrors) {
      console.log(`\n❌ Processing Error: ${finalFile.processingErrors}`);
    } else {
      console.log('\n⏳ Processing still in progress...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    try { fs.unlinkSync('final-verification.csv'); } catch (e) {}
  }
}

finalVerificationTest().catch(console.error);