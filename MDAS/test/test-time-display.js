// Quick test to verify time display improvements
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function testTimeDisplay() {
  console.log('=== TIME DISPLAY TEST ===');
  console.log('Testing improved local time formatting...\n');
  
  // Create a small test file
  const testCSV = `Client ID,Client Legal Name
TIME_TEST_001,Time Display Test Merchant`;
  
  fs.writeFileSync('time-test.csv', testCSV);
  
  // Upload the file
  const formData = new FormData();
  formData.append('file', fs.createReadStream('time-test.csv'));
  formData.append('type', 'merchant');
  
  const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData
  });
  
  if (uploadResponse.ok) {
    const uploadData = await uploadResponse.json();
    console.log(`✅ Test file uploaded successfully: ${uploadData.fileId}`);
    console.log(`💡 Check the uploads page to see the improved time display:`);
    console.log(`   - Recent uploads should show "Just now" or "X min ago"`);
    console.log(`   - Hover over upload time to see full local date/time`);
    console.log(`   - Times are now in your local timezone`);
  } else {
    console.log(`❌ Upload failed`);
  }
  
  // Cleanup
  try { fs.unlinkSync('time-test.csv'); } catch (e) {}
}

testTimeDisplay().catch(console.error);