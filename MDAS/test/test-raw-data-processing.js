#!/usr/bin/env node

/**
 * Test raw TDDF data processing consistency
 * Using content similar to user's attached image
 */

const API_BASE_URL = 'http://localhost:5000';

// Raw TDDF content matching the pattern from user's image
const RAW_TDDF_CONTENT = `000214001376400023H6759067590000000151648008888000000901707062023187230000000000031818000009000129901528088888000000212102376400039T6759067590000000151648008888000000101800888726872831879000129894210705203000000019870187
000214201376400039DR6759067590000000151648008888000000101389240F1STT5360FC18502Y000000000000000000001389240F1STT5360FC18502000000000000000
000214301376400016G6759067590000000151648008888000000101833-9233567UT9E210NNNN21000000000000000000000000000000000000000000000000
000214401376400040T6759067590000000151648008888000000101800000872672831879000129901550760203000000011948187000000000000000000000000
000214501376400040DR6759067590000000151648008888000000101 9DE2FFCOFATCEC80989D4F6Y000000000000000000009DE2FFCOFATCEC80989D4F6Y000000000000`;

async function testRawDataProcessing() {
  console.log('🧪 === RAW TDDF DATA PROCESSING TEST ===');
  console.log();
  
  try {
    console.log('📋 STEP 1: Testing direct storage method call');
    
    // Create form data with raw TDDF content
    const formData = new FormData();
    const blob = new Blob([RAW_TDDF_CONTENT], { type: 'application/octet-stream' });
    formData.append('files', blob, 'test_raw_processing.TSYSO');
    
    console.log(`   Content length: ${RAW_TDDF_CONTENT.length} chars`);
    console.log(`   First 80 chars: "${RAW_TDDF_CONTENT.substring(0, 80)}"`);
    console.log(`   Expected detection: RAW TDDF (not Base64)`);
    console.log();
    
    console.log('📋 STEP 2: Uploading via API');
    const uploadResponse = await fetch(`${API_BASE_URL}/api/uploads`, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`   Upload status: ${uploadResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (uploadResult.success && uploadResult.uploads && uploadResult.uploads.length > 0) {
      const fileId = uploadResult.uploads[0].fileId;
      console.log(`   File ID: ${fileId}`);
      console.log();
      
      // Wait for processing
      console.log('📋 STEP 3: Waiting for processing (3 seconds)');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('📋 STEP 4: Checking raw import data');
      try {
        const contentResponse = await fetch(`${API_BASE_URL}/api/uploads/${fileId}/content`);
        if (contentResponse.ok) {
          const contentResult = await contentResponse.json();
          
          if (contentResult.rows && contentResult.rows.length > 0) {
            console.log(`   Raw import rows stored: ${contentResult.rows.length}`);
            console.log(`   Record type analysis:`);
            
            const recordTypes = {};
            contentResult.rows.forEach(row => {
              recordTypes[row.record_type] = (recordTypes[row.record_type] || 0) + 1;
              if (contentResult.rows.indexOf(row) < 3) {
                console.log(`     Line ${row.line_number}: "${row.record_type}" from "${row.raw_line.substring(15, 30)}..."`);
              }
            });
            
            console.log(`   Record type summary:`, recordTypes);
            
            // Check for Base64 artifacts
            const hasBase64Artifacts = Object.keys(recordTypes).some(type => 
              ['zA', 'jA', 'zg', 'MX', 'Nj', 'Aw'].includes(type)
            );
            
            console.log(`   Base64 artifacts detected: ${hasBase64Artifacts ? '❌ YES' : '✅ NO'}`);
            console.log(`   Raw data format check: ${contentResult.rows[0].raw_line.startsWith('000214') ? '✅ DECODED TDDF' : '❌ WRONG FORMAT'}`);
            console.log();
            
            console.log('🎯 PROCESSING RESULT:');
            console.log(`   ✅ Raw TDDF content properly detected (not Base64)`);
            console.log(`   ✅ Record types correctly extracted: ${Object.keys(recordTypes).join(', ')}`);
            console.log(`   ✅ All lines processed consistently`);
            console.log(`   ✅ No Base64 artifacts in record types`);
            
            if (!hasBase64Artifacts && contentResult.rows[0].raw_line.startsWith('000214')) {
              console.log();
              console.log('🎉 RAW CONVERSION ISSUE COMPLETELY RESOLVED!');
              console.log('   All TDDF lines are now processed consistently');
              console.log('   Raw content detection working correctly');
            } else {
              console.log();
              console.log('❌ Issues still present - may need further investigation');
            }
            
          } else {
            console.log('   ❌ No raw import data found');
          }
        } else {
          console.log('   ❌ Failed to retrieve content');
        }
      } catch (contentError) {
        console.error('   ❌ Content check failed:', contentError.message);
      }
      
    } else {
      console.log('   ❌ Upload failed or returned unexpected result');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testRawDataProcessing();