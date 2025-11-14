// Fix files with placeholder content by finding and reading actual file content
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';

// Database setup
process.env.NEON_WS_CONSTRUCTOR = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fixPlaceholderContent() {
  console.log('=== FIXING PLACEHOLDER CONTENT ===\n');
  
  try {
    // Get files with placeholder content
    const result = await pool.query(`
      SELECT id, original_filename, storage_path, file_content
      FROM uploaded_files 
      WHERE file_content LIKE 'MIGRATED_PLACEHOLDER_%'
      LIMIT 5
    `);
    
    console.log(`Found ${result.rows.length} files with placeholder content`);
    
    for (const file of result.rows) {
      console.log(`\nProcessing: ${file.id} (${file.original_filename})`);
      console.log(`Storage path: ${file.storage_path}`);
      
      // Check if file exists at storage path
      if (fs.existsSync(file.storage_path)) {
        console.log(`✅ File exists at storage path`);
        
        // Read actual content
        const actualContent = fs.readFileSync(file.storage_path, 'utf8');
        const base64Content = Buffer.from(actualContent).toString('base64');
        
        console.log(`Content length: ${actualContent.length} characters`);
        console.log(`First 100 chars: ${actualContent.substring(0, 100)}...`);
        
        // Update database with actual content
        await pool.query(`
          UPDATE uploaded_files 
          SET file_content = $1
          WHERE id = $2
        `, [base64Content, file.id]);
        
        console.log(`✅ Updated database with actual content`);
      } else {
        console.log(`❌ File does not exist at storage path`);
        
        // Check if there's a similar file in tmp_uploads
        const tmpFiles = fs.readdirSync('tmp_uploads/');
        const matchingFile = tmpFiles.find(f => f.includes(file.id.split('_')[1]));
        
        if (matchingFile) {
          const tmpPath = path.join('tmp_uploads', matchingFile);
          console.log(`Found potential match in tmp_uploads: ${tmpPath}`);
          
          const actualContent = fs.readFileSync(tmpPath, 'utf8');
          const base64Content = Buffer.from(actualContent).toString('base64');
          
          console.log(`Content length: ${actualContent.length} characters`);
          console.log(`First 100 chars: ${actualContent.substring(0, 100)}...`);
          
          // Update database with actual content
          await pool.query(`
            UPDATE uploaded_files 
            SET file_content = $1
            WHERE id = $2
          `, [base64Content, file.id]);
          
          console.log(`✅ Updated database with content from tmp_uploads`);
        } else {
          console.log(`❌ No matching file found in tmp_uploads`);
        }
      }
    }
    
    console.log('\n=== PLACEHOLDER CONTENT FIX COMPLETE ===');
    
  } catch (error) {
    console.error('Error fixing placeholder content:', error);
  } finally {
    await pool.end();
  }
}

fixPlaceholderContent();