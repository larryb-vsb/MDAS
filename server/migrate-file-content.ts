import { db } from "./db";
import { uploadedFiles as uploadedFilesTable } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

export async function migrateFileContent() {
  try {
    console.log('Starting file content migration...');
    
    // Get all files that don't have content
    const files = await db.select()
      .from(uploadedFilesTable)
      .where(eq(uploadedFilesTable.deleted, false));
    
    console.log(`Found ${files.length} files to check`);
    
    let migratedCount = 0;
    let errorCount = 0;
    let alreadyMigrated = 0;
    
    for (const file of files) {
      try {
        // Check if file already has content
        const contentCheck = await db.execute(sql`
          SELECT file_content IS NOT NULL as has_content 
          FROM uploaded_files 
          WHERE id = ${file.id}
        `);
        
        if (contentCheck.rows[0]?.has_content) {
          alreadyMigrated++;
          continue;
        }
        
        console.log(`Migrating file: ${file.id} - ${file.originalFilename}`);
        
        // Check if file exists
        if (!fs.existsSync(file.storagePath)) {
          console.log(`File not found: ${file.storagePath}`);
          // Set placeholder content for missing files
          await db.execute(sql`
            UPDATE uploaded_files 
            SET file_content = ${'MISSING_FILE_PLACEHOLDER'},
                file_size = ${0},
                mime_type = 'text/csv'
            WHERE id = ${file.id}
          `);
          errorCount++;
          continue;
        }
        
        // Read and encode file content
        const fileContent = fs.readFileSync(file.storagePath);
        const base64Content = fileContent.toString('base64');
        const fileSize = fileContent.length;
        
        // Update database
        await db.execute(sql`
          UPDATE uploaded_files 
          SET file_content = ${base64Content},
              file_size = ${fileSize},
              mime_type = 'text/csv'
          WHERE id = ${file.id}
        `);
        
        console.log(`✓ Migrated ${file.id} (${fileSize} bytes)`);
        migratedCount++;
        
      } catch (error) {
        console.error(`✗ Error migrating ${file.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`\nMigration complete:`);
    console.log(`- Successfully migrated: ${migratedCount}`);
    console.log(`- Already migrated: ${alreadyMigrated}`);
    console.log(`- Errors: ${errorCount}`);
    
    return {
      migratedCount,
      alreadyMigrated,
      errorCount,
      totalFiles: files.length
    };
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === new URL(import.meta.resolve('./')).href + 'migrate-file-content.ts') {
  migrateFileContent().then(result => {
    console.log('Migration result:', result);
    process.exit(0);
  }).catch(error => {
    console.error('Migration error:', error);
    process.exit(1);
  });
}