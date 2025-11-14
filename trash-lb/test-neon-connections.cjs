/**
 * Neon Database Connection Test - Development & Production
 * Tests both development and production Neon database connections
 * Run this script to verify your Neon connections before updating the main application
 */

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Required for Neon serverless driver
neonConfig.webSocketConstructor = ws;

async function testConnection(url, name) {
  if (!url) {
    console.log(`❌ ${name} URL not found in environment variables`);
    return false;
  }

  console.log(`\n🔍 Testing ${name} connection...`);
  console.log(`📍 URL: ${url.substring(0, 80)}...`);

  const pool = new Pool({ connectionString: url });

  try {
    console.log('🔌 Attempting to connect...');
    const client = await pool.connect();
    
    console.log('📊 Running test query...');
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    
    console.log(`✅ ${name} connection successful!`);
    console.log(`🕒 Server time: ${result.rows[0].current_time}`);
    console.log(`🗄️  Database: ${result.rows[0].db_version.split(' ')[0]} ${result.rows[0].db_version.split(' ')[1]}`);
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.log(`❌ ${name} connection failed:`);
    console.error(`Error: ${error.message}`);
    
    if (error.message.includes('password authentication failed')) {
      console.log('\n🔧 Troubleshooting steps:');
      console.log('1. Check your username and password in the connection string');
      console.log('2. Make sure you copied the connection string correctly');
      console.log('3. Try generating a new connection string from Neon dashboard');
      console.log('4. Ensure you\'re using the pooled connection (-pooler in hostname)');
    } else if (error.message.includes('WebSocket')) {
      console.log('\n🔧 Network troubleshooting:');
      console.log('1. Check if the hostname is correct');
      console.log('2. Ensure SSL mode is set correctly');
      console.log('3. Try the non-pooled connection string as a test');
    }
    
    await pool.end();
    return false;
  }
}

async function testAllConnections() {
  console.log('🚀 Testing Neon Database Connections...');
  console.log('==================================================');
  
  const devUrl = process.env.NEON_DEV_DATABASE_URL;
  const prodUrl = process.env.NEON_PROD_DATABASE_URL;
  const fallbackUrl = process.env.DATABASE_URL;
  
  let results = {
    dev: false,
    prod: false,
    fallback: false
  };
  
  // Test development connection
  if (devUrl) {
    results.dev = await testConnection(devUrl, 'DEVELOPMENT (NEON_DEV_DATABASE_URL)');
  } else {
    console.log('\n⚠️  NEON_DEV_DATABASE_URL not set - skipping development test');
  }
  
  // Test production connection
  if (prodUrl) {
    results.prod = await testConnection(prodUrl, 'PRODUCTION (NEON_PROD_DATABASE_URL)');
  } else {
    console.log('\n⚠️  NEON_PROD_DATABASE_URL not set - skipping production test');
  }
  
  // Test fallback connection
  if (fallbackUrl) {
    results.fallback = await testConnection(fallbackUrl, 'FALLBACK (DATABASE_URL)');
  }
  
  // Summary
  console.log('\n==================================================');
  console.log('📋 CONNECTION TEST SUMMARY:');
  console.log(`🔧 Development: ${results.dev ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🚀 Production:  ${results.prod ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔄 Fallback:    ${results.fallback ? '✅ PASS' : '❌ FAIL'}`);
  
  const hasAnyConnection = results.dev || results.prod || results.fallback;
  
  if (hasAnyConnection) {
    console.log('\n🎉 At least one connection is working! Application can start.');
    if (results.dev && results.prod) {
      console.log('💡 Both dev and prod connections work - full environment separation ready!');
    } else if (results.dev) {
      console.log('💡 Development connection works - good for development environment.');
    } else if (results.prod) {
      console.log('💡 Production connection works - good for production environment.');
    }
  } else {
    console.log('\n❌ No connections are working. Please fix the connection strings and try again.');
  }
  
  return hasAnyConnection;
}

// Run the test
testAllConnections()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });