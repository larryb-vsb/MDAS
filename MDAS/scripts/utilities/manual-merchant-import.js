// Manual merchant detail import script
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import { ReplitStorageService } from './server/replit-storage-service.js';

const fileKey = 'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO';

// Helper to parse dates
function parseDate(dateString) {
  if (!dateString || dateString.trim() === '' || dateString === '99/99/9999' || dateString === '00/00/0000') {
    return null;
  }
  
  try {
    if (dateString.includes('/')) {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }
    
    if (dateString.includes('-')) {
      return new Date(dateString);
    }
    
    return null;
  } catch (error) {
    console.error(`Error parsing date: ${dateString}`, error);
    return null;
  }
}

async function importMerchantDetail() {
  try {
    console.log('Fetching file content...');
    const fileContent = await ReplitStorageService.getFileContent(fileKey);
    
    console.log('Parsing merchant detail records...');
    const lines = fileContent.split('\n').filter(line => line.trim());
    const dataRecords = lines.filter(line => line.startsWith('6759'));
    
    console.log(`Found ${dataRecords.length} merchant records to process`);
    
    let merchantsCreated = 0;
    let merchantsUpdated = 0;
    const errors = [];
    
    for (const line of dataRecords) {
      try {
        const fields = line.split('\t');
        
        const merchantData = {
          id: fields[2]?.trim() || null,
          name: fields[4]?.trim() || 'Unknown Merchant',
          merchant_type: '0',  // Set to 0 for DACQ_MER_DTL files
          city: fields[9]?.trim() || null,
          state: fields[10]?.trim() || null,
          zip: fields[11]?.trim() || null,
          client_mid: fields[3]?.trim() || null,
          bank: fields[1]?.trim() || null,
          status: 'Active'
        };
        
        if (!merchantData.id) {
          errors.push(`Missing merchant ID for record: ${fields.slice(0, 5).join(' | ')}`);
          continue;
        }
        
        // Check if merchant exists
        const existingMerchant = await db.execute(sql`
          SELECT id FROM dev_merchants WHERE id = ${merchantData.id}
        `);
        
        if (existingMerchant.rows.length > 0) {
          // Update existing merchant
          await db.execute(sql`
            UPDATE dev_merchants 
            SET name = ${merchantData.name},
                merchant_type = ${merchantData.merchant_type},
                city = ${merchantData.city},
                state = ${merchantData.state},
                zip = ${merchantData.zip},
                client_mid = ${merchantData.client_mid},
                bank = ${merchantData.bank},
                status = ${merchantData.status},
                updated_at = NOW()
            WHERE id = ${merchantData.id}
          `);
          merchantsUpdated++;
        } else {
          // Create new merchant
          await db.execute(sql`
            INSERT INTO dev_merchants (
              id, name, merchant_type, city, state, zip, client_mid, bank, status, created_at
            ) VALUES (
              ${merchantData.id}, ${merchantData.name}, ${merchantData.merchant_type},
              ${merchantData.city}, ${merchantData.state}, ${merchantData.zip},
              ${merchantData.client_mid}, ${merchantData.bank}, ${merchantData.status}, NOW()
            )
          `);
          merchantsCreated++;
        }
        
        if ((merchantsCreated + merchantsUpdated) % 50 === 0) {
          console.log(`Progress: ${merchantsCreated} created, ${merchantsUpdated} updated`);
        }
        
      } catch (recordError) {
        errors.push(`Error processing merchant record: ${recordError.message}`);
        console.error(`Record error:`, recordError);
      }
    }
    
    console.log(`\n=== IMPORT COMPLETE ===`);
    console.log(`Merchants created: ${merchantsCreated}`);
    console.log(`Merchants updated: ${merchantsUpdated}`);
    console.log(`Total records processed: ${dataRecords.length}`);
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log(`\nFirst 10 errors:`);
      errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
    }
    
    // Update file status
    await db.execute(sql`
      UPDATE dev_uploader_uploads 
      SET current_phase = 'encoded',
          encoding_status = 'completed',
          encoding_notes = ${`Successfully processed merchant detail file: ${merchantsCreated} created, ${merchantsUpdated} updated`},
          processing_notes = ${`Manual import completed: ${dataRecords.length} merchant records processed`}
      WHERE id = 'uploader_1759696290972_v52jphrnw'
    `);
    
    console.log(`\n✅ File status updated to 'encoded'`);
    
  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    process.exit(0);
  }
}

importMerchantDetail();
