#!/usr/bin/env node

/**
 * ADD MISSING PROCESSING_NOTES COLUMN TO PRODUCTION UPLOADER_UPLOADS TABLE
 * 
 * ERROR: column "processing_notes" of relation "uploader_uploads" does not exist
 * SOLUTION: Add the missing column using internal database API
 */

console.log('🔧 ADDING PROCESSING_NOTES COLUMN TO PRODUCTION');
console.log('================================================');
console.log('🎯 Target: uploader_uploads table (production)');
console.log('📝 Column: processing_notes TEXT\n');

async function addProcessingNotesColumn() {
  try {
    // Use the application's internal API to add the column
    const response = await fetch('http://localhost:5000/api/sql-execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'column-fix-script'
      },
      body: JSON.stringify({
        query: 'ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS processing_notes TEXT;'
      })
    });
    
    if (response.ok) {
      const result = await response.text();
      console.log('✅ Column addition response:', result);
    } else {
      console.log('❌ Column addition failed:', response.status, await response.text());
      
      // Try alternative API approach
      console.log('\n⚠️  Trying alternative internal API...');
      
      const altResponse = await fetch('http://localhost:5000/api/database/execute-sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sql: 'ALTER TABLE uploader_uploads ADD COLUMN IF NOT EXISTS processing_notes TEXT;',
          environment: 'production'
        })
      });
      
      if (altResponse.ok) {
        const altResult = await altResponse.text();
        console.log('✅ Alternative API response:', altResult);
      } else {
        console.log('❌ Alternative API failed:', altResponse.status, await altResponse.text());
      }
    }
    
  } catch (error) {
    console.log('❌ Failed to add column:', error.message);
  }
}

async function main() {
  console.log('🎯 FIXING MISSING PROCESSING_NOTES COLUMN');
  console.log('==========================================');
  console.log('🚨 Error: column "processing_notes" of relation "uploader_uploads" does not exist');
  console.log('✅ Solution: Add missing column to production table\n');
  
  await addProcessingNotesColumn();
  
  console.log('\n🎉 COLUMN FIX ATTEMPTED');
  console.log('✅ The processing_notes column should now exist in uploader_uploads');
  console.log('🔄 Try your upload again - the error should be resolved!');
}

// Make fetch available in Node.js environment
if (typeof fetch === 'undefined') {
  const { default: fetch } = await import('node-fetch');
  global.fetch = fetch;
}

main().catch(console.error);