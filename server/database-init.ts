import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { config, isDev, isProd, NODE_ENV } from './env-config';
import fs from 'fs';
import path from 'path';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";

// Required for Neon serverless driver
neonConfig.webSocketConstructor = ws;

/**
 * Initialize the environment-specific database
 * This function will create development and production databases if they don't exist
 */
export async function initializeDatabase() {
  try {
    // Get the base database URL (without environment suffix)
    const originalUrl = process.env.DATABASE_URL;
    if (!originalUrl) {
      throw new Error('DATABASE_URL not set');
    }

    console.log(`Initializing ${NODE_ENV} database...`);
    
    // In production, use the original database URL without modification
    if (isProd) {
      console.log(`Production mode - using original database URL`);
      const envUrl = originalUrl;
      const url = new URL(originalUrl);
      const pathParts = url.pathname.split('/');
      const envDbName = pathParts[pathParts.length - 1];
      
      // Try connecting directly to the database
      try {
        const testPool = new Pool({ connectionString: envUrl });
        await testPool.query('SELECT 1');
        console.log(`Successfully connected to production database ${envDbName}`);
        await testPool.end();
        return true;
      } catch (error) {
        console.error('Error connecting to production database:', error);
        throw error;
      }
    }
    
    // For development and testing, create environment-specific databases
    // Parse the original URL
    const url = new URL(originalUrl);
    const pathParts = url.pathname.split('/');
    const baseDbName = pathParts[pathParts.length - 1];
    
    // Create environment-specific database name
    const envSuffix = isDev ? '_dev' : '_test';
    const envDbName = `${baseDbName}${envSuffix}`;
    
    // Create the environment-specific URL
    const envUrl = originalUrl.replace(`/${baseDbName}`, `/${envDbName}`);
    console.log(`Environment URL: ${envUrl}`);
    
    // Try to connect to the environment database directly first
    try {
      const testPool = new Pool({ connectionString: envUrl });
      try {
        await testPool.query('SELECT 1');
        console.log(`Successfully connected to existing ${envDbName} database`);
        
        // Check if tables exist by trying to query schema_versions
        try {
          const tableCheck = await testPool.query('SELECT COUNT(*) FROM schema_versions');
          console.log(`Schema_versions table exists with ${tableCheck.rows[0].count} records`);
          await testPool.end();
          return true;
        } catch (tableError) {
          console.log('Schema_versions table does not exist, creating schema...');
          
          // Tables don't exist, apply schema
          const schemaPath = path.join(process.cwd(), 'server', 'schema.sql');
          if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            console.log('Applying schema to existing database...');
            await testPool.query(schemaSql);
            console.log('Schema applied successfully');
          } else {
            console.error('Schema SQL file not found at server/schema.sql');
          }
        }
        await testPool.end();
      } catch (error) {
        console.log(`Could not query ${envDbName}, database may need to be created`);
        await testPool.end();
        throw error;
      }
    } catch (connError) {
      console.log(`Could not connect to ${envDbName}, creating new database...`);
      
      // Connect to the base database to create the environment database
      const basePool = new Pool({ connectionString: originalUrl });
      
      try {
        // Check if environment database exists
        const checkResult = await basePool.query(`
          SELECT 1 FROM pg_database WHERE datname = $1
        `, [envDbName]);
        
        if (checkResult.rowCount === 0) {
          console.log(`Creating ${envDbName} database...`);
          
          // Create the database
          await basePool.query(`CREATE DATABASE "${envDbName}"`);
          console.log(`Created ${envDbName} database`);
          
          // Get schema SQL for the new database
          const schemaPath = path.join(process.cwd(), 'server', 'schema.sql');
          if (fs.existsSync(schemaPath)) {
            // Connect to the new database
            const envPool = new Pool({ connectionString: envUrl });
            
            try {
              const schemaSql = fs.readFileSync(schemaPath, 'utf8');
              console.log(`Applying schema to ${envDbName}...`);
              await envPool.query(schemaSql);
              console.log(`Schema applied to ${envDbName}`);
            } catch (schemaError) {
              console.error(`Error applying schema to ${envDbName}:`, schemaError);
            } finally {
              await envPool.end();
            }
          } else {
            console.error('Schema SQL file not found at server/schema.sql');
          }
        } else {
          console.log(`Database ${envDbName} exists but could not connect, check permissions`);
        }
      } catch (error) {
        console.error('Error creating environment database:', error);
        throw error;
      } finally {
        await basePool.end();
      }
    }
    
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    return false;
  }
}