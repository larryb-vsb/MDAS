import { db } from "../db";
import { backupSchedules } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { BackupSchedule } from "@shared/schema";
import { createBackup } from "./backup_manager";

// Interval for checking scheduled backups (every minute)
const CHECK_INTERVAL = 60 * 1000;

/**
 * Backup Scheduler Service
 * Handles scheduling and running of automated backups based on configured schedules
 */
export class BackupSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the scheduler service
   */
  public async start(): Promise<void> {
    console.log("Starting backup scheduler service...");
    
    // Ensure there's at least one default backup schedule
    await this.ensureDefaultBackupSchedule();
    
    // Run immediately on startup
    this.checkAndRunBackups();
    
    // Set up recurring check
    this.timer = setInterval(() => this.checkAndRunBackups(), CHECK_INTERVAL);
  }
  
  /**
   * Ensure there's at least one default backup schedule
   */
  private async ensureDefaultBackupSchedule(): Promise<void> {
    try {
      // Check if any backup schedules exist
      const existingSchedules = await db.select({ count: db.fn.count() })
        .from(backupSchedules);
      
      const scheduleCount = parseInt(existingSchedules[0].count as string, 10);
      
      if (scheduleCount === 0) {
        console.log("No backup schedules found, creating default daily backup schedule");
        
        // Calculate default nextRun time (tomorrow at midnight)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        // Create a default daily backup schedule
        await db.insert(backupSchedules).values({
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
        });
        
        console.log("Default backup schedule created successfully");
      }
    } catch (error) {
      console.error("Error ensuring default backup schedule:", error);
    }
  }

  /**
   * Stop the scheduler service
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log("Backup scheduler service stopped");
  }

  /**
   * Check for scheduled backups that need to be run and execute them
   */
  private async checkAndRunBackups(): Promise<void> {
    // Prevent concurrent execution
    if (this.isRunning) {
      return;
    }
    
    try {
      this.isRunning = true;
      
      // Find schedules that should run now
      const now = new Date();
      
      // Get all active schedules with nextRun <= now
      const schedulesToRun = await db.select()
        .from(backupSchedules)
        .where(
          and(
            eq(backupSchedules.enabled, true),
            lte(backupSchedules.nextRun, now)
          )
        );
      
      if (schedulesToRun.length > 0) {
        console.log(`Found ${schedulesToRun.length} backup schedule(s) to run`);
      }
      
      // Run each schedule
      for (const schedule of schedulesToRun) {
        await this.executeSchedule(schedule);
      }
    } catch (error) {
      console.error("Error in backup scheduler:", error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute a specific backup schedule
   */
  private async executeSchedule(schedule: BackupSchedule): Promise<void> {
    try {
      console.log(`Executing backup schedule: ${schedule.name} (ID: ${schedule.id})`);
      
      // Execute the backup operation
      const backupResult = await createBackup({
        useS3: schedule.useS3,
        notes: `Automated backup from schedule: ${schedule.name}`,
        scheduleId: schedule.id
      });
      
      // Calculate the next run time
      const nextRun = this.calculateNextRunTime(schedule);
      
      // Update the schedule's last run time and next run time
      await db.update(backupSchedules)
        .set({
          lastRun: new Date(),
          nextRun: nextRun,
          updatedAt: new Date()
        })
        .where(eq(backupSchedules.id, schedule.id));
      
      console.log(`Backup schedule ${schedule.id} executed successfully. Next run: ${nextRun.toISOString()}`);
    } catch (error) {
      console.error(`Error executing backup schedule ${schedule.id}:`, error);
    }
  }

  /**
   * Calculate the next run time for a schedule
   */
  private calculateNextRunTime(schedule: BackupSchedule): Date {
    const now = new Date();
    const nextRun = new Date();
    
    // Parse time of day
    const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);
    
    // Set the hours and minutes
    nextRun.setHours(hours, minutes, 0, 0);
    
    // If the time is in the past, push it to tomorrow
    if (nextRun < now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    // Handle frequency specific adjustments
    if (schedule.frequency === 'weekly' && typeof schedule.dayOfWeek === 'number') {
      // Set to the next occurrence of the specified day of week
      const currentDay = nextRun.getDay();
      const daysUntilTarget = (schedule.dayOfWeek - currentDay + 7) % 7;
      
      // If it's today but time has passed, we need to add 7 days
      if (daysUntilTarget === 0 && nextRun < now) {
        nextRun.setDate(nextRun.getDate() + 7);
      } else {
        nextRun.setDate(nextRun.getDate() + daysUntilTarget);
      }
    } else if (schedule.frequency === 'monthly' && typeof schedule.dayOfMonth === 'number') {
      // Set to the specified day of the month
      nextRun.setDate(schedule.dayOfMonth);
      
      // If the date is in the past, move to next month
      if (nextRun < now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }
      
      // Handle invalid dates (e.g., February 30th becomes March 2nd or 3rd)
      // If this happens, we'll set it to the last day of the month
      const originalMonth = nextRun.getMonth();
      if (nextRun.getMonth() !== originalMonth) {
        // Go back to the previous month and set to the last day
        nextRun.setDate(0);
      }
    }
    
    return nextRun;
  }
}

// Singleton instance
export const backupScheduler = new BackupSchedulerService();