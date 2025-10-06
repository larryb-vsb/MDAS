import { pool } from './server/db';
import { getTableName } from './server/table-config';
import { ReplitStorageService } from './server/replit-storage-service';

async function parseAndImportFile(storagePath: string) {
  console.log(`\n========================================`);
  console.log(`Processing: ${storagePath}`);
  console.log(`========================================\n`);
  
  const fileContent = await ReplitStorageService.getFileContent(storagePath);
  console.log(`File size: ${fileContent.length} bytes`);
  
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  console.log(`Total lines: ${lines.length}\n`);
  
  // Detect format by checking first line
  if (lines.length > 0) {
    const firstLine = lines[0];
    const tabCount = (firstLine.match(/\t/g) || []).length;
    console.log(`Format detection: ${tabCount} tabs found`);
    console.log(`First 3 sample lines:`);
    lines.slice(0, 3).forEach((line, idx) => {
      const fields = line.split('\t');
      console.log(`  [${idx+1}] ${fields.length} fields: ${fields.slice(0, 15).map((f, i) => `[${i}]${f.substring(0, 20)}`).join(' | ')}`);
    });
    console.log('');
  }
  
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  let vsbMerchants = 0;
  
  const merchantsTable = getTableName('merchants');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      const fields = line.split('\t');
      
      // Skip header or malformed lines
      if (fields.length < 10 || fields[0].includes('HEADER')) {
        console.log(`[${i+1}] Skipping: ${fields[0].substring(0, 50)}`);
        continue;
      }
      
      // Parse fields based on actual structure
      // From the file: Bank, MerchantNum, ClientMID, Name, Group, City, State, Zip...
      const bankNum = fields[0]?.trim();
      const merchantNum = fields[2]?.trim();
      const clientMID = fields[3]?.trim();
      const name = fields[4]?.trim();
      const groupDesc = fields[6]?.trim();
      
      // City/State/Zip might be in different positions, let me try different combinations
      let city = '';
      let state = '';
      let zip = '';
      
      // Try to find city, state, zip in the remaining fields
      for (let j = 7; j < Math.min(fields.length, 20); j++) {
        const field = fields[j]?.trim();
        if (!field) continue;
        
        // State codes are 2 characters
        if (field.length === 2 && /^[A-Z]{2}$/.test(field) && !state) {
          state = field;
          // City might be before state
          if (j > 0 && fields[j-1] && fields[j-1].trim().length > 2) {
            city = fields[j-1].trim();
          }
          // Zip might be after state  
          if (j < fields.length - 1 && fields[j+1]) {
            const nextField = fields[j+1].trim();
            if (/^\d{5}(-\d{4})?$/.test(nextField) || /^\d{5,9}$/.test(nextField)) {
              zip = nextField;
            }
          }
          break;
        }
      }
      
      console.log(`[${i+1}] Bank: ${bankNum}, MerchantNum: ${merchantNum}, ClientMID: ${clientMID}`);
      console.log(`       Name: ${name}, Group: ${groupDesc}`);
      console.log(`       City: ${city}, State: ${state}, Zip: ${zip}`);
      
      // Track Vermont State Bank merchants
      if (groupDesc && (groupDesc.includes('VERMONT STATE BANK') || groupDesc.includes('VSB-BANK'))) {
        vsbMerchants++;
        console.log(`  🏦 Vermont State Bank merchant #${vsbMerchants}`);
      }
      
      // Find merchant by client_mid
      const findResult = await pool.query(`
        SELECT id, name, city, state, zip_code, client_mid
        FROM ${merchantsTable} 
        WHERE client_mid = $1
        LIMIT 1
      `, [clientMID]);
      
      if (findResult.rows.length === 0) {
        console.log(`  ❌ No merchant found for ClientMID ${clientMID}\n`);
        notFound++;
        continue;
      }
      
      const merchant = findResult.rows[0];
      console.log(`  ✅ Found merchant: ${merchant.name} (ID: ${merchant.id})`);
      console.log(`     Current values: City="${merchant.city||''}", State="${merchant.state||''}", Zip="${merchant.zip_code||''}"`);
      
      // Only update if we have new values
      if (!city && !state && !zip) {
        console.log(`  ⚠️  No geographic data to update\n`);
        continue;
      }
      
      // Update with TSYS data (only update if new value is not empty)
      const updateResult = await pool.query(`
        UPDATE ${merchantsTable}
        SET 
          city = CASE WHEN $1 != '' THEN $1 ELSE city END,
          state = CASE WHEN $2 != '' THEN $2 ELSE state END,
          zip_code = CASE WHEN $3 != '' THEN $3 ELSE zip_code END,
          created_at = created_at,
          updated_by = 'tsys_merchant_detail_import'
        WHERE id = $4
        RETURNING city, state, zip_code
      `, [city, state, zip, merchant.id]);
      
      const updatedMerchant = updateResult.rows[0];
      console.log(`  📝 UPDATED TO: City="${updatedMerchant.city}", State="${updatedMerchant.state}", Zip="${updatedMerchant.zip_code}"\n`);
      updated++;
      
    } catch (error: any) {
      console.error(`  ❌ Error on line ${i+1}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n========================================`);
  console.log(`SUMMARY`);
  console.log(`========================================`);
  console.log(`Total lines processed: ${lines.length}`);
  console.log(`✅ Successfully updated: ${updated}`);
  console.log(`❌ Not found in database: ${notFound}`);
  console.log(`⚠️  Errors: ${errors}`);
  console.log(`🏦 Vermont State Bank merchants: ${vsbMerchants}`);
  console.log(`========================================\n`);
  
  return { updated, notFound, errors, vsbMerchants };
}

async function main() {
  const files = [
    'dev-uploader/2025-10-05/uploader_1759701574536_gyf30c82y/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO',
    'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO'
  ];
  
  console.log('🚀 TSYS Merchant Detail Import - VERBOSE LOGGING ENABLED');
  console.log('📋 State and Zip Code fields WILL BE UPDATED during import\n');
  console.log('ℹ️  Matching merchants by ClientMID from import file\n');
  
  let totalUpdated = 0;
  let totalVSB = 0;
  
  for (const file of files) {
    try {
      const result = await parseAndImportFile(file);
      totalUpdated += result.updated;
      totalVSB += result.vsbMerchants;
    } catch (error: any) {
      console.error(`❌ Failed to process ${file}:`, error.message);
    }
  }
  
  console.log('\n\n╔════════════════════════════════════════╗');
  console.log('║     IMPORT COMPLETE - FINAL TOTALS     ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`Total merchants updated: ${totalUpdated}`);
  console.log(`Vermont State Bank merchants found: ${totalVSB}`);
  console.log('');
  
  process.exit(0);
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
