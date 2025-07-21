#!/usr/bin/env node

// Test TDDF merchant name extraction with the corrected processing
import fs from 'fs';

async function testTddfProcessing() {
  console.log('🧪 Testing TDDF Merchant Name Extraction');
  
  try {
    // Read the TDDF file
    const content = fs.readFileSync('test-real-tddf.TSYSO', 'utf8');
    const base64Content = Buffer.from(content).toString('base64');
    
    // Upload the file first
    console.log('📤 Uploading TDDF file...');
    const uploadResponse = await fetch('http://localhost:5000/api/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [{
          name: 'test-merchant-names-extraction.TSYSO',
          type: 'tddf',
          size: content.length,
          content: base64Content
        }]
      })
    });
    
    const uploadData = await uploadResponse.json();
    console.log('✅ Upload successful:', uploadData.files[0].id);
    
    // Process the file
    console.log('⚙️ Processing TDDF file...');
    const processResponse = await fetch('http://localhost:5000/api/process-uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileIds: [uploadData.files[0].id]
      })
    });
    
    const processData = await processResponse.json();
    console.log('⚙️ Processing result:', processData);
    
    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check the results in database
    console.log('🔍 Checking TDDF records in database...');
    const checkResponse = await fetch('http://localhost:5000/api/tddf?limit=10&page=1');
    const checkData = await checkResponse.json();
    
    console.log('📊 TDDF Records Found:');
    checkData.records.forEach(record => {
      console.log(`  🏢 Transaction: ${record.txnId}`);
      console.log(`     Merchant Account: ${record.merchantId}`);
      console.log(`     Merchant Name: "${record.merchantName || 'NOT EXTRACTED'}"`);
      console.log(`     Amount: $${record.txnAmount}`);
      console.log(`     Date: ${record.txnDate}`);
      console.log('');
    });
    
    if (checkData.records.length > 0) {
      const hasNames = checkData.records.filter(r => r.merchantName && r.merchantName.trim()).length;
      console.log(`✅ SUCCESS: ${hasNames}/${checkData.records.length} records have merchant names extracted`);
    } else {
      console.log('❌ No TDDF records found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testTddfProcessing();