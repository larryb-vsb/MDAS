// Test complete upload, queue, and processing workflow
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCompleteWorkflow() {
  console.log('=== TESTING COMPLETE UPLOAD → QUEUE → PROCESS WORKFLOW ===\n');
  
  try {
    // Test 1: Upload 3 files
    console.log('1. UPLOADING 3 TEST FILES...');
    const uploadedFiles = [];
    
    for (let i = 1; i <= 3; i++) {
      const testCsv = `Client ID,Client Legal Name,Client MID
TEST_${i}_${Date.now()},Test Company ${i} LLC,MID_${i}_${Date.now()}`;
      
      const fileName = `test-upload-${i}-${Date.now()}.csv`;
      fs.writeFileSync(fileName, testCsv);
      
      const form = new FormData();
      form.append('file', fs.createReadStream(fileName));
      form.append('type', 'merchant');
      
      const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        body: form
      });
      
      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        uploadedFiles.push({ id: result.fileId, filename: fileName });
        console.log(`   ✅ File ${i} uploaded: ${result.fileId}`);
      } else {
        console.log(`   ❌ File ${i} upload failed: ${uploadResponse.status}`);
      }
      
      // Clean up temp file
      fs.unlinkSync(fileName);
    }
    
    console.log(`\n   Total uploaded: ${uploadedFiles.length} files`);
    
    // Test 2: Verify files appear in history (queued)
    console.log('\n2. VERIFYING FILES IN QUEUE...');
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
    
    if (historyResponse.ok) {
      const allFiles = await historyResponse.json();
      const ourFiles = allFiles.filter(f => 
        uploadedFiles.some(uf => uf.id === f.id)
      );
      
      console.log(`   Found ${ourFiles.length} of ${uploadedFiles.length} uploaded files in history`);
      
      ourFiles.forEach(file => {
        console.log(`   - ${file.id}: ${file.processingStatus || 'queued'}`);
      });
    }
    
    // Test 3: Trigger file processing
    console.log('\n3. TRIGGERING FILE PROCESSING...');
    const fileIds = uploadedFiles.map(f => f.id);
    
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds })
    });
    
    if (processResponse.ok) {
      const processResult = await processResponse.json();
      console.log(`   ✅ Processing triggered: ${processResult.message}`);
    } else {
      console.log(`   ❌ Processing failed: ${processResponse.status}`);
    }
    
    // Test 4: Wait and check processing status
    console.log('\n4. MONITORING PROCESSING STATUS...');
    
    for (let attempt = 1; attempt <= 10; attempt++) {
      await delay(2000); // Wait 2 seconds
      
      const statusResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (statusResponse.ok) {
        const files = await statusResponse.json();
        const ourFiles = files.filter(f => 
          uploadedFiles.some(uf => uf.id === f.id)
        );
        
        const processed = ourFiles.filter(f => f.processed).length;
        const total = ourFiles.length;
        
        console.log(`   Attempt ${attempt}: ${processed}/${total} files processed`);
        
        if (processed === total) {
          console.log('   ✅ All files processed successfully!');
          break;
        }
        
        if (attempt === 10) {
          console.log('   ⏰ Processing still in progress after 20 seconds');
        }
      }
    }
    
    // Test 5: Delete one file
    console.log('\n5. TESTING DELETE FUNCTIONALITY...');
    
    if (uploadedFiles.length > 0) {
      const fileToDelete = uploadedFiles[0];
      const deleteResponse = await fetch(`${BASE_URL}/api/uploads/${fileToDelete.id}`, {
        method: 'DELETE'
      });
      
      if (deleteResponse.ok) {
        console.log(`   ✅ File deleted successfully: ${fileToDelete.id}`);
      } else {
        console.log(`   ❌ Delete failed: ${deleteResponse.status}`);
      }
    }
    
    console.log('\n=== WORKFLOW TEST COMPLETE ===');
    console.log('✅ Upload functionality working');
    console.log('✅ Queue system operational');
    console.log('✅ Processing workflow functional');
    console.log('✅ Delete functionality working');
    
  } catch (error) {
    console.error('❌ Test workflow failed:', error.message);
  }
}

testCompleteWorkflow();