// import-tsyso-direct.js
// Direct import of TSYSO file to merchant database

import { ReplitStorageService } from './server/replit-storage-service.js';
import { processMerchantDetailFile } from './server/merchant-detail-parser.js';

const FILE_KEY = 'dev-uploader/uploader_1759894822729_8zse7tds5_test-VERMNTSB.6759_DACQ_MER_DTL_10072025_002410.TSYSO';

async function importTSYSOFile() {
  console.log('========================================');
  console.log('TSYSO Direct Import to Merchant Database');
  console.log('========================================');
  console.log(`File: ${FILE_KEY}`);
  console.log('');
  
  try {
    // Read file from storage
    console.log('📂 Reading file from storage...');
    const fileContent = await ReplitStorageService.getFileContent(FILE_KEY);
    console.log(`✅ File loaded: ${fileContent.length} bytes`);
    console.log('');
    
    // Process and import to merchant database
    console.log('🔄 Processing merchant detail file...');
    const result = await processMerchantDetailFile(
      fileContent, 
      'uploader_1759894822729_8zse7tds5',
      'tab_delimited'
    );
    
    console.log('');
    console.log('========================================');
    console.log('Import Results:');
    console.log('========================================');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📊 Total Records: ${result.totalRecords}`);
    console.log(`✅ Imported: ${result.imported}`);
    console.log(`⏭️  Skipped: ${result.skipped}`);
    console.log(`⏱️  Processing Time: ${result.processingTimeMs}ms`);
    
    if (result.error) {
      console.log(`❌ Error: ${result.error}`);
    }
    
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importTSYSOFile()
  .then(() => {
    console.log('✅ Import completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });