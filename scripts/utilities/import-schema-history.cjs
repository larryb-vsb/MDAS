#!/usr/bin/env node

/**
 * Schema History Import Script
 * 
 * This script imports the current schema.ts content into the database
 * for the View Schema functionality. This creates the "MMS-Master-Schema"
 * history record that provides complete schema access without file system dependency.
 */

const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Database connection
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function importSchemaHistory() {
  console.log('🔄 Starting Schema History Import...');
  
  try {
    // Read the current schema file
    const schemaPath = path.join(__dirname, 'shared', 'schema.ts');
    console.log(`📖 Reading schema from: ${schemaPath}`);
    
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const contentHash = crypto.createHash('sha256').update(schemaContent).digest('hex');
    
    console.log(`📊 Schema file size: ${schemaContent.length} characters`);
    console.log(`🔐 Content hash: ${contentHash.substring(0, 12)}...`);
    
    // Check if this exact content already exists
    const existingCheck = await pool.query(`
      SELECT id, version FROM schema_content 
      WHERE content_hash = $1
    `, [contentHash]);
    
    if (existingCheck.rows.length > 0) {
      console.log(`⚠️ Schema content with hash ${contentHash.substring(0, 12)}... already exists (version: ${existingCheck.rows[0].version})`);
      console.log('✅ No import needed - content is already stored');
      return;
    }
    
    // Get current schema version from the file header
    const versionMatch = schemaContent.match(/Version: ([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : '1.3.0';
    
    // Insert the schema content
    const result = await pool.query(`
      INSERT INTO schema_content (
        version, 
        content, 
        file_name, 
        stored_by, 
        content_hash, 
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, version, stored_at
    `, [
      version,
      schemaContent,
      'schema.ts',
      'Alex-ReplitAgent',
      contentHash,
      `MMS-Master-Schema import: Complete schema file content for version ${version} with ${schemaContent.length} characters`
    ]);
    
    const record = result.rows[0];
    console.log(`✅ Successfully imported schema content:`);
    console.log(`   - Record ID: ${record.id}`);
    console.log(`   - Version: ${record.version}`);
    console.log(`   - Stored at: ${record.stored_at}`);
    console.log(`   - Content size: ${schemaContent.length} characters`);
    
    // Verify the import
    const verifyQuery = await pool.query(`
      SELECT version, LENGTH(content) as content_length, stored_at 
      FROM schema_content 
      ORDER BY stored_at DESC 
      LIMIT 5
    `);
    
    console.log('\n📋 Schema Content History:');
    verifyQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. Version ${row.version} - ${row.content_length} chars (${row.stored_at})`);
    });
    
    console.log('\n🎉 Schema history import completed successfully!');
    console.log('🔗 The View button in Schema Version widget will now work without file system access');
    
  } catch (error) {
    console.error('❌ Error importing schema history:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the import
importSchemaHistory();