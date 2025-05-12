import { db } from "../db";
import {
  merchants,
  transactions,
  uploadedFiles,
  backupHistory,
  backupSchedules,
  schemaVersions,
  users
} from "@shared/schema";

/**
 * Create a complete backup of all database tables
 * 
 * @returns Object containing all database data
 */
export async function createBackupData() {
  try {
    // Get all data from each table
    const merchantsData = await db.select().from(merchants);
    const transactionsData = await db.select().from(transactions);
    const uploadedFilesData = await db.select().from(uploadedFiles);
    const backupHistoryData = await db.select().from(backupHistory);
    const backupSchedulesData = await db.select().from(backupSchedules);
    const schemaVersionsData = await db.select().from(schemaVersions);
    const usersData = await db.select().from(users);
    
    // Create metadata for the backup
    const metadata = {
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      tables: [
        "merchants",
        "transactions",
        "uploaded_files",
        "backup_history",
        "backup_schedules",
        "schema_versions",
        "users"
      ]
    };
    
    // Assemble the complete backup object
    const backupData = {
      metadata,
      data: {
        merchants: merchantsData,
        transactions: transactionsData,
        uploadedFiles: uploadedFilesData,
        backupHistory: backupHistoryData,
        backupSchedules: backupSchedulesData,
        schemaVersions: schemaVersionsData,
        users: usersData
      }
    };
    
    return backupData;
  } catch (error) {
    console.error("Error creating backup data:", error);
    throw error;
  }
}