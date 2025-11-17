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
  
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  let vsbMerchants = 0;
  let skipped = 0;
  
  const merchantsTable = getTableName('merchants');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      const fields = line.split('\t');
      
      // Skip header or malformed lines
      if (fields.length < 10 || fields[0]?.includes('HEADER')) {
        console.log(`[${i+1}] Skipping header/short line\n`);
        skipped++;
        continue;
      }
      
      // Parse fields based on actual file structure from screenshot
      const bankNum = fields[0]?.trim();
      const dbaName = fields[4]?.trim();  // DBA Name as merchant name
      const groupDesc = fields[5]?.trim();
      
      // City/State/Zip are in later fields - let me find them
      let city = '';
      let state = '';
      let zip = '';
      
      // Look for state (2-letter code) in fields 7-15
      for (let j = 7; j < Math.min(fields.length, 20); j++) {
        const field = fields[j]?.trim();
        if (!field) continue;
        
        // State codes are 2 uppercase letters
        if (field.length === 2 && /^[A-Z]{2}$/.test(field) && !state) {
          state = field;
          // City might be 1-2 fields before state
          if (j > 0 && fields[j-1]?.trim()) {
            city = fields[j-1].trim();
          }
          // Zip might be 1-2 fields after state
          if (j < fields.length - 1) {
            const nextField = fields[j+1]?.trim();
            // Zip can be 5-9 digits
            if (nextField && /^\d{5,9}$/.test(nextField)) {
              // Remove leading zeros for proper zip format
              zip = nextField.replace(/^0+/, '');
              if (zip.length === 4) zip = '0' + zip; // Keep at least 5 digits
            }
          }
          break;
        }
      }
      
      console.log(`[${i+1}] Bank: ${bankNum}`);
      console.log(`       DBA Name: ${dbaName}`);
      console.log(`       Group: ${groupDesc}`);
      console.log(`       City: ${city}, State: ${state}, Zip: ${zip}`);
      
      if (!dbaName) {
        console.log(`  ⚠️  No DBA name, skipping\n`);
        skipped++;
        continue;
      }
      
      // Track Vermont State Bank merchants
      if (groupDesc && groupDesc.includes('VSB-BANK')) {
        vsbMerchants++;
        console.log(`  🏦 Vermont State Bank merchant #${vsbMerchants}`);
      }
      
      // Find merchant by DBA name (exact match, case-insensitive)
      const findResult = await pool.query(`
        SELECT id, name, city, state, zip_code
        FROM ${merchantsTable} 
        WHERE UPPER(name) = UPPER($1)
        LIMIT 1
      `, [dbaName]);
      
      if (findResult.rows.length === 0) {
        console.log(`  ❌ No merchant found for DBA Name: "${dbaName}"\n`);
        notFound++;
        continue;
      }
      
      const merchant = findResult.rows[0];
      console.log(`  ✅ MATCHED merchant in database: "${merchant.name}" (ID: ${merchant.id})`);
      console.log(`     BEFORE: City="${merchant.city||''}", State="${merchant.state||''}", Zip="${merchant.zip_code||''}"`);
      
      // Only update if we have new values
      if (!city && !state && !zip) {
        console.log(`  ⚠️  No geographic data in file to update\n`);
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
      console.log(`  📝 AFTER:  City="${updatedMerchant.city}", State="${updatedMerchant.state}", Zip="${updatedMerchant.zip_code}"`);
      console.log(`  ✅ SUCCESSFULLY UPDATED!\n`);
      updated++;
      
    } catch (error: any) {
      console.error(`  ❌ ERROR on line ${i+1}:`, error.message, '\n');
      errors++;
    }
  }
  
  console.log(`\n========================================`);
  console.log(`            SUMMARY`);
  console.log(`========================================`);
  console.log(`Total lines in file: ${lines.length}`);
  console.log(`✅ Successfully updated: ${updated}`);
  console.log(`❌ Not found in database: ${notFound}`);
  console.log(`⚠️  Errors: ${errors}`);
  console.log(`⏭️  Skipped (headers/invalid): ${skipped}`);
  console.log(`🏦 Vermont State Bank merchants: ${vsbMerchants}`);
  console.log(`========================================\n`);
  
  return { updated, notFound, errors, vsbMerchants };
}

async function main() {
  const files = [
    'dev-uploader/2025-10-05/uploader_1759701574536_gyf30c82y/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO',
    'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO'
  ];
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  TSYS MERCHANT DETAIL IMPORT - VERBOSE LOGGING ENABLED   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('📋 State and Zip Code fields WILL BE UPDATED during import');
  console.log('🔍 Matching merchants by DBA Name from file');
  console.log('');
  
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
  
  console.log('\n\n╔════════════════════════════════════════════════════════╗');
  console.log('║          IMPORT COMPLETE - FINAL TOTALS                ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`Total merchants updated: ${totalUpdated}`);
  console.log(`Vermont State Bank merchants found: ${totalVSB}`);
  console.log('');
  
  if (totalUpdated > 0) {
    console.log('✅ SUCCESS: State and Zip Code data has been imported!');
  } else {
    console.log('⚠️  WARNING: No merchants were updated. Check if DBA names match database.');
  }
  console.log('');
  
  process.exit(0);
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
