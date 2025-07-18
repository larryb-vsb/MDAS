import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { eq, isNotNull, isNull } from "drizzle-orm";
import fs from "fs";
import path from "path";

/**
 * Migration script to convert file storage from disk to database
 * This migrates existing uploaded files to store content in the database
 */

export interface MigrationStats {
  totalFiles: number;
  migratedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  orphanedFiles: number;
  errors: string[];
}

export async function migrateFileStorageToDatabase(): Promise<MigrationStats> {
  console.log("Starting file storage migration to database...");
  
  const stats: MigrationStats = {
    totalFiles: 0,
    migratedFiles: 0,
    skippedFiles: 0,
    errorFiles: 0,
    orphanedFiles: 0,
    errors: []
  };

  try {
    // Get all uploaded files that haven't been migrated yet (no fileContent)
    const filesToMigrate = await db
      .select()
      .from(uploadedFiles)
      .where(isNull(uploadedFiles.fileContent));

    stats.totalFiles = filesToMigrate.length;
    console.log(`Found ${stats.totalFiles} files to migrate`);

    for (const file of filesToMigrate) {
      try {
        // Skip if already deleted
        if (file.deleted) {
          stats.skippedFiles++;
          continue;
        }

        // Check if file exists on disk
        if (!file.storagePath || !fs.existsSync(file.storagePath)) {
          // Mark as orphaned and delete the record
          await db
            .update(uploadedFiles)
            .set({ 
              deleted: true, 
              processingErrors: "File not found on disk during migration - marked as deleted" 
            })
            .where(eq(uploadedFiles.id, file.id));
          
          stats.orphanedFiles++;
          console.log(`Orphaned file marked as deleted: ${file.originalFilename}`);
          continue;
        }

        // Read file content from disk
        const fileBuffer = fs.readFileSync(file.storagePath);
        const fileContent = fileBuffer.toString('base64');
        const fileSize = fileBuffer.length;
        
        // Determine MIME type based on file extension
        const mimeType = file.originalFilename.toLowerCase().endsWith('.csv') 
          ? 'text/csv' 
          : 'application/octet-stream';

        // Update database record with file content
        await db
          .update(uploadedFiles)
          .set({
            fileContent: fileContent,
            fileSize: fileSize,
            mimeType: mimeType
          })
          .where(eq(uploadedFiles.id, file.id));

        stats.migratedFiles++;
        console.log(`Migrated: ${file.originalFilename} (${fileSize} bytes)`);

      } catch (error) {
        stats.errorFiles++;
        const errorMsg = `Failed to migrate ${file.originalFilename}: ${error}`;
        stats.errors.push(errorMsg);
        console.error(errorMsg);
        
        // Mark file as having migration error
        await db
          .update(uploadedFiles)
          .set({ 
            processingErrors: `Migration error: ${error}` 
          })
          .where(eq(uploadedFiles.id, file.id));
      }
    }

    console.log("Migration completed:", stats);
    return stats;

  } catch (error) {
    console.error("Migration failed:", error);
    stats.errors.push(`Migration failed: ${error}`);
    throw error;
  }
}

export async function verifyMigration(): Promise<void> {
  console.log("Verifying migration...");
  
  // Count files with and without content
  const totalFiles = await db
    .select({ count: db.$count() })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.deleted, false));

  const migratedFiles = await db
    .select({ count: db.$count() })
    .from(uploadedFiles)
    .where(isNotNull(uploadedFiles.fileContent));

  console.log(`Total active files: ${totalFiles[0]?.count || 0}`);
  console.log(`Migrated files: ${migratedFiles[0]?.count || 0}`);
  
  if (totalFiles[0]?.count === migratedFiles[0]?.count) {
    console.log("✅ Migration verification successful - all files migrated");
  } else {
    console.log("⚠️ Migration incomplete - some files still need migration");
  }
}