// Analyze merchant detail fields in detail
import { ReplitStorageService } from './server/replit-storage-service.js';

const fileKey = 'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO';

async function analyzeMerchantFields() {
  try {
    const content = await ReplitStorageService.getFileContent(fileKey);
    const lines = content.split('\n').filter(line => line.trim());
    
    // Get first data record (skip HEADER)
    const dataLine = lines.find(line => line.startsWith('6759'));
    if (!dataLine) {
      console.log('No DATA record found');
      return;
    }
    
    const fields = dataLine.split('\t');
    console.log(`Total fields in DATA record: ${fields.length}\n`);
    
    // Show all fields with their values
    console.log('=== ALL FIELDS ===');
    fields.forEach((field, idx) => {
      if (field.trim()) { // Only show non-empty fields
        console.log(`[${idx}]: ${field}`);
      }
    });
    
    // Show a few more data records to identify patterns
    console.log('\n=== Sample of 3 DATA Records ===');
    const dataRecords = lines.filter(line => line.startsWith('6759')).slice(0, 3);
    dataRecords.forEach((record, idx) => {
      const f = record.split('\t');
      console.log(`\nRecord ${idx + 1}:`);
      console.log(`  [0] Record Type: ${f[0]}`);
      console.log(`  [1] Field 1: ${f[1]}`);
      console.log(`  [2] Field 2: ${f[2]}`);
      console.log(`  [3] Field 3: ${f[3]}`);
      console.log(`  [4] Field 4: ${f[4]}`);
      console.log(`  [5] Field 5: ${f[5]}`);
      console.log(`  [6] Field 6: ${f[6]}`);
      console.log(`  [7] Field 7: ${f[7]}`);
      console.log(`  [8] Field 8: ${f[8]}`);
      console.log(`  [9] Field 9: ${f[9]}`);
      console.log(`  [10] Field 10: ${f[10]}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeMerchantFields();
