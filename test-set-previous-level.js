#!/usr/bin/env node

/**
 * Test script for "Set Previous Level" functionality with failed files
 * Tests the complete failed file recovery system
 */

const API_BASE = 'http://localhost:20559/api';

console.log('🧪 Testing Set Previous Level functionality for failed files');

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': 'connect.sid=s%3AhvJrY2xhNGhwNTZpcXM5eHhvd2o0eA.uVpNJG8l9b5%2BXAOLl%2Fg3kDLwG4hnH2wZQGS9xvXowm0'
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

async function testSetPreviousLevel() {
  try {
    console.log('\n1. 📂 Getting uploads to find failed files...');
    const uploads = await apiRequest('/uploader');
    
    // Find failed files from our SQL setup
    const failedFiles = uploads.filter(u => u.currentPhase === 'failed');
    console.log(`✅ Found ${failedFiles.length} failed files`);
    
    if (failedFiles.length === 0) {
      console.log('❌ No failed files found for testing');
      return;
    }

    // Show the failed files
    console.log('\n📋 Failed files for testing:');
    failedFiles.forEach(file => {
      console.log(`  - ${file.filename} (${file.id})`);
      console.log(`    Status: ${file.currentPhase}`);
      console.log(`    Uploaded: ${file.uploadedAt}`);
      console.log(`    Identified: ${file.identifiedAt}`);
      console.log(`    Processing Notes: ${file.processingNotes || 'None'}`);
    });

    // Test set previous level with the first failed file
    const testFile = failedFiles[0];
    console.log(`\n2. 🔄 Testing Set Previous Level with: ${testFile.filename}`);
    
    const recoveryResult = await apiRequest('/uploader/set-previous-level', {
      method: 'POST',
      body: JSON.stringify({
        uploadIds: [testFile.id]
      })
    });

    console.log('✅ Set Previous Level API Response:', recoveryResult);

    // Check the result
    console.log('\n3. 🔍 Verifying recovery result...');
    const updatedUploads = await apiRequest('/uploader');
    const recoveredFile = updatedUploads.find(u => u.id === testFile.id);
    
    if (recoveredFile) {
      console.log(`✅ File ${recoveredFile.filename} recovered successfully!`);
      console.log(`  Previous Status: failed`);
      console.log(`  New Status: ${recoveredFile.currentPhase}`);
      console.log(`  Processing Notes: ${recoveredFile.processingNotes}`);
      
      // Determine expected new status based on timestamps
      let expectedStatus = 'started';
      if (testFile.identifiedAt) {
        expectedStatus = 'identified';
      } else if (testFile.uploadedAt) {
        expectedStatus = 'uploaded';
      }
      
      if (recoveredFile.currentPhase === expectedStatus) {
        console.log(`✅ Status recovery correct: expected ${expectedStatus}, got ${recoveredFile.currentPhase}`);
      } else {
        console.log(`⚠️  Status recovery unexpected: expected ${expectedStatus}, got ${recoveredFile.currentPhase}`);
      }
    } else {
      console.log('❌ Failed to find recovered file');
    }

    console.log('\n🎉 Set Previous Level test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the test
testSetPreviousLevel();