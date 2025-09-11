#!/usr/bin/env node

/**
 * Database Connections Audit
 * Test and analyze all available database connections
 */

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for Node.js environment
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

async function testDatabaseConnection(name, url) {
  if (!url) {
    return {
      name,
      status: 'NOT_CONFIGURED',
      error: 'URL not provided'
    };
  }

  console.log(`\n🔗 Testing ${name}...`);
  console.log(`   URL: ${url.substring(0, 80)}...`);
  
  const pool = new Pool({ 
    connectionString: url,
    connectionTimeoutMillis: 10000
  });
  
  try {
    const result = await pool.query('SELECT current_user, current_database(), version()');
    const info = result.rows[0];
    
    // Extract database server info from URL
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const dbName = urlObj.pathname.split('/')[1];
    
    console.log(`   ✅ SUCCESS: Connected to ${info.current_database} as ${info.current_user}`);
    console.log(`   📊 Server: ${host}`);
    
    return {
      name,
      status: 'CONNECTED',
      user: info.current_user,
      database: info.current_database,
      server: host,
      version: info.version.split(' ').slice(0, 2).join(' ')
    };
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    
    // Extract server info even on failure
    let server = 'unknown';
    try {
      const urlObj = new URL(url);
      server = urlObj.hostname;
    } catch {}
    
    return {
      name,
      status: 'FAILED',
      error: error.message,
      server
    };
  } finally {
    await pool.end();
  }
}

async function auditAllDatabaseConnections() {
  console.log('🔍 [DB-AUDIT] Starting comprehensive database connections audit...');
  
  const connections = [
    {
      name: 'DATABASE_URL (Fallback)',
      url: process.env.DATABASE_URL
    },
    {
      name: 'NEON_DEV_DATABASE_URL (Development)',
      url: process.env.NEON_DEV_DATABASE_URL
    },
    {
      name: 'NEON_PROD_DATABASE_URL (Production)',
      url: process.env.NEON_PROD_DATABASE_URL
    }
  ];
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗄️ DATABASE CONNECTIONS TESTING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const results = [];
  
  for (const conn of connections) {
    const result = await testDatabaseConnection(conn.name, conn.url);
    results.push(result);
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CONNECTION SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  results.forEach(result => {
    console.log(`\n🔗 ${result.name}:`);
    console.log(`   Status: ${result.status === 'CONNECTED' ? '✅' : result.status === 'NOT_CONFIGURED' ? '⚪' : '❌'} ${result.status}`);
    
    if (result.status === 'CONNECTED') {
      console.log(`   Database: ${result.database}`);
      console.log(`   User: ${result.user}`);
      console.log(`   Server: ${result.server}`);
      console.log(`   Version: ${result.version}`);
    } else if (result.status === 'FAILED') {
      console.log(`   Server: ${result.server}`);
      console.log(`   Error: ${result.error}`);
    } else {
      console.log(`   Reason: ${result.error}`);
    }
  });
  
  // Analyze which databases are the same vs different
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 DATABASE COMPARISON ANALYSIS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const workingConnections = results.filter(r => r.status === 'CONNECTED');
  const failedConnections = results.filter(r => r.status === 'FAILED');
  const notConfigured = results.filter(r => r.status === 'NOT_CONFIGURED');
  
  console.log(`\n✅ WORKING CONNECTIONS: ${workingConnections.length}`);
  workingConnections.forEach(conn => {
    console.log(`   🟢 ${conn.name} → ${conn.server} (${conn.database})`);
  });
  
  console.log(`\n❌ FAILED CONNECTIONS: ${failedConnections.length}`);
  failedConnections.forEach(conn => {
    console.log(`   🔴 ${conn.name} → ${conn.server} (${conn.error.substring(0, 50)}...)`);
  });
  
  console.log(`\n⚪ NOT CONFIGURED: ${notConfigured.length}`);
  notConfigured.forEach(conn => {
    console.log(`   ⚪ ${conn.name}`);
  });
  
  // Server grouping analysis
  console.log('\n🏗️ SERVER GROUPING:');
  const servers = {};
  results.forEach(result => {
    if (result.server && result.server !== 'unknown') {
      if (!servers[result.server]) {
        servers[result.server] = [];
      }
      servers[result.server].push({
        name: result.name,
        status: result.status,
        database: result.database
      });
    }
  });
  
  Object.keys(servers).forEach(server => {
    console.log(`\n🖥️ ${server}:`);
    servers[server].forEach(conn => {
      const statusIcon = conn.status === 'CONNECTED' ? '✅' : '❌';
      console.log(`   ${statusIcon} ${conn.name} ${conn.database ? `(${conn.database})` : ''}`);
    });
  });
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 RECOMMENDATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (workingConnections.length === 1) {
    console.log('\n⚠️ SINGLE POINT OF FAILURE:');
    console.log('   Only one database connection is working');
    console.log('   Consider fixing failed connections for redundancy');
  }
  
  if (failedConnections.length > 0) {
    console.log('\n🔧 ACTION ITEMS:');
    failedConnections.forEach(conn => {
      if (conn.error.includes('password authentication failed')) {
        console.log(`   🔐 ${conn.name}: Reset credentials in database provider`);
      } else if (conn.error.includes('connection')) {
        console.log(`   🌐 ${conn.name}: Check network connectivity and server status`);
      }
    });
  }
  
  console.log('\n🔚 [DB-AUDIT] Audit completed');
}

// Run the audit
auditAllDatabaseConnections().catch(console.error);