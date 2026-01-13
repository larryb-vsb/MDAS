#!/usr/bin/env node

/**
 * Debug which table the API is actually trying to use
 */

console.log('🔍 Debugging Table Selection Logic');

const environment = process.env.NODE_ENV || 'development';
console.log(`Current NODE_ENV: "${process.env.NODE_ENV}"`);
console.log(`Detected environment: "${environment}"`);

const tableName = environment === 'development' ? 'dev_uploader_tddf_jsonb_records' : 'uploader_tddf_jsonb_records';
console.log(`Selected table name: "${tableName}"`);

console.log('\n📊 Environment Variables:');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`REPLIT_DEPLOYMENT: ${process.env.REPLIT_DEPLOYMENT}`);
console.log(`REPL_DEPLOYMENT: ${process.env.REPL_DEPLOYMENT}`);

console.log('\n🎯 API Logic Result:');
console.log(`API will use table: ${tableName}`);

if (tableName === 'dev_uploader_tddf_jsonb_records') {
  console.log('✅ Correct - using development table which has 29 records');
} else {
  console.log('❌ Wrong - trying to use production table which does not exist');
}