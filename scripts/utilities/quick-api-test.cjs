#!/usr/bin/env node

/**
 * Quick API test to simulate web browser request
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Neon config for WebSocket
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

async function testJsonbAPI() {
  console.log('🔍 Direct API Simulation Test');
  
  const uploadId = 'uploader_1753770043406_rxjr75vpv';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('\n📊 Simulating API endpoint logic...');
    
    const environment = process.env.NODE_ENV || 'development';
    const tableName = environment === 'development' ? 'dev_uploader_tddf_jsonb_records' : 'uploader_tddf_jsonb_records';
    
    console.log(`Environment: ${environment}, Table: ${tableName}`);
    
    // Simulate the exact API query
    const limit = '50';
    const offset = '0';
    
    let query = `
      SELECT 
        id, upload_id, record_type, record_data, 
        processing_status, created_at
      FROM ${tableName} 
      WHERE upload_id = $1
    `;
    
    const params = [uploadId];
    query += ` ORDER BY id ASC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);
    
    console.log('\n🔧 Executing query...');
    console.log('Query:', query);
    console.log('Params:', params);
    
    const result = await pool.query(query, params);
    console.log(`✅ Query returned ${result.rows.length} rows`);
    
    if (result.rows.length === 0) {
      console.log('❌ No data returned - this is the issue!');
      return false;
    }
    
    // Transform data like the API does
    const transformedData = result.rows.map(row => {
      const recordData = row.record_data;
      return {
        id: row.id,
        upload_id: row.upload_id,
        filename: recordData.filename || 'Unknown',
        record_type: row.record_type,
        line_number: recordData.lineNumber || 0,
        raw_line: recordData.rawLine || '',
        extracted_fields: recordData.extractedFields || {},
        record_identifier: `${row.record_type}-${recordData.lineNumber || row.id}`,
        processing_time_ms: recordData.processingTimeMs || 0,
        created_at: row.created_at
      };
    });
    
    // Get count
    let countQuery = `SELECT COUNT(*) as total FROM ${tableName} WHERE upload_id = $1`;
    const countParams = [uploadId];
    
    const countResult = await pool.query(countQuery, countParams);
    const totalRecords = parseInt(countResult.rows[0].total);
    
    console.log('\n📊 API Response Simulation:');
    const response = {
      data: transformedData,
      tableName: tableName,
      pagination: {
        total: totalRecords,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < totalRecords
      }
    };
    
    console.log('Response structure:');
    console.log(`- data.length: ${response.data.length}`);
    console.log(`- pagination.total: ${response.pagination.total}`);
    console.log(`- tableName: ${response.tableName}`);
    console.log('\nFirst record sample:');
    console.log(JSON.stringify(response.data[0], null, 2));
    
    console.log('\n✅ API simulation successful - data should be available!');
    return true;
    
  } catch (error) {
    console.error('💥 API simulation failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  } finally {
    await pool.end();
  }
}

// Run the test
testJsonbAPI().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});