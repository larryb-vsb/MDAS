import { db } from './db';
import { sql } from 'drizzle-orm';
import { SchemaVersionManager } from './schema_version';

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
            id TEXT PRIMARY KEY,
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
            created_by TEXT
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
          { name: 'day_of_month', type: 'INTEGER DEFAULT 1' }
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
    console.log('Checking for admin user...');
    
    // First check if the users table exists
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'users'
        );
      `);
      
      if (!result.rows[0].exists) {
        console.log('users table does not exist yet, it will be created with migrations');
        return false;
      }
    } catch (error) {
      console.error('Error checking if users table exists:', error);
      return false;
    }
    
    // Check if the admin user exists
    try {
      const adminResult = await db.execute(sql`
        SELECT * FROM users WHERE username = 'admin' LIMIT 1
      `);
      
      // Hash the default password (admin123) - this is a known bcrypt hash for 'admin123'
      const passwordHash = '$2b$10$hIJ9hSuT7PJwlSxZu5ibbOGh7v3yMHGBITKrMpkpyaZFdHFvQhfIK';
      
      if (adminResult.rows.length === 0) {
        console.log('Admin user does not exist, creating default admin...');
        
        await db.execute(sql`
          INSERT INTO users (username, password, email, role, created_at)
          VALUES ('admin', ${passwordHash}, 'admin@example.com', 'admin', CURRENT_TIMESTAMP)
        `);
        
        console.log('Default admin user created successfully');
        console.log('You can login with username "admin" and password "admin123"');
      } else {
        console.log('Admin user exists, updating password to ensure it works...');
        
        // Update the admin password to match our expected hash
        await db.execute(sql`
          UPDATE users SET password = ${passwordHash} WHERE username = 'admin'
        `);
        
        console.log('Admin password updated');
        console.log('You can login with username "admin" and password "admin123"');
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