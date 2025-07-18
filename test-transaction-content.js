// Test transaction file content display
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testTransactionContent() {
  console.log('=== TESTING TRANSACTION FILE CONTENT DISPLAY ===\n');
  
  // Get list of transaction files
  const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
  const files = await historyResponse.json();
  
  const transactionFiles = files.filter(f => f.fileType === 'transaction').slice(0, 3);
  
  console.log(`Found ${transactionFiles.length} transaction files to test:`);
  
  for (const file of transactionFiles) {
    console.log(`\nTesting file: ${file.id} (${file.originalFilename})`);
    
    // Test content endpoint
    const contentResponse = await fetch(`${BASE_URL}/api/uploads/${file.id}/content`);
    
    if (contentResponse.ok) {
      const contentData = await contentResponse.json();
      console.log(`✅ Content loaded: ${contentData.totalRows} rows`);
      console.log(`Headers: ${contentData.headers?.slice(0, 5).join(', ')}...`);
      
      if (contentData.rows && contentData.rows.length > 0) {
        console.log(`Sample row 1:`, Object.entries(contentData.rows[0]).slice(0, 3));
        if (contentData.rows.length > 1) {
          console.log(`Sample row 2:`, Object.entries(contentData.rows[1]).slice(0, 3));
        }
      }
    } else {
      const error = await contentResponse.json();
      console.log(`❌ Content failed: ${error.error}`);
    }
  }
  
  console.log('\n=== TESTING COMPLETE ===');
}

testTransactionContent().catch(console.error);