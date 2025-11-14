// Test script to verify TDDF raw import processing during upload
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testTddfRawImportFix() {
  console.log('🧪 Testing TDDF Raw Import Fix During Upload...\n');
  
  try {
    // 1. Upload the test TDDF file
    console.log('1. Uploading test TDDF file...');
    const form = new FormData();
    form.append('files', fs.createReadStream('attached_assets/test_small_tddf.TSYSO'));
    form.append('type', 'tddf');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/uploads`, {
      method: 'POST',
      body: form
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${await uploadResponse.text()}`);
    }
    
    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.uploads[0].fileId;
    console.log(`   ✅ TDDF file uploaded: ${fileId}`);
    
    // 2. Wait a moment then check the file record
    console.log('\n2. Checking upload record for raw import processing...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const fileResponse = await fetch(`${BASE_URL}/api/uploads/history?limit=1`, {
      method: 'GET'
    });
    
    if (!fileResponse.ok) {
      throw new Error(`Failed to get file info: ${await fileResponse.text()}`);
    }
    
    const fileData = await fileResponse.json();
    const uploadedFile = fileData.uploads[0];
    
    console.log(`   📋 File ID: ${uploadedFile.id}`);
    console.log(`   📄 Original filename: ${uploadedFile.originalFilename}`);
    console.log(`   📊 Raw lines count: ${uploadedFile.rawLinesCount || 'NULL'}`);
    console.log(`   📝 Processing notes: ${uploadedFile.processingNotes || 'NULL'}`);
    console.log(`   ✅ Has content: ${uploadedFile.fileContent ? 'YES' : 'NO'}`);
    
    // 3. Check if raw import records were created
    console.log('\n3. Checking raw import records...');
    const rawImportResponse = await fetch(`${BASE_URL}/api/tddf/raw-import?fileId=${fileId}`, {
      method: 'GET'
    });
    
    if (rawImportResponse.ok) {
      const rawImportData = await rawImportResponse.json();
      console.log(`   📋 Raw import records found: ${rawImportData.length || 0}`);
      
      if (rawImportData.length > 0) {
        console.log(`   🔍 Sample record types: ${rawImportData.slice(0, 3).map(r => r.recordType).join(', ')}`);
      }
    } else {
      console.log('   ⚠️  Raw import endpoint not available (this is expected)');
    }
    
    // 4. Summary
    console.log('\n📊 SUMMARY:');
    if (uploadedFile.rawLinesCount > 0) {
      console.log(`   ✅ SUCCESS: Raw import processing worked! ${uploadedFile.rawLinesCount} lines processed`);
      console.log(`   ✅ Processing notes: ${uploadedFile.processingNotes}`);
    } else {
      console.log(`   ❌ ISSUE: Raw import processing failed - raw_lines_count is still 0`);
      console.log(`   📝 Notes: ${uploadedFile.processingNotes || 'No processing notes'}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testTddfRawImportFix();