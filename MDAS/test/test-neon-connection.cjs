#!/usr/bin/env node

/**
 * Simple Neon database connection test
 * Run this script to test your Neon connection before updating the main application
 */

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Required for Neon serverless driver
neonConfig.webSocketConstructor = ws;

async function testNeonConnection() {
  const neonUrl = process.env.NEON_DATABASE_URL;
  
  if (!neonUrl) {
    console.log('❌ NEON_DATABASE_URL not found in environment variables');
    console.log('Please set your Neon connection string in Replit Secrets');
    return false;
  }
  
  console.log('🔍 Testing Neon connection...');
  console.log(`📍 URL: ${neonUrl.substring(0, 80)}...`);
  
  const pool = new Pool({
    connectionString: neonUrl,
    max: 1, // Just one connection for testing
    connectionTimeoutMillis: 10000,
    acquireTimeoutMillis: 10000
  });
  
  try {
    // Test basic connection
    console.log('🔌 Attempting to connect...');
    const client = await pool.connect();
    
    // Test basic query
    console.log('📊 Running test query...');
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    
    console.log('✅ Connection successful!');
    console.log(`⏰ Database time: ${result.rows[0].current_time}`);
    console.log(`🗄️  Database version: ${result.rows[0].db_version.substring(0, 50)}...`);
    
    // Test if we can create/access tables
    console.log('🔧 Testing table access...');
    await client.query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log('✅ Table access working');
    
    client.release();
    await pool.end();
    
    console.log('🎉 Neon connection test passed! Ready to switch to Neon database.');
    return true;
    
  } catch (error) {
    console.log('❌ Connection failed:');
    console.log(`Error: ${error.message}`);
    
    if (error.message.includes('password authentication failed')) {
      console.log('\n🔧 Troubleshooting steps:');
      console.log('1. Check your username and password in the connection string');
      console.log('2. Make sure you copied the connection string correctly');
      console.log('3. Try generating a new connection string from Neon dashboard');
      console.log('4. Ensure you\'re using the pooled connection (-pooler in hostname)');
    }
    
    if (error.message.includes('timeout') || error.message.includes('connect')) {
      console.log('\n🔧 Network troubleshooting:');
      console.log('1. Check if the hostname is correct');
      console.log('2. Ensure SSL mode is set correctly');
      console.log('3. Try the non-pooled connection string as a test');
    }
    
    await pool.end();
    return false;
  }
}

// Run the test
testNeonConnection().then(success => {
  process.exit(success ? 0 : 1);
});