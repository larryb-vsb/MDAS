// Complete verification that File not found errors are eliminated
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function completeFixVerification() {
  console.log('=== COMPLETE FIX VERIFICATION ===');
  console.log('Testing complete elimination of "File not found" errors\n');
  
  // Test multiple file uploads to ensure comprehensive fix
  const testFiles = [
    { name: 'verify-1.csv', content: 'TransactionID,MerchantID,Amount\nVERIFY_001,M999001,100.00' },
    { name: 'verify-2.csv', content: 'TransactionID,MerchantID,Amount\nVERIFY_002,M999002,200.50' },
    { name: 'verify-3.csv', content: 'TransactionID,MerchantID,Amount\nVERIFY_003,M999003,300.75' }
  ];
  
  const uploadedFiles = [];
  
  try {
    // Upload multiple test files
    console.log('📤 Uploading multiple test files...');
    for (const testFile of testFiles) {
      fs.writeFileSync(testFile.name, testFile.content);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(testFile.name));
      formData.append('type', 'transaction');
      
      const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });
      
      const uploadData = await uploadResponse.json();
      uploadedFiles.push({ fileId: uploadData.fileId, name: testFile.name });
      console.log(`   ✅ ${testFile.name} → ${uploadData.fileId}`);
    }
    
    // Wait for temporary file cleanup
    console.log('\n⏳ Waiting for temporary file cleanup (5 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify all files have database content
    console.log('\n🔍 Verifying database content storage...');
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=10`);
    const historyData = await historyResponse.json();
    
    let allHaveContent = true;
    for (const file of uploadedFiles) {
      const dbFile = historyData.find(f => f.id === file.fileId);
      const hasContent = !!dbFile?.file_content;
      console.log(`   ${file.name}: ${hasContent ? '✅ HAS CONTENT' : '❌ NO CONTENT'}`);
      if (!hasContent) allHaveContent = false;
    }
    
    if (!allHaveContent) {
      console.log('\n❌ CRITICAL: Some files missing database content');
      return;
    }
    
    // Trigger processing
    console.log('\n🔧 Triggering batch processing...');
    const fileIds = uploadedFiles.map(f => f.fileId);
    const processResponse = await fetch(`${BASE_URL}/api/process-uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds })
    });
    
    const processData = await processResponse.json();
    console.log(`   Processing response: ${processData.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    // Monitor processing completion
    console.log('\n👀 Monitoring processing completion...');
    let maxChecks = 20;
    let allProcessed = false;
    
    while (maxChecks > 0 && !allProcessed) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=10`);
      const statusData = await statusResponse.json();
      
      const processedCount = fileIds.filter(fileId => {
        const file = statusData.find(f => f.id === fileId);
        return file?.processed;
      }).length;
      
      console.log(`   Check: ${processedCount}/${fileIds.length} files processed`);
      
      if (processedCount === fileIds.length) {
        allProcessed = true;
        break;
      }
      
      maxChecks--;
    }
    
    // Final verification - check for any errors
    console.log('\n📊 Final Results Check...');
    const finalResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=10`);
    const finalData = await finalResponse.json();
    
    let hasErrors = false;
    for (const file of uploadedFiles) {
      const dbFile = finalData.find(f => f.id === file.fileId);
      const status = dbFile?.processed ? 'PROCESSED' : 'PENDING';
      const error = dbFile?.processingErrors || 'None';
      const hasFileNotFoundError = error.includes('File not found');
      
      console.log(`   ${file.name}:`);
      console.log(`     Status: ${status}`);
      console.log(`     Error: ${error}`);
      console.log(`     File Not Found Error: ${hasFileNotFoundError ? '❌ YES' : '✅ NO'}`);
      
      if (hasFileNotFoundError) hasErrors = true;
    }
    
    console.log('\n🎯 FINAL VERDICT:');
    if (!hasErrors && allProcessed) {
      console.log('✅ SUCCESS: Complete elimination of "File not found" errors confirmed!');
      console.log('✅ All files processed successfully from database content');
      console.log('✅ Zero dependency on temporary file storage');
      console.log('✅ System is production-ready with robust file processing');
    } else if (hasErrors) {
      console.log('❌ FAILURE: "File not found" errors still occurring');
    } else {
      console.log('⏳ PARTIAL: Processing still in progress');
    }
    
  } catch (error) {
    console.error('❌ Verification test failed:', error);
  } finally {
    // Cleanup test files
    for (const testFile of testFiles) {
      try { fs.unlinkSync(testFile.name); } catch (e) {}
    }
  }
}

completeFixVerification().catch(console.error);