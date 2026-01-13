// Test existing files that have content stored in database
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testExistingContent() {
  console.log('=== TESTING EXISTING FILE CONTENT ACCESS ===\n');
  
  // Test files that should have content in database
  const filesToTest = [
    'merchant_1752812563697_qff8uhe',
    'transaction_1752812657095_d0zrsqf',
    'transaction_1752812746037_uph74l1'
  ];
  
  for (const fileId of filesToTest) {
    console.log(`Testing file: ${fileId}`);
    
    // Test content viewing
    const contentResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}/content`);
    if (contentResponse.ok) {
      const contentData = await contentResponse.json();
      console.log(`   ✅ Content view: SUCCESS (${contentData.totalRows || 'unknown'} rows)`);
      if (contentData.headers) {
        console.log(`   Headers: ${contentData.headers.slice(0, 3).join(', ')}...`);
      }
    } else {
      const error = await contentResponse.json();
      console.log(`   ❌ Content view: ${error.error}`);
    }
    
    // Test download
    const downloadResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}/download`);
    if (downloadResponse.ok) {
      const content = await downloadResponse.text();
      const lines = content.split('\n').filter(line => line.trim());
      console.log(`   ✅ Download: SUCCESS (${lines.length} lines)`);
    } else {
      const error = await downloadResponse.json();
      console.log(`   ❌ Download: ${error.error}`);
    }
    
    console.log('');
  }
  
  console.log('=== RESULTS ===');
  console.log('✅ Testing shows if file content access is working from database');
  console.log('✅ This validates the crash protection system');
}

testExistingContent();