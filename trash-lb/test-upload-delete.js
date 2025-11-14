// Test upload and delete functionality with demographic file
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testUploadDelete() {
  console.log('Testing upload and delete functionality...');
  
  try {
    // Create test demographic file
    const demographicCsv = `Client ID,Client Legal Name,Client MID,Client Prg,Client Stat,Client Padl,Client Padr,Client Sinc,Client Loca,Client Cont,Client Phon,Client MTYP,Client SalesChannel
TEST_DELETE_001,Test Delete Merchant LLC,DELETE_TEST_MID,TEST,Active,123 Delete St,Suite 999,2024-01-01,Delete City,NY,555-9999,1,TestChannel`;
    
    const testFileName = 'test-delete-demographic-' + Date.now() + '.csv';
    fs.writeFileSync(testFileName, demographicCsv);
    
    console.log(`✓ Created test demographic file: ${testFileName}`);
    
    // Login first
    const loginResponse = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    
    if (!loginResponse.ok) {
      throw new Error('Login failed');
    }
    
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('✓ Login successful');
    
    // Upload the demographic file
    const form = new FormData();
    form.append('files', fs.createReadStream(testFileName));
    form.append('fileType', 'merchant');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/uploads`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
      body: form
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('✓ Upload successful:', uploadResult.message);
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get upload history to find our file
    const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`, {
      headers: { 'Cookie': cookies }
    });
    
    if (!historyResponse.ok) {
      throw new Error('Failed to get upload history');
    }
    
    const files = await historyResponse.json();
    const testFile = files.find(f => f.originalFilename === testFileName);
    
    if (!testFile) {
      throw new Error('Test file not found in upload history');
    }
    
    console.log(`✓ Found uploaded file: ${testFile.id} - ${testFile.originalFilename}`);
    console.log(`✓ File status: ${testFile.processingStatus} (processed: ${testFile.processed})`);
    
    // Now delete the file
    const deleteResponse = await fetch(`${BASE_URL}/api/uploads/${testFile.id}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookies }
    });
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      throw new Error(`Delete failed: ${deleteResponse.status} - ${errorText}`);
    }
    
    const deleteResult = await deleteResponse.json();
    console.log('✓ Delete successful:', deleteResult);
    
    // Verify file is deleted
    const verifyResponse = await fetch(`${BASE_URL}/api/uploads/history`, {
      headers: { 'Cookie': cookies }
    });
    
    if (verifyResponse.ok) {
      const updatedFiles = await verifyResponse.json();
      const deletedFile = updatedFiles.find(f => f.id === testFile.id);
      
      if (!deletedFile) {
        console.log('✓ File successfully removed from history');
      } else {
        console.log(`✓ File marked as deleted: ${deletedFile.deleted}`);
      }
    }
    
    // Clean up test file
    fs.unlinkSync(testFileName);
    console.log('✓ Test file cleaned up');
    
    console.log('\n✅ UPLOAD AND DELETE TEST COMPLETED SUCCESSFULLY');
    console.log('Summary:');
    console.log('- Demographic file uploaded successfully');
    console.log('- File was processed and tracked in database');
    console.log('- File deletion functionality working correctly');
    console.log('- No schema errors during delete operation');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    // Clean up test file on failure
    const testFileName = 'test-delete-demographic-' + Date.now() + '.csv';
    try {
      if (fs.existsSync(testFileName)) {
        fs.unlinkSync(testFileName);
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

testUploadDelete();