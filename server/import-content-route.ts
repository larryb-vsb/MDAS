import { Express } from "express";
import { db } from "./db";
import { uploadedFiles as uploadedFilesTable } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";
import fs from "fs";

export function addContentImportRoute(app: Express) {
  // Import all file content to database
  app.post("/api/import-file-content", async (req, res) => {
    try {
      console.log('Starting file content import...');
      
      // Get all files that don't have content in database
      const files = await db.select()
        .from(uploadedFilesTable)
        .where(eq(uploadedFilesTable.deleted, false));
      
      console.log(`Found ${files.length} files to check`);
      
      let importedCount = 0;
      let errorCount = 0;
      let alreadyImported = 0;
      
      for (const file of files) {
        try {
          // Check if file already has content via raw SQL
          const contentCheck = await db.execute(sql`
            SELECT file_content IS NOT NULL as has_content 
            FROM uploaded_files 
            WHERE id = ${file.id}
          `);
          
          if (contentCheck.rows[0]?.has_content) {
            alreadyImported++;
            continue;
          }
          
          console.log(`Processing file: ${file.id} - ${file.originalFilename}`);
          
          // Check if file exists on disk
          if (!fs.existsSync(file.storagePath)) {
            console.log(`File not found on disk: ${file.storagePath}`);
            continue;
          }
          
          // Read file content
          const fileContent = fs.readFileSync(file.storagePath);
          const base64Content = fileContent.toString('base64');
          const fileSize = fileContent.length;
          
          // Update database with content
          await db.execute(sql`
            UPDATE uploaded_files 
            SET file_content = ${base64Content},
                file_size = ${fileSize},
                mime_type = 'text/csv'
            WHERE id = ${file.id}
          `);
          
          console.log(`✓ Imported content for ${file.id} (${fileSize} bytes)`);
          importedCount++;
          
        } catch (error) {
          console.error(`✗ Error importing ${file.id}:`, error instanceof Error ? error.message : error);
          errorCount++;
        }
      }
      
      const summary = {
        totalFiles: files.length,
        alreadyImported,
        successfullyImported: importedCount,
        errors: errorCount,
        message: `Import complete! Successfully imported: ${importedCount} files, Already had content: ${alreadyImported}, Errors: ${errorCount}`
      };
      
      console.log(summary.message);
      res.json(summary);
      
    } catch (error) {
      console.error('Import failed:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Import failed"
      });
    }
  });
}