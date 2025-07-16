import { db } from "../db";
import { 
  merchants, 
  transactions, 
  backupHistory, 
  backupSchedules, 
  uploadedFiles, 
  schemaVersions 
} from "@shared/schema";
import { CURRENT_SCHEMA_VERSION } from "../schema_version";

/**
 * Creates a complete backup of the database tables
 * @returns A JSON-serializable object containing all database tables
 */
export async function createBackupData() {
  // Fetch data from all tables
  const merchantsData = await db.select().from(merchants);
  const transactionsData = await db.select().from(transactions);
  const uploadedFilesData = await db.select().from(uploadedFiles);
  const backupHistoryData = await db.select().from(backupHistory);
  const backupSchedulesData = await db.select().from(backupSchedules);
  const schemaVersionsData = await db.select().from(schemaVersions);
  
  // Create metadata with schema version and timestamp
  const metadata = {
    timestamp: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tables: [
      "merchants",
      "transactions", 
      "uploadedFiles",
      "backupHistory",
      "backupSchedules",
      "schemaVersions"
    ],
    counts: {
      merchants: merchantsData.length,
      transactions: transactionsData.length,
      uploadedFiles: uploadedFilesData.length,
      backupHistory: backupHistoryData.length,
      backupSchedules: backupSchedulesData.length,
      schemaVersions: schemaVersionsData.length
    }
  };
  
  // Combine all data into a single object
  return {
    metadata,
    data: {
      merchants: merchantsData,
      transactions: transactionsData,
      uploadedFiles: uploadedFilesData,
      backupHistory: backupHistoryData,
      backupSchedules: backupSchedulesData,
      schemaVersions: schemaVersionsData
    }
  };
}