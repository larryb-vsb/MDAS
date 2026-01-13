#!/usr/bin/env node

// PRODUCTION DATABASE SERVER FIX
// Issue: Production using wrong server (ep-shy-king-aasxdlh7) instead of (ep-quiet-unit-aa0eaxhe)
// Date: 2025-09-12

console.log('🔧 PRODUCTION DATABASE SERVER CONNECTION FIX');
console.log('='.repeat(60));

// STEP 1: Environment Analysis
console.log('\n📋 STEP 1: Current Environment Analysis');
console.log('-'.repeat(40));

console.log(`NODE_ENV: ${process.env.NODE_ENV || 'undefined (PROBLEM!)'}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'Set ✅' : 'Missing ❌'}`);
console.log(`NEON_DATABASE_URL: ${process.env.NEON_DATABASE_URL ? 'Set ✅' : 'Missing ❌'}`);
console.log(`NEON_DEV_DATABASE_URL: ${process.env.NEON_DEV_DATABASE_URL ? 'Set ✅' : 'Missing ❌'}`);
console.log(`NEON_PROD_DATABASE_URL: ${process.env.NEON_PROD_DATABASE_URL ? 'Set ✅' : 'Missing ❌'}`);

// Check which server is currently being used
if (process.env.NEON_DEV_DATABASE_URL) {
  const devUrl = process.env.NEON_DEV_DATABASE_URL;
  const isUsingShyKing = devUrl.includes('ep-shy-king-aasxdlh7');
  const isUsingQuietUnit = devUrl.includes('ep-quiet-unit-aa0eaxhe');
  
  console.log(`\n🔍 Current Database Server Analysis:`);
  console.log(`NEON_DEV_DATABASE_URL server: ${isUsingShyKing ? 'ep-shy-king-aasxdlh7 (DEV)' : isUsingQuietUnit ? 'ep-quiet-unit-aa0eaxhe (PROD)' : 'Other'}`);
}

if (process.env.NEON_PROD_DATABASE_URL) {
  const prodUrl = process.env.NEON_PROD_DATABASE_URL;
  const isUsingShyKing = prodUrl.includes('ep-shy-king-aasxdlh7');
  const isUsingQuietUnit = prodUrl.includes('ep-quiet-unit-aa0eaxhe');
  
  console.log(`NEON_PROD_DATABASE_URL server: ${isUsingShyKing ? 'ep-shy-king-aasxdlh7 (DEV)' : isUsingQuietUnit ? 'ep-quiet-unit-aa0eaxhe (PROD)' : 'Other'}`);
}

// STEP 2: Problem Analysis
console.log('\n🚨 STEP 2: Problem Analysis');
console.log('-'.repeat(40));

if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
  console.log('❌ CRITICAL: NODE_ENV is not set to "production"');
  console.log('   This causes the application to default to development mode');
  console.log('   and use dev_* tables with development database server');
}

console.log('❌ HARDCODED: Found hardcoded NEON_DEV_DATABASE_URL usage in /api/uploader/:id/jsonb-data');
console.log('   This bypasses environment detection and forces dev server usage');

// STEP 3: Required Actions
console.log('\n✅ STEP 3: Required Actions to Fix');
console.log('-'.repeat(40));

console.log('1. 🔧 Set NODE_ENV=production in Replit environment variables');
console.log('   This is CRITICAL for proper environment detection');

console.log('\n2. 🔧 Fix hardcoded database connection in server/routes.ts');
console.log('   Replace hardcoded NEON_DEV_DATABASE_URL with environment-aware connection');

console.log('\n3. 🔧 Ensure production database URLs point to ep-quiet-unit-aa0eaxhe');
console.log('   NEON_PROD_DATABASE_URL should use the production server');

console.log('\n4. 🔧 Add connection validation to prevent prod-to-dev mistakes');
console.log('   Add startup checks to ensure production never connects to dev servers');

// STEP 4: Manual Instructions
console.log('\n📋 STEP 4: Manual Environment Variable Setup');
console.log('-'.repeat(40));

console.log('In Replit Dashboard → Environment Variables:');
console.log('');
console.log('1. Set NODE_ENV=production');
console.log('   Variable: NODE_ENV');
console.log('   Value: production');
console.log('');
console.log('2. Verify NEON_PROD_DATABASE_URL points to ep-quiet-unit-aa0eaxhe');
console.log('   Variable: NEON_PROD_DATABASE_URL');
console.log('   Value: postgresql://[credentials]@ep-quiet-unit-aa0eaxhe.us-east-1.aws.neon.tech/[database]');
console.log('');
console.log('3. Keep NEON_DEV_DATABASE_URL pointing to ep-shy-king-aasxdlh7 for development');
console.log('   Variable: NEON_DEV_DATABASE_URL');
console.log('   Value: postgresql://[credentials]@ep-shy-king-aasxdlh7.us-east-1.aws.neon.tech/[database]');

// STEP 5: Code Fix Summary
console.log('\n🔧 STEP 5: Code Changes Required');
console.log('-'.repeat(40));

console.log('File: server/routes.ts');
console.log('Location: Line ~14796 in /api/uploader/:id/jsonb-data route');
console.log('');
console.log('REPLACE:');
console.log('  const directPool = new Pool({ ');
console.log('    connectionString: process.env.NEON_DEV_DATABASE_URL');
console.log('  });');
console.log('');
console.log('WITH:');
console.log('  import { getDatabaseUrl } from "./env-config";');
console.log('  const directPool = new Pool({ ');
console.log('    connectionString: getDatabaseUrl()');
console.log('  });');

console.log('\n🔍 STEP 6: Verification Commands');
console.log('-'.repeat(40));

console.log('After making changes, check logs for:');
console.log('✅ [ENV CONFIG] Final NODE_ENV: production, isProd: true');
console.log('✅ [DB CONFIG] Using NEON_PROD_DATABASE_URL (production database)');
console.log('✅ [FILE PROCESSOR] Using table: uploader_uploads (no dev_ prefix)');
console.log('❌ No more "[JSONB-API] Using direct NEON DEV connection" messages');

console.log('\n🎯 EXPECTED OUTCOME');
console.log('-'.repeat(40));
console.log('✅ Production connects to ep-quiet-unit-aa0eaxhe server');
console.log('✅ Development connects to ep-shy-king-aasxdlh7 server');
console.log('✅ Environment detection works correctly');
console.log('✅ No hardcoded database connections');

console.log('\n' + '='.repeat(60));
console.log('📞 CONTACT: Run this script after making environment changes');
console.log('🔄 RESTART: Application restart required after environment changes');
console.log('='.repeat(60));