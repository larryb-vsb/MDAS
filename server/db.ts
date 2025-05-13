import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { config, NODE_ENV } from "./env-config";

neonConfig.webSocketConstructor = ws;

// Get the environment-specific database URL
const databaseUrl = config.database.url;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

console.log(`Connecting to ${NODE_ENV} database: ${databaseUrl}`);

// Extract database name from URL for logging
try {
  const url = new URL(databaseUrl);
  const pathParts = url.pathname.split('/');
  const dbName = pathParts[pathParts.length - 1];
  console.log(`Database name: ${dbName}`);
} catch (error) {
  console.error('Could not parse database URL', error);
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });