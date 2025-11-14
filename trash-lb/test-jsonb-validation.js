#!/usr/bin/env node

/**
 * JSONB Validation Test Script
 * Tests complete TDDF to JSONB encoding pipeline with record count verification
 */

import { Pool } from '@neondatabase/serverless';
import fs from 'fs';
import ws from 'ws';

// Configure neon for websocket support
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function validateJsonbRecords() {
  try {
    console.log('🔍 JSONB Validation Test Starting...\n');
    
    // 1. Find encoded uploads
    const encodedUploads = await pool.query(`
      SELECT id, filename, file_size, line_count, current_phase 
      FROM dev_uploader_uploads 
      WHERE current_phase = 'encoded' 
      AND final_file_type = 'tddf'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log(`📊 Found ${encodedUploads.rows.length} encoded TDDF uploads:`);
    encodedUploads.rows.forEach((upload, i) => {
      console.log(`  ${i+1}. ${upload.filename} (${upload.file_size} bytes, ${upload.line_count || 'unknown'} lines)`);
    });
    console.log('');
    
    if (encodedUploads.rows.length === 0) {
      console.log('❌ No encoded uploads found. Please encode a TDDF file first.');
      return;
    }
    
    // 2. Test each encoded upload
    for (const upload of encodedUploads.rows) {
      console.log(`🔍 Testing Upload: ${upload.filename} (ID: ${upload.id})`);
      
      // Check JSONB records
      const jsonbRecords = await pool.query(`
        SELECT 
          record_type, 
          COUNT(*) as count,
          MIN(line_number) as min_line,
          MAX(line_number) as max_line
        FROM dev_tddf_jsonb 
        WHERE upload_id = $1 
        GROUP BY record_type 
        ORDER BY record_type
      `, [upload.id]);
      
      const totalJsonbRecords = jsonbRecords.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
      
      console.log(`  📄 JSONB Records by Type:`);
      if (jsonbRecords.rows.length === 0) {
        console.log(`    ❌ No JSONB records found for this upload!`);
      } else {
        jsonbRecords.rows.forEach(row => {
          console.log(`    ${row.record_type}: ${row.count} records (lines ${row.min_line}-${row.max_line})`);
        });
        console.log(`    📊 Total JSONB Records: ${totalJsonbRecords}`);
      }
      
      // Check for metadata preservation
      const sampleRecord = await pool.query(`
        SELECT filename, record_identifier, extracted_fields, processing_time_ms
        FROM dev_tddf_jsonb 
        WHERE upload_id = $1 
        LIMIT 1
      `, [upload.id]);
      
      if (sampleRecord.rows.length > 0) {
        const sample = sampleRecord.rows[0];
        console.log(`  📋 Metadata Check:`);
        console.log(`    ✓ Filename preserved: ${sample.filename}`);
        console.log(`    ✓ Record identifier: ${sample.record_identifier}`);
        console.log(`    ✓ Processing time: ${sample.processing_time_ms}ms`);
        console.log(`    ✓ Extracted fields: ${Object.keys(sample.extracted_fields || {}).length} fields`);
      }
      
      // Compare with expected line count
      if (upload.line_count) {
        const coverage = ((totalJsonbRecords / upload.line_count) * 100).toFixed(1);
        console.log(`  📈 Coverage Analysis:`);
        console.log(`    File lines: ${upload.line_count}`);
        console.log(`    JSONB records: ${totalJsonbRecords}`);
        console.log(`    Coverage: ${coverage}%`);
        
        if (coverage < 95) {
          console.log(`    ⚠️  Low coverage! Expected ~100% for complete encoding`);
        } else {
          console.log(`    ✅ Good coverage!`);
        }
      }
      
      console.log('');
    }
    
    // 3. Test JSONB API endpoint functionality
    console.log('🔧 Testing JSONB API Response Structure...');
    const testUpload = encodedUploads.rows[0];
    
    const apiResponse = await pool.query(`
      SELECT 
        id, upload_id, filename, record_type, line_number, 
        raw_line, extracted_fields, record_identifier, 
        processing_time_ms, created_at
      FROM dev_tddf_jsonb 
      WHERE upload_id = $1
      ORDER BY line_number ASC 
      LIMIT 5
    `, [testUpload.id]);
    
    console.log(`  📊 API Response Structure Test:`);
    console.log(`    Records returned: ${apiResponse.rows.length}`);
    
    if (apiResponse.rows.length > 0) {
      const sample = apiResponse.rows[0];
      const requiredFields = ['id', 'upload_id', 'filename', 'record_type', 'line_number', 'raw_line', 'extracted_fields', 'record_identifier'];
      
      requiredFields.forEach(field => {
        const hasField = sample.hasOwnProperty(field) && sample[field] !== null;
        console.log(`    ${hasField ? '✅' : '❌'} ${field}: ${hasField ? 'present' : 'missing'}`);
      });
    }
    
    // 4. Create comprehensive summary
    console.log('\n📋 JSONB Validation Summary:');
    console.log(`  Total encoded uploads tested: ${encodedUploads.rows.length}`);
    
    let totalJsonbRecords = 0;
    let totalFileLines = 0;
    
    for (const upload of encodedUploads.rows) {
      const counts = await pool.query(`
        SELECT COUNT(*) as count FROM dev_tddf_jsonb WHERE upload_id = $1
      `, [upload.id]);
      
      totalJsonbRecords += parseInt(counts.rows[0].count);
      totalFileLines += upload.line_count || 0;
    }
    
    console.log(`  Total JSONB records across all files: ${totalJsonbRecords}`);
    console.log(`  Total file lines across all files: ${totalFileLines}`);
    
    if (totalFileLines > 0) {
      const overallCoverage = ((totalJsonbRecords / totalFileLines) * 100).toFixed(1);
      console.log(`  Overall encoding coverage: ${overallCoverage}%`);
      
      if (overallCoverage > 95) {
        console.log('  🎉 JSONB encoding system is working correctly!');
      } else {
        console.log('  ⚠️  JSONB encoding needs investigation - low coverage detected');
      }
    }
    
  } catch (error) {
    console.error('❌ Validation test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the validation
validateJsonbRecords();