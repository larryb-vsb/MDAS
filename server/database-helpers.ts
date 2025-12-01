import { db } from './db';
import { sql } from 'drizzle-orm';
import { SchemaVersionManager } from './schema_version';
import { getTableName } from './table-config';
import bcrypt from 'bcrypt';

/**
 * Fix schema_versions table structure to match current schema definition
 */
export async function fixSchemaVersionsTable() {
  try {
    console.log('Checking schema_versions table structure...');
    
    // First check if the table exists
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'schema_versions'
        );
      `);
      
      if (!result.rows[0].exists) {
        console.log('schema_versions table does not exist yet, it will be created with migrations');
        return false;
      }
    } catch (error) {
      console.error('Error checking if schema_versions table exists:', error);
      return false;
    }
    
    // Check and add columns if needed
    const columnChecks = [
      { name: 'applied_by', type: 'TEXT' },
      { name: 'changes', type: 'JSONB' },
      { name: 'script', type: 'TEXT' }
    ];
    
    for (const column of columnChecks) {
      try {
        // Check if column exists
        const columnResult = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'schema_versions' AND column_name = ${column.name}
          );
        `);
        
        if (!columnResult.rows[0].exists) {
          console.log(`Adding missing column ${column.name} to schema_versions table...`);
          await db.execute(sql`
            ALTER TABLE schema_versions 
            ADD COLUMN IF NOT EXISTS ${sql.raw(column.name)} ${sql.raw(column.type)}
          `);
          console.log(`Column ${column.name} added successfully`);
        } else {
          console.log(`Column ${column.name} already exists in schema_versions table`);
        }
      } catch (error) {
        console.error(`Error checking/adding column ${column.name}:`, error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error fixing schema_versions table:', error);
    return false;
  }
}

/**
 * Create or reset a default admin user
 */
export async function ensureAdminUser() {
  try {
    console.log('=== ADMIN USER INITIALIZATION DEBUG ===');
    
    // Get environment info
    const { getEnvironment } = await import('./env-config');
    const { NODE_ENV, isProd, isDev } = getEnvironment();
    console.log(`[ADMIN INIT] Environment: ${NODE_ENV}, isProd: ${isProd}, isDev: ${isDev}`);
    
    // Get environment-specific table name
    const usersTableName = getTableName('users');
    console.log(`[ADMIN INIT] Target users table: ${usersTableName}`);
    
    // List all existing tables for debugging
    try {
      console.log('[ADMIN INIT] Checking all existing tables...');
      const allTablesResult = await db.execute(sql`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      const existingTables = allTablesResult.rows.map(row => row.table_name);
      console.log(`[ADMIN INIT] Existing tables: ${existingTables.join(', ')}`);
      
      // Check for both users and dev_users
      const hasUsers = existingTables.includes('users');
      const hasDevUsers = existingTables.includes('dev_users');
      console.log(`[ADMIN INIT] Has 'users' table: ${hasUsers}`);
      console.log(`[ADMIN INIT] Has 'dev_users' table: ${hasDevUsers}`);
    } catch (error) {
      console.error('[ADMIN INIT] Error listing tables:', error);
    }

    // First check if the users table exists
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = ${usersTableName}
        );
      `);
      
      console.log(`[ADMIN INIT] Table ${usersTableName} exists: ${result.rows[0].exists}`);
      
      if (!result.rows[0].exists) {
        console.log(`[ADMIN INIT] ${usersTableName} table does not exist yet, it will be created with migrations`);
        return false;
      }
    } catch (error) {
      console.error(`[ADMIN INIT] Error checking if ${usersTableName} table exists:`, error);
      return false;
    }
    
    // Get admin credentials from Test_Creds secret
    let adminUsername = 'admin';
    let adminPassword = 'admin123';
    let passwordHash: string;
    
    try {
      const testCredsSecret = process.env.Test_Creds;
      if (testCredsSecret) {
        const testCreds = JSON.parse(testCredsSecret);
        if (testCreds.username) adminUsername = testCreds.username;
        if (testCreds.password) adminPassword = testCreds.password;
        console.log(`[ADMIN INIT] Using credentials from Test_Creds secret: username=${adminUsername}`);
      } else {
        console.log('[ADMIN INIT] ⚠️  Test_Creds secret not found, using default credentials');
      }
      
      // Hash the password from secret
      passwordHash = await bcrypt.hash(adminPassword, 10);
      console.log(`[ADMIN INIT] Password hashed successfully`);
    } catch (secretError) {
      console.error('[ADMIN INIT] ❌ Error reading Test_Creds secret:', secretError);
      console.log('[ADMIN INIT] Falling back to default credentials');
      passwordHash = await bcrypt.hash('admin123', 10);
    }
    
    // Check if the admin user exists
    try {
      console.log(`[ADMIN INIT] Checking for admin user in table: ${usersTableName}`);
      const adminResult = await db.execute(sql`
        SELECT * FROM ${sql.identifier(usersTableName)} WHERE username = ${adminUsername} LIMIT 1
      `);
      
      console.log(`[ADMIN INIT] Admin user query returned ${adminResult.rows.length} rows`);
      
      if (adminResult.rows.length === 0) {
        console.log(`[ADMIN INIT] Admin user "${adminUsername}" does not exist, creating...`);
        
        try {
          await db.execute(sql`
            INSERT INTO ${sql.identifier(usersTableName)} (username, password, email, first_name, last_name, role, developer_flag, default_dashboard, theme_preference, created_at, last_login)
            VALUES (${adminUsername}, ${passwordHash}, 'admin@example.com', 'System', 'Administrator', 'admin', true, 'merchants', 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);
          
          console.log(`[ADMIN INIT] ✅ Admin user "${adminUsername}" created successfully`);
          console.log(`[ADMIN INIT] ✅ Credentials stored in Test_Creds secret`);
        } catch (insertError) {
          console.error('[ADMIN INIT] ❌ Error creating admin user:', insertError);
          
          // Try with minimal fields if full insert fails
          console.log('[ADMIN INIT] Trying with minimal fields...');
          await db.execute(sql`
            INSERT INTO ${sql.identifier(usersTableName)} (username, password, email, role, created_at)
            VALUES (${adminUsername}, ${passwordHash}, 'admin@example.com', 'admin', CURRENT_TIMESTAMP)
          `);
          console.log(`[ADMIN INIT] ✅ Admin user "${adminUsername}" created with minimal fields`);
        }
      } else {
        console.log(`[ADMIN INIT] Admin user "${adminUsername}" exists, updating password from Test_Creds...`);
        console.log(`[ADMIN INIT] Current admin user data:`, JSON.stringify(adminResult.rows[0], null, 2));
        
        // Always update password to match Test_Creds secret
        await db.execute(sql`
          UPDATE ${sql.identifier(usersTableName)} SET password = ${passwordHash} WHERE username = ${adminUsername}
        `);
        
        console.log(`[ADMIN INIT] ✅ Admin password synced with Test_Creds secret`);
      }
      
      return true;
    } catch (error) {
      console.error('Error checking/creating admin user:', error);
      return false;
    }
  } catch (error) {
    console.error('Error ensuring admin user exists:', error);
    return false;
  }
}