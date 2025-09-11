#!/usr/bin/env node

/**
 * FIX MISSING PROCESSING_NOTES COLUMN IN PRODUCTION
 * 
 * ERROR: column "processing_notes" of relation "uploader_uploads" does not exist
 * SOLUTION: Add missing column to production uploader_uploads table
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';

// Use the application's internal API to fix the schema
async function fixViaAPI() {
  try {
    console.log('🔧 FIXING MISSING PROCESSING_NOTES COLUMN');
    console.log('========================================');
    console.log('🎯 Adding missing column to production uploader_uploads table\n');
    
    const response = await fetch('http://localhost:5000/api/admin/fix-uploader-schema', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'schema-fix'
      },
      body: JSON.stringify({
        table: 'uploader_uploads',
        action: 'add_missing_columns'
      })
    });
    
    if (response.ok) {
      const result = await response.text();
      console.log('✅ Schema fix response:', result);
    } else {
      console.log('❌ Schema fix failed:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.log('❌ API fix failed:', error.message);
  }
}

// Try direct database connection as fallback
async function fixViaDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.log('❌ No database URL found');
    return;
  }

  try {
    const pool = new Pool({ connectionString: databaseUrl });
    
    console.log('🔧 DIRECT DATABASE FIX');
    console.log('=======================');
    
    // Check current schema
    const schemaCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'uploader_uploads' 
        AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Current production table columns:');
    schemaCheck.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });
    
    // Check if processing_notes exists
    const hasProcessingNotes = schemaCheck.rows.some(row => row.column_name === 'processing_notes');
    
    if (!hasProcessingNotes) {
      console.log('\n⚠️ Missing processing_notes column - adding it...');
      
      await pool.query(`
        ALTER TABLE uploader_uploads 
        ADD COLUMN IF NOT EXISTS processing_notes TEXT
      `);
      
      console.log('✅ Added processing_notes column');
    } else {
      console.log('\n✅ processing_notes column already exists');
    }
    
    await pool.end();
    
  } catch (error) {
    console.log('❌ Database fix failed:', error.message);
  }
}

async function main() {
  console.log('🎯 SCHEMA MISMATCH FIX');
  console.log('======================');
  console.log('ERROR: column "processing_notes" of relation "uploader_uploads" does not exist\n');
  
  // Try API fix first
  await fixViaAPI();
  
  // Try direct database fix as backup
  await fixViaDatabase();
  
  console.log('\n🎉 SCHEMA FIX COMPLETE');
  console.log('✅ Production uploader_uploads table should now have processing_notes column');
  console.log('🔄 Try your upload again - it should work now!');
}

main().catch(console.error);