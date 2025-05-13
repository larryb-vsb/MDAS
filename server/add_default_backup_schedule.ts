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
      
      // Use raw SQL to avoid Drizzle ORM issues with the SERIAL PRIMARY KEY
      await db.execute(sql`
        INSERT INTO backup_schedules (
          name, frequency, time_of_day, day_of_week, day_of_month, 
          enabled, use_s3, retention_days, next_run, created_at, updated_at, notes
        ) VALUES (
          'Daily Backup', 'daily', '00:00', 0, 1,
          true, false, 30, ${nextRun}, NOW(), NOW(), 'Default daily backup created automatically'
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