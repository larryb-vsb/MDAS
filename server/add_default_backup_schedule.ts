import { db } from "./db";
import { backupSchedules } from "@shared/schema";

/**
 * Add a default backup schedule if none exists
 */
export async function addDefaultBackupSchedule() {
  try {
    // Check if any schedules exist
    const existingSchedules = await db.select().from(backupSchedules);
    
    if (existingSchedules.length === 0) {
      console.log("No backup schedules found, adding default daily backup schedule");
      
      // Calculate next run time (tonight at midnight)
      const nextRun = new Date();
      nextRun.setHours(0, 0, 0, 0); // Set to midnight
      nextRun.setDate(nextRun.getDate() + 1); // Set to next day
      
      // Create default daily backup at midnight
      // Get only the columns that actually exist in the table
      // Note: id is auto-generated as serial primary key, don't specify it
      await db.insert(backupSchedules).values({
        name: "Daily Backup",
        frequency: "daily",
        time_of_day: "00:00",
        day_of_week: 0,
        day_of_month: 1,
        enabled: true,
        use_s3: false,
        retention_days: 30,
        next_run: nextRun,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log("Default backup schedule created successfully");
    } else {
      console.log(`Found ${existingSchedules.length} existing backup schedules, no need to add default`);
    }
    
    return true;
  } catch (error) {
    console.error("Error adding default backup schedule:", error);
    return false;
  }
}