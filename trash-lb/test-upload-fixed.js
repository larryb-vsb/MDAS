// Test upload functionality after fixing the ORM issue
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function testUploadFixed() {
  console.log('Testing upload functionality after ORM fix...');
  
  try {
    // Create test demographic file
    const demographicCsv = `Client ID,Client Legal Name,Client MID,Client Prg,Client Stat,Client Padl,Client Padr,Client Sinc,Client Loca,Client Cont,Client Phon,Client MTYP,Client SalesChannel
TEST_UPLOAD_FIXED,Test Upload Fixed LLC,FIXED_MID,TEST,Active,123 Fixed St,Suite 100,2024-01-01,Fixed City,NY,555-0000,1,TestFixed`;
    
    const testFileName = 'test-upload-fixed-' + Date.now() + '.csv';
    fs.writeFileSync(testFileName, demographicCsv);
    
    console.log(`✓ Created test file: ${testFileName}`);
    
    // Test upload using the single file endpoint
    const form = new FormData();
    form.append('file', fs.createReadStream(testFileName));
    form.append('type', 'merchant');
    
    const uploadResponse = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      body: form
    });
    
    console.log(`Upload response status: ${uploadResponse.status}`);
    
    if (uploadResponse.ok) {
      const result = await uploadResponse.json();
      console.log('✅ Upload successful:', result);
      
      // Verify file appears in history
      const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (historyResponse.ok) {
        const files = await historyResponse.json();
        const uploadedFile = files.find(f => f.originalFilename === testFileName);
        if (uploadedFile) {
          console.log('✅ File appears in history:', uploadedFile.id);
        } else {
          console.log('❌ File not found in history');
        }
      }
    } else {
      const errorText = await uploadResponse.text();
      console.log('❌ Upload failed:', errorText);
    }
    
    // Clean up
    if (fs.existsSync(testFileName)) {
      fs.unlinkSync(testFileName);
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testUploadFixed();