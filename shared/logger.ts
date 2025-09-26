/**
 * Configurable Logging System for MMS
 * 
 * Environment Variables:
 * - VERBOSE_AUTH_DEBUG: Enable auth debugging (default: false)
 * - VERBOSE_NAVIGATION: Enable navigation click logging (default: false) 
 * - VERBOSE_UPLOADER: Enable uploader debugging (default: false)
 * - VERBOSE_CHARTS: Enable charts data fetching debug (default: false)
 * - VERBOSE_TDDF_PROCESSING: Enable TDDF processing logging (default: true)
 * - VERBOSE_DATABASE: Enable database operation logging (default: false)
 * - VERBOSE_ALL: Enable all verbose logging (default: false)
 */

// Server-side environment variables (Node.js)
const isServer = typeof window === 'undefined';

// Get environment variable value with fallback
function getEnvVar(name: string, defaultValue: boolean = false): boolean {
  if (isServer) {
    // Server-side: use process.env
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  } else {
    // Client-side: use import.meta.env with VITE_ prefix
    const viteVarName = `VITE_${name}`;
    const value = import.meta.env[viteVarName];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }
}

// Logging configuration
export const logConfig = {
  auth: getEnvVar('VERBOSE_AUTH_DEBUG', false),
  navigation: getEnvVar('VERBOSE_NAVIGATION', false),
  uploader: getEnvVar('VERBOSE_UPLOADER', false),
  charts: getEnvVar('VERBOSE_CHARTS', false),
  tddfProcessing: getEnvVar('VERBOSE_TDDF_PROCESSING', true), // Keep enabled by default
  database: getEnvVar('VERBOSE_DATABASE', false),
  all: getEnvVar('VERBOSE_ALL', false)
};

// Override individual settings if VERBOSE_ALL is enabled
if (logConfig.all) {
  logConfig.auth = true;
  logConfig.navigation = true;
  logConfig.uploader = true;
  logConfig.charts = true;
  logConfig.tddfProcessing = true;
  logConfig.database = true;
}

/**
 * Centralized logger with category-based controls
 */
export const logger = {
  auth: (message: string, ...args: any[]) => {
    if (logConfig.auth) {
      console.log(`[AUTH-DEBUG] ${message}`, ...args);
    }
  },

  navigation: (message: string, ...args: any[]) => {
    if (logConfig.navigation) {
      console.log(`[NAV-DEBUG] ${message}`, ...args);
    }
  },

  uploader: (message: string, ...args: any[]) => {
    if (logConfig.uploader) {
      console.log(`[UPLOADER-DEBUG] ${message}`, ...args);
    }
  },

  charts: (message: string, ...args: any[]) => {
    if (logConfig.charts) {
      console.log(`[CHART DEBUG] ${message}`, ...args);
    }
  },

  tddfProcessing: (message: string, ...args: any[]) => {
    if (logConfig.tddfProcessing) {
      console.log(`[TDDF-PROCESSING] ${message}`, ...args);
    }
  },

  database: (message: string, ...args: any[]) => {
    if (logConfig.database) {
      console.log(`[DB-DEBUG] ${message}`, ...args);
    }
  },

  // Always log errors and warnings regardless of settings
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(`[WARNING] ${message}`, ...args);
  },

  // Always log important info regardless of settings
  info: (message: string, ...args: any[]) => {
    console.log(`[INFO] ${message}`, ...args);
  }
};

/**
 * Log the current configuration on startup (server-side only)
 */
if (isServer) {
  console.log('[INFO] Verbose logging configuration:');
  console.log(`  - Auth Debug: ${logConfig.auth}`);
  console.log(`  - Navigation: ${logConfig.navigation}`);
  console.log(`  - Uploader: ${logConfig.uploader}`);
  console.log(`  - Charts: ${logConfig.charts}`);
  console.log(`  - TDDF Processing: ${logConfig.tddfProcessing}`);
  console.log(`  - Database: ${logConfig.database}`);
  console.log(`  - All Verbose: ${logConfig.all}`);
}

export default logger;