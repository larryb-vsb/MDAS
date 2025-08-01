#!/usr/bin/env node

/**
 * Check Production File Processing Issue
 * Investigates the TDDF file encoding error in production vs development
 */

const https = require('https');

const PRODUCTION_URL = 'https://mms-vsb.replit.app';
const TARGET_FILE = 'VERMNTSB.6759_TDDF_830_08012025_083844.TSYSO';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      },
      method: options.method || 'GET'
    };

    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ 
            status: res.statusCode, 
            data: parsed,
            headers: res.headers 
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            data: data,
            headers: res.headers 
          });
        }
      });
    });

    if (options.data) {
      req.write(JSON.stringify(options.data));
    }

    req.on('error', reject);
    req.end();
  });
}

async function checkProductionFileIssue() {
  console.log('🔍 Investigating Production File Processing Issue');
  console.log('Target File:', TARGET_FILE);
  console.log('=' .repeat(70));
  
  let sessionCookie = '';
  
  try {
    // Step 1: Login to production
    console.log('🔐 Logging into production...');
    const loginResponse = await makeRequest(`${PRODUCTION_URL}/api/login`, {
      method: 'POST',
      data: { username: 'admin', password: 'admin123' }
    });
    
    if (loginResponse.status === 200) {
      const setCookie = loginResponse.headers['set-cookie'];
      if (setCookie) {
        sessionCookie = setCookie.find(cookie => cookie.startsWith('connect.sid'));
        console.log('✅ Production login successful');
      }
    } else {
      console.log('❌ Production login failed');
      return;
    }

    // Step 2: Check production uploads for the target file
    console.log('\n📁 Checking production uploads...');
    const uploadsResponse = await makeRequest(`${PRODUCTION_URL}/api/uploader?limit=200`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    if (uploadsResponse.status === 200) {
      const uploads = Array.isArray(uploadsResponse.data) ? uploadsResponse.data : uploadsResponse.data.uploads || [];
      const targetFile = uploads.find(upload => upload.filename === TARGET_FILE);
      
      if (targetFile) {
        console.log('✅ Found target file in production uploads:');
        console.log(`   ID: ${targetFile.id}`);
        console.log(`   Status: ${targetFile.status}`);
        console.log(`   File Size: ${targetFile.file_size}`);
        console.log(`   Line Count: ${targetFile.line_count}`);
        console.log(`   Uploaded At: ${targetFile.uploaded_at}`);
        console.log(`   Identified At: ${targetFile.identified_at}`);
        console.log(`   Encoding At: ${targetFile.encoding_at}`);
        console.log(`   Processing At: ${targetFile.processing_at}`);
        console.log(`   Completed At: ${targetFile.completed_at}`);
        
        if (targetFile.error_message) {
          console.log(`   ❌ Error: ${targetFile.error_message}`);
        }
      } else {
        console.log('❌ Target file not found in production uploads');
        console.log(`   Total uploads found: ${uploads.length}`);
        console.log(`   Recent files:`, uploads.slice(0, 5).map(u => u.filename));
      }
    } else {
      console.log('❌ Failed to retrieve production uploads:', uploadsResponse.status);
    }

    // Step 3: Check system info for environment differences
    console.log('\n🔧 Checking production system info...');
    const systemResponse = await makeRequest(`${PRODUCTION_URL}/api/system/info`);
    
    if (systemResponse.status === 200) {
      console.log('📊 Production Environment:');
      console.log(`   Environment: ${systemResponse.data.environment?.name}`);
      console.log(`   Database: ${systemResponse.data.database?.status}`);
      console.log(`   Storage: ${systemResponse.data.storage?.storageType}`);
      console.log(`   Version: ${systemResponse.data.version?.appVersion}`);
    }

    // Step 4: Check for database table differences
    console.log('\n🗄️ Checking database health...');
    const dbHealthCheck = await makeRequest(`${PRODUCTION_URL}/api/system/database-health`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    if (dbHealthCheck.status === 200) {
      console.log('✅ Database health check passed');
    } else {
      console.log('⚠️ Database health check issues:', dbHealthCheck.status);
    }

    console.log('\n' + '=' .repeat(70));
    console.log('🎯 DIAGNOSIS COMPLETE');
    console.log('');
    console.log('📋 RECOMMENDATIONS:');
    console.log('1. Check if production has missing TDDF tables');
    console.log('2. Verify database schema between dev and production');
    console.log('3. Check for encoding/processing service differences');
    console.log('4. Investigate production-specific table constraints');
    
  } catch (error) {
    console.error('❌ Investigation failed:', error.message);
  }
}

// Run investigation
checkProductionFileIssue().catch(console.error);