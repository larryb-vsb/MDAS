// Test specific transaction file content that should have data
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testSpecificTransactionContent() {
  console.log('=== TESTING SPECIFIC TRANSACTION FILE WITH CONTENT ===\n');
  
  // Test a file we know has content in database
  const fileId = 'transaction_1752812657095_d0zrsqf';
  
  console.log(`Testing file: ${fileId}`);
  
  const contentResponse = await fetch(`${BASE_URL}/api/uploads/${fileId}/content`);
  
  if (contentResponse.ok) {
    const contentData = await contentResponse.json();
    console.log(`✅ Content loaded successfully`);
    console.log(`Total rows: ${contentData.totalRows}`);
    console.log(`Headers: ${JSON.stringify(contentData.headers)}`);
    console.log(`Truncated: ${contentData.truncated}`);
    console.log(`Rows returned: ${contentData.rows?.length || 0}`);
    
    if (contentData.rows && contentData.rows.length > 0) {
      console.log('\nFirst few rows:');
      contentData.rows.slice(0, 3).forEach((row, index) => {
        console.log(`Row ${index + 1}:`, JSON.stringify(row, null, 2));
      });
    } else {
      console.log('\n❌ No rows returned - this indicates an issue with CSV parsing');
    }
  } else {
    const error = await contentResponse.json();
    console.log(`❌ Content failed: ${error.error}`);
    console.log(`Details: ${error.details}`);
  }
}

testSpecificTransactionContent().catch(console.error);