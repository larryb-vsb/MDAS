import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { config, NODE_ENV } from "./env-config";
import { initializeDatabase } from './database-init';

neonConfig.webSocketConstructor = ws;

// Get the environment-specific database URL
const databaseUrl = config.database.url;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

console.log(`Database URL for ${NODE_ENV}: ${databaseUrl}`);

// Extract database name from URL for logging
try {
  const url = new URL(databaseUrl);
  const pathParts = url.pathname.split('/');
  const dbName = pathParts[pathParts.length - 1];
  console.log(`Database name: ${dbName}`);
} catch (error) {
  console.error('Could not parse database URL', error);
}

// This function initializes the database connection and ensures the database exists
export async function initializeDbConnection() {
  // First, ensure the database exists and has the schema
  await initializeDatabase();
  
  // Now connect to it
  console.log(`Connecting to ${NODE_ENV} database...`);
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });
  
  return { pool, db };
}

// These will be initialized in server/index.ts
export let pool: Pool;
export let db: ReturnType<typeof drizzle>;

// This function sets the global pool and db variables
export function setDbConnection(connection: { pool: Pool, db: ReturnType<typeof drizzle> }) {
  pool = connection.pool;
  db = connection.db;
}