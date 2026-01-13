#!/usr/bin/env node

// Script to manually skip non-DT records for a specific file
import { pool } from './server/db.js';
import { getTableName } from './server/table-config.js';

async function skipNonDTRecords() {
  const fileId = 'tddf_1753194147212_49s8kq86r';
  
  console.log(`🧪 Manually skipping non-DT records for file: ${fileId}`);
  
  try {
    // Get all non-DT records from the database for this file
    console.log('📋 Getting non-DT records to skip...');
    const result = await pool.query(`
      SELECT id, line_number, record_type, record_description, processing_status
      FROM ${getTableName('tddf_raw_import')} 
      WHERE source_file_id = $1 
        AND record_type != 'DT' 
        AND processing_status = 'pending'
      ORDER BY line_number
      LIMIT 20
    `, [fileId]);
    
    const nonDtRecords = result.rows;
    
    console.log(`Found ${nonDtRecords.length} non-DT records to skip (showing first 20)`);
    
    if (nonDtRecords.length === 0) {
      console.log('✅ No non-DT records found to skip');
      return;
    }
    
    // Show sample records
    console.log('\n📄 Sample non-DT records to skip:');
    for (const record of nonDtRecords.slice(0, 5)) {
      console.log(`  Line ${record.line_number}: ${record.record_type} - ${record.record_description}`);
    }
    
    // Skip all non-DT records for this file
    console.log('\n⏳ Updating non-DT records to skipped status...');
    const updateResult = await pool.query(`
      UPDATE ${getTableName('tddf_raw_import')} 
      SET processing_status = 'skipped',
          skip_reason = 'non_dt_record',
          processed_at = NOW(),
          updated_at = NOW()
      WHERE source_file_id = $1 
        AND record_type != 'DT' 
        AND processing_status = 'pending'
    `, [fileId]);
    
    console.log(`✅ Successfully marked ${updateResult.rowCount} non-DT records as skipped`);
    
    // Get updated status
    console.log('\n📊 Updated processing status:');
    const statusResult = await pool.query(`
      SELECT 
        processing_status,
        COUNT(*) as count
      FROM ${getTableName('tddf_raw_import')} 
      WHERE source_file_id = $1
      GROUP BY processing_status
      ORDER BY processing_status
    `, [fileId]);
    
    for (const status of statusResult.rows) {
      console.log(`  ${status.processing_status}: ${status.count} records`);
    }
    
    console.log('\n🎉 Non-DT record skipping complete!');
    
  } catch (error) {
    console.error('❌ Error skipping non-DT records:', error);
  } finally {
    await pool.end();
  }
}

skipNonDTRecords();