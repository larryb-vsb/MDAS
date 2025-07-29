// Direct encoding test through server internal functions
const fs = require('fs');
const path = require('path');

// Create a simple Express request to test the encoding endpoint
const express = require('express');
const app = express();

console.log('=== DIRECT ENCODING TEST FOR 29-LINE FILE ===');

// Create a test server that can authenticate and call the encoding endpoint
const testServer = async () => {
  try {
    // Import the server modules directly
    const { default: serverApp } = await import('./server/index.js');
    
    console.log('Server modules loaded successfully');
    
    // Test the encoding endpoint directly by simulating a request
    const uploadId = 'uploader_1753770043406_rxjr75vpv';
    
    // Create a mock request object
    const mockReq = {
      params: { id: uploadId },
      user: { id: 1, username: 'admin' }, // Simulate authenticated user
      method: 'POST',
      url: `/api/uploader/${uploadId}/encode`
    };
    
    const mockRes = {
      status: function(code) { 
        this.statusCode = code; 
        return this; 
      },
      json: function(data) { 
        console.log('Encoding Response:', JSON.stringify(data, null, 2));
        this.data = data;
        return this;
      },
      statusCode: 200,
      data: null
    };
    
    console.log(`Attempting to encode upload: ${uploadId}`);
    
    // This would need to be adapted based on the actual server structure
    console.log('Mock request created, testing encoding...');
    
    return { success: true, message: 'Test setup complete' };
    
  } catch (error) {
    console.error('Error in test server:', error.message);
    return { success: false, error: error.message };
  }
};

// Alternative: Direct database approach
const directDatabaseTest = () => {
  const { execSync } = require('child_process');
  
  try {
    console.log('\n=== ALTERNATIVE: DATABASE-DRIVEN TEST ===');
    
    // Get the file content directly from storage
    console.log('1. Getting file content...');
    const fileContent = execSync(`node -e "
      const { ReplitStorageService } = require('./server/replit-storage-service.ts');
      const service = new ReplitStorageService();
      service.getFileContent('dev-uploader/uploader_1753770043406_rxjr75vpv/VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO')
        .then(content => {
          if (content) {
            const lines = content.trim().split('\\n');
            console.log(\`Found \${lines.length} lines in file\`);
            console.log(\`First line: \${lines[0].substring(0, 50)}...\`);
          } else {
            console.log('File content not found');
          }
        })
        .catch(err => console.error('Error:', err.message));
    "`, { encoding: 'utf8', cwd: '/home/runner/workspace' });
    
    console.log(fileContent);
    
    console.log('\n2. Testing encoding function...');
    const encodingResult = execSync(`node -e "
      const { encodeTddfToJsonbDirect } = require('./server/tddf-json-encoder.ts');
      const { ReplitStorageService } = require('./server/replit-storage-service.ts');
      
      (async () => {
        try {
          const uploadId = 'uploader_1753770043406_rxjr75vpv';
          const service = new ReplitStorageService();
          const content = await service.getFileContent('dev-uploader/uploader_1753770043406_rxjr75vpv/VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO');
          
          if (!content) {
            throw new Error('File content not available');
          }
          
          const result = await encodeTddfToJsonbDirect(uploadId, content);
          console.log(\`Encoding completed: \${result.totalRecords} records\`);
          console.log(\`Processing time: \${result.processingTime}ms\`);
          console.log(\`Record breakdown: \${JSON.stringify(result.recordTypeBreakdown)}\`);
        } catch (error) {
          console.error('Encoding error:', error.message);
        }
      })();
    "`, { encoding: 'utf8', cwd: '/home/runner/workspace' });
    
    console.log(encodingResult);
    
    console.log('\n3. Checking JSONB table...');
    const jsonbCount = execSync(`psql "${process.env.DATABASE_URL}" -t -c "SELECT COUNT(*) FROM dev_tddf_jsonb WHERE upload_id = 'uploader_1753770043406_rxjr75vpv';"`, { encoding: 'utf8' }).trim();
    console.log(`JSONB records found: ${jsonbCount}`);
    
    if (parseInt(jsonbCount) === 29) {
      console.log('\n🎉 SUCCESS: All 29 lines encoded to JSON!');
      return { success: true, recordCount: 29 };
    } else {
      console.log(`\n❌ MISMATCH: Expected 29, got ${jsonbCount}`);
      return { success: false, recordCount: parseInt(jsonbCount) };
    }
    
  } catch (error) {
    console.error('\nDatabase test failed:', error.message);
    return { success: false, error: error.message };
  }
};

// Run the tests
testServer()
  .then(result => {
    console.log('Server test result:', result);
    
    // Run the database test
    const dbResult = directDatabaseTest();
    console.log('\nFinal result:', dbResult);
  })
  .catch(error => {
    console.error('Test failed:', error.message);
    
    // Still try the database test
    const dbResult = directDatabaseTest();
    console.log('\nFallback result:', dbResult);
  });