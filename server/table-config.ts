// Table configuration for environment separation
import { getEnvironment, getUploadEnvironment } from './env-config';

const { NODE_ENV } = getEnvironment();

// Environment-aware table prefix
// Development: dev_ prefix, Production: no prefix
const TABLE_PREFIX = NODE_ENV === 'production' ? '' : 'dev_';

// Function to get environment-specific table name
export function getTableName(baseName: string): string {
  return `${TABLE_PREFIX}${baseName}`;
}

// Function to get environment prefix for SQL queries
export function getEnvironmentPrefix(): string {
  return TABLE_PREFIX;
}

// Environment-specific table names
export const TABLE_NAMES = {
  merchants: getTableName('merchants'),
  transactions: getTableName('transactions'),
  users: getTableName('users'),
  uploaded_files: getTableName('uploaded_files'),
  audit_logs: getTableName('audit_logs'),
  system_logs: getTableName('system_logs'),
  security_logs: getTableName('security_logs'),
  backups: getTableName('backups'),
  backup_schedules: getTableName('backup_schedules'),
  session: getTableName('session')
};

// Upload-specific table configuration (respects production override)
export function getUploadTableName(baseName: string): string {
  const uploadEnv = getUploadEnvironment();
  const uploadPrefix = uploadEnv.isProd ? '' : 'dev_';
  return `${uploadPrefix}${baseName}`;
}

// Upload-specific table names
export const UPLOAD_TABLE_NAMES = {
  uploader_uploads: () => getUploadTableName('uploader_uploads'),
  uploaded_files: () => getUploadTableName('uploaded_files')
};

// Storage prefix for uploads (respects production override)
export function getUploadStoragePrefix(): string {
  const uploadEnv = getUploadEnvironment();
  return uploadEnv.isProd ? 'prod-uploader' : 'dev-uploader';
}

console.log(`[TABLE CONFIG] ${NODE_ENV} mode - Table prefix: "${TABLE_PREFIX}"`);
console.log(`[TABLE CONFIG] Merchants table: ${TABLE_NAMES.merchants}`);
console.log(`[TABLE CONFIG] Transactions table: ${TABLE_NAMES.transactions}`);