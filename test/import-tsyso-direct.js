// test/import-tsyso-direct.js
// Direct import of local TSYSO file to merchant database

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { processMerchantDetailFile } from '../server/merchant-detail-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local file in test directory
const LOCAL_FILE = 'test-VERMNTSB.6759_DACQ_MER_DTL_10072025_002410.TSYSO';
const FILE_PATH = join(__dirname, LOCAL_FILE);

async function importTSYSOFile() {
  console.log('========================================');
  console.log('TSYSO Direct Import to Merchant Database');
  console.log('========================================');
  console.log(`File: ${LOCAL_FILE}`);
  console.log(`Path: ${FILE_PATH}`);
  console.log('');
  
  try {
    // Read local file
    console.log('📂 Reading local file...');
    const fileContent = readFileSync(FILE_PATH, 'utf-8');
    console.log(`✅ File loaded: ${fileContent.length} bytes`);
    console.log('');
    
    // Process and import to merchant database
    console.log('🔄 Processing merchant detail file...');
    const result = await processMerchantDetailFile(
      fileContent, 
      'test-import-local',
      'tab_delimited'
    );
    
    console.log('');
    console.log('========================================');
    console.log('Import Results:');
    console.log('========================================');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📊 Total Records: ${result.totalRecords}`);
    console.log(`✅ Total Imported: ${result.imported}`);
    console.log(`  ➕ Inserted (new): ${result.inserted || 0}`);
    console.log(`  🔄 Updated (existing): ${result.updated || 0}`);
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
