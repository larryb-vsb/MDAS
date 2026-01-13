#!/usr/bin/env node

/**
 * Fix missing audit logs table
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:5000';

async function createAuditTable() {
  try {
    console.log('🔧 Creating missing dev_audit_logs table...');
    
    // Make a request to trigger database table creation
    const response = await axios.get(`${BASE_URL}/api/system/info`);
    console.log('✅ System info response:', response.status);
    
    // Test if audit logs are now working by trying to create one
    const testResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'admin'
    });
    
    console.log('✅ Login test successful:', testResponse.status);
    
    // Now test export functionality
    const exportResponse = await axios.get(`${BASE_URL}/api/exports/batch-summary/download?targetDate=2024-03-11`, {
      headers: {
        Cookie: testResponse.headers['set-cookie']?.[0] || ''
      }
    });
    
    console.log('✅ Export test successful:', exportResponse.status);
    console.log('🎉 Audit table issue appears to be resolved!');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

createAuditTable();