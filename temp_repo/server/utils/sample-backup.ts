/**
 * Utility to generate a sample backup file
 * This can be used to create a minimal valid backup file for restore operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getFilePath } from '../env-config';

/**
 * Generate a sample backup file with minimum required structure
 * @returns Path to the created backup file
 */
export function generateSampleBackup(): string {
  // Create a sample backup structure
  const backup = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: "development",
    tables: {
      users: [
        {
          id: 1,
          username: "admin",
          password: "JGFkbWluMTIzJA==", // base64 encoded "admin123"
          email: "admin@example.com",
          role: "admin",
          created_at: new Date().toISOString(),
          last_login: null
        }
      ],
      merchants: [],
      transactions: [],
      uploaded_files: [],
      backup_history: [],
      backup_schedules: [],
      schema_versions: [
        {
          id: uuidv4(),
          version: "1.0.0",
          changes: "Initial schema",
          applied_at: new Date().toISOString(),
          description: "Generated sample backup"
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
  const backupFilePath = path.join(backupDir, `sample_backup_${timestamp}.json`);
  
  // Write the backup file
  fs.writeFileSync(backupFilePath, JSON.stringify(backup, null, 2), 'utf8');
  
  return backupFilePath;
}