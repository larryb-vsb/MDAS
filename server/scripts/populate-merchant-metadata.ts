/**
 * Migration Script: Populate Merchant Metadata from Historical TDDF Data
 * 
 * This script populates three key merchant fields from historical TDDF records:
 * 1. clientMID - Extracted from merchantAccountNumber in TDDF records
 * 2. lastBatchDate & lastBatchFilename - From most recent BH (Batch Header) record
 * 3. lastTransactionDate & lastTransactionAmount - From most recent DT (Detail Transaction) record
 * 
 * Usage:
 *   npx tsx server/scripts/populate-merchant-metadata.ts
 */

import { batchPool, batchDb } from '../db';
import { sql } from 'drizzle-orm';
import { getTableName } from '@shared/schema';

interface MerchantMetadata {
  merchantId: string;
  clientMID: string | null;
  lastBatchDate: Date | null;
  lastBatchFilename: string | null;
  lastTransactionDate: Date | null;
  lastTransactionAmount: string | null;
}

interface ProgressStats {
  totalMerchants: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
}

async function populateMerchantMetadata() {
  // CRITICAL SAFETY CHECK: Only run in development
  const currentEnv = process.env.NODE_ENV || 'production';
  if (currentEnv !== 'development') {
    throw new Error(`SAFETY ERROR: This migration script can only run in DEVELOPMENT mode. Current environment: ${currentEnv}`);
  }
  
  console.log('\n=== Merchant Metadata Population Script ===\n');
  console.log('This will populate Client MID, Last Batch, and Last Transaction fields');
  console.log('from historical TDDF data in dev_tddf_jsonb table.\n');

  const startTime = Date.now();
  const stats: ProgressStats = {
    totalMerchants: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };

  try {
    // Step 1: Get all merchants
    console.log('📊 Fetching merchant list...');
    const merchantsTableName = getTableName('merchants');
    const merchantsResult = await batchDb.execute(sql`
      SELECT id as merchant_id 
      FROM ${sql.identifier(merchantsTableName)}
      ORDER BY id
    `);

    stats.totalMerchants = merchantsResult.rows.length;
    console.log(`✅ Found ${stats.totalMerchants} merchants to process\n`);

    if (stats.totalMerchants === 0) {
      console.log('⚠️  No merchants found. Exiting.');
      return;
    }

    // Step 2: Process merchants in batches
    const BATCH_SIZE = 100;
    const tddfTableName = getTableName('tddf_jsonb');

    for (let i = 0; i < merchantsResult.rows.length; i += BATCH_SIZE) {
      const batch = merchantsResult.rows.slice(i, i + BATCH_SIZE);
      
      console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stats.totalMerchants / BATCH_SIZE)} (${batch.length} merchants)...`);

      for (const merchant of batch) {
        const merchantId = merchant.merchant_id as string;
        
        try {
          // Query TDDF data for this merchant
          const metadata = await fetchMerchantMetadata(
            merchantId,
            tddfTableName
          );

          if (!metadata.clientMID && !metadata.lastBatchDate && !metadata.lastTransactionDate) {
            stats.skipped++;
            continue;
          }

          // Update merchant record
          await updateMerchantRecord(merchantsTableName, merchantId, metadata);
          stats.updated++;
          stats.processed++;

          // Progress indicator
          if (stats.processed % 10 === 0) {
            process.stdout.write(`  Processed: ${stats.processed}/${stats.totalMerchants} | Updated: ${stats.updated} | Skipped: ${stats.skipped}\r`);
          }

        } catch (error) {
          console.error(`\n❌ Error processing merchant ${merchantId}:`, error);
          stats.errors++;
          stats.processed++;
        }
      }
    }

    // Step 3: Report results
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n\n=== Migration Complete ===');
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Total Merchants: ${stats.totalMerchants}`);
    console.log(`✅ Updated: ${stats.updated}`);
    console.log(`⏭️  Skipped: ${stats.skipped} (no TDDF data found)`);
    console.log(`❌ Errors: ${stats.errors}`);
    console.log(`\n✨ Merchant metadata successfully populated!\n`);

  } catch (error) {
    console.error('\n❌ Fatal error during migration:', error);
    throw error;
  } finally {
    // Close connection pool
    await batchPool.end();
  }
}

async function fetchMerchantMetadata(
  merchantId: string,
  tddfTableName: string
): Promise<MerchantMetadata> {
  const metadata: MerchantMetadata = {
    merchantId,
    clientMID: null,
    lastBatchDate: null,
    lastBatchFilename: null,
    lastTransactionDate: null,
    lastTransactionAmount: null
  };

  // Single optimized query using window functions to get all metadata at once
  // This reduces 3 queries per merchant to 1 query
  const result = await batchDb.execute(sql`
    WITH merchant_data AS (
      SELECT 
        (extracted_fields->>'merchantAccountNumber')::text as merchant_account_number,
        record_type,
        tddf_processing_date,
        filename,
        (extracted_fields->>'transactionDate')::date as transaction_date,
        (extracted_fields->>'transactionAmount')::numeric as transaction_amount,
        ROW_NUMBER() OVER (
          PARTITION BY record_type 
          ORDER BY 
            CASE 
              WHEN record_type = 'BH' THEN tddf_processing_date
              WHEN record_type = 'DT' THEN (extracted_fields->>'transactionDate')::date
            END DESC NULLS LAST,
            created_at DESC
        ) as rn
      FROM ${sql.identifier(tddfTableName)}
      WHERE extracted_fields->>'merchantAccountNumber' = ${merchantId}
        AND record_type IN ('BH', 'DT')
        AND (
          (record_type = 'BH' AND tddf_processing_date IS NOT NULL) OR
          (record_type = 'DT' AND extracted_fields->>'transactionDate' IS NOT NULL)
        )
    )
    SELECT 
      merchant_account_number,
      MAX(CASE WHEN record_type = 'BH' AND rn = 1 THEN tddf_processing_date END) as last_batch_date,
      MAX(CASE WHEN record_type = 'BH' AND rn = 1 THEN filename END) as last_batch_filename,
      MAX(CASE WHEN record_type = 'DT' AND rn = 1 THEN transaction_date END) as last_transaction_date,
      MAX(CASE WHEN record_type = 'DT' AND rn = 1 THEN transaction_amount END) as last_transaction_amount
    FROM merchant_data
    WHERE rn = 1
    GROUP BY merchant_account_number
  `);

  if (result.rows.length > 0) {
    const row = result.rows[0];
    metadata.clientMID = row.merchant_account_number as string;
    metadata.lastBatchDate = row.last_batch_date as Date | null;
    metadata.lastBatchFilename = row.last_batch_filename as string | null;
    metadata.lastTransactionDate = row.last_transaction_date as Date | null;
    metadata.lastTransactionAmount = row.last_transaction_amount as string | null;
  }

  return metadata;
}

async function updateMerchantRecord(
  merchantsTableName: string,
  merchantId: string,
  metadata: MerchantMetadata
): Promise<void> {
  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (metadata.clientMID) {
    updates.push(`client_mid = $${paramIndex++}`);
    params.push(metadata.clientMID);
  }

  if (metadata.lastBatchDate) {
    updates.push(`last_batch_date = $${paramIndex++}`);
    params.push(metadata.lastBatchDate);
  }

  if (metadata.lastBatchFilename) {
    updates.push(`last_batch_filename = $${paramIndex++}`);
    params.push(metadata.lastBatchFilename);
  }

  if (metadata.lastTransactionDate) {
    updates.push(`last_transaction_date = $${paramIndex++}`);
    params.push(metadata.lastTransactionDate);
  }

  if (metadata.lastTransactionAmount) {
    updates.push(`last_transaction_amount = $${paramIndex++}`);
    params.push(metadata.lastTransactionAmount);
  }

  if (updates.length === 0) {
    return; // Nothing to update
  }

  // Add merchant_id as the last parameter
  params.push(merchantId);

  const updateSQL = `
    UPDATE ${merchantsTableName}
    SET ${updates.join(', ')}, edit_date = NOW()
    WHERE id = $${paramIndex}
  `;

  // Use raw pool query with parameterized values
  await batchPool.query(updateSQL, params);
}

// Run the migration
// Check if script is being run directly (ES module version)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  // Ensure we're running in development mode
  if (process.env.NODE_ENV !== 'development') {
    console.error('❌ This migration script should only run in DEVELOPMENT mode');
    console.error('   Set NODE_ENV=development to continue');
    process.exit(1);
  }
  
  populateMerchantMetadata()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { populateMerchantMetadata };
