// Simple Node.js script to migrate all file content
import fs from 'fs';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateAllFiles() {
  try {
    console.log('Starting file content migration...');
    
    // Get all files without content
    const result = await pool.query(`
      SELECT id, original_filename, storage_path, file_content IS NULL as missing_content
      FROM uploaded_files 
      WHERE deleted = false
      ORDER BY uploaded_at DESC
    `);
    const files = result.rows;
    
    console.log(`Found ${files.length} files to process`);
    
    let migratedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    for (const file of files) {
      try {
        if (!file.missing_content) {
          skippedCount++;
          continue;
        }
        
        console.log(`Processing ${file.id} - ${file.original_filename}`);
        
        if (!fs.existsSync(file.storage_path)) {
          console.log(`File not found: ${file.storage_path}`);
          // Set empty content for missing files
          await pool.query(`
            UPDATE uploaded_files 
            SET file_content = $1,
                file_size = $2,
                mime_type = $3
            WHERE id = $4
          `, ['FILE_NOT_FOUND', 0, 'text/csv', file.id]);
          errorCount++;
          continue;
        }
        
        // Read file content
        const fileContent = fs.readFileSync(file.storage_path);
        const base64Content = fileContent.toString('base64');
        const fileSize = fileContent.length;
        
        // Update database
        await pool.query(`
          UPDATE uploaded_files 
          SET file_content = $1,
              file_size = $2,
              mime_type = $3
          WHERE id = $4
        `, [base64Content, fileSize, 'text/csv', file.id]);
        
        console.log(`✓ Migrated ${file.id} (${fileSize} bytes)`);
        migratedCount++;
        
      } catch (error) {
        console.error(`✗ Error processing ${file.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Already had content: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Total files: ${files.length}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrateAllFiles().then(() => {
  console.log('Migration script completed');
  process.exit(0);
}).catch(error => {
  console.error('Script error:', error);
  process.exit(1);
});