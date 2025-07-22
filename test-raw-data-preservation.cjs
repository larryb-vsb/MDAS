#!/usr/bin/env node

/**
 * TEST: Raw Data Preservation During File Processing
 * 
 * This test verifies that raw_lines_count is preserved when files 
 * are marked as "completed" after processing.
 * 
 * Previously, the UPDATE queries in storage.ts were overwriting 
 * raw_lines_count to 0 during completion, even though raw data existed.
 */

const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

// Test configuration
const TEST_CONFIG = {
  testFile: 'test-raw-data-preservation.csv',
  testContent: `Transaction ID,Amount,Merchant ID,Transaction Date
12345,100.00,MERCHANT001,2024-01-01
67890,250.50,MERCHANT002,2024-01-02
11111,75.25,MERCHANT003,2024-01-03`,
  expectedLines: 4, // Including header
  fileType: 'transaction'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🧪 Starting Raw Data Preservation Test');
  console.log('=====================================');
  
  try {
    // Step 1: Create test file
    console.log('\n📝 Step 1: Creating test file...');
    fs.writeFileSync(TEST_CONFIG.testFile, TEST_CONFIG.testContent);
    console.log(`✅ Created test file: ${TEST_CONFIG.testFile} with ${TEST_CONFIG.expectedLines} lines`);
    
    // Step 2: Upload file
    console.log('\n📤 Step 2: Uploading file...');
    const form = new FormData();
    form.append('files', fs.createReadStream(TEST_CONFIG.testFile));
    form.append('type', TEST_CONFIG.fileType);
    
    const uploadResponse = await axios.post(`${BASE_URL}/api/uploads`, form, {
      headers: form.getHeaders()
    });
    
    const fileId = uploadResponse.data.uploads[0].fileId;
    console.log(`✅ File uploaded successfully with ID: ${fileId}`);
    
    // Step 3: Trigger processing
    console.log('\n⚡ Step 3: Triggering file processing...');
    await axios.post(`${BASE_URL}/api/process-uploads`, {
      fileIds: [fileId]
    });
    console.log('✅ Processing initiated');
    
    // Step 4: Wait for processing to complete and monitor raw data
    console.log('\n⏳ Step 4: Monitoring processing status and raw data...');
    let attempts = 0;
    const maxAttempts = 30;
    let finalStatus = null;
    
    while (attempts < maxAttempts) {
      await sleep(2000);
      attempts++;
      
      try {
        const statusResponse = await axios.get(`${BASE_URL}/api/uploads/history`, {
          params: { limit: 10 }
        });
        
        // Handle response structure - check if data has uploads property
        const uploads = statusResponse.data.uploads || statusResponse.data;
        if (!Array.isArray(uploads)) {
          console.log(`   Response structure: ${JSON.stringify(Object.keys(statusResponse.data))}`);
          continue;
        }
        
        const uploadedFile = uploads.find(f => f.id === fileId);
        if (!uploadedFile) {
          console.log(`❌ File ${fileId} not found in uploads list`);
          continue;
        }
        
        const status = uploadedFile.processing_status || uploadedFile.status;
        const rawLinesCount = uploadedFile.raw_lines_count;
        const processingNotes = uploadedFile.processing_notes;
        
        console.log(`   Attempt ${attempts}: Status="${status}", Raw Lines=${rawLinesCount}, Notes="${processingNotes}"`);
        
        if (status === 'completed' || status === 'failed' || status === 'error') {
          finalStatus = {
            status,
            rawLinesCount,
            processingNotes,
            recordsProcessed: uploadedFile.records_processed,
            processingDetails: uploadedFile.processing_details
          };
          break;
        }
      } catch (error) {
        console.log(`   Attempt ${attempts}: Error checking status: ${error.message}`);
      }
    }
    
    // Step 5: Analyze results
    console.log('\n📊 Step 5: Analyzing results...');
    if (!finalStatus) {
      console.log('❌ FAILED: Processing did not complete within time limit');
      return false;
    }
    
    console.log(`Final Status: ${finalStatus.status}`);
    console.log(`Raw Lines Count: ${finalStatus.rawLinesCount}`);
    console.log(`Records Processed: ${finalStatus.recordsProcessed}`);
    console.log(`Processing Notes: ${finalStatus.processingNotes}`);
    console.log(`Processing Details: ${finalStatus.processingDetails}`);
    
    // Validation
    let testPassed = true;
    const issues = [];
    
    // Check 1: Raw lines count should match expected
    if (finalStatus.rawLinesCount !== TEST_CONFIG.expectedLines) {
      issues.push(`❌ Raw lines count mismatch: Expected ${TEST_CONFIG.expectedLines}, got ${finalStatus.rawLinesCount}`);
      testPassed = false;
    } else {
      console.log(`✅ Raw lines count preserved correctly: ${finalStatus.rawLinesCount}`);
    }
    
    // Check 2: Processing notes should mention raw data
    if (!finalStatus.processingNotes || !finalStatus.processingNotes.includes('Raw data')) {
      issues.push(`❌ Processing notes missing raw data info: "${finalStatus.processingNotes}"`);
      testPassed = false;
    } else {
      console.log(`✅ Processing notes include raw data info`);
    }
    
    // Check 3: Processing should complete successfully
    if (finalStatus.status !== 'completed') {
      issues.push(`❌ Processing failed with status: ${finalStatus.status}`);
      testPassed = false;
    } else {
      console.log(`✅ Processing completed successfully`);
    }
    
    // Step 6: Report results
    console.log('\n🎯 Test Results');
    console.log('===============');
    
    if (testPassed) {
      console.log('🎉 TEST PASSED: Raw data preservation is working correctly!');
      console.log('   ✓ Raw lines count preserved during completion');
      console.log('   ✓ Processing notes maintained');
      console.log('   ✓ File processing completed successfully');
    } else {
      console.log('💥 TEST FAILED: Raw data preservation issues detected!');
      issues.forEach(issue => console.log(`   ${issue}`));
    }
    
    return testPassed;
    
  } catch (error) {
    console.error(`💥 Test failed with error:`, error.message);
    return false;
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(TEST_CONFIG.testFile)) {
        fs.unlinkSync(TEST_CONFIG.testFile);
        console.log(`🧹 Cleaned up test file: ${TEST_CONFIG.testFile}`);
      }
    } catch (cleanupError) {
      console.warn(`⚠️  Cleanup warning:`, cleanupError.message);
    }
  }
}

// Run the test
if (require.main === module) {
  runTest().then(success => {
    console.log(`\n${success ? '✅' : '❌'} Test completed with status: ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runTest };