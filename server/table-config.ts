// Table configuration for environment separation
import { getEnvironment } from './env-config';

const { NODE_ENV } = getEnvironment();

// Table name prefix for environment separation
const TABLE_PREFIX = NODE_ENV === 'development' ? 'dev_' : '';

// Function to get environment-specific table name
export function getTableName(baseName: string): string {
  return `${TABLE_PREFIX}${baseName}`;
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

console.log(`[TABLE CONFIG] ${NODE_ENV} mode - Table prefix: "${TABLE_PREFIX}"`);
console.log(`[TABLE CONFIG] Merchants table: ${TABLE_NAMES.merchants}`);
console.log(`[TABLE CONFIG] Transactions table: ${TABLE_NAMES.transactions}`);