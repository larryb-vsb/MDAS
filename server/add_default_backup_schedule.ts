import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Add a default backup schedule if none exists
 */
export async function addDefaultBackupSchedule() {
  try {
    // Check if any schedules exist
    const result = await db.execute(sql`SELECT COUNT(*) FROM backup_schedules`);
    const count = parseInt(result.rows[0].count);
    
    if (count === 0) {
      console.log("No backup schedules found, adding default daily backup schedule");
      
      // Calculate next run time (tonight at midnight)
      const nextRun = new Date();
      nextRun.setHours(0, 0, 0, 0); // Set to midnight
      nextRun.setDate(nextRun.getDate() + 1); // Set to next day
      
      // Use a simple approach: find max ID and increment it, ensuring type compatibility
      const idResult = await db.execute(sql`SELECT COALESCE(MAX(id::integer), 0) + 1 as next_id FROM backup_schedules`);
      const nextId = parseInt(idResult.rows[0].next_id);
      
      // Insert with explicit ID
      await db.execute(sql`
        INSERT INTO backup_schedules (
          id, name, frequency, time_of_day, next_run,
          enabled, retention_days, notes, day_of_week, day_of_month
        ) VALUES (
          ${nextId}, 'Daily Backup', 'daily', '00:00', ${nextRun},
          true, 30, 'Default daily backup created automatically', 0, 1
        )
      `);
      
      console.log("Default backup schedule created successfully");
    } else {
      console.log(`Found ${count} existing backup schedules, no need to add default`);
    }
    
    return true;
  } catch (error) {
    console.error("Error adding default backup schedule:", error);
    return false;
  }
}