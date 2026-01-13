// Test to reproduce and fix the "File not found" error
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function testDatabaseProcessing() {
  console.log('=== DATABASE PROCESSING TEST ===');
  console.log('Testing file processing from database content only...\n');
  
  // Create test transaction file
  const testCSV = `TransactionID,MerchantID,Amount,Date,Type
TEST001,M999999,100.00,2024-01-01,Credit
TEST002,M999998,50.00,2024-01-02,Debit`;
  
  fs.writeFileSync('test-db-processing.csv', testCSV);
  
  try {
    // 1. Upload the file
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-db-processing.csv'));
    formData.append('type', 'transaction');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!uploadResponse.ok) {
      console.log(`❌ Upload failed: ${uploadResponse.status}`);
      return;
    }
    
    const uploadData = await uploadResponse.json();
    const fileId = uploadData.fileId;
    console.log(`✅ File uploaded: ${fileId}`);
    
    // 2. Wait a moment for cleanup to happen
    console.log('⏳ Waiting for temporary file cleanup...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Check if temporary file still exists
    const tempPath = `/home/runner/workspace/tmp_uploads/${uploadData.fileName || 'unknown'}`;
    console.log(`🔍 Checking temp file: ${tempPath}`);
    
    // 4. Get file info from database
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=5`);
    const historyData = await historyResponse.json();
    const ourFile = historyData.find(f => f.id === fileId);
    
    console.log(`📂 File in database:`, {
      id: ourFile?.id,
      filename: ourFile?.originalFilename,
      hasContent: ourFile?.file_content ? 'YES' : 'NO',
      contentLength: ourFile?.file_content?.length || 0,
      storagePath: ourFile?.storagePath
    });
    
    // 5. Try to manually process the file to trigger the error
    console.log('\n🔧 Triggering manual file processing...');
    
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [fileId] })
    });
    
    if (processResponse.ok) {
      console.log('✅ Processing request sent successfully');
    } else {
      console.log(`❌ Processing failed: ${processResponse.status}`);
      const errorText = await processResponse.text();
      console.log(`Error: ${errorText}`);
    }
    
    console.log('\n📊 Check the server logs for "File not found" errors');
    console.log('This test reproduces the exact error condition you experienced.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    try { fs.unlinkSync('test-db-processing.csv'); } catch (e) {}
  }
}

testDatabaseProcessing().catch(console.error);