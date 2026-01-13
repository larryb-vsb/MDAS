#!/usr/bin/env node

/**
 * PRODUCTION DATABASE FIX SCRIPT
 * 
 * ISSUE: Production uploader tables don't exist, causing upload failures
 * SOLUTION: Create missing production tables using proper Drizzle schema
 * 
 * This script ensures production database has all required uploader tables
 * with correct schema matching the development environment.
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';

// Use production database connection (same database, different tables)
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ ERROR: No database URL found in environment');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

async function main() {
  try {
    console.log('🔧 PRODUCTION DATABASE FIX');
    console.log('==========================');
    console.log('🎯 Creating missing production uploader tables\n');
    
    // Step 1: Check existing tables
    console.log('📊 CHECKING EXISTING TABLES:\n');
    
    const existingTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (table_name LIKE '%uploader%' OR table_name LIKE '%upload%')
      ORDER BY table_name
    `);
    
    console.log('Found tables:');
    existingTables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Step 2: Create production uploader_uploads table
    console.log('\n🛠️ CREATING PRODUCTION UPLOADER TABLES:\n');
    
    const createUploaderUploadsTable = `
    CREATE TABLE IF NOT EXISTS uploader_uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_size INTEGER,
      
      -- Comprehensive Status Date Tracking
      upload_start TIMESTAMP,
      upload_complete TIMESTAMP,
      uploaded_line_count INTEGER,
      identify_start TIMESTAMP,
      identify_complete TIMESTAMP,
      encoding_start TIMESTAMP,
      encoding_complete TIMESTAMP,
      encoded_lines INTEGER,
      
      -- Phase 1: Started
      start_time TIMESTAMP DEFAULT NOW() NOT NULL,
      
      -- Phase 2: Uploading
      upload_started_at TIMESTAMP,
      upload_progress INTEGER DEFAULT 0,
      chunked_upload BOOLEAN DEFAULT FALSE,
      chunk_count INTEGER,
      chunks_uploaded INTEGER DEFAULT 0,
      
      -- Phase 3: Uploaded
      uploaded_at TIMESTAMP,
      storage_path TEXT,
      s3_bucket TEXT,
      s3_key TEXT,
      s3_url TEXT,
      s3_etag TEXT,
      upload_status TEXT DEFAULT 'started' NOT NULL,
      
      -- Phase 4: Identified
      identified_at TIMESTAMP,
      detected_file_type TEXT,
      user_classified_type TEXT,
      final_file_type TEXT,
      line_count INTEGER,
      data_size INTEGER,
      has_headers BOOLEAN,
      file_format TEXT,
      
      -- Phase 5: Encoding
      encoding_started_at TIMESTAMP,
      encoding_completed_at TIMESTAMP,
      encoding_time_ms INTEGER,
      encoding_status TEXT,
      json_records_created INTEGER,
      tddf_records_created INTEGER,
      field_separation_strategy TEXT,
      encoding_errors JSONB,
      health_metadata JSONB,
      
      -- Metadata and error handling
      compression_used TEXT,
      encoding_detected TEXT,
      validation_errors JSONB,
      processing_notes TEXT,
      
      -- System tracking
      created_by TEXT,
      server_id TEXT,
      session_id TEXT,
      
      -- Review mode control
      keep_for_review BOOLEAN DEFAULT FALSE,
      
      -- Current processing state
      current_phase TEXT DEFAULT 'started' NOT NULL,
      last_updated TIMESTAMP DEFAULT NOW() NOT NULL
    );`;
    
    await pool.query(createUploaderUploadsTable);
    console.log('✅ Created uploader_uploads table');
    
    // Step 3: Create indexes for performance
    console.log('\n📊 CREATING INDEXES:\n');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS uploader_uploads_current_phase_idx ON uploader_uploads(current_phase);',
      'CREATE INDEX IF NOT EXISTS uploader_uploads_upload_status_idx ON uploader_uploads(upload_status);',
      'CREATE INDEX IF NOT EXISTS uploader_uploads_start_time_idx ON uploader_uploads(start_time);',
      'CREATE INDEX IF NOT EXISTS uploader_uploads_filename_idx ON uploader_uploads(filename);',
      'CREATE INDEX IF NOT EXISTS uploader_uploads_created_by_idx ON uploader_uploads(created_by);',
      'CREATE INDEX IF NOT EXISTS uploader_uploads_final_file_type_idx ON uploader_uploads(final_file_type);'
    ];
    
    for (const indexQuery of indexes) {
      await pool.query(indexQuery);
      const indexName = indexQuery.match(/INDEX IF NOT EXISTS (\w+)/)[1];
      console.log(`✅ Created index: ${indexName}`);
    }
    
    // Step 4: Create supporting tables
    console.log('\n📋 CREATING SUPPORTING TABLES:\n');
    
    const createUploaderJsonTable = `
    CREATE TABLE IF NOT EXISTS uploader_json (
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL REFERENCES uploader_uploads(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      raw_line_data TEXT NOT NULL,
      processed_json JSONB,
      field_separation_data JSONB,
      processing_time_ms INTEGER,
      errors JSONB,
      source_file_name TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      processed_at TIMESTAMP
    );`;
    
    await pool.query(createUploaderJsonTable);
    console.log('✅ Created uploader_json table');
    
    const createUploaderTddfTable = `
    CREATE TABLE IF NOT EXISTS uploader_tddf_jsonb_records (
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL REFERENCES uploader_uploads(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      record_data JSONB NOT NULL,
      processing_status TEXT DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      processed_at TIMESTAMP
    );`;
    
    await pool.query(createUploaderTddfTable);
    console.log('✅ Created uploader_tddf_jsonb_records table');
    
    // Step 5: Reset any stuck processing locks
    console.log('\n🔧 RESETTING STUCK PROCESSING LOCKS:\n');
    
    const resetLocks = await pool.query(`
      UPDATE uploader_uploads 
      SET 
        current_phase = 'uploaded',
        upload_status = 'uploaded',
        server_id = NULL,
        last_updated = NOW()
      WHERE current_phase = 'processing' 
        AND (start_time < NOW() - INTERVAL '5 minutes')
      RETURNING id, filename
    `);
    
    if (resetLocks.rows.length > 0) {
      console.log(`🔧 Reset ${resetLocks.rows.length} stuck processing locks:`);
      resetLocks.rows.forEach(row => {
        console.log(`   - ${row.filename} (${row.id})`);
      });
    } else {
      console.log('✅ No stuck processing locks found');
    }
    
    // Step 6: Verify final status
    console.log('\n📋 FINAL VERIFICATION:\n');
    
    const finalTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('uploader_uploads', 'uploader_json', 'uploader_tddf_jsonb_records')
      ORDER BY table_name
    `);
    
    console.log('Production uploader tables confirmed:');
    finalTables.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });
    
    const recordCount = await pool.query('SELECT COUNT(*) as count FROM uploader_uploads');
    console.log(`\n📊 Current records in uploader_uploads: ${recordCount.rows[0].count}`);
    
    console.log('\n🎉 PRODUCTION DATABASE FIX COMPLETE!');
    console.log('✨ Production uploader system ready for file uploads');
    console.log('🔄 Switch to production environment to test uploads');
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR during production database fix:', error.message);
    console.error('Stack trace:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);