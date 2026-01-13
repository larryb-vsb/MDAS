import { Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { getDatabaseUrl } from './env-config';

/**
 * Drop all tables and recreate them with the latest schema
 */
export async function dropAndRecreateTables() {
  // Connect directly to the database
  const databaseUrl = getDatabaseUrl();
  console.log(`Connecting to database for cleanup: ${databaseUrl.split('@')[1]}`);
  
  const pool = new Pool({ connectionString: databaseUrl });
  
  try {
    console.log('Dropping all tables...');
    
    // Drop tables in the correct order to avoid foreign key constraints
    await pool.query(`
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS merchants CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS uploaded_files CASCADE;
      DROP TABLE IF EXISTS backup_history CASCADE;
      DROP TABLE IF EXISTS backup_schedules CASCADE;
      DROP TABLE IF EXISTS schema_versions CASCADE;
    `);
    
    console.log('All tables dropped successfully');
    return true;
  } catch (error) {
    console.error('Error dropping tables:', error);
    return false;
  } finally {
    await pool.end();
  }
}