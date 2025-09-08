// This file creates and exports optimized database connections with separate pools
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Required for Neon serverless driver
neonConfig.webSocketConstructor = ws;

// KING SERVER FIX: FORCE use of King server (ep-shy-king-aasxdlh7) for ALL processing
// ABSOLUTE OVERRIDE: Disconnect from ep-young-frog and FORCE King server connection
const FORCE_KING_SERVER_URL = "postgresql://neondb_owner:npg_Dzy4oGqcr3SH@ep-shy-king-aasxdlh7-pooler.westus3.azure.neon.tech/neondb?sslmode=require&channel_binding=require";

console.log('🔧 [DATABASE-OVERRIDE] Forcing disconnection from ep-young-frog-a6mno10h');
console.log('🔧 [DATABASE-OVERRIDE] Forcing connection to King server ep-shy-king-aasxdlh7');

// Check what environment variable is being used
console.log(`🔍 [ENV-CHECK] DATABASE_URL: ${process.env.DATABASE_URL?.includes('ep-young-frog') ? 'ep-young-frog (WRONG)' : process.env.DATABASE_URL?.includes('ep-shy-king') ? 'ep-shy-king (CORRECT)' : 'unknown'}`);
console.log(`🔍 [ENV-CHECK] NEON_DEV_DATABASE_URL: ${process.env.NEON_DEV_DATABASE_URL?.includes('ep-shy-king') ? 'ep-shy-king (CORRECT)' : 'unknown'}`);

// FORCE King server - Use NEON_DEV_DATABASE_URL which points to King server
const databaseUrl = process.env.NEON_DEV_DATABASE_URL || FORCE_KING_SERVER_URL;

// Override ALL environment variables to ensure King server connection
process.env.DATABASE_URL = databaseUrl;
process.env.NEON_DATABASE_URL = databaseUrl;

console.log(`🔧 [FORCE-OVERRIDE] Final database URL: ${databaseUrl.substring(0, 50)}...${databaseUrl.includes('ep-shy-king') ? ' (KING SERVER ✅)' : databaseUrl.includes('ep-young-frog') ? ' (FROG SERVER ❌)' : ' (UNKNOWN)'}`);

console.log(`🔧 [FORCED] Using King server URL: ${databaseUrl?.includes('ep-shy-king') ? 'ep-shy-king (SUCCESS)' : 'FAILED'}`);

// Import config after environment override
import { config, NODE_ENV } from "./env-config";

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

console.log(`[FORCED FIX] Database URL for ${NODE_ENV}: ${databaseUrl.substring(0, 80)}...`);

// Verify we're connecting to the correct database
if (databaseUrl.includes('ep-shy-king-aasxdlh7')) {
  console.log(`✅ [DB-FIX] Connected to NEON DEV database (ep-shy-king-aasxdlh7)`);
} else if (databaseUrl.includes('ep-young-frog')) {
  console.log(`❌ [DB-FIX] WARNING: Still connecting to wrong database (ep-young-frog)`);
} else {
  console.log(`⚠️ [DB-FIX] Unknown database connection`);
}

// Extract database name from URL for logging
try {
  const url = new URL(databaseUrl);
  const pathParts = url.pathname.split('/');
  const dbName = pathParts[pathParts.length - 1];
  console.log(`Database name: ${dbName}`);
} catch (error) {
  console.error('Could not parse database URL', error);
}

// Environment-specific pool configurations
const getPoolConfig = (poolType: 'app' | 'batch' | 'session') => {
  const isDev = NODE_ENV === 'development';
  
  const configs = {
    app: {
      max: isDev ? 25 : 40,             // INCREASED: Regular app operations + heavy monitoring
      min: isDev ? 5 : 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      acquireTimeoutMillis: 30000,
    },
    batch: {
      max: isDev ? 20 : 30,             // INCREASED: Heavy TDDF batch processing  
      min: isDev ? 3 : 5,
      idleTimeoutMillis: 60000,         // Longer idle time for batch jobs
      connectionTimeoutMillis: 15000,
      acquireTimeoutMillis: 60000,      // Longer wait for batch operations
    },
    session: {
      max: isDev ? 8 : 12,              // INCREASED: Session storage
      min: isDev ? 2 : 3,
      idleTimeoutMillis: 120000,        // Sessions can be idle longer
      connectionTimeoutMillis: 8000,
      acquireTimeoutMillis: 20000,
    }
  };
  
  return {
    connectionString: databaseUrl,
    ...configs[poolType]
  };
};

// Create separate pools for different workloads
export const appPool = new Pool(getPoolConfig('app'));
export const batchPool = new Pool(getPoolConfig('batch'));
export const sessionPool = new Pool(getPoolConfig('session'));

// Default pool for backward compatibility (uses app pool)
export const pool = appPool;

// Create Drizzle instances
export const db = drizzle({ client: appPool, schema });
export const batchDb = drizzle({ client: batchPool, schema });

// Connection pool monitoring
export interface PoolStats {
  name: string;
  totalConnections: number;
  idleConnections: number;
  waitingCount: number;
}

export async function getPoolStats(): Promise<PoolStats[]> {
  const pools = [
    { name: 'Application Pool', pool: appPool },
    { name: 'Batch Processing Pool', pool: batchPool },
    { name: 'Session Pool', pool: sessionPool }
  ];
  
  return pools.map(({ name, pool }) => ({
    name,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingCount: pool.waitingCount
  }));
}

// Pool health monitoring
export async function checkPoolHealth(): Promise<{ healthy: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  try {
    const stats = await getPoolStats();
    
    for (const stat of stats) {
      // Check for potential connection exhaustion
      if (stat.waitingCount > 5) {
        issues.push(`${stat.name}: High waiting count (${stat.waitingCount})`);
      }
      
      // Check for too many idle connections
      if (stat.idleConnections > stat.totalConnections * 0.8) {
        issues.push(`${stat.name}: Too many idle connections (${stat.idleConnections}/${stat.totalConnections})`);
      }
      
      // Check for connection starvation
      if (stat.totalConnections === 0) {
        issues.push(`${stat.name}: No active connections`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues
    };
  } catch (error) {
    return {
      healthy: false,
      issues: [`Pool health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

console.log(`[CONNECTION POOLS] Initialized for ${NODE_ENV}:`);
console.log(`  App Pool: max=${getPoolConfig('app').max}, min=${getPoolConfig('app').min}`);
console.log(`  Batch Pool: max=${getPoolConfig('batch').max}, min=${getPoolConfig('batch').min}`);
console.log(`  Session Pool: max=${getPoolConfig('session').max}, min=${getPoolConfig('session').min}`);