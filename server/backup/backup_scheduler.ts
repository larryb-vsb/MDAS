import { backupSchedules } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { scheduleJob } from "node-schedule";
import axios from "axios";
import { createBackup } from "./backup_manager";

// Track scheduled jobs
const scheduledJobs = new Map();

/**
 * Initialize the backup scheduler service
 * This sets up and runs automated backup jobs based on configured schedules
 */
export async function initializeBackupScheduler() {
  console.log("Starting backup scheduler service...");
  
  try {
    // Get all enabled backup schedules
    const schedules = await db.select().from(backupSchedules).where(eq(backupSchedules.enabled, true));
    
    // Schedule each backup job
    schedules.forEach(schedule => {
      scheduleBackupJob(schedule);
    });
    
    // Set up a periodic check to ensure all schedules are running (runs every hour)
    scheduleJob("0 * * * *", async () => {
      refreshSchedules();
    });
    
  } catch (error) {
    console.error("Error initializing backup scheduler:", error);
  }
}

/**
 * Schedule a specific backup job based on its configuration
 */
function scheduleBackupJob(schedule: any) {
  // Cancel any existing job for this schedule
  if (scheduledJobs.has(schedule.id)) {
    scheduledJobs.get(schedule.id).cancel();
  }
  
  let cronExpression;
  
  // Parse the schedule into a cron expression
  const [hours, minutes] = schedule.timeOfDay.split(":").map(Number);
  
  if (schedule.frequency === "daily") {
    cronExpression = `${minutes} ${hours} * * *`;
  } else if (schedule.frequency === "weekly" && schedule.dayOfWeek !== null) {
    cronExpression = `${minutes} ${hours} * * ${schedule.dayOfWeek}`;
  } else if (schedule.frequency === "monthly" && schedule.dayOfMonth !== null) {
    cronExpression = `${minutes} ${hours} ${schedule.dayOfMonth} * *`;
  } else {
    console.error(`Invalid schedule configuration for schedule ID ${schedule.id}`);
    return;
  }
  
  try {
    // Schedule the job with node-schedule
    const job = scheduleJob(cronExpression, async () => {
      await runBackupJob(schedule);
    });
    
    // Store the job for later reference
    scheduledJobs.set(schedule.id, job);
    
    console.log(`Scheduled backup job ID ${schedule.id} (${schedule.name}) with cron: ${cronExpression}`);
    
    // Calculate and update the next run time
    updateNextRunTime(schedule);
    
  } catch (error) {
    console.error(`Error scheduling backup job ID ${schedule.id}:`, error);
  }
}

/**
 * Execute a backup job
 */
async function runBackupJob(schedule: any) {
  console.log(`Running scheduled backup: ${schedule.name} (ID: ${schedule.id})`);
  
  try {
    // Run the backup using system credentials (not tied to any specific user session)
    const backupResult = await createBackup({
      notes: `Automated backup from schedule: ${schedule.name}`,
      useS3: schedule.useS3,
      isScheduled: true,
      scheduleId: schedule.id,
      // We don't need a user ID as this is a system operation
      systemOperation: true
    });
    
    // Update the last run time
    await db.update(backupSchedules)
      .set({ 
        lastRun: new Date(),
        updatedAt: new Date()
      })
      .where(eq(backupSchedules.id, schedule.id));
    
    // Update the next run time
    updateNextRunTime(schedule);
    
    console.log(`Scheduled backup completed successfully: ${schedule.name} (ID: ${schedule.id})`);
    return backupResult;
    
  } catch (error) {
    console.error(`Error running scheduled backup ${schedule.name} (ID: ${schedule.id}):`, error);
    
    // Still update the last run time (even though it failed)
    await db.update(backupSchedules)
      .set({ 
        lastRun: new Date(),
        updatedAt: new Date()
      })
      .where(eq(backupSchedules.id, schedule.id));
      
    // Update the next run time
    updateNextRunTime(schedule);
    
    throw error;
  }
}

/**
 * Calculate and update the next run time for a schedule
 */
async function updateNextRunTime(schedule: any) {
  const now = new Date();
  let nextRun = new Date();
  
  // Set the time
  const [hours, minutes] = schedule.timeOfDay.split(":").map(Number);
  nextRun.setHours(hours, minutes, 0, 0);
  
  // Adjust based on frequency
  if (schedule.frequency === "daily") {
    // If the time today has already passed, set for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (schedule.frequency === "weekly" && schedule.dayOfWeek !== null) {
    // Set to the next occurrence of the specified day of week
    const currentDay = nextRun.getDay();
    const targetDay = schedule.dayOfWeek;
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0 || (daysToAdd === 0 && nextRun <= now)) {
      daysToAdd += 7; // Go to next week
    }
    nextRun.setDate(nextRun.getDate() + daysToAdd);
  } else if (schedule.frequency === "monthly" && schedule.dayOfMonth !== null) {
    // Set to the specified day of the month
    const targetDay = schedule.dayOfMonth;
    nextRun.setDate(targetDay);
    
    // If this date has already passed this month, go to next month
    if (nextRun <= now) {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }
    
    // Handle cases where the target day doesn't exist in some months
    const actualDay = nextRun.getDate();
    if (actualDay !== targetDay) {
      // This means we rolled over to the next month
      // Go back to the last day of the previous month
      nextRun.setDate(0);
    }
  }
  
  // Update the schedule with the new next run time
  await db.update(backupSchedules)
    .set({ 
      nextRun: nextRun,
      updatedAt: new Date()
    })
    .where(eq(backupSchedules.id, schedule.id));
    
  console.log(`Updated next run time for ${schedule.name} (ID: ${schedule.id}) to ${nextRun}`);
}

/**
 * Refresh all backup schedules (called periodically)
 */
export async function refreshSchedules() {
  try {
    // Get all enabled backup schedules
    const schedules = await db.select().from(backupSchedules).where(eq(backupSchedules.enabled, true));
    
    // Set of current schedule IDs
    const currentIds = new Set(schedules.map(s => s.id));
    
    // Cancel any jobs that are no longer in the database or are disabled
    for (const [id, job] of scheduledJobs.entries()) {
      if (!currentIds.has(id)) {
        job.cancel();
        scheduledJobs.delete(id);
        console.log(`Removed schedule job for deleted schedule ID ${id}`);
      }
    }
    
    // Schedule or update each backup job
    schedules.forEach(schedule => {
      scheduleBackupJob(schedule);
    });
    
    console.log(`Refreshed backup schedules. ${schedules.length} active schedules.`);
  } catch (error) {
    console.error("Error refreshing backup schedules:", error);
  }
}

/**
 * Manually run a backup schedule
 */
export async function runScheduleManually(scheduleId: number) {
  try {
    // Get the schedule
    const [schedule] = await db.select()
      .from(backupSchedules)
      .where(eq(backupSchedules.id, scheduleId));
    
    if (!schedule) {
      throw new Error(`Schedule with ID ${scheduleId} not found`);
    }
    
    // Run the backup job
    return await runBackupJob(schedule);
    
  } catch (error) {
    console.error(`Error manually running schedule ID ${scheduleId}:`, error);
    throw error;
  }
}