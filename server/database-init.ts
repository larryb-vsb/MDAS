import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { config, isDev, isProd, NODE_ENV } from './env-config';
import fs from 'fs';
import path from 'path';

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
    
    // Parse the original URL
    const url = new URL(originalUrl);
    const pathParts = url.pathname.split('/');
    const baseDbName = pathParts[pathParts.length - 1];
    
    // Create environment-specific database name
    const envSuffix = isProd ? '_prod' : isDev ? '_dev' : '_test';
    const envDbName = `${baseDbName}${envSuffix}`;
    
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
          const envUrl = originalUrl.replace(`/${baseDbName}`, `/${envDbName}`);
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
        console.log(`Database ${envDbName} already exists`);
      }
    } catch (error) {
      console.error('Error creating environment database:', error);
      throw error;
    } finally {
      await basePool.end();
    }
    
    return true;
  } catch (error) {
    console.error('Database initialization failed:', error);
    return false;
  }
}