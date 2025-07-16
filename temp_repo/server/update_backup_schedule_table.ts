import { pool } from "./db";
import { SchemaVersionManager, CURRENT_SCHEMA_VERSION } from "./schema_version";

async function createBackupScheduleTable() {
  console.log("Creating backup_schedules table...");
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Check if table already exists
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'backup_schedules'
      )
    `;
    
    const tableResult = await client.query(checkTableQuery);
    const tableExists = tableResult.rows[0].exists;
    
    if (tableExists) {
      console.log("backup_schedules table already exists");
    } else {
      console.log("Creating backup_schedules table...");
      
      // Create the table
      await client.query(`
        CREATE TABLE backup_schedules (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          frequency TEXT NOT NULL,
          time_of_day TEXT NOT NULL,
          day_of_week INTEGER,
          day_of_month INTEGER,
          enabled BOOLEAN DEFAULT TRUE NOT NULL,
          use_s3 BOOLEAN DEFAULT FALSE NOT NULL,
          retention_days INTEGER DEFAULT 30 NOT NULL,
          last_run TIMESTAMP,
          next_run TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
          notes TEXT
        )
      `);
      
      // Create an index on enabled and next_run
      await client.query(`
        CREATE INDEX idx_backup_schedules_enabled_next_run 
        ON backup_schedules(enabled, next_run)
      `);
      
      // Add a default daily backup schedule
      await client.query(`
        INSERT INTO backup_schedules (
          name, frequency, time_of_day, enabled, use_s3, retention_days, notes
        ) VALUES (
          'Daily Backup', 'daily', '00:00', TRUE, FALSE, 30, 'Default daily backup at midnight'
        ) RETURNING *
      `);
    }
    
    // Record schema update
    await SchemaVersionManager.addVersion({
      version: CURRENT_SCHEMA_VERSION,
      appliedAt: new Date(),
      description: "Added backup_schedules table for scheduled automated backups",
      changes: {
        addedTables: ["backup_schedules"],
        addedIndices: ["idx_backup_schedules_enabled_next_run"]
      },
      appliedBy: "system",
      script: "update_backup_schedule_table.ts"
    });
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log("Schema update completed successfully");
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error("Error updating schema:", error);
    throw error;
  } finally {
    // Release the client
    client.release();
  }
}

// Run the update
createBackupScheduleTable().then(() => {
  console.log("Finished backup schedule schema update");
  process.exit(0);
}).catch(error => {
  console.error("Schema update failed:", error);
  process.exit(1);
});