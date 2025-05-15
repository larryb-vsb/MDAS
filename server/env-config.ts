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
const BASE_UPLOAD_PATH = isProd ? './data/uploads' : './tmp_uploads';
const BASE_BACKUP_PATH = isProd ? './data/backups' : './backups';

// Generate environment-specific database URL
export function getDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || '';
  if (!baseUrl) return '';
  
  // If already has a specific environment suffix, return as is
  if (baseUrl.includes('_dev') || baseUrl.includes('_prod') || baseUrl.includes('_test')) {
    return baseUrl;
  }
  
  // Add environment suffix to database name
  try {
    const url = new URL(baseUrl);
    const pathParts = url.pathname.split('/');
    const dbName = pathParts[pathParts.length - 1];
    
    // Create a new database name with environment suffix
    const envSuffix = isProd ? '_prod' : isDev ? '_dev' : '_test';
    const newDbName = `${dbName}${envSuffix}`;
    
    // Replace database name in the URL
    pathParts[pathParts.length - 1] = newDbName;
    url.pathname = pathParts.join('/');
    
    return url.toString();
  } catch (error) {
    console.error('Failed to parse database URL for environment separation:', error);
    return baseUrl;
  }
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