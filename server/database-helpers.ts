import { db } from './db';
import { sql } from 'drizzle-orm';
import { SchemaVersionManager } from './schema_version';
import { getTableName } from './table-config';

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
 * Fix backup_schedules table structure or create it if needed
 */
export async function fixBackupSchedulesTable() {
  try {
    console.log('Checking backup_schedules table structure...');
    
    // First check if the table exists
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'backup_schedules'
        );
      `);
      
      if (!result.rows[0].exists) {
        console.log('backup_schedules table does not exist, creating it...');
        
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS backup_schedules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            frequency TEXT NOT NULL,
            time_of_day TEXT NOT NULL,
            day_of_week INTEGER DEFAULT 0,
            day_of_month INTEGER DEFAULT 1,
            next_run TIMESTAMP WITH TIME ZONE,
            last_run TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
            enabled BOOLEAN DEFAULT TRUE NOT NULL,
            retention_days INTEGER DEFAULT 30 NOT NULL,
            use_s3 BOOLEAN DEFAULT FALSE NOT NULL,
            created_by TEXT,
            notes TEXT
          )
        `);
        console.log('backup_schedules table created successfully');
      } else {
        console.log('backup_schedules table exists, checking columns...');
        
        // Check and add required columns
        const requiredColumns = [
          { name: 'use_s3', type: 'BOOLEAN DEFAULT FALSE' },
          { name: 'last_run', type: 'TIMESTAMP WITH TIME ZONE' },
          { name: 'created_by', type: 'TEXT' },
          { name: 'day_of_week', type: 'INTEGER DEFAULT 0' },
          { name: 'day_of_month', type: 'INTEGER DEFAULT 1' },
          { name: 'notes', type: 'TEXT' }
        ];
        
        for (const column of requiredColumns) {
          try {
            const columnResult = await db.execute(sql`
              SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_name = 'backup_schedules' AND column_name = ${column.name}
              );
            `);
            
            if (!columnResult.rows[0].exists) {
              console.log(`Adding missing column ${column.name} to backup_schedules table...`);
              await db.execute(sql`
                ALTER TABLE backup_schedules 
                ADD COLUMN IF NOT EXISTS ${sql.raw(column.name)} ${sql.raw(column.type)}
              `);
              console.log(`Column ${column.name} added successfully`);
            }
          } catch (error) {
            console.error(`Error checking/adding column ${column.name}:`, error);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error fixing backup_schedules table:', error);
      return false;
    }
  } catch (error) {
    console.error('Error fixing backup_schedules table:', error);
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
    
    // Check if the admin user exists
    try {
      console.log(`[ADMIN INIT] Checking for admin user in table: ${usersTableName}`);
      const adminResult = await db.execute(sql`
        SELECT * FROM ${sql.identifier(usersTableName)} WHERE username = 'admin' LIMIT 1
      `);
      
      console.log(`[ADMIN INIT] Admin user query returned ${adminResult.rows.length} rows`);
      
      // Hash the default password (admin123) - this is a known bcrypt hash for 'admin123'
      const passwordHash = '$2b$10$hIJ9hSuT7PJwlSxZu5ibbOGh7v3yMHGBITKrMpkpyaZFdHFvQhfIK';
      console.log(`[ADMIN INIT] Using password hash: ${passwordHash}`);
      
      if (adminResult.rows.length === 0) {
        console.log('[ADMIN INIT] Admin user does not exist, creating default admin...');
        
        try {
          await db.execute(sql`
            INSERT INTO ${sql.identifier(usersTableName)} (username, password, email, first_name, last_name, role, developer_flag, default_dashboard, theme_preference, created_at, last_login)
            VALUES ('admin', ${passwordHash}, 'admin@example.com', 'System', 'Administrator', 'admin', true, 'merchants', 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `);
          
          console.log('[ADMIN INIT] ✅ Default admin user created successfully');
          console.log('[ADMIN INIT] ✅ You can login with username "admin" and password "admin123"');
        } catch (insertError) {
          console.error('[ADMIN INIT] ❌ Error creating admin user:', insertError);
          
          // Try with minimal fields if full insert fails
          console.log('[ADMIN INIT] Trying with minimal fields...');
          await db.execute(sql`
            INSERT INTO ${sql.identifier(usersTableName)} (username, password, email, role, created_at)
            VALUES ('admin', ${passwordHash}, 'admin@example.com', 'admin', CURRENT_TIMESTAMP)
          `);
          console.log('[ADMIN INIT] ✅ Admin user created with minimal fields');
        }
      } else {
        console.log('[ADMIN INIT] Admin user exists, checking if password needs update...');
        console.log(`[ADMIN INIT] Current admin user data:`, JSON.stringify(adminResult.rows[0], null, 2));
        
        // Only update password if it's still the default or empty
        const currentPassword = adminResult.rows[0].password;
        const defaultPasswordHash = '$2b$10$hIJ9hSuT7PJwlSxZu5ibbOGh7v3yMHGBITKrMpkpyaZFdHFvQhfIK';
        
        if (!currentPassword || currentPassword === defaultPasswordHash) {
          // Update the admin password to match our expected hash
          await db.execute(sql`
            UPDATE ${sql.identifier(usersTableName)} SET password = ${passwordHash} WHERE username = 'admin'
          `);
          
          console.log('[ADMIN INIT] ✅ Admin password updated to default');
          console.log('[ADMIN INIT] ✅ You can login with username "admin" and password "admin123"');
        } else {
          console.log('[ADMIN INIT] Admin user has custom password - keeping existing password');
        }
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