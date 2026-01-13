// Test script to demonstrate enhanced TDDF processing with MMS-RAW-Line field
import { fetch } from 'undici';

async function testEnhancedTddfProcessing() {
  console.log('=== TESTING ENHANCED TDDF PROCESSING WITH MMS-RAW-LINE FIELD ===\n');
  
  // Create test TDDF content with various record types
  const testTddfContent = `01696290624670002BH6759067590000000215480088880000090171128202233222000000000853920    0000090001484509N8008886759C11292022                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
01696300624670003DT67590675900000002154800888800000010180088873011002332900014845093112820220000085392033222000000000853920377972XXXXX1024                          NY 4 07N003321356909322N840000000853920          01DNDRIP DROP DISTRO LLC     266851    AM84000000853920 N  519971004114                            000000000+6004S0S00140 258     11245                     000000000                   0000000000000.00 0000000.00   0000000.00                             000000000000000 61248972736759675900000002154 DRIP DROP DISTRO LLC     1445 W COMMERCE AVE SUITE2087248209      83705     TROY@DRIPDROPDISTRO.COM                   01418  000000000000 0000000000200.77     02350 00000                  
01696310624670004A167590675900000000968800888800000010180088887287282332900010154024112820220000000128433222000000000001784531260XXXXXX3486       ME03KE06MS02      NY 4607AMDJMSYA1U1128  N840000000001284          81DNAIRLINE EXTENSION REC    105024    MD84000000001284 N  546200000001   r9SaxiRndZAdNCuNN4ja     000000000+600450S00140    MDJ  10813                     000000000  1                0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                   U001418  000000000000 0000000000000.23     00050 02200                  
01696320624670005P167590675900000000968800888800000010180088887287282332900010169865112820220000000050033222000000000001784531260XXXXXX3486       ME03KE06MS02      NY 4607AMDJM9XEI01128  N840000000000500          81DNPURCHASING CARD EXT      104051    MD84000000000500 N  546200000001   69                       000000000+600450S00140    MDJ  10813                     000000000  1                0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                   U001418  000000000000 0000000000000.22     00050 02200                  
01696330624670006DR67590675900000000968800888800000010180088887287282332900010169865112820220000000050033222000000000001784531260XXXXXX3486       ME03KE06MS02      NY 4607AMDJM9XEI01128  N840000000000500          81DNDIRECT MARKETING EXT     104051    MD84000000000500 N  546200000001   69                       000000000+600450S00140    MDJ  10813                     000000000  1                0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                   U001418  000000000000 0000000000000.22     00050 02200                  
01696340624670007DT67590675900000000968800888800000010180088887287282332900010169865112820220000000050033222000000000001784531260XXXXXX3486       ME03KE06MS02      NY 4607AMDJM9XEI01128  N840000000000500          81DNHIGHER FLOUR LLC         104051    MD84000000000500 N  546200000001   69                       000000000+600450S00140    MDJ  10813                     000000000  1                0000000000000.00 0000000.00   0000000.00                             000000000000000                                                                                                                                                   U001418  000000000000 0000000000000.22     00050 02200                  `;

  try {
    console.log('Expected Processing Results:');
    console.log('  - Line 1: BH (Batch Header) - Should be SKIPPED');
    console.log('  - Line 2: DT (Detail Transaction) - Should be PROCESSED');
    console.log('  - Line 3: A1 (Airline Extension) - Should be SKIPPED');
    console.log('  - Line 4: P1 (Purchasing Card Extension) - Should be SKIPPED');
    console.log('  - Line 5: DR (Direct Marketing Extension) - Should be SKIPPED');
    console.log('  - Line 6: DT (Detail Transaction) - Should be PROCESSED');
    console.log('  - All lines stored in MMS-RAW-Line field before processing decisions\n');

    // Upload the test file
    const formData = new FormData();
    const blob = new Blob([testTddfContent], { type: 'text/plain' });
    formData.append('files', blob, 'enhanced_test_all_types.TSYSO');
    formData.append('fileType', 'tddf');

    console.log('Uploading test TDDF file with multiple record types...');
    const uploadResponse = await fetch('http://localhost:5000/api/uploads', {
      method: 'POST',
      body: formData,
      headers: {
        'Cookie': 'connect.sid=s%3A6K9p2L4xH1mF5N8qT7vW3eR2gD.abc123' // Mock session
      }
    });

    if (uploadResponse.ok) {
      console.log('✅ File uploaded successfully!');
      
      // Trigger processing
      console.log('\nTriggering file processing...');
      const processResponse = await fetch('http://localhost:5000/api/file-processor/process-all', {
        method: 'POST',
        headers: {
          'Cookie': 'connect.sid=s%3A6K9p2L4xH1mF5N8qT7vW3eR2gD.abc123'
        }
      });

      if (processResponse.ok) {
        console.log('✅ Processing triggered successfully!');
        console.log('\nCheck the console logs for detailed record type breakdown showing:');
        console.log('  📋 RECORD TYPE BREAKDOWN with all 13 supported types');
        console.log('  🔍 DETAILED RECORD TYPE ANALYSIS with percentages and processing status');
        console.log('  ✅ PROCESSING EFFICIENCY metrics');
        console.log('  📝 MMS-RAW-Line field populated for all records');
      } else {
        console.log('❌ Processing failed:', await processResponse.text());
      }
    } else {
      console.log('❌ Upload failed:', await uploadResponse.text());
    }

  } catch (error) {
    console.error('Test error:', error);
  }
}

testEnhancedTddfProcessing();