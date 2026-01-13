import fs from 'fs';
import path from 'path';
import { batchPool } from './db.js';

// Database connection - use properly configured environment-specific pool
const pool = batchPool;

async function importFileContent() {
  try {
    console.log('Starting file content import...');
    
    // Get all files that don't have content in database
    const client = await pool.connect();
    const filesQuery = `
      SELECT id, original_filename, storage_path, file_content IS NULL as missing_content
      FROM uploaded_files 
      WHERE deleted = false AND file_content IS NULL
      ORDER BY uploaded_at DESC
    `;
    
    const result = await client.query(filesQuery);
    const files = result.rows;
    
    console.log(`Found ${files.length} files without database content`);
    
    let importedCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.id} - ${file.original_filename}`);
        
        // Check if file exists on disk
        if (!fs.existsSync(file.storage_path)) {
          console.log(`File not found on disk: ${file.storage_path}`);
          continue;
        }
        
        // Read file content
        const fileContent = fs.readFileSync(file.storage_path);
        const base64Content = fileContent.toString('base64');
        const fileSize = fileContent.length;
        
        // Update database with content
        const updateQuery = `
          UPDATE uploaded_files 
          SET file_content = $1,
              file_size = $2,
              mime_type = 'text/csv'
          WHERE id = $3
        `;
        
        await client.query(updateQuery, [base64Content, fileSize, file.id]);
        
        console.log(`✓ Imported content for ${file.id} (${fileSize} bytes)`);
        importedCount++;
        
      } catch (error) {
        console.error(`✗ Error importing ${file.id}:`, error.message);
        errorCount++;
      }
    }
    
    client.release();
    
    console.log(`\nImport complete!`);
    console.log(`- Successfully imported: ${importedCount} files`);
    console.log(`- Errors: ${errorCount} files`);
    
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importFileContent().then(() => {
  console.log('File content import finished');
  process.exit(0);
});