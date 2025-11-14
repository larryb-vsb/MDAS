// Fix for legacy files that don't have database content
import { Pool } from '@neondatabase/serverless';
import fs from 'fs';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

async function fixLegacyFileIssues() {
  console.log('=== FIXING LEGACY FILE ISSUES ===');
  console.log('Identifying and fixing files that still depend on storage paths\n');
  
  try {
    // Find files that have "File not found" errors or no content
    const result = await pool.query(`
      SELECT id, original_filename, storage_path, processed, processing_errors, 
             file_content IS NOT NULL as has_content,
             CASE 
               WHEN file_content IS NULL THEN 'NO_CONTENT'
               WHEN file_content LIKE 'MIGRATED_PLACEHOLDER_%' THEN 'PLACEHOLDER'
               ELSE 'REAL_CONTENT'
             END as content_status
      FROM uploaded_files 
      WHERE (processed = false OR processing_errors LIKE '%File not found%')
        AND deleted = false
      ORDER BY uploaded_at DESC 
      LIMIT 20
    `);
    
    console.log(`Found ${result.rows.length} files with potential issues:\n`);
    
    let fixedCount = 0;
    let errorCount = 0;
    let noFileCount = 0;
    
    for (const file of result.rows) {
      console.log(`📁 File: ${file.id} (${file.original_filename})`);
      console.log(`   Status: ${file.processed ? 'PROCESSED' : 'UNPROCESSED'}`);
      console.log(`   Content: ${file.content_status}`);
      console.log(`   Storage: ${file.storage_path}`);
      console.log(`   Error: ${file.processing_errors || 'None'}`);
      
      try {
        if (file.content_status === 'NO_CONTENT' || file.content_status === 'PLACEHOLDER') {
          // Try to read from storage path if it exists
          if (fs.existsSync(file.storage_path)) {
            console.log(`   ✅ Reading content from storage path...`);
            const fileContent = fs.readFileSync(file.storage_path, 'utf8');
            const base64Content = Buffer.from(fileContent).toString('base64');
            
            // Update database with content
            await pool.query(`
              UPDATE uploaded_files 
              SET file_content = $1,
                  processed = false,
                  processing_errors = NULL
              WHERE id = $2
            `, [base64Content, file.id]);
            
            console.log(`   ✅ Fixed: Added content to database (${fileContent.length} chars)`);
            fixedCount++;
          } else {
            console.log(`   ❌ Storage file missing, marking as permanently failed`);
            await pool.query(`
              UPDATE uploaded_files 
              SET processed = true,
                  processing_errors = 'File permanently unavailable: Original temporary file was removed by system cleanup. Please re-upload the file.'
              WHERE id = $2
            `, [file.id]);
            noFileCount++;
          }
        } else if (file.processing_errors && file.processing_errors.includes('File not found')) {
          // File has content but still has old error message, clear it
          console.log(`   🔧 Clearing old error message...`);
          await pool.query(`
            UPDATE uploaded_files 
            SET processed = false,
                processing_errors = NULL
            WHERE id = $1
          `, [file.id]);
          
          console.log(`   ✅ Cleared old error, file ready for reprocessing`);
          fixedCount++;
        } else {
          console.log(`   ℹ️  File appears to be in good state`);
        }
      } catch (fileError) {
        console.log(`   ❌ Error fixing file: ${fileError.message}`);
        errorCount++;
      }
      
      console.log('');
    }
    
    console.log(`📊 SUMMARY:`);
    console.log(`   Fixed: ${fixedCount} files`);
    console.log(`   Permanent failures: ${noFileCount} files`);
    console.log(`   Errors: ${errorCount} files`);
    
    if (fixedCount > 0) {
      console.log(`\n🎉 Successfully fixed ${fixedCount} files!`);
      console.log(`These files should now process correctly from database content.`);
    }
    
  } catch (error) {
    console.error('❌ Failed to fix legacy file issues:', error);
  } finally {
    await pool.end();
  }
}

fixLegacyFileIssues().catch(console.error);