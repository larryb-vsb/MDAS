import fs from 'fs';

async function testRawDataProcessingSimple() {
  console.log('🧪 Testing Raw Data Processing with Simple API Calls...\n');

  // Test data for each file type
  const testData = {
    merchant: 'Merchant ID,Name,Status\n123456,Test Merchant,Active\n789012,Another Test,Inactive',
    transaction: 'Transaction ID,Amount,Date,Merchant ID\nTXN001,100.50,2024-01-01,123456\nTXN002,250.00,2024-01-02,789012',
    terminal: 'Terminal ID,Merchant ID,Location\nT001,123456,Store 1\nT002,789012,Store 2'
  };

  const results = {};

  for (const [fileType, content] of Object.entries(testData)) {
    console.log(`\n📁 Testing ${fileType.toUpperCase()} file...`);
    
    try {
      // Write test file
      const filename = `test-${fileType}.csv`;
      fs.writeFileSync(filename, content);
      
      // Upload via curl
      const curlCommand = `curl -X POST "http://localhost:5000/api/uploads" \\
        -H "Cookie: connect.sid=s%3A_JQcY5BT7kWWTQhGjDNKBkqzVbGNHn9X.%2FYPWdP%2FkOH%2Fj4DXHLEIQaW6tN8%2FlpXFpQA4K2lY" \\
        -F "files=@${filename}" \\
        -F "type=${fileType}"`;
      
      console.log(`   🔄 Uploading ${fileType} file...`);
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(curlCommand);
      
      if (stderr) {
        console.log(`   ⚠️  stderr: ${stderr}`);
      }
      
      const uploadResult = JSON.parse(stdout);
      
      if (uploadResult.success) {
        const fileId = uploadResult.uploads[0].fileId;
        console.log(`   ✅ Upload successful: ${fileId}`);
        
        // Check if raw data was processed by checking upload history
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for processing
        
        const historyCommand = `curl -H "Cookie: connect.sid=s%3A_JQcY5BT7kWWTQhGjDNKBkqzVbGNHn9X.%2FYPWdP%2FkOH%2Fj4DXHLEIQaW6tN8%2FlpXFpQA4K2lY" "http://localhost:5000/api/uploads/history?limit=5"`;
        
        const { stdout: historyStdout } = await execAsync(historyCommand);
        const historyData = JSON.parse(historyStdout);
        
        const uploadedFile = historyData.uploads.find(file => file.id === fileId);
        
        if (uploadedFile) {
          results[fileType] = {
            success: true,
            fileId: fileId,
            rawLinesCount: uploadedFile.rawLinesCount,
            processingNotes: uploadedFile.processingNotes,
            hasRawData: uploadedFile.rawLinesCount > 0
          };
          
          console.log(`   📊 Raw lines count: ${uploadedFile.rawLinesCount || 0}`);
          console.log(`   📝 Processing notes: ${uploadedFile.processingNotes || 'None'}`);
          console.log(`   ✅ Has raw data: ${uploadedFile.rawLinesCount > 0 ? 'YES' : 'NO'}`);
        } else {
          results[fileType] = { success: false, error: 'Could not find uploaded file in history' };
          console.log('   ❌ Could not find uploaded file in history');
        }
      } else {
        results[fileType] = { success: false, error: uploadResult.error || 'Upload failed' };
        console.log(`   ❌ Upload failed: ${uploadResult.error || 'Unknown error'}`);
      }
      
      // Clean up
      if (fs.existsSync(filename)) {
        fs.unlinkSync(filename);
      }
      
    } catch (error) {
      results[fileType] = { success: false, error: error.message };
      console.log(`   ❌ Test failed: ${error.message}`);
    }
  }

  // Summary
  console.log('\n📊 SUMMARY:');
  const successfulTypes = Object.keys(results).filter(type => results[type].success && results[type].hasRawData);
  const failedTypes = Object.keys(results).filter(type => !results[type].success || !results[type].hasRawData);
  
  if (successfulTypes.length === Object.keys(testData).length) {
    console.log('   ✅ SUCCESS: All file types now have raw data processing!');
    successfulTypes.forEach(type => {
      console.log(`   ✅ ${type.toUpperCase()}: ${results[type].rawLinesCount} lines, "${results[type].processingNotes}"`);
    });
  } else {
    console.log(`   ⚠️  PARTIAL SUCCESS: ${successfulTypes.length}/${Object.keys(testData).length} file types have raw data`);
    successfulTypes.forEach(type => {
      console.log(`   ✅ ${type.toUpperCase()}: ${results[type].rawLinesCount} lines`);
    });
    failedTypes.forEach(type => {
      console.log(`   ❌ ${type.toUpperCase()}: ${results[type].error || 'No raw data'}`);
    });
  }

  // Also check TDDF files to make sure they still work
  console.log('\n🔍 Checking existing TDDF files...');
  try {
    const checkCommand = `curl -H "Cookie: connect.sid=s%3A_JQcY5BT7kWWTQhGjDNKBkqzVbGNHn9X.%2FYPWdP%2FkOH%2Fj4DXHLEIQaW6tN8%2FlpXFpQA4K2lY" "http://localhost:5000/api/uploads/history?fileType=tddf&limit=5"`;
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(checkCommand);
    const tddfData = JSON.parse(stdout);
    
    const tddfFilesWithRawData = tddfData.uploads.filter(file => file.rawLinesCount > 0);
    
    console.log(`   📊 TDDF files checked: ${tddfData.uploads.length} total, ${tddfFilesWithRawData.length} have raw data`);
    
    if (tddfFilesWithRawData.length > 0) {
      console.log(`   ✅ TDDF raw data example: ${tddfFilesWithRawData[0].rawLinesCount} lines, "${tddfFilesWithRawData[0].processingNotes}"`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check TDDF files: ${error.message}`);
  }
}

testRawDataProcessingSimple().catch(console.error);