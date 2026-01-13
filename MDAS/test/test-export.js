#!/usr/bin/env node

/**
 * Test script for debugging export functionality
 * This script tests all export functions to identify issues
 */

import axios from 'axios';
import fs from 'fs';

// Configuration
const BASE_URL = 'http://localhost:5000';
const TEST_DATE = '2024-03-11'; // March 11, 2024 as requested

// Test session for authentication
let sessionCookie = '';

/**
 * Login to get session cookie
 */
async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'admin'
    });
    
    // Extract session cookie
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      sessionCookie = cookies.find(cookie => cookie.startsWith('connect.sid'));
    }
    
    console.log('✅ Login successful');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Test individual export function
 */
async function testExport(endpoint, description) {
  try {
    console.log(`\n🧪 Testing ${description}...`);
    console.log(`   Endpoint: ${endpoint}`);
    
    const headers = {};
    if (sessionCookie) {
      headers.Cookie = sessionCookie;
    }
    
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers,
      timeout: 30000, // 30 second timeout
      responseType: 'arraybuffer' // For CSV downloads
    });
    
    console.log(`✅ ${description} - Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    console.log(`   Content-Length: ${response.headers['content-length'] || 'unknown'}`);
    
    // Check if it's a CSV file
    if (response.headers['content-type']?.includes('text/csv')) {
      const csvContent = response.data.toString();
      const lines = csvContent.split('\n').filter(line => line.trim());
      console.log(`   CSV Lines: ${lines.length}`);
      if (lines.length > 0) {
        console.log(`   CSV Header: ${lines[0]}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${error.response.data?.toString?.() || error.response.statusText}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    return false;
  }
}

/**
 * Test all available export endpoints
 */
async function runExportTests() {
  console.log('🚀 Starting Export Function Tests');
  console.log(`📅 Test Date: ${TEST_DATE}`);
  
  const results = {};
  
  // Test actual export endpoints found in routes.ts
  console.log('\n📊 Testing Actual Export Endpoints...');
  
  results.transactions = await testExport(
    `/api/exports/transactions/download?startDate=${TEST_DATE}&endDate=${TEST_DATE}`,
    'Transactions Export'
  );
  
  results.merchants = await testExport(
    `/api/exports/merchants/download?startDate=${TEST_DATE}&endDate=${TEST_DATE}`,
    'Merchants Export'
  );
  
  results.allMerchants = await testExport(
    `/api/exports/merchants-all/download?targetDate=${TEST_DATE}`,
    'All Merchants for Date'
  );
  
  results.batchSummary = await testExport(
    `/api/exports/batch-summary/download?targetDate=${TEST_DATE}`,
    'Batch Summary Export'
  );
  
  results.allData = await testExport(
    `/api/exports/all-data/download?targetDate=${TEST_DATE}`,
    'All Data Export (ZIP)'
  );
  
  // Test legacy endpoints
  console.log('\n🔄 Testing Legacy Endpoints...');
  
  results.legacyTransactions = await testExport(
    `/api/transactions/export?startDate=${TEST_DATE}&endDate=${TEST_DATE}`,
    'Legacy Transactions Export'
  );
  
  results.legacyExportTransactions = await testExport(
    `/api/export/transactions`,
    'Legacy Export Transactions'
  );
  
  results.legacyExportMerchants = await testExport(
    `/api/export/merchants`,
    'Legacy Export Merchants'
  );
  
  // Summary
  console.log('\n📋 Test Results Summary:');
  const successful = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  console.log(`✅ Successful: ${successful}/${total}`);
  console.log(`❌ Failed: ${total - successful}/${total}`);
  
  if (successful === 0) {
    console.log('\n⚠️  All export tests failed. Check:');
    console.log('   1. Server is running on port 5000');
    console.log('   2. Export routes are properly defined');
    console.log('   3. Database contains data for the test date');
    console.log('   4. Authentication is working correctly');
  }
  
  return results;
}

/**
 * Test database connection and data availability
 */
async function testDataAvailability() {
  try {
    console.log('\n🗄️  Testing Data Availability...');
    
    const headers = {};
    if (sessionCookie) {
      headers.Cookie = sessionCookie;
    }
    
    // Test transactions endpoint
    const transactionsResponse = await axios.get(
      `${BASE_URL}/api/transactions?startDate=${TEST_DATE}&endDate=${TEST_DATE}&limit=1`,
      { headers }
    );
    
    console.log(`✅ Transactions API working - Status: ${transactionsResponse.status}`);
    const transactionCount = transactionsResponse.data.pagination?.totalItems || 0;
    console.log(`   Transactions found for ${TEST_DATE}: ${transactionCount}`);
    
    // Test merchants endpoint
    const merchantsResponse = await axios.get(
      `${BASE_URL}/api/merchants?limit=1`,
      { headers }
    );
    
    console.log(`✅ Merchants API working - Status: ${merchantsResponse.status}`);
    const merchantCount = merchantsResponse.data.pagination?.totalItems || 0;
    console.log(`   Total merchants: ${merchantCount}`);
    
    return { transactionCount, merchantCount };
  } catch (error) {
    console.error('❌ Data availability test failed:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('🔬 Export Function Debug Tool');
  console.log('================================\n');
  
  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('❌ Cannot proceed without authentication');
    process.exit(1);
  }
  
  // Test data availability
  const dataInfo = await testDataAvailability();
  if (!dataInfo) {
    console.log('⚠️  Data availability check failed, but continuing with export tests...');
  } else if (dataInfo.transactionCount === 0) {
    console.log(`⚠️  No transactions found for ${TEST_DATE}, but continuing with tests...`);
  }
  
  // Run export tests
  const results = await runExportTests();
  
  // Final status
  console.log('\n🏁 Test Complete');
  
  const allPassed = Object.values(results).every(r => r);
  if (allPassed) {
    console.log('🎉 All export functions are working!');
  } else {
    console.log('🔧 Some export functions need debugging.');
  }
}

// Run the tests
main().catch(console.error);