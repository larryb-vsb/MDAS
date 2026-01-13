// Simple upload test to verify the endpoint works
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testSimpleUpload() {
  console.log('Testing simple upload...');
  
  try {
    // Create a simple test file
    const testCsv = 'Client ID,Client Legal Name\nTEST001,Test Company LLC';
    const fileName = 'test-simple-upload.csv';
    fs.writeFileSync(fileName, testCsv);
    
    // Upload the file
    const form = new FormData();
    form.append('file', fs.createReadStream(fileName));
    form.append('type', 'merchant');
    
    const response = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: form
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Upload successful:', result);
    } else {
      const error = await response.text();
      console.log('❌ Upload failed:', error);
    }
    
    // Clean up
    fs.unlinkSync(fileName);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSimpleUpload();