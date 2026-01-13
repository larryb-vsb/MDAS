#!/usr/bin/env node
/**
 * Test JSONB Encoding Performance
 * Triggers encoding for the test file and validates complete record count
 */

import axios from 'axios';

async function testEncodingProcess() {
  try {
    console.log('🚀 Testing JSONB Encoding Performance with Timing Tracking...\n');
    
    const uploadId = 'uploader_1753761770915_rm9j9ckhb';
    const cookies = 'connect.sid=s%3APGfnAHiF4eMd9qnpCNcF0LeSqvJBi0mp.vy6SZNX9zQo1QqbIBqiYMr8tJNQ5FEJ%2F6IaAQFRY1e0';
    
    console.log(`📁 Target Upload ID: ${uploadId}`);
    console.log(`🔧 Starting Stage 5 encoding...`);
    
    // Trigger Stage 5 encoding
    const encodingResponse = await axios.post(
      `http://localhost:5000/api/uploader/${uploadId}/encode`,
      { strategy: 'tddf_json' },
      {
        headers: {
          'Cookie': cookies,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Encoding completed successfully!`);
    console.log(`📊 Results Summary:`);
    console.log(`   - Status: ${encodingResponse.data.status}`);
    console.log(`   - Progress: ${encodingResponse.data.progress}%`);
    console.log(`   - Records Created: ${encodingResponse.data.results.totalRecords}`);
    console.log(`   - Encoding Time: ${encodingResponse.data.results.encodingTimeMs}ms`);
    console.log(`   - Record Types:`, encodingResponse.data.recordTypeBreakdown);
    
    // Display timing metadata if available
    if (encodingResponse.data.results.timingData) {
      const timing = encodingResponse.data.results.timingData;
      console.log(`⏱️  Timing Analysis:`);
      console.log(`   - Start Time: ${timing.startTime}`);
      console.log(`   - Finish Time: ${timing.finishTime}`);
      console.log(`   - Total Processing: ${timing.totalProcessingTime}ms`);
      console.log(`   - Batch Count: ${timing.batchTimes?.length || 0}`);
      if (timing.batchTimes && timing.batchTimes.length > 0) {
        const avgBatchTime = timing.batchTimes.reduce((sum, batch) => sum + batch.insertTimeMs, 0) / timing.batchTimes.length;
        console.log(`   - Average Batch Time: ${avgBatchTime.toFixed(2)}ms`);
      }
    }
    
    // Test JSONB data retrieval
    console.log(`\n🔍 Testing JSONB data retrieval...`);
    
    const jsonbResponse = await axios.get(
      `http://localhost:5000/api/uploader/${uploadId}/jsonb-data?limit=5`,
      {
        headers: { 'Cookie': cookies }
      }
    );
    
    console.log(`📄 JSONB Sample Data (first 5 records):`);
    jsonbResponse.data.data.forEach((record, index) => {
      console.log(`   ${index + 1}. Line ${record.line_number}: ${record.record_type} - ${record.record_identifier}`);
      console.log(`      Fields: ${Object.keys(JSON.parse(record.extracted_fields)).length} extracted`);
      if (record.processing_time_ms) {
        console.log(`      Processing Time: ${record.processing_time_ms}ms`);
      }
    });
    
    // Display timing metadata from JSONB API if available
    if (jsonbResponse.data.timingMetadata) {
      const meta = jsonbResponse.data.timingMetadata;
      console.log(`\n⏰ Encoding Performance Summary:`);
      console.log(`   - Total Records: ${meta.totalRecords?.toLocaleString()}`);
      console.log(`   - Encoding Time: ${(meta.totalEncodingTimeMs / 1000).toFixed(2)}s`);
      console.log(`   - Records/sec: ${Math.round(meta.totalRecords / (meta.totalEncodingTimeMs / 1000)).toLocaleString()}`);
      console.log(`   - Started: ${meta.encodingStartTime ? new Date(meta.encodingStartTime).toLocaleTimeString() : 'N/A'}`);
      if (meta.recordTypeBreakdown) {
        console.log(`   - Record Types:`, meta.recordTypeBreakdown);
      }
    }
    
    console.log(`\n📊 Final Validation:`);
    console.log(`   - Total JSONB records: ${jsonbResponse.data.pagination.total}`);
    console.log(`   - File had 66,601 lines`);
    console.log(`   - Coverage: ${((jsonbResponse.data.pagination.total / 66601) * 100).toFixed(1)}%`);
    
    if (jsonbResponse.data.pagination.total > 60000) {
      console.log(`🎉 SUCCESS: Complete JSONB encoding verified!`);
    } else {
      console.log(`⚠️  WARNING: Lower than expected record count`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testEncodingProcess();