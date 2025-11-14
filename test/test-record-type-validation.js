// Test script to validate TDDF record type detection from Base64 data
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testRecordTypeDetection() {
  console.log('=== TESTING TDDF RECORD TYPE DETECTION ===\n');
  
  // Create test TDDF content with clear record types
  const testTddfContent = [
    '01696290624670002BH6759067590000000215480088880000090171128202233222000000000853920    0000090001484509N8008886759C11292022', // BH - Batch Header
    '01696290624670002DT6759067590000000215480088880000090171128202233222000000001284      0000090001484509N8008886759C11292022', // DT - Detail Transaction  
    '01696290624670002P16759067590000000215480088880000090171128202233222000000000500      0000090001484509N8008886759C11292022'  // P1 - Purchasing Extension
  ].join('\n');
  
  // Test Base64 encoding/decoding
  console.log('Original content length:', testTddfContent.length);
  const base64Content = Buffer.from(testTddfContent, 'utf8').toString('base64');
  console.log('Base64 content length:', base64Content.length);
  
  // Test decoding and record type extraction
  const decodedContent = Buffer.from(base64Content, 'base64').toString('utf8');
  const lines = decodedContent.split('\n').filter(line => line.trim());
  
  console.log('\nRecord type extraction test:');
  lines.forEach((line, index) => {
    const recordType = line.length >= 19 ? line.substring(17, 19) : 'XX';
    console.log(`Line ${index + 1}: Record Type = "${recordType}", Length = ${line.length}`);
    console.log(`  First 50 chars: ${line.substring(0, 50)}`);
    console.log(`  Positions 18-19: "${line.substring(17, 19)}"`);
  });
  
  // Test upload with proper format
  try {
    const formData = new FormData();
    const blob = Buffer.from(testTddfContent, 'utf8');
    formData.append('files', blob, 'test_record_types.TSYSO');
    formData.append('type', 'tddf');
    
    console.log('\nUploading test TDDF file...');
    const uploadResponse = await fetch('http://localhost:5000/api/uploads', {
      method: 'POST',
      body: formData,
      headers: {
        'Cookie': 'connect.sid=s%3A6K9p2L4xH1mF5N8qT7vW3eR2gD.abc123'
      }
    });
    
    const uploadResult = await uploadResponse.text();
    console.log('Upload result:', uploadResult);
    
  } catch (error) {
    console.error('Upload test failed:', error.message);
  }
}

testRecordTypeDetection().catch(console.error);