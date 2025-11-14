// Test uploading a transaction file with real content to verify content display works
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

// Create a realistic transaction CSV file based on the filename pattern
const transactionCSV = `Transaction ID,Client ID,Amount,Transaction Date,Transaction Type,Merchant ID,Description
801203001,VS4218148933B94BE5AA742E5601B05210,125.50,2024-01-18,Sale,AH0314P1,Coffee Purchase
801203002,VS7C6855262C0449BCA1DFA565DC8BD264,87.25,2024-01-18,Sale,AH0314P1,Retail Purchase
801203003,VS08DA0E58F8554A0C9B34EC3589A592E3,45.00,2024-01-18,Sale,AH0314P1,Service Fee
801203004,655973920,200.00,2024-01-18,Sale,AH0314P1,Product Sale
801203005,VS4218148933B94BE5AA742E5601B05210,15.75,2024-01-18,Refund,AH0314P1,Returned Item`;

async function testRealTransactionUpload() {
  console.log('=== TESTING REAL TRANSACTION FILE WITH CONTENT ===\n');
  
  // Create temp file with realistic transaction data
  fs.writeFileSync('test-real-transaction.csv', transactionCSV);
  
  // Upload the file
  console.log('1. Uploading transaction file with real data...');
  const formData = new FormData();
  formData.append('file', fs.createReadStream('test-real-transaction.csv'));
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
  
  // Test content display
  console.log('\n2. Testing transaction content display...');
  const contentResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}/content`);
  
  if (contentResponse.ok) {
    const contentData = await contentResponse.json();
    console.log(`✅ Content loaded successfully`);
    console.log(`Total rows: ${contentData.totalRows}`);
    console.log(`Headers: ${JSON.stringify(contentData.headers)}`);
    
    if (contentData.rows && contentData.rows.length > 0) {
      console.log('\n📊 TRANSACTION DATA PREVIEW:');
      console.log('═'.repeat(80));
      
      contentData.rows.forEach((row, index) => {
        console.log(`Transaction ${index + 1}:`);
        console.log(`  ID: ${row['Transaction ID']}`);
        console.log(`  Client: ${row['Client ID']}`);
        console.log(`  Amount: $${row['Amount']}`);
        console.log(`  Date: ${row['Transaction Date']}`);
        console.log(`  Type: ${row['Transaction Type']}`);
        console.log(`  Description: ${row['Description']}`);
        console.log('─'.repeat(40));
      });
      
      console.log('✅ TRANSACTION CONTENT IS DISPLAYING CORRECTLY!');
    } else {
      console.log('\n❌ No transaction rows returned - content display issue');
    }
  } else {
    const error = await contentResponse.json();
    console.log(`❌ Content failed: ${error.error}`);
  }
  
  // Test download
  console.log('\n3. Testing download functionality...');
  const downloadResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}/download`);
  
  if (downloadResponse.ok) {
    const content = await downloadResponse.text();
    const lines = content.split('\n').filter(line => line.trim());
    console.log(`✅ Download successful: ${lines.length} lines`);
    console.log(`First line: ${lines[0]}`);
  } else {
    console.log(`❌ Download failed`);
  }
  
  // Keep the file for demonstration - don't delete
  console.log(`\n📁 File ID for testing: ${fileId}`);
  console.log('💡 You can now test this file in the web interface!');
  
  // Clean up local file
  fs.unlinkSync('test-real-transaction.csv');
}

testRealTransactionUpload().catch(console.error);