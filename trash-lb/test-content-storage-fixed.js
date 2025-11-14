// Test to verify if file content storage is working correctly
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function testContentStorage() {
  console.log('=== CONTENT STORAGE TEST ===');
  
  // Create simple test CSV
  const testCSV = `TransactionID,MerchantID,Amount
CONTENT_TEST_001,M999001,123.45`;
  
  fs.writeFileSync('content-test.csv', testCSV);
  
  try {
    // Upload file
    const formData = new FormData();
    formData.append('file', fs.createReadStream('content-test.csv'));
    formData.append('type', 'transaction');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadData = await uploadResponse.json();
    console.log('Upload response:', uploadData);
    
    if (!uploadResponse.ok) {
      console.log('❌ Upload failed');
      return;
    }
    
    const fileId = uploadData.fileId;
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check database content
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=5`);
    const historyData = await historyResponse.json();
    const ourFile = historyData.find(f => f.id === fileId);
    
    console.log('File in database:', {
      id: ourFile?.id,
      filename: ourFile?.originalFilename,
      hasContent: ourFile?.file_content ? 'YES' : 'NO',
      contentLength: ourFile?.file_content?.length || 0,
      storagePath: ourFile?.storagePath
    });
    
    if (ourFile?.file_content) {
      // Decode and verify content
      const decodedContent = Buffer.from(ourFile.file_content, 'base64').toString('utf8');
      console.log('Decoded content:', decodedContent);
      console.log('✅ Content storage is working correctly!');
    } else {
      console.log('❌ Content storage is NOT working - file_content is missing');
      
      // Check if it's a database schema issue
      console.log('Raw file data keys:', Object.keys(ourFile || {}));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    try { fs.unlinkSync('content-test.csv'); } catch (e) {}
  }
}

testContentStorage().catch(console.error);