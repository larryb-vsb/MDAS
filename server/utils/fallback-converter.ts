/**
 * Utility to convert in-memory fallback data to the actual database
 * This allows converting data from fallback mode to the real database
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getFilePath } from '../env-config';
import { storage } from '../storage';
import { pool, db } from '../db';
import { restoreBackupToEnvironment } from '../restore-env-backup';

/**
 * Convert the in-memory fallback data to a live database
 * @returns Success status and any error message
 */
export async function convertFallbackToDatabase(): Promise<{ success: boolean; message: string; needsRestart?: boolean }> {
  try {
    // Check if we're actually in fallback mode
    // We need to make sure the storage is correctly identified as fallback storage
    const isFallbackMode = 
      (storage as any).isFallbackStorage === true || 
      (storage && (storage.constructor.name === 'MemStorageFallback'));
    
    if (!isFallbackMode) {
      return { 
        success: false, 
        message: "Not running in fallback mode - no conversion necessary." 
      };
    }

    // Generate a backup file from the in-memory data
    const backupFilePath = await generateBackupFromMemory();
    
    if (!backupFilePath) {
      return { 
        success: false, 
        message: "Failed to generate backup from in-memory data." 
      };
    }

    // Try to restore the backup to the environment-specific database
    const restored = await restoreBackupToEnvironment(backupFilePath);
    
    if (!restored) {
      return { 
        success: false, 
        message: "Failed to restore backup to database. Database might be unavailable or corrupted." 
      };
    }

    return { 
      success: true, 
      message: "Successfully converted in-memory data to database. Application will restart.",
      needsRestart: true 
    };
  } catch (error) {
    console.error("Error converting fallback to database:", error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : "An unknown error occurred during conversion." 
    };
  }
}

/**
 * Generate a backup file from the in-memory data
 * @returns Path to the created backup file or null if failed
 */
async function generateBackupFromMemory(): Promise<string | null> {
  try {
    console.log("Generating backup from memory storage");
    
    // Get all data from in-memory storage using the IStorage interface
    const users = await storage.getUsers();
    console.log(`Retrieved ${users.length} users`);
    
    // Get all merchants with a high limit to effectively get all
    const merchantsResponse = await storage.getMerchants(1, 10000);
    const merchants = merchantsResponse.merchants || [];
    console.log(`Retrieved ${merchants.length} merchants`);
    
    // Get all transactions for each merchant
    let allTransactions: any[] = [];
    for (const merchant of merchants) {
      // Get transactions with a high limit to effectively get all
      const transactionResponse = await storage.getTransactions(1, 10000, merchant.id);
      if (transactionResponse && transactionResponse.transactions) {
        allTransactions = [...allTransactions, ...transactionResponse.transactions];
      }
    }
    console.log(`Retrieved ${allTransactions.length} transactions`);
    
    // Uploaded files are not accessible directly through interface,
    // so we'll create an empty array
    const uploadedFiles: any[] = [];
    
    // Create a backup structure
    const backup = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      tables: {
        users: users,
        merchants: merchants,
        transactions: allTransactions,
        uploaded_files: uploadedFiles,
        backup_history: [],
        backup_schedules: [],
        schema_versions: [
          {
            id: uuidv4(),
            version: "1.0.0",
            changes: "Converted from in-memory storage",
            applied_at: new Date().toISOString(),
            description: "Backup created from in-memory storage"
          }
        ]
      }
    };
    
    // Generate the backup file
    const backupDir = getFilePath('backups');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const backupFilePath = path.join(backupDir, `memory_conversion_${timestamp}.json`);
    
    // Write the backup file
    fs.writeFileSync(backupFilePath, JSON.stringify(backup, null, 2), 'utf8');
    
    return backupFilePath;
  } catch (error) {
    console.error("Error generating backup from memory:", error);
    return null;
  }
}