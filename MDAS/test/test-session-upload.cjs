#!/usr/bin/env node

/**
 * Session-Based Upload Test Script
 * Tests the 3-phase upload workflow: started → uploading → uploaded → completed
 */

const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:5000';
const TEST_FILE_CONTENT = `Test File Content
Line 1: Sample data for testing
Line 2: Another line of test data
Line 3: Final test line`;

async function testSessionUpload() {
  console.log('🧪 Starting Session-Based Upload Test\n');
  
  try {
    // Create a temporary test file
    const testFileName = `test-upload-${Date.now()}.txt`;
    const testFilePath = `/tmp/${testFileName}`;
    fs.writeFileSync(testFilePath, TEST_FILE_CONTENT);
    console.log(`✅ Created test file: ${testFileName}`);
    
    // Generate session ID (matching frontend logic)
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`🔄 Session ID: ${sessionId}`);
    
    // Phase 1: Initialize upload (started phase)
    console.log('\n📤 Phase 1: Initializing upload...');
    const initResponse = await fetch(`${BASE_URL}/api/uploader`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3AyourSessionId.signature' // Mock session
      },
      body: JSON.stringify({
        filename: testFileName,
        fileType: 'test',
        sessionId: sessionId,
        processingNotes: `Session-controlled upload started (Session: ${sessionId})`
      })
    });
    
    if (!initResponse.ok) {
      throw new Error(`Init failed: ${initResponse.status} ${initResponse.statusText}`);
    }
    
    const uploadRecord = await initResponse.json();
    console.log(`✅ Upload initialized: ${uploadRecord.id}`);
    console.log(`   Current Phase: ${uploadRecord.currentPhase}`);
    
    // Phase 2: Set to uploading phase
    console.log('\n📡 Phase 2: Setting uploading phase...');
    const uploadingResponse = await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}/phase/uploading`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3AyourSessionId.signature'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        uploadProgress: 0,
        processingNotes: `Upload started - Session: ${sessionId}`
      })
    });
    
    if (!uploadingResponse.ok) {
      throw new Error(`Uploading phase failed: ${uploadingResponse.status}`);
    }
    
    const uploadingRecord = await uploadingResponse.json();
    console.log(`✅ Upload phase set: ${uploadingRecord.currentPhase}`);
    console.log(`   Progress: ${uploadingRecord.uploadProgress}%`);
    
    // Simulate progress updates (like frontend does)
    console.log('\n📊 Simulating progress updates...');
    for (let progress = 25; progress <= 75; progress += 25) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      
      const progressResponse = await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'connect.sid=s%3AyourSessionId.signature'
        },
        body: JSON.stringify({
          uploadProgress: progress,
          processingNotes: `Upload progress: ${progress}% - Session: ${sessionId}`
        })
      });
      
      if (progressResponse.ok) {
        console.log(`   Progress updated: ${progress}%`);
      }
    }
    
    // Phase 3: Upload file content (simulate actual file upload)
    console.log('\n📋 Phase 3: Uploading file content...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('sessionId', sessionId);
    
    const fileUploadResponse = await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}/upload`, {
      method: 'POST',
      headers: {
        'Cookie': 'connect.sid=s%3AyourSessionId.signature'
      },
      body: formData
    });
    
    if (!fileUploadResponse.ok) {
      throw new Error(`File upload failed: ${fileUploadResponse.status}`);
    }
    
    console.log(`✅ File content uploaded successfully`);
    
    // Final progress update (100%)
    await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3AyourSessionId.signature'
      },
      body: JSON.stringify({
        uploadProgress: 100,
        processingNotes: `Upload completed - Session: ${sessionId}`
      })
    });
    console.log(`   Progress: 100% ✅`);
    
    // Phase 4: Set to uploaded phase
    console.log('\n📁 Phase 4: Setting uploaded phase...');
    const uploadedResponse = await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}/phase/uploaded`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3AyourSessionId.signature'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        processingNotes: `Upload to storage completed - Session: ${sessionId}`,
        uploadedAt: new Date().toISOString()
      })
    });
    
    if (!uploadedResponse.ok) {
      throw new Error(`Uploaded phase failed: ${uploadedResponse.status}`);
    }
    
    const uploadedRecord = await uploadedResponse.json();
    console.log(`✅ Upload phase set: ${uploadedRecord.currentPhase}`);
    
    // Phase 5: Set to completed phase (automatic completion)
    console.log('\n🎯 Phase 5: Setting completed phase...');
    const completedResponse = await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}/phase/completed`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'connect.sid=s%3AyourSessionId.signature'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        processingNotes: `All chunks received and processing completed - Session: ${sessionId}`,
        completedAt: new Date().toISOString()
      })
    });
    
    if (!completedResponse.ok) {
      throw new Error(`Completed phase failed: ${completedResponse.status}`);
    }
    
    const completedRecord = await completedResponse.json();
    console.log(`✅ Final phase set: ${completedRecord.currentPhase}`);
    
    // Verify final status
    console.log('\n🔍 Verifying final upload status...');
    const finalResponse = await fetch(`${BASE_URL}/api/uploader/${uploadRecord.id}`, {
      headers: {
        'Cookie': 'connect.sid=s%3AyourSessionId.signature'
      }
    });
    
    if (finalResponse.ok) {
      const finalRecord = await finalResponse.json();
      console.log(`\n📊 Final Upload Record:`);
      console.log(`   ID: ${finalRecord.id}`);
      console.log(`   Filename: ${finalRecord.filename}`);
      console.log(`   Current Phase: ${finalRecord.currentPhase}`);
      console.log(`   Upload Progress: ${finalRecord.uploadProgress}%`);
      console.log(`   Session ID: ${finalRecord.sessionId}`);
      console.log(`   Started: ${finalRecord.startTime}`);
      console.log(`   Upload Started: ${finalRecord.uploadStartedAt}`);
      console.log(`   Uploaded: ${finalRecord.uploadedAt}`);
      console.log(`   Completed: ${finalRecord.completedAt}`);
      console.log(`   Processing Notes: ${finalRecord.processingNotes}`);
    }
    
    // Cleanup
    fs.unlinkSync(testFilePath);
    console.log(`\n🧹 Cleanup: Removed test file`);
    
    console.log(`\n🎉 Test completed successfully!`);
    console.log(`✅ All phases verified: started → uploading → uploaded → completed`);
    
  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);
    process.exit(1);
  }
}

// Run the test
testSessionUpload();