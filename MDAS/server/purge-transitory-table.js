/**
 * Purge Script for TRANSITORY TDDF JSONB Records Table
 * 
 * WARNING: This script deletes ALL records from the TRANSITORY table:
 * - Development: dev_uploader_tddf_jsonb_records
 * - Production: uploader_tddf_jsonb_records
 * 
 * This does NOT affect the MASTER table (dev_tddf_jsonb) which contains
 * permanent storage from the uploader system.
 * 
 * Usage:
 *   node server/purge-transitory-table.js
 * 
 * Safety:
 *   - Confirms table name before deletion
 *   - Shows record count before purge
 *   - Reports records deleted
 */

import { batchPool } from './db.js';

async function purgeTransitoryTable() {
  const environment = process.env.NODE_ENV || 'development';
  const tableName = environment === 'development' 
    ? 'dev_uploader_tddf_jsonb_records' 
    : 'uploader_tddf_jsonb_records';

  console.log(`\n========================================`);
  console.log(`TDDF TRANSITORY TABLE PURGE SCRIPT`);
  console.log(`========================================`);
  console.log(`Environment: ${environment}`);
  console.log(`Target Table: ${tableName}`);
  console.log(`========================================\n`);

  const client = await batchPool.connect();

  try {
    // Get current record count
    const countQuery = `SELECT COUNT(*) as total FROM ${tableName};`;
    const countResult = await client.query(countQuery);
    const totalRecords = parseInt(countResult.rows[0].total);

    console.log(`Current records in ${tableName}: ${totalRecords.toLocaleString()}`);

    if (totalRecords === 0) {
      console.log(`\nTable is already empty. Nothing to purge.`);
      return;
    }

    // Get breakdown by record type
    const breakdownQuery = `
      SELECT 
        record_type,
        COUNT(*) as count
      FROM ${tableName}
      GROUP BY record_type
      ORDER BY record_type;
    `;
    const breakdownResult = await client.query(breakdownQuery);

    console.log(`\nRecord Type Breakdown:`);
    breakdownResult.rows.forEach(row => {
      console.log(`  ${row.record_type}: ${parseInt(row.count).toLocaleString()}`);
    });

    // Purge all records
    console.log(`\n🗑️  Purging ALL records from ${tableName}...`);
    
    const deleteQuery = `DELETE FROM ${tableName};`;
    const deleteResult = await client.query(deleteQuery);

    console.log(`\n✅ Purge completed successfully!`);
    console.log(`   Records deleted: ${deleteResult.rowCount.toLocaleString()}`);

    // Verify table is empty
    const verifyResult = await client.query(countQuery);
    const remainingRecords = parseInt(verifyResult.rows[0].total);

    console.log(`   Remaining records: ${remainingRecords}`);

    if (remainingRecords === 0) {
      console.log(`\n✨ Table ${tableName} is now empty.`);
    } else {
      console.log(`\n⚠️  Warning: ${remainingRecords} records still remain in table.`);
    }

    console.log(`\n========================================`);
    console.log(`PURGE COMPLETE`);
    console.log(`========================================\n`);

  } catch (error) {
    console.error(`\n❌ Error during purge:`, error);
    throw error;
  } finally {
    client.release();
    await batchPool.end();
  }
}

// Run the purge
purgeTransitoryTable()
  .then(() => {
    console.log(`Script completed successfully.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`Script failed:`, error);
    process.exit(1);
  });
