// Enhanced tracing test to debug file processing flow
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function traceProcessingFlow() {
  console.log('=== PROCESSING FLOW TRACE TEST ===');
  console.log('Adding comprehensive tracing to debug file processing\n');
  
  // Create test file
  const testCSV = `TransactionID,MerchantID,Amount,Date,Type
TRACE_001,M777001,500.00,2024-01-01,Credit
TRACE_002,M777002,300.25,2024-01-02,Debit`;
  
  fs.writeFileSync('trace-test.csv', testCSV);
  
  try {
    // Upload file
    console.log('📤 Uploading trace test file...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream('trace-test.csv'));
    formData.append('type', 'transaction');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadData = await uploadResponse.json();
    const fileId = uploadData.fileId;
    console.log(`✅ File uploaded: ${fileId}`);
    
    // Check database content immediately
    console.log('\n🔍 Checking database content...');
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=5`);
    const historyData = await historyResponse.json();
    const ourFile = historyData.find(f => f.id === fileId);
    
    console.log('Database file info:');
    console.log(`   ID: ${ourFile?.id}`);
    console.log(`   Filename: ${ourFile?.originalFilename}`);
    console.log(`   Storage Path: ${ourFile?.storagePath}`);
    console.log(`   Has Content: ${ourFile?.file_content ? 'YES' : 'NO'}`);
    console.log(`   Content Length: ${ourFile?.file_content ? Buffer.from(ourFile.file_content, 'base64').toString('utf8').length : 0} chars`);
    
    // Wait a moment for any cleanup
    console.log('\n⏳ Waiting for potential file cleanup...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to trigger processing with enhanced logging
    console.log('\n🔧 Triggering processing with trace...');
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: [fileId], trace: true })
    });
    
    console.log(`Process response status: ${processResponse.status}`);
    const processData = await processResponse.json();
    console.log('Process response:', processData);
    
    // Monitor processing for a few seconds
    console.log('\n👀 Monitoring processing...');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=5`);
      const statusData = await statusResponse.json();
      const currentFile = statusData.find(f => f.id === fileId);
      
      console.log(`   Check ${i+1}: Status=${currentFile?.processed ? 'PROCESSED' : 'PENDING'}, Errors=${currentFile?.processingErrors || 'None'}`);
      
      if (currentFile?.processed) {
        console.log('\n✅ Processing completed');
        break;
      }
    }
    
  } catch (error) {
    console.error('❌ Trace test failed:', error);
  } finally {
    try { fs.unlinkSync('trace-test.csv'); } catch (e) {}
  }
}

traceProcessingFlow().catch(console.error);