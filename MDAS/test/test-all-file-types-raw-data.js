import fs from 'fs';

async function testRawDataProcessingAllFileTypes() {
  console.log('🧪 Testing Raw Data Processing for All File Types...\n');

  // Create test files for each type
  const testFiles = {
    merchant: {
      filename: 'test-merchant.csv',
      content: 'Merchant ID,Name,Status\n123456,Test Merchant,Active\n789012,Another Test,Inactive'
    },
    transaction: {
      filename: 'test-transaction.csv', 
      content: 'Transaction ID,Amount,Date,Merchant ID\nTXN001,100.50,2024-01-01,123456\nTXN002,250.00,2024-01-02,789012'
    },
    terminal: {
      filename: 'test-terminal.csv',
      content: 'Terminal ID,Merchant ID,Location\nT001,123456,Store 1\nT002,789012,Store 2'
    },
    tddf: {
      filename: 'test-small.TSYSO',
      content: `BH0000180001015291000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
DT0000180002070900012800000000037890000003789100029900000001292021090801220004900105000000006540000000000000000000000F6400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
DT0000180003080900013000000000563720000056372100000410000012122021070800120004900105000000006540000000000000000000000F6400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`
    }
  };

  const results = {};

  for (const [fileType, fileData] of Object.entries(testFiles)) {
    console.log(`\n📁 Testing ${fileType.toUpperCase()} file upload...`);
    
    try {
      // Write test file
      fs.writeFileSync(fileData.filename, fileData.content);
      
      // Create form data
      const { default: FormData } = await import('form-data');
      const form = new FormData();
      form.append('files', fs.createReadStream(fileData.filename));
      form.append('type', fileType);

      // Upload file
      const response = await fetch('http://localhost:5000/api/uploads', {
        method: 'POST',
        body: form,
        headers: {
          'Cookie': 'connect.sid=s%3A_JQcY5BT7kWWTQhGjDNKBkqzVbGNHn9X.%2FYPWdP%2FkOH%2Fj4DXHLEIQaW6tN8%2FlpXFpQA4K2lY'
        }
      });

      const uploadResult = await response.json();
      
      if (uploadResult.success) {
        const fileId = uploadResult.uploads[0].fileId;
        console.log(`   ✅ ${fileType.toUpperCase()} file uploaded: ${fileId}`);
        
        // Check upload record for raw data processing
        const historyResponse = await fetch('http://localhost:5000/api/uploads/history?limit=1', {
          headers: {
            'Cookie': 'connect.sid=s%3A_JQcY5BT7kWWTQhGjDNKBkqzVbGNHn9X.%2FYPWdP%2FkOH%2Fj4DXHLEIQaW6tN8%2FlpXFpQA4K2lY'
          }
        });
        
        const historyData = await historyResponse.json();
        const latestFile = historyData.uploads[0];
        
        if (latestFile && latestFile.id === fileId) {
          results[fileType] = {
            success: true,
            fileId: fileId,
            rawLinesCount: latestFile.rawLinesCount,
            processingNotes: latestFile.processingNotes,
            hasRawData: latestFile.rawLinesCount > 0
          };
          
          console.log(`   📊 Raw lines count: ${latestFile.rawLinesCount || 0}`);
          console.log(`   📝 Processing notes: ${latestFile.processingNotes || 'None'}`);
          console.log(`   ✅ Has raw data: ${latestFile.rawLinesCount > 0 ? 'YES' : 'NO'}`);
        } else {
          results[fileType] = { success: false, error: 'Could not find uploaded file in history' };
          console.log('   ❌ Could not find uploaded file in history');
        }
      } else {
        results[fileType] = { success: false, error: uploadResult.error || 'Upload failed' };
        console.log(`   ❌ Upload failed: ${uploadResult.error || 'Unknown error'}`);
      }
      
      // Clean up test file
      if (fs.existsSync(fileData.filename)) {
        fs.unlinkSync(fileData.filename);
      }
      
    } catch (error) {
      results[fileType] = { success: false, error: error.message };
      console.log(`   ❌ Test failed: ${error.message}`);
      
      // Clean up test file on error
      if (fs.existsSync(fileData.filename)) {
        fs.unlinkSync(fileData.filename);
      }
    }
  }

  // Summary
  console.log('\n📊 SUMMARY:');
  const successfulTypes = Object.keys(results).filter(type => results[type].success && results[type].hasRawData);
  const failedTypes = Object.keys(results).filter(type => !results[type].success || !results[type].hasRawData);
  
  if (successfulTypes.length === Object.keys(testFiles).length) {
    console.log('   ✅ SUCCESS: All file types now have raw data processing!');
    successfulTypes.forEach(type => {
      console.log(`   ✅ ${type.toUpperCase()}: ${results[type].rawLinesCount} lines, "${results[type].processingNotes}"`);
    });
  } else {
    console.log(`   ❌ PARTIAL SUCCESS: ${successfulTypes.length}/${Object.keys(testFiles).length} file types have raw data`);
    successfulTypes.forEach(type => {
      console.log(`   ✅ ${type.toUpperCase()}: ${results[type].rawLinesCount} lines`);
    });
    failedTypes.forEach(type => {
      console.log(`   ❌ ${type.toUpperCase()}: ${results[type].error || 'No raw data'}`);
    });
  }
}

testRawDataProcessingAllFileTypes().catch(console.error);