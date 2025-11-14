#!/usr/bin/env node

/**
 * Comprehensive TDDF Encoding Test Cycle
 * Tests encoding process with automatic retry and verification
 */

const fs = require('fs');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:5000',
  cookieFile: './test_cookies.txt',
  maxRetries: 10,
  stuckTimeout: 30000, // 30 seconds
  verificationTimeout: 5000, // 5 seconds between checks
  targetLineCount: 29
};

class EncodingTestCycle {
  constructor() {
    this.cookies = this.loadCookies();
    this.currentTestFile = null;
    this.attempt = 0;
  }

  loadCookies() {
    try {
      return fs.readFileSync(CONFIG.cookieFile, 'utf8').trim();
    } catch (error) {
      console.error('❌ Could not load cookies from', CONFIG.cookieFile);
      process.exit(1);
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${CONFIG.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Cookie': this.cookies,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async findTestFile() {
    console.log('🔍 Finding 29-line file for testing...');
    
    const uploads = await this.makeRequest('/api/uploader');
    const candidates = uploads.filter(file => 
      file.lineCount === CONFIG.targetLineCount && 
      file.currentPhase === 'identified'
    );

    if (candidates.length === 0) {
      throw new Error('No 29-line files found in identified phase');
    }

    this.currentTestFile = candidates[0];
    console.log(`✅ Selected test file: ${this.currentTestFile.filename} (ID: ${this.currentTestFile.id})`);
    return this.currentTestFile;
  }

  async startEncoding(uploadId) {
    console.log(`🚀 Starting encoding for ${uploadId}...`);
    
    try {
      const result = await this.makeRequest('/api/uploader/encode', {
        method: 'POST',
        body: JSON.stringify({ uploadIds: [uploadId] })
      });
      
      console.log(`✅ Encoding started: ${result.message}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to start encoding: ${error.message}`);
      throw error;
    }
  }

  async checkEncodingStatus(uploadId) {
    try {
      const uploads = await this.makeRequest('/api/uploader');
      const file = uploads.find(f => f.id === uploadId);
      
      if (!file) {
        throw new Error(`File ${uploadId} not found`);
      }

      return {
        phase: file.currentPhase,
        encodingStatus: file.encodingStatus,
        recordsCreated: file.jsonRecordsCreated || 0,
        error: file.processingNotes?.includes('error') || file.processingNotes?.includes('failed')
      };
    } catch (error) {
      console.error(`❌ Failed to check status: ${error.message}`);
      return null;
    }
  }

  async cancelEncoding(uploadId) {
    console.log(`🛑 Canceling encoding for ${uploadId}...`);
    
    try {
      const result = await this.makeRequest('/api/uploader/cancel-encoding', {
        method: 'POST',
        body: JSON.stringify({ uploadIds: [uploadId] })
      });
      
      console.log(`✅ Encoding canceled: ${result.message}`);
      return result;
    } catch (error) {
      console.error(`❌ Failed to cancel encoding: ${error.message}`);
      throw error;
    }
  }

  async verifyJsonbRecords(uploadId) {
    console.log(`🔍 Verifying JSONB records for ${uploadId}...`);
    
    try {
      const result = await this.makeRequest(`/api/uploader/${uploadId}/jsonb-data`);
      
      if (result.records && result.records.length > 0) {
        console.log(`✅ Found ${result.records.length} JSONB records`);
        console.log(`📊 Sample record structure:`, Object.keys(result.records[0] || {}));
        return result.records.length;
      } else {
        console.log(`❌ No JSONB records found`);
        return 0;
      }
    } catch (error) {
      console.error(`❌ Failed to verify JSONB records: ${error.message}`);
      return 0;
    }
  }

  async testJsonViewer(uploadId) {
    console.log(`🖥️ Testing JSON viewer for ${uploadId}...`);
    
    try {
      // Test the JSON data endpoint that the viewer uses
      const jsonData = await this.makeRequest(`/api/uploader/${uploadId}/jsonb-data`);
      
      if (jsonData.records && jsonData.records.length > 0) {
        console.log(`✅ JSON viewer data accessible: ${jsonData.records.length} records`);
        
        // Verify data structure
        const sampleRecord = jsonData.records[0];
        const hasRequiredFields = sampleRecord && 
          typeof sampleRecord.recordType === 'string' &&
          typeof sampleRecord.lineNumber === 'number';
        
        if (hasRequiredFields) {
          console.log(`✅ Record structure valid`);
          return true;
        } else {
          console.log(`❌ Invalid record structure`);
          return false;
        }
      } else {
        console.log(`❌ No JSON data available for viewer`);
        return false;
      }
    } catch (error) {
      console.error(`❌ JSON viewer test failed: ${error.message}`);
      return false;
    }
  }

  async waitForCompletion(uploadId, timeout = CONFIG.stuckTimeout) {
    console.log(`⏳ Waiting for encoding completion (timeout: ${timeout}ms)...`);
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = await this.checkEncodingStatus(uploadId);
      
      if (!status) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.verificationTimeout));
        continue;
      }

      console.log(`📊 Status: ${status.phase} | Encoding: ${status.encodingStatus || 'none'} | Records: ${status.recordsCreated}`);

      // Check for completion
      if (status.phase === 'encoded' && status.recordsCreated >= CONFIG.targetLineCount) {
        console.log(`✅ Encoding completed successfully!`);
        return 'completed';
      }

      // Check for errors
      if (status.error) {
        console.log(`❌ Encoding failed with error`);
        return 'failed';
      }

      // Check if stuck in encoding
      if (status.phase === 'encoding' && Date.now() - startTime > timeout) {
        console.log(`⚠️ Encoding appears stuck`);
        return 'stuck';
      }

      await new Promise(resolve => setTimeout(resolve, CONFIG.verificationTimeout));
    }

    return 'timeout';
  }

  async runTestCycle() {
    console.log(`\n🧪 Starting TDDF Encoding Test Cycle - Attempt ${++this.attempt}`);
    console.log(`📋 Target: ${CONFIG.targetLineCount} lines encoded to JSONB`);
    
    try {
      // Find test file if not already selected
      if (!this.currentTestFile) {
        await this.findTestFile();
      }

      const uploadId = this.currentTestFile.id;

      // Start encoding
      await this.startEncoding(uploadId);

      // Wait for completion or detect if stuck
      const result = await this.waitForCompletion(uploadId);

      if (result === 'completed') {
        // Verify JSONB records
        const recordCount = await this.verifyJsonbRecords(uploadId);
        
        if (recordCount >= CONFIG.targetLineCount) {
          // Test JSON viewer
          const viewerWorking = await this.testJsonViewer(uploadId);
          
          if (viewerWorking) {
            console.log(`\n🎉 SUCCESS! Test cycle completed:`);
            console.log(`   ✅ File encoded successfully`);
            console.log(`   ✅ ${recordCount} JSONB records created`);
            console.log(`   ✅ JSON viewer working correctly`);
            return true;
          } else {
            console.log(`\n❌ JSON viewer test failed, retrying...`);
            return false;
          }
        } else {
          console.log(`\n❌ Insufficient records created (${recordCount}/${CONFIG.targetLineCount}), retrying...`);
          return false;
        }
      } else if (result === 'stuck' || result === 'timeout') {
        console.log(`\n⚠️ Encoding stuck/timeout, canceling and retrying...`);
        await this.cancelEncoding(uploadId);
        
        // Wait a moment for cancellation to take effect
        await new Promise(resolve => setTimeout(resolve, 2000));
        return false;
      } else {
        console.log(`\n❌ Encoding failed, retrying...`);
        return false;
      }

    } catch (error) {
      console.error(`\n💥 Test cycle failed: ${error.message}`);
      return false;
    }
  }

  async run() {
    console.log('🚀 Starting Comprehensive TDDF Encoding Test');
    console.log(`🎯 Goal: Successfully encode ${CONFIG.targetLineCount}-line file to JSONB with working JSON viewer`);
    console.log(`🔄 Max attempts: ${CONFIG.maxRetries}`);

    for (let i = 0; i < CONFIG.maxRetries; i++) {
      const success = await this.runTestCycle();
      
      if (success) {
        console.log(`\n🏆 MISSION ACCOMPLISHED! Test successful on attempt ${this.attempt}`);
        process.exit(0);
      }

      if (i < CONFIG.maxRetries - 1) {
        console.log(`\n⏳ Waiting 3 seconds before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log(`\n💔 Test failed after ${CONFIG.maxRetries} attempts`);
    process.exit(1);
  }
}

// Run the test if called directly
if (require.main === module) {
  const tester = new EncodingTestCycle();
  tester.run().catch(error => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = EncodingTestCycle;