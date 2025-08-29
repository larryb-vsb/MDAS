/**
 * Environment configuration
 * Centralized place for environment-specific settings
 */

// Enhanced environment detection for production deployments
function detectEnvironment(): string {
  // First check explicit NODE_ENV
  if (process.env.NODE_ENV) {
    return process.env.NODE_ENV;
  }
  
  // Production environment indicators
  const productionIndicators = [
    process.env.REPLIT_DEPLOYMENT === 'true',
    process.env.REPL_DEPLOYMENT === 'true', 
    process.env.REPLIT_PROD === 'true',
    process.env.PRODUCTION === 'true',
    process.env.ENV === 'production',
    process.env.ENVIRONMENT === 'production',
    // Check for common production domains
    process.env.REPL_SLUG && process.env.REPL_SLUG.includes('.replit.app'),
    process.env.REPLIT_DOMAINS && process.env.REPLIT_DOMAINS.includes('.replit.app'),
    // Check for production URL in hostname
    process.env.HOSTNAME && process.env.HOSTNAME.includes('replit.app'),
    // Force production mode for deployed apps
    typeof window === 'undefined' && process.env.REPL_SLUG
  ];
  
  // If any production indicators are present, use production mode
  if (productionIndicators.some(indicator => indicator)) {
    console.log('[ENV CONFIG] Production environment detected via deployment indicators');
    return 'production';
  }
  
  // Default to development for local development
  return 'development';
}

// Determine the current environment from process.env with enhanced detection
export const NODE_ENV = detectEnvironment();
export const isProd = NODE_ENV === 'production';
export const isDev = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';

// Export environment getter function for table-config
export function getEnvironment() {
  return { NODE_ENV, isProd, isDev, isTest };
}

console.log(`[ENV CONFIG] NODE_ENV from process.env: ${process.env.NODE_ENV}`);
console.log(`[ENV CONFIG] Environment detection method: ${process.env.NODE_ENV ? 'explicit' : 'auto-detected'}`);
if (!process.env.NODE_ENV) {
  console.log(`[ENV CONFIG] Checking deployment indicators...`);
  console.log(`[ENV CONFIG] REPLIT_DEPLOYMENT: ${process.env.REPLIT_DEPLOYMENT}`);
  console.log(`[ENV CONFIG] REPL_DEPLOYMENT: ${process.env.REPL_DEPLOYMENT}`);
  console.log(`[ENV CONFIG] REPL_SLUG: ${process.env.REPL_SLUG}`);
  console.log(`[ENV CONFIG] REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS}`);
}
console.log(`[ENV CONFIG] Final NODE_ENV: ${NODE_ENV}, isProd: ${isProd}, isDev: ${isDev}`);

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

// Environment-specific Neon database URLs with fallback to default
export function getDatabaseUrl(): string {
  // Get environment-specific Neon URLs
  const neonDevUrl = process.env.NEON_DEV_DATABASE_URL;
  const neonProdUrl = process.env.NEON_PROD_DATABASE_URL;
  const defaultUrl = process.env.DATABASE_URL;
  
  // Select appropriate URL based on environment
  let selectedUrl = '';
  let urlSource = '';
  
  // SWITCH BACK TO DATABASE_URL - User data exists in ep-young-frog database
  // Note: ep-shy-king (NEON_DEV_DATABASE_URL) has different schema and no data
  if (defaultUrl) {
    selectedUrl = defaultUrl;
    urlSource = 'DATABASE_URL (ep-young-frog with user TDDF data)';
  } else if (isDev && neonDevUrl) {
    selectedUrl = neonDevUrl;
    urlSource = 'NEON_DEV_DATABASE_URL (ep-shy-king development database)';
  } else if (isProd && neonProdUrl) {
    selectedUrl = neonProdUrl;
    urlSource = 'NEON_PROD_DATABASE_URL (external Neon production database)';
  } else {
    throw new Error(`External Neon database required. Please ensure DATABASE_URL, NEON_DEV_DATABASE_URL or NEON_PROD_DATABASE_URL is set. Current environment: ${NODE_ENV}`);
  }
  
  if (!selectedUrl) {
    throw new Error(`No database URL available for ${NODE_ENV} environment. Please set NEON_${NODE_ENV.toUpperCase()}_DATABASE_URL or DATABASE_URL`);
  }
  
  console.log(`[DB CONFIG] NODE_ENV: ${NODE_ENV}, isProd: ${isProd}, isDev: ${isDev}`);
  console.log(`[DB CONFIG] Using ${urlSource}`);
  console.log(`[DB CONFIG] Database URL: ${selectedUrl.substring(0, 80)}...`);
  
  // Log available Neon URLs for debugging
  if (neonDevUrl && !isDev) {
    console.log(`[DB CONFIG] ℹ️  NEON_DEV_DATABASE_URL available for development`);
  }
  if (neonProdUrl && !isProd) {
    console.log(`[DB CONFIG] ℹ️  NEON_PROD_DATABASE_URL available for production`);
  }
  
  // Table separation still applies within each environment's database
  console.log(`[DB CONFIG] Using environment-specific database with table separation`);
  console.log(`[DB CONFIG] ${NODE_ENV} tables: ${isDev ? 'dev_*' : 'production'} tables`);
  
  return selectedUrl;
}

// Environment-specific configuration
export const config = {
  // Database connection
  database: {
    url: getDatabaseUrl(),
    useEnvVars: true,
    // Keep original URLs for reference
    originalUrl: process.env.DATABASE_URL,
    neonDevUrl: process.env.NEON_DEV_DATABASE_URL,
    neonProdUrl: process.env.NEON_PROD_DATABASE_URL,
    usingNeonDev: isDev && !!process.env.NEON_DEV_DATABASE_URL,
    usingNeonProd: isProd && !!process.env.NEON_PROD_DATABASE_URL
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
    sessionSecret: process.env.SESSION_SECRET || (isProd ? 'prod-fallback-secret' : 'default-dev-session-secret')
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