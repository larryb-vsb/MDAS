/**
 * Environment configuration
 * Centralized place for environment-specific settings
 */

// Determine the current environment  
// Back to development mode
export const NODE_ENV = 'development';
export const isProd = NODE_ENV === 'production';
export const isDev = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';

// Export environment getter function for table-config
export function getEnvironment() {
  return { NODE_ENV, isProd, isDev, isTest };
}

console.log(`[ENV CONFIG] NODE_ENV from process.env: ${process.env.NODE_ENV}`);
console.log(`[ENV CONFIG] Final NODE_ENV: ${NODE_ENV}, isProd: ${isProd}, isDev: ${isDev}`);

// Set development mode 
process.env.NODE_ENV = 'development';

// IMPLEMENTING TABLE-LEVEL DATABASE SEPARATION  
// Use same database with dev_ table prefixes for complete separation
console.log(`[DB CONFIG] ${NODE_ENV} mode: Using table-level separation`);
if (NODE_ENV === 'development') {
  console.log(`[DB CONFIG] Development tables: dev_merchants, dev_transactions, etc.`);
} else {
  console.log(`[DB CONFIG] Production tables: merchants, transactions, etc.`);
}

// Base paths for file storage
const BASE_UPLOAD_PATH = isProd ? './data/uploads' : './tmp_uploads';
const BASE_BACKUP_PATH = isProd ? './data/backups' : './backups';

// TABLE-LEVEL separation: Use same database with different table prefixes
export function getDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || '';
  if (!baseUrl) return '';
  
  console.log(`[DB CONFIG] NODE_ENV: ${NODE_ENV}, isProd: ${isProd}, isDev: ${isDev}`);
  console.log(`[DB CONFIG] Base URL: ${baseUrl.substring(0, 80)}...`);
  
  // IMPORTANT: Use same database for both environments
  // Separation is achieved through table prefixes (dev_merchants vs merchants)
  console.log(`[DB CONFIG] Using table-level separation - same database, different table prefixes`);
  console.log(`[DB CONFIG] ${NODE_ENV} tables: ${isDev ? 'dev_*' : 'main'} tables`);
  
  return baseUrl;
}

// Environment-specific configuration
export const config = {
  // Database connection
  database: {
    url: getDatabaseUrl(),
    useEnvVars: true,
    // Keep original URL for reference
    originalUrl: process.env.DATABASE_URL
  },
  
  // File storage paths
  paths: {
    uploads: BASE_UPLOAD_PATH,
    backups: BASE_BACKUP_PATH,
    // Ensure paths end with trailing slash for consistency
    uploadsDir: BASE_UPLOAD_PATH.endsWith('/') ? BASE_UPLOAD_PATH : `${BASE_UPLOAD_PATH}/`,
    backupsDir: BASE_BACKUP_PATH.endsWith('/') ? BASE_BACKUP_PATH : `${BASE_BACKUP_PATH}/`,
  },
  
  // Other environment settings
  app: {
    port: parseInt(process.env.PORT || '5000', 10),
    logLevel: isProd ? 'info' : 'debug',
    sessionSecret: process.env.SESSION_SECRET || 'default-dev-session-secret'
  }
};

/**
 * Create environment-specific directory paths
 * @param basePath Base directory path
 * @returns Path with environment prefix
 */
export function getEnvPath(basePath: string): string {
  const envPrefix = isProd ? 'prod' : isDev ? 'dev' : 'test';
  // Ensure path ends with trailing slash
  const normalizedPath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${normalizedPath}${envPrefix}/`;
}

/**
 * Get the appropriate file path for the current environment
 * @param type Type of file storage ('uploads' or 'backups')
 * @param filename Optional filename to append to the path
 * @returns The complete file path
 */
export function getFilePath(type: 'uploads' | 'backups', filename?: string): string {
  const basePath = type === 'uploads' ? config.paths.uploadsDir : config.paths.backupsDir;
  const envPath = getEnvPath(basePath);
  
  return filename ? `${envPath}${filename}` : envPath;
}