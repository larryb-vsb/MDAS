// Test merchant detail field extraction
import { ReplitStorageService } from './server/replit-storage-service.ts';
import { extractMerchantData } from './server/merchant-detail-field-mapping.js';

const fileKey = 'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO';

async function testFieldExtraction() {
  try {
    console.log('Fetching file content...');
    const fileContent = await ReplitStorageService.getFileContent(fileKey);
    
    console.log('Parsing merchant detail records...');
    const lines = fileContent.split('\n').filter(line => line.trim());
    const dataRecords = lines.filter(line => line.startsWith('6759'));
    
    console.log(`Found ${dataRecords.length} merchant records\n`);
    
    // Test first 3 records
    console.log('=== TESTING FIRST 3 MERCHANT RECORDS ===\n');
    
    for (let i = 0; i < Math.min(3, dataRecords.length); i++) {
      const line = dataRecords[i];
      const fields = line.split('\t');
      
      console.log(`\n--- Record ${i + 1} ---`);
      console.log(`Total fields: ${fields.length}`);
      console.log(`\nKey field values:`);
      console.log(`  Field[0] (Bank Number): "${fields[0]}"`);
      console.log(`  Field[1] (Group): "${fields[1]}"`);
      console.log(`  Field[2] (Association/ID): "${fields[2]}"`);
      console.log(`  Field[3] (Account/Client MID): "${fields[3]}"`);
      console.log(`  Field[7] (MCC): "${fields[7]}"`);
      console.log(`  Field[8] (DBA Name): "${fields[8]}"`);
      console.log(`  Field[9] (City): "${fields[9]}"`);
      console.log(`  Field[10] (State): "${fields[10]}"`);
      console.log(`  Field[11] (Zip): "${fields[11]}"`);
      console.log(`  Field[12] (Phone): "${fields[12]}"`);
      
      // Extract using new mapping
      const merchantData = extractMerchantData(fields);
      
      console.log(`\nExtracted merchant data:`);
      console.log(`  ID: ${merchantData.id}`);
      console.log(`  Name: ${merchantData.name}`);
      console.log(`  Merchant Type: ${merchantData.merchantType}`);
      console.log(`  Bank (agentBankNumber): ${merchantData.agentBankNumber}`);
      console.log(`  Client MID: ${merchantData.clientMid}`);
      console.log(`  MCC: ${merchantData.mcc}`);
      console.log(`  DBA Name: ${merchantData.dbaName}`);
      console.log(`  City: ${merchantData.city}`);
      console.log(`  State: ${merchantData.state}`);
      console.log(`  Zip Code: ${merchantData.zipCode}`);
      console.log(`  Phone: ${merchantData.phone}`);
      console.log(`  Email: ${merchantData.email}`);
      console.log(`  Website: ${merchantData.website}`);
      
      // Check metadata fields
      if (merchantData.metadata) {
        console.log(`\nMetadata fields (${Object.keys(merchantData.metadata).length} total):`);
        Object.entries(merchantData.metadata).slice(0, 5).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      }
    }
    
    // Verify bank number
    const firstRecord = dataRecords[0].split('\t');
    const extractedData = extractMerchantData(firstRecord);
    
    console.log('\n\n=== BANK NUMBER VERIFICATION ===');
    console.log(`Expected bank number: 6759`);
    console.log(`Field[0] value: "${firstRecord[0]}"`);
    console.log(`Extracted agentBankNumber: "${extractedData.agentBankNumber}"`);
    console.log(`Match: ${extractedData.agentBankNumber === '6759' ? '✅ PASS' : '❌ FAIL'}`);
    
  } catch (error) {
    console.error('Error testing field extraction:', error);
    process.exit(1);
  }
}

testFieldExtraction();
