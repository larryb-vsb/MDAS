import express, { Router, Request, Response } from "express";
import type { Express } from "express";
import { db } from "../db";
import { backupSchedules } from "@shared/schema";
import { eq } from "drizzle-orm";
import { insertBackupScheduleSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

/**
 * Get all backup schedules
 */
router.get("/schedules", async (req: Request, res: Response) => {
  try {
    const schedules = await db.select().from(backupSchedules).orderBy(backupSchedules.createdAt);
    return res.json(schedules);
  } catch (error) {
    console.error("Error fetching backup schedules:", error);
    return res.status(500).json({ error: "Failed to fetch backup schedules" });
  }
});

/**
 * Get a specific backup schedule by ID
 */
router.get("/schedules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid schedule ID" });
    }
    
    const schedule = await db.select().from(backupSchedules).where(eq(backupSchedules.id, parseInt(id))).limit(1);
    
    if (!schedule || schedule.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    return res.json(schedule[0]);
  } catch (error) {
    console.error("Error fetching backup schedule:", error);
    return res.status(500).json({ error: "Failed to fetch backup schedule" });
  }
});

/**
 * Create a new backup schedule
 */
router.post("/schedules", async (req: Request, res: Response) => {
  try {
    const parsed = insertBackupScheduleSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid schedule data",
        details: parsed.error.format()
      });
    }
    
    // Calculate next run time based on schedule
    const nextRunDate = calculateNextRunTime(parsed.data);
    
    const newSchedule = await db.insert(backupSchedules).values({
      ...parsed.data,
      nextRun: nextRunDate,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    return res.status(201).json(newSchedule[0]);
  } catch (error) {
    console.error("Error creating backup schedule:", error);
    return res.status(500).json({ error: "Failed to create backup schedule" });
  }
});

/**
 * Update an existing backup schedule
 */
router.patch("/schedules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid schedule ID" });
    }
    
    const scheduleId = parseInt(id);
    
    // Verify schedule exists
    const existingSchedule = await db.select().from(backupSchedules).where(eq(backupSchedules.id, scheduleId)).limit(1);
    
    if (!existingSchedule || existingSchedule.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    // If only enabled status is being updated, use a simplified approach
    if (Object.keys(req.body).length === 1 && 'enabled' in req.body) {
      const result = await db.update(backupSchedules)
        .set({
          enabled: req.body.enabled,
          updatedAt: new Date()
        })
        .where(eq(backupSchedules.id, scheduleId))
        .returning();
      
      return res.json(result[0]);
    }
    
    // For full updates, validate all fields
    const parsed = insertBackupScheduleSchema.partial().safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid schedule data",
        details: parsed.error.format()
      });
    }
    
    const updateData = parsed.data;
    
    // If frequency-related fields are updated, recalculate next run time
    if (updateData.frequency || updateData.timeOfDay || updateData.dayOfWeek || updateData.dayOfMonth) {
      // Merge with existing data for complete schedule information
      const updatedScheduleData = {
        ...existingSchedule[0],
        ...updateData
      };
      
      // Need to cast the updateData to any to avoid TypeScript errors with dynamic properties
      (updateData as any).nextRun = calculateNextRunTime(updatedScheduleData);
    }
    
    // Add updatedAt timestamp
    (updateData as any).updatedAt = new Date();
    
    const result = await db.update(backupSchedules)
      .set(updateData)
      .where(eq(backupSchedules.id, scheduleId))
      .returning();
    
    return res.json(result[0]);
  } catch (error) {
    console.error("Error updating backup schedule:", error);
    return res.status(500).json({ error: "Failed to update backup schedule" });
  }
});

/**
 * Delete a backup schedule
 */
router.delete("/schedules/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid schedule ID" });
    }
    
    const scheduleId = parseInt(id);
    
    // Check if schedule exists
    const existingSchedule = await db.select().from(backupSchedules).where(eq(backupSchedules.id, scheduleId)).limit(1);
    
    if (!existingSchedule || existingSchedule.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    await db.delete(backupSchedules).where(eq(backupSchedules.id, scheduleId));
    
    return res.json({ success: true, message: "Schedule deleted successfully" });
  } catch (error) {
    console.error("Error deleting backup schedule:", error);
    return res.status(500).json({ error: "Failed to delete backup schedule" });
  }
});

/**
 * Run a backup schedule manually
 */
router.post("/schedules/:id/run", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: "Invalid schedule ID" });
    }
    
    const scheduleId = parseInt(id);
    
    // Check if schedule exists
    const existingSchedule = await db.select().from(backupSchedules).where(eq(backupSchedules.id, scheduleId)).limit(1);
    
    if (!existingSchedule || existingSchedule.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    const schedule = existingSchedule[0];
    
    // Import backup manager here to avoid circular dependencies
    const { backupManager } = await import("../backup/backup_manager");
    
    // Execute the backup operation using the backup manager
    const backupResult = await backupManager.createBackup(
      `Manual execution of backup schedule: ${schedule.name}`
    );
    
    // Update the schedule's last run time
    await db.update(backupSchedules)
      .set({
        lastRun: new Date(),
        updatedAt: new Date()
      })
      .where(eq(backupSchedules.id, scheduleId));
    
    // Return success with schedule name for display in UI
    return res.json({
      success: true,
      message: "Backup executed successfully",
      scheduleName: schedule.name
    });
  } catch (error) {
    console.error("Error running backup schedule:", error);
    return res.status(500).json({ error: "Failed to run backup schedule" });
  }
});

/**
 * Calculate the next run time based on schedule settings
 */
function calculateNextRunTime(schedule: any): Date {
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

export default router;

export function registerBackupScheduleRoutes(app: Express) {
  // We'll rely on the authentication middleware already applied in routes.ts
  app.use("/api/settings/backup", router);
}