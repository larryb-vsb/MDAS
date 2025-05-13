import fs from "fs";
import path from "path";

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  url: string;
  useEnvVars?: boolean;
}

const CONFIG_DIR = path.join(process.cwd(), ".config");
const CONFIG_FILE = path.join(CONFIG_DIR, "database.json");

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Default config uses environment variables
const DEFAULT_CONFIG: DatabaseConfig = {
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
  ssl: true,
  url: "",
  useEnvVars: true
};

/**
 * Load database configuration from file or use default
 */
export function loadDatabaseConfig(): DatabaseConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, "utf8");
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error("Error loading database configuration:", error);
  }
  
  return DEFAULT_CONFIG;
}

/**
 * Save database configuration to file
 */
export function saveDatabaseConfig(config: DatabaseConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving database configuration:", error);
    throw new Error("Failed to save database configuration");
  }
}

/**
 * Get the database connection URL
 * Uses custom configuration if available, otherwise uses environment-specific database URL
 */
export function getDatabaseUrl(): string {
  const config = loadDatabaseConfig();
  const { config: envConfig } = require('./env-config');
  
  // If using environment variables, use environment-specific DATABASE_URL
  if (config.useEnvVars) {
    return envConfig.database.url;
  }
  
  // If a complete URL is provided, use it
  if (config.url) {
    return config.url;
  }
  
  // If custom connection details are provided, build the URL
  if (config.host && config.database && config.username) {
    const sslParam = config.ssl ? "?sslmode=require" : "";
    let databaseName = config.database;
    
    // Add environment suffix to database name
    const { isProd, isDev } = require('./env-config');
    const envSuffix = isProd ? '_prod' : isDev ? '_dev' : '_test';
    
    // Only add suffix if it doesn't already have one
    if (!databaseName.endsWith('_prod') && !databaseName.endsWith('_dev') && !databaseName.endsWith('_test')) {
      databaseName = `${databaseName}${envSuffix}`;
    }
    
    return `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${databaseName}${sslParam}`;
  }
  
  // Fall back to environment-specific URL
  return envConfig.database.url;
}

/**
 * Test a database connection with the provided configuration
 * Uses environment-specific database name
 */
export async function testDatabaseConnection(config: DatabaseConfig): Promise<boolean> {
  const { Pool } = await import("@neondatabase/serverless");
  const { config: envConfig, isProd, isDev, NODE_ENV } = require('./env-config');
  
  let connectionString = "";
  
  // If using environment variables, use environment-specific DATABASE_URL
  if (config.useEnvVars) {
    connectionString = envConfig.database.url;
  }
  // If a complete URL is provided, use it
  else if (config.url) {
    // Parse URL and add environment suffix if needed
    try {
      const url = new URL(config.url);
      const pathParts = url.pathname.split('/');
      const dbName = pathParts[pathParts.length - 1];
      
      // Add environment suffix to database name if not already present
      if (!dbName.endsWith('_prod') && !dbName.endsWith('_dev') && !dbName.endsWith('_test')) {
        const envSuffix = isProd ? '_prod' : isDev ? '_dev' : '_test';
        const newDbName = `${dbName}${envSuffix}`;
        
        // Replace database name in the URL
        pathParts[pathParts.length - 1] = newDbName;
        url.pathname = pathParts.join('/');
        connectionString = url.toString();
      } else {
        connectionString = config.url;
      }
    } catch (error) {
      console.error('Failed to parse database URL:', error);
      connectionString = config.url;
    }
  } 
  // Build connection string from components
  else if (config.host && config.database && config.username) {
    const sslParam = config.ssl ? "?sslmode=require" : "";
    let dbName = config.database;
    
    // Add environment suffix if not already present
    if (!dbName.endsWith('_prod') && !dbName.endsWith('_dev') && !dbName.endsWith('_test')) {
      const envSuffix = isProd ? '_prod' : isDev ? '_dev' : '_test';
      dbName = `${dbName}${envSuffix}`;
    }
    
    connectionString = `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${dbName}${sslParam}`;
  } 
  // No valid connection options
  else {
    throw new Error("Incomplete database configuration");
  }
  
  console.log(`Testing ${NODE_ENV} database connection...`);
  const pool = new Pool({ connectionString });
  
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    await pool.end();
    return true;
  } catch (error) {
    console.error("Database connection test failed:", error);
    await pool.end();
    return false;
  }
}