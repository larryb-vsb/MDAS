#!/usr/bin/env node

/**
 * Production Status Verification Script
 * Verifies that production environment is working correctly
 */

const https = require('https');
const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');

// Configure Neon for serverless
const neonConfig = require('@neondatabase/serverless').neonConfig;
neonConfig.webSocketConstructor = ws;

const PRODUCTION_URL = 'https://mms-vsb.replit.app';

function makeRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on('error', reject);
  });
}

async function verifyProductionStatus() {
  console.log('🔍 Verifying Production Environment Status...');
  console.log('=' .repeat(60));
  
  try {
    // Test system info endpoint
    console.log('📊 Testing system info endpoint...');
    const systemInfo = await makeRequest(`${PRODUCTION_URL}/api/system/info`);
    
    if (systemInfo.status === 200) {
      console.log('✅ System info endpoint working');
      console.log(`   Environment: ${systemInfo.data.environment?.name}`);
      console.log(`   Storage: ${systemInfo.data.storage?.storageType}`);
      console.log(`   Version: ${systemInfo.data.version?.appVersion}`);
    } else {
      console.log('❌ System info endpoint failed:', systemInfo.status);
    }

    // Test authentication endpoint
    console.log('\n🔐 Testing authentication endpoint...');
    const userCheck = await makeRequest(`${PRODUCTION_URL}/api/user`);
    
    if (userCheck.status === 401) {
      console.log('✅ Authentication endpoint working (not authenticated)');
    } else if (userCheck.status === 200) {
      console.log('✅ Authentication endpoint working (authenticated)');
    } else {
      console.log('❌ Authentication endpoint failed:', userCheck.status);
    }

    // Test charts endpoint
    console.log('\n📈 Testing charts endpoint...');
    const chartsTest = await makeRequest(`${PRODUCTION_URL}/api/charts/60day-trends`);
    
    if (chartsTest.status === 401) {
      console.log('✅ Charts endpoint working (requires auth)');
    } else if (chartsTest.status === 200) {
      console.log('✅ Charts endpoint working and returning data');
    } else {
      console.log('⚠️  Charts endpoint status:', chartsTest.status);
    }

    // Database connectivity test (if DATABASE_URL available)
    if (process.env.DATABASE_URL) {
      console.log('\n🗄️  Testing database connectivity...');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      
      try {
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful');
        
        // Check critical tables
        const tables = await pool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name IN ('users', 'merchants', 'dashboard_cache', 'charts_pre_cache')
          ORDER BY table_name
        `);
        
        console.log(`✅ Found ${tables.rows.length}/4 critical tables:`);
        tables.rows.forEach(row => {
          console.log(`   - ${row.table_name}`);
        });
        
        await pool.end();
      } catch (error) {
        console.log('❌ Database connection failed:', error.message);
      }
    }

    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Production verification complete!');
    console.log(`🌐 Access production at: ${PRODUCTION_URL}/dashboard2`);
    
  } catch (error) {
    console.error('❌ Production verification failed:', error);
  }
}

// Run verification
verifyProductionStatus().catch(console.error);