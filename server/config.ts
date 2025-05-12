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
  url: ""
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
 * Uses custom configuration if available, otherwise uses DATABASE_URL environment variable
 */
export function getDatabaseUrl(): string {
  const config = loadDatabaseConfig();
  
  // If a complete URL is provided, use it
  if (config.url) {
    return config.url;
  }
  
  // If custom connection details are provided, build the URL
  if (config.host && config.database && config.username) {
    const sslParam = config.ssl ? "?sslmode=require" : "";
    return `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`;
  }
  
  // Fall back to environment variable
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  
  return process.env.DATABASE_URL;
}

/**
 * Test a database connection with the provided configuration
 */
export async function testDatabaseConnection(config: DatabaseConfig): Promise<boolean> {
  const { Pool } = await import("@neondatabase/serverless");
  
  let connectionString = "";
  
  // If a complete URL is provided, use it
  if (config.url) {
    connectionString = config.url;
  } else if (config.host && config.database && config.username) {
    // Build connection string from components
    const sslParam = config.ssl ? "?sslmode=require" : "";
    connectionString = `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`;
  } else {
    throw new Error("Incomplete database configuration");
  }
  
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