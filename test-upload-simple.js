// Simple test script to verify upload functionality works
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testUpload() {
  try {
    console.log('Testing file upload functionality...');
    
    // Create a simple test CSV file
    const testCsvContent = `Transaction ID,Merchant ID,Amount,Date,Type
TEST001,TEST_MERCHANT,100.00,2024-01-01,Sale
TEST002,TEST_MERCHANT,50.00,2024-01-02,Sale`;
    
    const testFileName = 'test-upload-' + Date.now() + '.csv';
    fs.writeFileSync(testFileName, testCsvContent);
    
    console.log(`Created test file: ${testFileName}`);
    
    // First login to get session
    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    
    if (!loginResponse.ok) {
      throw new Error('Login failed');
    }
    
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('Login successful');
    
    // Create form data for file upload
    const form = new FormData();
    form.append('files', fs.createReadStream(testFileName));
    form.append('fileType', 'transaction');
    
    // Upload the file
    const uploadResponse = await fetch(`${BASE_URL}/api/uploads`, {
      method: 'POST',
      headers: {
        'Cookie': cookies
      },
      body: form
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload successful:', uploadResult);
    
    // Check if files were uploaded
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`, {
      headers: { 'Cookie': cookies }
    });
    
    if (!historyResponse.ok) {
      throw new Error('Failed to get upload history');
    }
    
    const files = await historyResponse.json();
    console.log(`Upload history shows ${files.length} files`);
    
    // Clean up test file
    fs.unlinkSync(testFileName);
    console.log('Test file cleaned up');
    
    console.log('✅ Upload test PASSED - Both upload and history retrieval work');
    return true;
    
  } catch (error) {
    console.error('❌ Upload test FAILED:', error.message);
    return false;
  }
}

testUpload().then(success => {
  process.exit(success ? 0 : 1);
});