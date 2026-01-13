#!/usr/bin/env node
/**
 * Environment Check Utility
 * Verifies production environment configuration
 */

console.log('🔍 Environment Configuration Check');
console.log('==================================');

// Check Node.js environment
console.log(`NODE_ENV from process.env: "${process.env.NODE_ENV}"`);
console.log(`NODE_ENV is undefined: ${process.env.NODE_ENV === undefined}`);
console.log(`NODE_ENV is empty string: ${process.env.NODE_ENV === ''}`);

// Import and check environment detection
try {
  const { NODE_ENV, isProd, isDev } = require('./server/env-config.js');
  console.log(`\n📊 Environment Detection Results:`);
  console.log(`Final NODE_ENV: "${NODE_ENV}"`);
  console.log(`isProd: ${isProd}`);
  console.log(`isDev: ${isDev}`);
  
  // Import table configuration
  const { getTableName } = require('./server/table-config.js');
  console.log(`\n📋 Table Configuration:`);
  console.log(`Merchants table: ${getTableName('merchants')}`);
  console.log(`Transactions table: ${getTableName('transactions')}`);
  console.log(`TDDF records table: ${getTableName('tddf_records')}`);
  console.log(`Uploaded files table: ${getTableName('uploaded_files')}`);
  
  // Environment status
  console.log(`\n✅ Status:`);
  if (isProd) {
    console.log(`🎯 PRODUCTION MODE - Using main tables`);
  } else {
    console.log(`🔧 DEVELOPMENT MODE - Using dev_ prefixed tables`);
    console.log(`⚠️  WARNING: Production deployment should use production mode`);
  }
  
} catch (error) {
  console.error(`❌ Error checking environment:`, error.message);
}

console.log(`\n🔧 Fix Instructions:`);
console.log(`1. Set NODE_ENV=production in deployment environment`);
console.log(`2. Redeploy application`);
console.log(`3. Verify tables use production names (no dev_ prefix)`);