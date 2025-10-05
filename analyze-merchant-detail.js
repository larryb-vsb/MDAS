// Analyze merchant detail file structure
import { ReplitStorageService } from './server/replit-storage-service.js';

const fileKey = 'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO';

async function analyzeMerchantDetailFile() {
  try {
    console.log('Fetching file content...');
    const content = await ReplitStorageService.getFileContent(fileKey);
    
    const lines = content.split('\n').filter(line => line.trim());
    console.log(`Total lines: ${lines.length}`);
    
    // Show first 5 lines
    console.log('\n=== First 5 lines ===');
    lines.slice(0, 5).forEach((line, idx) => {
      const fields = line.split('\t');
      console.log(`\nLine ${idx + 1} (${fields.length} fields):`);
      console.log(`Record type: ${fields[0]}`);
      if (fields.length > 1) {
        console.log(`Field 2: ${fields[1]}`);
        console.log(`Field 3: ${fields[2]}`);
      }
    });
    
    // Show HEADER record
    const headerLine = lines.find(line => line.startsWith('HEADER'));
    if (headerLine) {
      const headerFields = headerLine.split('\t');
      console.log('\n=== HEADER Record ===');
      console.log(`Total fields: ${headerFields.length}`);
      console.log(`First 10 fields: ${headerFields.slice(0, 10).join(' | ')}`);
    }
    
    // Show first DATA record
    const dataLine = lines.find(line => line.startsWith('DATA'));
    if (dataLine) {
      const dataFields = dataLine.split('\t');
      console.log('\n=== First DATA Record ===');
      console.log(`Total fields: ${dataFields.length}`);
      console.log(`First 20 fields:`);
      dataFields.slice(0, 20).forEach((field, idx) => {
        console.log(`  [${idx}]: ${field}`);
      });
    }
    
    // Show TRAILER record
    const trailerLine = lines.find(line => line.startsWith('TRAILER'));
    if (trailerLine) {
      const trailerFields = trailerLine.split('\t');
      console.log('\n=== TRAILER Record ===');
      console.log(`Total fields: ${trailerFields.length}`);
      console.log(`Fields: ${trailerFields.join(' | ')}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeMerchantDetailFile();
