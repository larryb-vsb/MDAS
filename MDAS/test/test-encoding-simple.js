const { spawn } = require('child_process');

console.log('=== TESTING ENCODING WORKFLOW ===');
console.log('Upload ID: uploader_1753770043406_rxjr75vpv');
console.log('File: VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO\n');

// Test the encoding by calling the server endpoint directly
const testEncoding = () => {
  return new Promise((resolve, reject) => {
    const child = spawn('tsx', ['-e', `
      import { encodeTddfToJsonbDirect } from './server/tddf-json-encoder.ts';
      import { ReplitStorageService } from './server/replit-storage-service.ts';
      
      (async () => {
        try {
          const uploadId = 'uploader_1753770043406_rxjr75vpv';
          const filename = 'VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO';
          const storageKey = \`dev-uploader/\${uploadId}/\${filename}\`;
          
          console.log('Getting file content from:', storageKey);
          const storageService = new ReplitStorageService();
          const fileContent = await storageService.getFileContent(storageKey);
          
          if (!fileContent) {
            throw new Error('File content not found');
          }
          
          const lines = fileContent.trim().split('\\n');
          console.log(\`✓ File content retrieved: \${lines.length} lines\`);
          
          console.log('Starting encoding process...');
          const result = await encodeTddfToJsonbDirect(uploadId, fileContent);
          
          console.log('✓ ENCODING COMPLETED!');
          console.log('Total Records:', result.totalRecords);
          console.log('Processing Time:', result.processingTime + 'ms');
          console.log('Record Breakdown:', JSON.stringify(result.recordTypeBreakdown, null, 2));
          
        } catch (error) {
          console.error('❌ ENCODING FAILED:', error.message);
          process.exit(1);
        }
      })();
    `], { cwd: '/home/runner/workspace' });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${code}: ${errorOutput}`));
      }
    });
  });
};

testEncoding()
  .then(() => {
    console.log('\n=== VERIFYING JSONB RECORDS ===');
    
    // Now check the database
    const dbCheck = spawn('psql', [process.env.DATABASE_URL, '-c', 
      "SELECT COUNT(*) as record_count FROM dev_tddf_jsonb WHERE upload_id = 'uploader_1753770043406_rxjr75vpv';"
    ]);
    
    dbCheck.stdout.on('data', (data) => {
      console.log('Database result:', data.toString());
    });
    
    dbCheck.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Test completed successfully!');
      } else {
        console.log('❌ Database check failed');
      }
    });
  })
  .catch(console.error);