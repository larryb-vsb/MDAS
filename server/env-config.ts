/**
 * Environment configuration
 * Centralized place for environment-specific settings
 */

// Determine the current environment
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const isProd = NODE_ENV === 'production';
export const isDev = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';

// Base paths for file storage
const BASE_UPLOAD_PATH = isProd ? '/data/uploads' : './tmp_uploads';
const BASE_BACKUP_PATH = isProd ? '/data/backups' : './backups';

// Environment-specific configuration
export const config = {
  // Database connection
  database: {
    url: process.env.DATABASE_URL,
    useEnvVars: true
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