import { pool } from "./db";
import { SchemaVersionManager, CURRENT_SCHEMA_VERSION } from "./schema_version";

async function updateBackupHistoryTable() {
  console.log("Updating backup_history table schema...");
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Check if columns already exist
    const checkColumnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'backup_history' 
      AND column_name IN ('storage_type', 's3_bucket', 's3_key')
    `;
    
    const columnsResult = await client.query(checkColumnsQuery);
    const existingColumns = columnsResult.rows.map(row => row.column_name);
    
    // Add missing columns
    if (!existingColumns.includes('storage_type')) {
      console.log("Adding storage_type column...");
      await client.query(`
        ALTER TABLE backup_history 
        ADD COLUMN storage_type text NOT NULL DEFAULT 'local'
      `);
    }
    
    if (!existingColumns.includes('s3_bucket')) {
      console.log("Adding s3_bucket column...");
      await client.query(`
        ALTER TABLE backup_history 
        ADD COLUMN s3_bucket text
      `);
    }
    
    if (!existingColumns.includes('s3_key')) {
      console.log("Adding s3_key column...");
      await client.query(`
        ALTER TABLE backup_history 
        ADD COLUMN s3_key text
      `);
    }
    
    // Record schema update
    await SchemaVersionManager.addVersion({
      version: CURRENT_SCHEMA_VERSION,
      appliedAt: new Date(),
      description: "Added S3 backup storage fields to backup_history",
      changes: {
        tables: ["backup_history"],
        addedColumns: ["storage_type", "s3_bucket", "s3_key"],
        removedColumns: []
      },
      appliedBy: "system",
      script: "update_backup_table.ts"
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
updateBackupHistoryTable().then(() => {
  console.log("Finished schema update process");
  process.exit(0);
}).catch(error => {
  console.error("Schema update failed:", error);
  process.exit(1);
});