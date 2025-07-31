#!/usr/bin/env node

const { Pool } = require('pg');

async function populateTddfObjectTotalsCache() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  console.log('🔍 Building TDDF Object Totals cache...');
  const scanStart = new Date();
  
  try {
    // Get basic storage statistics
    const basicStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as analyzed_objects,
        SUM(file_size) as total_file_size,
        SUM((metadata->'record_type_analysis'->>'total_records')::int) as total_records,
        AVG((metadata->'record_type_analysis'->>'total_records')::int) as avg_records_per_file,
        MAX((metadata->'record_type_analysis'->>'total_records')::int) as largest_file_records
      FROM dev_master_object_keys 
      WHERE processing_status = 'complete'
      AND metadata->'record_type_analysis' IS NOT NULL
    `);
    
    // Get largest file name separately
    const largestFileResult = await pool.query(`
      SELECT original_filename
      FROM dev_master_object_keys 
      WHERE processing_status = 'complete'
      AND metadata->'record_type_analysis' IS NOT NULL
      ORDER BY (metadata->'record_type_analysis'->>'total_records')::int DESC
      LIMIT 1
    `);
    
    // Get total objects count
    const totalObjectsResult = await pool.query(`
      SELECT COUNT(*) as total_objects
      FROM dev_master_object_keys 
      WHERE processing_status = 'complete'
    `);
    
    // Aggregate record type breakdown
    const recordTypesResult = await pool.query(`
      SELECT 
        key as record_type,
        SUM(value::int) as record_count
      FROM dev_master_object_keys,
      LATERAL jsonb_each_text(metadata->'record_type_breakdown') as kv(key, value)
      WHERE processing_status = 'complete'
      AND metadata->'record_type_breakdown' IS NOT NULL
      GROUP BY key
      ORDER BY record_count DESC
    `);
    
    // Build combined stats object
    const stats = {
      ...basicStatsResult.rows[0],
      largest_file_name: largestFileResult.rows[0]?.original_filename,
      total_objects: totalObjectsResult.rows[0].total_objects,
      record_breakdown: {}
    };
    
    // Convert record types array to object
    recordTypesResult.rows.forEach(row => {
      stats.record_breakdown[row.record_type] = parseInt(row.record_count);
    });
    
    const scanEnd = new Date();
    const scanDuration = Math.round((scanEnd - scanStart) / 1000);
    
    if (basicStatsResult.rows.length === 0) {
      console.log('❌ No analyzed storage objects found');
      return;
    }
    
    // Clear existing cache and insert new data
    await pool.query('DELETE FROM dev_tddf_object_totals_cache_2025');
    
    const insertResult = await pool.query(`
      INSERT INTO dev_tddf_object_totals_cache_2025 (
        scan_date,
        scan_completion_time,
        scan_status,
        total_objects,
        analyzed_objects,
        total_records,
        total_file_size,
        record_type_breakdown,
        scan_duration_seconds,
        average_records_per_file,
        largest_file_records,
        largest_file_name,
        cache_expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() + INTERVAL '4 hours'
      ) RETURNING *
    `, [
      scanStart,
      scanEnd,
      'completed',
      stats.total_objects,
      stats.analyzed_objects,
      stats.total_records,
      stats.total_file_size,
      stats.record_breakdown,
      scanDuration,
      Math.round(stats.avg_records_per_file),
      stats.largest_file_records,
      stats.largest_file_name
    ]);
    
    const cacheRecord = insertResult.rows[0];
    
    // Display comprehensive summary
    console.log('\n📊 TDDF OBJECT TOTALS CACHE POPULATED');
    console.log('='.repeat(60));
    console.log(`Scan Started: ${scanStart.toLocaleString()}`);
    console.log(`Scan Completed: ${scanEnd.toLocaleString()}`);
    console.log(`Scan Duration: ${scanDuration} seconds`);
    console.log(`Scan Status: ${cacheRecord.scan_status}`);
    console.log(`Cache Expires: ${cacheRecord.cache_expires_at.toLocaleString()}`);
    
    console.log('\n📈 STORAGE STATISTICS:');
    console.log(`Total Objects: ${stats.total_objects.toLocaleString()}`);
    console.log(`Analyzed Objects: ${stats.analyzed_objects.toLocaleString()}`);
    console.log(`Total File Size: ${(stats.total_file_size / (1024*1024*1024)).toFixed(2)} GB`);
    console.log(`Analysis Coverage: ${((stats.analyzed_objects / stats.total_objects) * 100).toFixed(1)}%`);
    
    console.log('\n🏷️ RECORD TYPE BREAKDOWN:');
    console.log(`Total Records: ${stats.total_records.toLocaleString()}`);
    console.log(`Average Records/File: ${Math.round(stats.avg_records_per_file).toLocaleString()}`);
    console.log(`Largest File: ${stats.largest_file_name}`);
    console.log(`Largest File Records: ${stats.largest_file_records.toLocaleString()}`);
    
    // Display record types sorted by count
    const recordTypes = stats.record_breakdown;
    const sortedTypes = Object.entries(recordTypes)
      .sort(([,a], [,b]) => b - a);
    
    sortedTypes.forEach(([type, count]) => {
      const percentage = ((count / stats.total_records) * 100).toFixed(1);
      const description = getRecordTypeDescription(type);
      console.log(`   ${type}: ${count.toLocaleString()} records (${percentage}%) - ${description}`);
    });
    
    console.log(`\n✅ TDDF Object Totals cache populated successfully!`);
    console.log(`🕒 Cache valid until: ${cacheRecord.cache_expires_at.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Cache population failed:', error);
    
    // Record failed scan
    await pool.query(`
      INSERT INTO dev_tddf_object_totals_cache_2025 (
        scan_date,
        scan_completion_time,
        scan_status,
        scan_duration_seconds
      ) VALUES (
        $1, $2, 'failed', $3
      )
    `, [scanStart, new Date(), Math.round((new Date() - scanStart) / 1000)]);
    
  } finally {
    await pool.end();
  }
}

function getRecordTypeDescription(type) {
  const descriptions = {
    'DT': 'Detail Transaction',
    'BH': 'Batch Header',
    'P1': 'Purchasing Card 1',
    'P2': 'Purchasing Card 2', 
    'E1': 'Electronic Check',
    'G2': 'General 2',
    'AD': 'Adjustment',
    'DR': 'Detail Record (Non-standard)',
    'TH': 'Transaction Header',
    'TF': 'Transaction Footer',
    'FH': 'File Header',
    'FF': 'File Footer'
  };
  return descriptions[type] || 'Unknown Type';
}

populateTddfObjectTotalsCache().catch(console.error);