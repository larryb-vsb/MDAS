/**
 * File system utilities
 */
import fs from 'fs';
import path from 'path';
import { getFilePath } from '../env-config';

/**
 * Ensures that the directory exists, creates it if it doesn't
 * @param dirPath Directory path to ensure
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Ensures that all environment-specific application directories exist
 */
export function ensureAppDirectories(): void {
  // Make sure base directories exist
  ensureDirectoryExists(path.join(process.cwd(), 'backups'));
  ensureDirectoryExists(path.join(process.cwd(), 'tmp_uploads'));
  
  // Ensure environment-specific directories exist
  ensureDirectoryExists(getFilePath('uploads'));
  ensureDirectoryExists(getFilePath('backups'));
}

/**
 * Gets the complete file path for a file in the environment-specific directory
 * @param type Type of storage ('uploads' or 'backups')
 * @param filename Filename to use
 * @returns Full file path
 */
export function getEnvFilePath(type: 'uploads' | 'backups', filename: string): string {
  return getFilePath(type, filename);
}