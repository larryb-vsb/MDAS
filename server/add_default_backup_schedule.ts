import { db } from "./db";
import { backupSchedules } from "@shared/schema";

/**
 * Add a default backup schedule if none exists
 */
async function addDefaultBackupSchedule() {
  try {
    console.log("Checking for existing backup schedules...");
    
    // Check if any backup schedules exist
    const existingSchedules = await db.select().from(backupSchedules);
    
    if (existingSchedules.length === 0) {
      console.log("No backup schedules found, creating default daily backup schedule");
      
      // Calculate default nextRun time (tomorrow at midnight)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      // Create a default daily backup schedule
      const result = await db.insert(backupSchedules).values({
        name: "Default Daily Backup",
        frequency: "daily",
        timeOfDay: "00:00",
        enabled: true,
        useS3: false,
        retentionDays: 30,
        nextRun: tomorrow,
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: "System-created default backup schedule"
      }).returning();
      
      console.log("Default backup schedule created successfully:", result[0]);
    } else {
      console.log(`Found ${existingSchedules.length} existing backup schedules. No default schedule created.`);
    }
  } catch (error) {
    console.error("Error adding default backup schedule:", error);
  } finally {
    process.exit(0);
  }
}

// Run the function
addDefaultBackupSchedule();