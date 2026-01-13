// Upload a new transaction file with actual content to test content display
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

// Create a sample transaction CSV file
const transactionCSV = `Transaction ID,Client ID,Amount,Date,Type
TX001,TEST_CLIENT_001,150.00,2024-01-15,Sale
TX002,TEST_CLIENT_002,75.50,2024-01-16,Sale
TX003,TEST_CLIENT_001,200.00,2024-01-17,Sale
TX004,TEST_CLIENT_003,125.25,2024-01-18,Sale
TX005,TEST_CLIENT_002,50.00,2024-01-19,Refund`;

async function testNewTransactionUpload() {
  console.log('=== TESTING NEW TRANSACTION FILE UPLOAD AND CONTENT DISPLAY ===\n');
  
  // Create temp file
  fs.writeFileSync('test-new-transaction.csv', transactionCSV);
  
  // Upload the file
  console.log('1. Uploading new transaction file...');
  const formData = new FormData();
  formData.append('file', fs.createReadStream('test-new-transaction.csv'));
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
  
  // Test content immediately
  console.log('\n2. Testing immediate content display...');
  const contentResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}/content`);
  
  if (contentResponse.ok) {
    const contentData = await contentResponse.json();
    console.log(`✅ Content loaded successfully`);
    console.log(`Total rows: ${contentData.totalRows}`);
    console.log(`Headers: ${JSON.stringify(contentData.headers)}`);
    console.log(`Rows returned: ${contentData.rows?.length || 0}`);
    
    if (contentData.rows && contentData.rows.length > 0) {
      console.log('\nTransaction data:');
      contentData.rows.slice(0, 3).forEach((row, index) => {
        console.log(`Row ${index + 1}: ${row['Transaction ID']} | ${row['Client ID']} | $${row['Amount']} | ${row['Date']}`);
      });
    } else {
      console.log('\n❌ No transaction rows returned');
    }
  } else {
    const error = await contentResponse.json();
    console.log(`❌ Content failed: ${error.error}`);
  }
  
  // Clean up
  console.log('\n3. Cleaning up...');
  await fetch(`${BASE_URL}/api/uploads/${fileId}`, { method: 'DELETE' });
  fs.unlinkSync('test-new-transaction.csv');
  console.log('✅ Cleanup complete');
}

testNewTransactionUpload().catch(console.error);