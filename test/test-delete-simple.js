// Simple test to verify delete functionality
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testDelete() {
  console.log('Testing delete functionality...');
  
  try {
    // Get upload history first
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
    console.log(`History endpoint status: ${historyResponse.status}`);
    
    if (historyResponse.ok) {
      const files = await historyResponse.json();
      console.log(`Found ${files.length} files in history`);
      
      if (files.length > 0) {
        const testFile = files[0];
        console.log(`Test file: ${testFile.id} - ${testFile.originalFilename}`);
        
        // Try to delete the file
        const deleteResponse = await fetch(`${BASE_URL}/api/uploads/${testFile.id}`, {
          method: 'DELETE'
        });
        
        console.log(`Delete response status: ${deleteResponse.status}`);
        const deleteResult = await deleteResponse.text();
        console.log(`Delete response: ${deleteResult}`);
        
        if (deleteResponse.ok) {
          console.log('✅ Delete functionality working');
        } else {
          console.log('❌ Delete failed');
        }
      } else {
        console.log('No files found to test delete');
      }
    } else {
      console.log('❌ Could not get upload history');
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testDelete();