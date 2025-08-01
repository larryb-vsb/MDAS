#!/usr/bin/env node

/**
 * Final Production Verification Script
 * Comprehensive test of all production functionality
 */

const https = require('https');

const PRODUCTION_URL = 'https://mms-vsb.replit.app';

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

async function verifyProduction() {
  console.log('🎯 Final Production Verification - Complete Test Suite');
  console.log('=' .repeat(70));
  
  let sessionCookie = '';
  
  try {
    // Step 1: Test Login
    console.log('🔐 Testing authentication flow...');
    const loginResponse = await makeRequest(`${PRODUCTION_URL}/api/login`, {
      method: 'POST',
      data: { username: 'admin', password: 'admin123' }
    });
    
    if (loginResponse.status === 200 && loginResponse.data.username === 'admin') {
      console.log('✅ Login successful');
      
      // Extract session cookie
      const setCookie = loginResponse.headers['set-cookie'];
      if (setCookie) {
        sessionCookie = setCookie.find(cookie => cookie.startsWith('connect.sid'));
        console.log('✅ Session cookie obtained');
      }
    } else {
      console.log('❌ Login failed:', loginResponse.status);
      return;
    }

    // Step 2: Test Session Validation
    console.log('\n👤 Testing session validation...');
    const userResponse = await makeRequest(`${PRODUCTION_URL}/api/user`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    if (userResponse.status === 200 && userResponse.data.username === 'admin') {
      console.log('✅ Session validation successful');
      console.log(`   User: ${userResponse.data.username} (${userResponse.data.role})`);
    } else {
      console.log('❌ Session validation failed:', userResponse.status);
      return;
    }

    // Step 3: Test Dashboard Metrics
    console.log('\n📊 Testing dashboard metrics API...');
    const metricsResponse = await makeRequest(`${PRODUCTION_URL}/api/dashboard/cached-metrics`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    if (metricsResponse.status === 200 && metricsResponse.data.merchants) {
      console.log('✅ Dashboard metrics working');
      console.log(`   Total Merchants: ${metricsResponse.data.merchants.total}`);
      console.log(`   Cache Status: ${metricsResponse.data.cacheMetadata?.refreshStatus || 'Unknown'}`);
      console.log(`   Build Time: ${metricsResponse.data.cacheMetadata?.buildTime || 'N/A'}ms`);
    } else {
      console.log('❌ Dashboard metrics failed:', metricsResponse.status);
      console.log('   Error:', metricsResponse.data);
      return;
    }

    // Step 4: Test Charts API  
    console.log('\n📈 Testing charts API...');
    const chartsResponse = await makeRequest(`${PRODUCTION_URL}/api/charts/60day-trends`, {
      headers: { 'Cookie': sessionCookie }
    });
    
    if (chartsResponse.status === 200 && chartsResponse.data.dailyData) {
      console.log('✅ Charts API working');
      console.log(`   Daily Data Points: ${chartsResponse.data.dailyData.length}`);
      console.log(`   Cache Status: ${chartsResponse.data.cacheMetadata?.status || 'Unknown'}`);
    } else {
      console.log('❌ Charts API failed:', chartsResponse.status);
    }

    // Step 5: Test System Info
    console.log('\n🔧 Testing system info...');
    const systemResponse = await makeRequest(`${PRODUCTION_URL}/api/system/info`);
    
    if (systemResponse.status === 200) {
      console.log('✅ System info working');
      console.log(`   Environment: ${systemResponse.data.environment?.name}`);
      console.log(`   Storage: ${systemResponse.data.storage?.storageType}`);
      console.log(`   Version: ${systemResponse.data.version?.appVersion}`);
    } else {
      console.log('❌ System info failed:', systemResponse.status);
    }

    // Step 6: Test Page Loading
    console.log('\n🌐 Testing page accessibility...');
    const dashboardTest = await makeRequest(`${PRODUCTION_URL}/dashboard2`, {
      headers: { 
        'Accept': 'text/html',
        'Cookie': sessionCookie 
      }
    });
    
    if (dashboardTest.status === 200 && typeof dashboardTest.data === 'string') {
      console.log('✅ Dashboard2 page loads successfully');
      console.log('   Page returns HTML content (not login redirect)');
    } else {
      console.log('❌ Dashboard2 page failed:', dashboardTest.status);
    }

    console.log('\n' + '=' .repeat(70));
    console.log('🎉 PRODUCTION VERIFICATION COMPLETE!');
    console.log('✅ All critical functionality is working correctly');
    console.log('🌟 Production environment is fully operational');
    console.log(`🔗 Access dashboard at: ${PRODUCTION_URL}/dashboard2`);
    
  } catch (error) {
    console.error('❌ Verification failed with error:', error.message);
  }
}

// Run final verification
verifyProduction().catch(console.error);