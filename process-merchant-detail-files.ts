import { storage } from './server/storage';
import { Client } from '@replit/object-storage';

const client = new Client();

async function processFile(fileId: string, storagePath: string) {
  console.log(`\n======== Processing ${fileId} ========`);
  console.log(`Storage path: ${storagePath}`);
  
  try {
    // Get file content from Replit Object Storage
    const downloadResult = await client.downloadAsBytes(storagePath);
    if (!downloadResult.ok) {
      throw new Error(`Failed to download file from ${storagePath}: ${downloadResult.error}`);
    }
    
    // Convert the value to Buffer
    let fileContent: Buffer;
    if (Buffer.isBuffer(downloadResult.value)) {
      fileContent = downloadResult.value;
    } else if (downloadResult.value instanceof Uint8Array) {
      fileContent = Buffer.from(downloadResult.value);
    } else if (typeof downloadResult.value === 'string') {
      fileContent = Buffer.from(downloadResult.value, 'utf-8');
    } else {
      fileContent = Buffer.from(JSON.stringify(downloadResult.value));
    }
    
    // Convert to base64
    const base64Content = fileContent.toString('base64');
    console.log(`File size: ${fileContent.length} bytes`);
    
    // Process using the merchant detail parser
    console.log('Calling processMerchantDetailFileFromContent...');
    const result = await storage.processMerchantDetailFileFromContent(base64Content);
    
    console.log('\n✅ Processing complete:');
    console.log(`   Rows processed: ${result.rowsProcessed}`);
    console.log(`   Merchants updated: ${result.merchantsUpdated}`);
    console.log(`   Errors: ${result.errors}`);
    
    return result;
  } catch (error) {
    console.error(`❌ Error processing ${fileId}:`, error);
    throw error;
  }
}

async function main() {
  const files = [
    {
      id: 'uploader_1759701574536_gyf30c82y',
      storagePath: 'dev-uploader/2025-10-05/uploader_1759701574536_gyf30c82y/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO'
    },
    {
      id: 'uploader_1759696290972_v52jphrnw',
      storagePath: 'dev-uploader/2025-10-05/uploader_1759696290972_v52jphrnw/VERMNTSB.6759_DACQ_MER_DTL_10012025_011606.TSYSO'
    }
  ];
  
  console.log('Starting merchant detail file processing...\n');
  
  for (const file of files) {
    await processFile(file.id, file.storagePath);
  }
  
  console.log('\n======== All files processed ========\n');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
