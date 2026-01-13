#!/usr/bin/env node

/**
 * Test improved TDDF content detection logic
 * Based on the user's attached image showing raw TDDF content starting with "000214001376400023H..."
 */

// Sample content from user's attached image
const RAW_TDDF_CONTENT = `000214001376400023H675906759000000015164800888800000090170706202318723000000000003181B 0000090001299015Y800888
000214101376400039T67590675900000015164800888800000101800888726872831879000129894210705203000000019870187
ME03KE06M502 NY 46Q7AMM1VEV2K24DQ702 N84000000001987O $1DNKETOFUSION833-923-3587 75108F MC6400000000198701N
38920415T1PP000PC15303 0000000000+604500X01309WLC00737 0000000000000 N 0000000000000000 000000000 000000000 000
0000000000000S2T 02500 01000

000214201376400039DR67590675900000015164800888800000101389240F1STT5360FC18502 Y000000000000

000214301376400016267590675900000015164800888800000101833-9233567 UT 9 E 210 NNNN 21000000000000000000000000000

000214401376400040T67590675900000015164800888800000101800000872672831879000129901550760203000000011948187
2E03KE06M502 NY 46Q7AMCWVOV2K24DQ702 N84000000001I9488$1DNKETOFUSION833-923-3587 04485Z MC6400000000011948 N
9DE2FFCOFATCEC80989D4F6 0000000000+604500X01392WC00642 0000000000 N 0000000000000000 000000000 000000000 000
00000000000000Z73 02200 01000

000214501376400040DR67590675900000015164800888800000101 9DE2FFCOFATCEC80989D4F6 Y000000000000

000214601376400016267590675900000015164800888800000101833-9233567 UT 9 W 210 NNNN 21000000000000000000000000000

000214701376400058H675906759000000346948001428000009017070620231872300000000015000000000993001110027Y800142I

000214801376400060T675906759000000346948001428000001018004224011931879000111002769706203000001500001872
P501EF100000000 NY14 07N46318767023171998480000000150007WNO0 01DNHORIZON WHOLESALE LLC 01102G V8440000000
G1CG1118853 000000000 N0000000010 14B 0000000000000000000 000000000 000000000 000000000000000000 01424 0000000000000 000`;

// Base64 encoded version for comparison
const BASE64_ENCODED = Buffer.from(RAW_TDDF_CONTENT, 'utf8').toString('base64');

function testTddfDetection() {
  console.log('=== TESTING IMPROVED TDDF DETECTION LOGIC ===\n');

  // Test the improved detection logic
  function testDetection(content, expectedResult, description) {
    console.log(`📋 Testing: ${description}`);
    console.log(`   Content length: ${content.length}`);
    console.log(`   First 60 chars: "${content.substring(0, 60)}"`);
    
    // Apply the same logic as in the fixed storage method
    const hasTddfPatterns = content.length > 50 && (
      content.includes('BH') || content.includes('DT') || content.includes('P1') || // Record types
      /^\d{6,}/.test(content) || // Starts with 6+ digits (sequence numbers like 000214...)
      content.startsWith('01') // Some TDDF files start with '01'
    );
    
    const isBase64 = content.length > 100 && 
                    !hasTddfPatterns && // No TDDF patterns detected
                    /^[A-Za-z0-9+/=\s]*$/.test(content); // Base64 character pattern
    
    console.log(`   Has TDDF patterns: ${hasTddfPatterns ? '✅ YES' : '❌ NO'}`);
    console.log(`   Detected as Base64: ${isBase64 ? '⚠️ YES' : '✅ NO'}`);
    console.log(`   Result: ${!isBase64 ? '✅ PROCESS AS RAW TDDF' : '🔄 DECODE FROM BASE64'}`);
    console.log(`   Expected: ${expectedResult}`);
    console.log(`   Status: ${(!isBase64 && expectedResult === 'RAW') || (isBase64 && expectedResult === 'BASE64') ? '✅ CORRECT' : '❌ WRONG'}\n`);
    
    return { hasTddfPatterns, isBase64, correct: (!isBase64 && expectedResult === 'RAW') || (isBase64 && expectedResult === 'BASE64') };
  }

  // Test cases
  const results = [
    testDetection(RAW_TDDF_CONTENT, 'RAW', 'Raw TDDF content from user image'),
    testDetection(BASE64_ENCODED, 'BASE64', 'Base64 encoded TDDF content'),
    testDetection('01696290624670002BH6759067590000000215', 'RAW', 'TDDF starting with 01'),
    testDetection('000214BH000000DT111111P1222222', 'RAW', 'TDDF with record types'),
    testDetection('MDE2OTYyOTA2MjQ2NzAwMDJCSDY3NTkwNjc1OTA=', 'BASE64', 'Pure Base64 string')
  ];

  console.log('🎯 SUMMARY:');
  const allCorrect = results.every(r => r.correct);
  console.log(`   Detection accuracy: ${results.filter(r => r.correct).length}/${results.length} tests passed`);
  console.log(`   Overall result: ${allCorrect ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allCorrect) {
    console.log('\n🎉 IMPROVED DETECTION LOGIC IS WORKING CORRECTLY!');
    console.log('   Raw TDDF content (like in user image) will be processed directly');
    console.log('   Base64 content will be decoded before processing');
    console.log('   All lines should now be processed consistently');
  }
}

testTddfDetection();