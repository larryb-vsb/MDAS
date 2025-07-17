import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, isFallbackStorage } from "./storage";
import { db, pool } from "./db";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { createReadStream, createWriteStream } from "fs";
import { parse as parseCSV } from "csv-parse";
import multer from "multer";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { count, desc, eq, isNotNull, and, gte, between, sql, isNull } from "drizzle-orm";
import { setupAuth } from "./auth";
import { loadDatabaseConfig, saveDatabaseConfig, testDatabaseConnection } from "./config";
import { registerS3Routes } from "./routes/s3_routes";
import { registerBackupScheduleRoutes } from "./routes/backup_schedule_routes";
import { fileProcessorService } from "./services/file-processor";
import logsRoutes from "./routes/logs_routes";
import logTestRoutes from "./routes/log_test_routes";

// Authentication middleware
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

// Helper function to format CSV without external dependency
function formatCSV(data: any[]) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header] ?? '';
      // Escape commas and quotes
      return typeof val === 'string' && (val.includes(',') || val.includes('"')) 
        ? `"${val.replace(/"/g, '""')}"` 
        : val;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

import { 
  merchants as merchantsTable, 
  transactions as transactionsTable, 
  uploadedFiles as uploadedFilesTable,
  backupHistory,
  InsertBackupHistory,
  schemaVersions,
  backupSchedules as backupSchedulesTable,
  users as usersTable
} from "@shared/schema";
import { SchemaVersionManager, CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_HISTORY } from "./schema_version";

const execPromise = promisify(exec);

// Set up multer for file uploads
const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize authentication system
  setupAuth(app);
  
  // Register S3 configuration routes
  registerS3Routes(app);
  
  // Register logs routes
  app.use(logsRoutes);
  app.use(logTestRoutes);
  
  // Import the restore function from restore-env-backup
  const { restoreBackupToEnvironment } = await import('./restore-env-backup');
  
  // Upload and restore backup endpoint that works even in fallback mode
  app.post("/api/settings/backup/restore-upload", upload.single('backupFile'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }
      
      console.log(`Processing uploaded backup file: ${req.file.originalname}`);
      
      // Check file size
      const fileStat = fs.statSync(req.file.path);
      console.log(`Backup file size: ${fileStat.size} bytes`);
      
      if (fileStat.size === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          error: "Backup file is empty"
        });
      }
      
      // Check if file is valid JSON
      let fileData;
      let jsonData;
      
      try {
        fileData = fs.readFileSync(req.file.path, 'utf8');
        
        // Log first part of the file content for diagnostic purposes
        console.log("File content preview:", fileData.substring(0, 200) + "...");
        
        // Attempt to parse JSON
        jsonData = JSON.parse(fileData);
        
        // Basic structure validation
        if (!jsonData) {
          throw new Error("Empty JSON object");
        }
        
        // Check if it has tables property
        if (!jsonData.tables) {
          console.log("JSON structure:", Object.keys(jsonData));
          throw new Error("Missing 'tables' property");
        }
      } catch (e: any) {
        fs.unlinkSync(req.file.path); // Delete invalid file
        return res.status(400).json({ 
          success: false, 
          error: `Invalid backup file: ${e.message || "The file is not a valid JSON file"}` 
        });
      }
      
      // Use the restore utility function to restore the database from the uploaded file
      // This works for both regular DB mode and fallback mode
      console.log("File validation passed, attempting to restore...");
      const success = await restoreBackupToEnvironment(req.file.path);
      
      // If we're in fallback mode and restored successfully, we need to restart the server
      // to switch back to DB mode. Client will need to handle this by showing a message
      // that server is restarting.
      if (success && isFallbackStorage) {
        res.status(200).json({ 
          success: true, 
          message: "Backup restored successfully. System is restarting to apply changes.",
          needsRestart: true
        });
        
        // Give the response time to send before restarting
        setTimeout(() => {
          console.log("Restarting server to switch from fallback mode to database mode...");
          process.exit(0); // Process manager will restart the server
        }, 2000);
      } else if (success) {
        res.status(200).json({ 
          success: true, 
          message: "Backup restored successfully" 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: "Failed to restore backup" 
        });
      }
      
      // Clean up the temporary uploaded file
      fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error("Error restoring backup from upload:", error);
      
      // Clean up the temporary uploaded file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      // Enhanced error handling for more specific error messages
      let errorMessage = "Failed to restore backup from upload";
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error("Restore error details:", error.stack);
      }
      
      res.status(500).json({ 
        success: false, 
        error: errorMessage 
      });
    }
  });
  
  // Endpoint to generate a sample backup file
  app.get("/api/settings/backup/generate-sample", async (req, res) => {
    try {
      // Import the sample backup generator
      const { generateSampleBackup } = await import('./utils/sample-backup');
      
      // Generate a sample backup file
      const backupFilePath = generateSampleBackup();
      
      // Return the path to the sample backup file
      res.json({
        success: true,
        message: "Sample backup file generated successfully",
        filePath: backupFilePath
      });
    } catch (error) {
      console.error("Error generating sample backup:", error);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate sample backup file"
      });
    }
  });
  
  // Endpoint to convert in-memory data to database
  app.post("/api/settings/convert-memory-to-database", isAuthenticated, async (req, res) => {
    try {
      // Enhanced fallback detection
      const storageType = storage.constructor.name;
      const isFallbackDetected = 
        isFallbackStorage === true || 
        storageType === 'MemStorageFallback';
      
      console.log('Memory-to-database conversion request:', {
        storageType,
        isFallbackStorage,
        isFallbackDetected
      });
      
      // Force fallback mode for testing if needed
      if (req.body.forceFallbackMode === true) {
        console.log('Forcing fallback mode for testing');
        
        // Import the fallback converter
        const { convertFallbackToDatabase } = await import('./utils/fallback-converter');
        
        // Convert the in-memory data to database even if we don't think we're in fallback mode
        const result = await convertFallbackToDatabase();
        return res.json(result);
      }
      
      if (!isFallbackDetected) {
        return res.json({
          success: false,
          message: "Not running in fallback mode - no conversion necessary."
        });
      }
      
      // Import the fallback converter
      const { convertFallbackToDatabase } = await import('./utils/fallback-converter');
      
      // Convert the in-memory data to database
      const result = await convertFallbackToDatabase();
      
      // Return the result
      res.json(result);
    } catch (error) {
      console.error("Error converting memory to database:", error);
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to convert memory data to database"
      });
    }
  });
  
  // Register backup schedule routes
  app.use("/api/settings", isAuthenticated);
  registerBackupScheduleRoutes(app);
  
  // User management endpoints
  app.get("/api/users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  app.post("/api/users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const user = await storage.createUser({
        ...req.body,
        password: await storage.hashPassword(req.body.password),
        role: req.body.role || "user",
        createdAt: new Date()
      });
      
      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  app.put("/api/users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Don't allow password updates through this endpoint
      const { password, ...userData } = req.body;
      
      const updatedUser = await storage.updateUser(userId, userData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  
  app.delete("/api/users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      // Don't allow deleting your own account
      if (req.user?.id === parseInt(req.params.id)) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      const userId = parseInt(req.params.id);
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  
  // Change password endpoint (admin can change any user's password, users can only change their own)
  app.post("/api/users/:id/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = parseInt(req.params.id);
      
      // Regular users can only change their own password
      if (req.user?.role !== "admin" && req.user?.id !== userId) {
        return res.status(403).json({ error: "Forbidden: You can only change your own password" });
      }
      
      // For regular users, require current password
      if (req.user?.role !== "admin" && req.user?.id === userId) {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: "Current password and new password are required" });
        }
        
        const user = await storage.getUser(userId);
        if (!user || !(await storage.verifyPassword(currentPassword, user.password))) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
        
        await storage.updateUserPassword(userId, newPassword);
        return res.json({ success: true });
      } else {
        // Admin can change password without knowing current password
        const { newPassword } = req.body;
        if (!newPassword) {
          return res.status(400).json({ error: "New password is required" });
        }
        
        await storage.updateUserPassword(userId, newPassword);
        return res.json({ success: true });
      }
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  // Get database statistics and info for settings page
  // Get schema version information
  app.get("/api/schema/versions", async (req, res) => {
    try {
      const versions = await SchemaVersionManager.getAllVersions();
      const currentVersion = await SchemaVersionManager.getCurrentVersion();
      
      res.json({
        versions,
        currentVersion,
        expectedVersion: CURRENT_SCHEMA_VERSION
      });
    } catch (error) {
      console.error("Error getting schema versions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retrieve schema versions" 
      });
    }
  });
  
  // Update schema version to the latest version
  app.post("/api/schema/update", isAuthenticated, async (req, res) => {
    try {
      const latestVersionInfo = SCHEMA_VERSION_HISTORY.find((v: any) => v.version === CURRENT_SCHEMA_VERSION);
      
      if (!latestVersionInfo) {
        return res.status(404).json({ error: "Latest version information not found" });
      }
      
      const newVersion = await SchemaVersionManager.addVersion({
        version: latestVersionInfo.version,
        description: latestVersionInfo.description,
        changes: latestVersionInfo.changes,
        appliedBy: req.user ? req.user.username : 'system',
      });
      
      res.json({
        success: true,
        version: newVersion
      });
    } catch (error) {
      console.error("Error updating schema version:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update schema version" 
      });
    }
  });

  app.get("/api/settings/database", async (req, res) => {
    try {
      // Get PostgreSQL version
      const versionResult = await pool.query("SELECT version()");
      const version = versionResult.rows[0].version.split(" ")[1];
      
      // Get table information
      const tables = ['merchants', 'transactions', 'uploaded_files', 'backup_history', 'schema_versions'];
      const tableStats = [];
      let totalRows = 0;
      let totalSizeBytes = 0;
      
      for (const tableName of tables) {
        try {
          console.log(`Processing table: ${tableName}`);
          // Get row count for each table
          const table = 
            tableName === 'merchants' ? merchantsTable : 
            tableName === 'transactions' ? transactionsTable : 
            tableName === 'backup_history' ? backupHistory : 
            tableName === 'schema_versions' ? schemaVersions : uploadedFilesTable;
          
          console.log(`Selected table object for ${tableName}`);
          
          const rowCountResult = await db.select({ count: count() }).from(table);
          console.log(`Row count result for ${tableName}:`, rowCountResult);
          
          const rowCount = parseInt(rowCountResult[0].count.toString(), 10);
          
          // Get table size in bytes
          const sizeResult = await pool.query(`
            SELECT pg_total_relation_size('${tableName}') as size
          `);
          console.log(`Size result for ${tableName}:`, sizeResult.rows);
          
          const sizeBytes = parseInt(sizeResult.rows[0].size, 10);
          
          tableStats.push({
            name: tableName,
            rowCount,
            sizeBytes
          });
          console.log(`Added ${tableName} to tableStats`);
          
          totalRows += rowCount;
          totalSizeBytes += sizeBytes;
        } catch (error) {
          console.error(`Error processing table ${tableName}:`, error);
          // If we can't get stats for this table, still add a placeholder
          tableStats.push({
            name: tableName,
            rowCount: 0,
            sizeBytes: 0
          });
        }
      }
      
      // Get last backup info from database
      let lastBackup = null;
      try {
        const [latestBackup] = await db
          .select({ timestamp: backupHistory.timestamp })
          .from(backupHistory)
          .orderBy(desc(backupHistory.timestamp))
          .limit(1);
        
        if (latestBackup) {
          lastBackup = latestBackup.timestamp.toISOString();
        }
      } catch (e) {
        console.error('Error getting latest backup info:', e);
      }
      
      res.json({
        connectionStatus: "connected",
        version,
        tables: tableStats,
        totalRows,
        totalSizeBytes,
        lastBackup
      });
    } catch (error) {
      console.error("Error getting database information:", error);
      res.status(500).json({ 
        connectionStatus: "error",
        version: "Unknown",
        tables: [],
        totalRows: 0,
        totalSizeBytes: 0,
        lastBackup: null,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // System information endpoint with fallback storage status
  app.get("/api/system/info", async (req, res) => {
    try {
      // Get environment information from env-config
      const { NODE_ENV, isProd, isDev, isTest } = await import('./env-config');
      // Get version information
      const { APP_VERSION, BUILD_DATE } = await import('@shared/version');
      
      // Enhanced fallback detection
      const storageType = storage.constructor.name;
      const isFallbackDetected = 
        isFallbackStorage === true || 
        storageType === 'MemStorageFallback';
      
      console.log('Storage status check:', {
        storageType,
        isFallbackStorage,
        isFallbackDetected
      });
      
      // Return system information including fallback storage status
      res.json({
        environment: {
          name: NODE_ENV,
          isProd,
          isDev,
          isTest
        },
        storage: {
          fallbackMode: isFallbackDetected,
          storageType: storageType,
          type: isFallbackDetected ? 'memory' : 'database'
        },
        version: {
          appVersion: APP_VERSION,
          buildDate: BUILD_DATE
        },
        uptime: process.uptime()
      });
    } catch (error) {
      console.error("Error getting system information:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retrieve system information"
      });
    }
  });
  
  // Create database backup using direct SQL queries
  app.post("/api/settings/backup", isAuthenticated, async (req, res) => {
    try {
      // Import the BackupManager and S3 config dynamically
      const { backupManager } = await import('./backup/backup_manager');
      const { loadS3Config, saveS3Config } = await import('./backup/s3_config');
      
      // Get the current S3 config
      const s3Config = loadS3Config();
      
      // Update config with useS3 option if provided
      if (req.body.useS3 === true) {
        s3Config.enabled = true;
        // Save the updated config
        saveS3Config(s3Config);
      }
      
      // Create the backup using the manager
      const backupId = await backupManager.createBackup({
        notes: req.body.notes || "Created via API",
        useS3: req.body.useS3,
        userId: req.user?.id
      });
      
      // Get the backup record with details
      const [backup] = await db.select().from(backupHistory).where(eq(backupHistory.id, backupId));
      
      // Success response
      res.json({
        success: true,
        message: "Database backup created successfully",
        timestamp: new Date().toISOString(),
        backup,
        storageType: backup?.storageType || "local"
      });
    } catch (error) {
      console.error("Error creating database backup:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to create database backup" 
      });
    }
  });
  
  // Get backup history
  app.get("/api/settings/backup/history", isAuthenticated, async (req, res) => {
    try {
      // Check if we should include deleted backups
      const includeDeleted = req.query.includeDeleted === 'true';
      
      let backupRecords;
      
      // Use Drizzle's SQL template literal to safely execute raw SQL
      const query = includeDeleted 
        ? sql`SELECT * FROM backup_history ORDER BY timestamp DESC LIMIT 20` 
        : sql`SELECT * FROM backup_history WHERE deleted = false ORDER BY timestamp DESC LIMIT 20`;
        
      const result = await db.execute(query);
      backupRecords = result.rows;
      
      console.log("Backup history raw records:", JSON.stringify(backupRecords, null, 2));
      
      // Transform the data to match client expectations
      const transformedRecords = backupRecords.map((record: any) => ({
        id: record.id,
        timestamp: record.timestamp,
        fileName: record.file_name,
        size: parseInt(record.size),
        tables: typeof record.tables === 'string' ? JSON.parse(record.tables) : record.tables,
        downloaded: record.downloaded,
        deleted: record.deleted,
        storageType: record.storage_type,
        s3Bucket: record.s3_bucket,
        s3Key: record.s3_key,
        notes: record.notes
      }));
      
      console.log("Transformed backup history:", JSON.stringify(transformedRecords, null, 2));
      
      res.json(transformedRecords);
    } catch (error) {
      console.error("Error retrieving backup history:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to retrieve backup history" 
      });
    }
  });
  
  // Download a specific backup by ID
  app.get("/api/settings/backup/download/:id", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup record in the database
      const [backup] = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup with specified ID not found." 
        });
      }
      
      if (!backup.filePath || !fs.existsSync(backup.filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup file not found. The temporary file may have been deleted." 
        });
      }
      
      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename=${backup.fileName}`);
      res.setHeader('Content-Type', 'application/json');
      
      // Update the downloaded status
      await db
        .update(backupHistory)
        .set({ downloaded: true })
        .where(eq(backupHistory.id, backupId));
      
      // Stream the file to client
      if (!backup.filePath) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup file path is missing." 
        });
      }
      const fileStream = fs.createReadStream(backup.filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to download backup file" 
      });
    }
  });
  
  // Soft delete a backup
  app.delete("/api/settings/backup/:id", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup record
      const [backup] = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup with specified ID not found." 
        });
      }
      
      // Mark the backup as deleted (soft delete)
      await db
        .update(backupHistory)
        .set({ deleted: true })
        .where(eq(backupHistory.id, backupId));
      
      res.json({ 
        success: true, 
        message: "Backup moved to trash successfully" 
      });
    } catch (error) {
      console.error("Error deleting backup:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to delete backup" 
      });
    }
  });
  
  // Restore a backup from trash
  app.post("/api/settings/backup/:id/restore", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup record
      const [backup] = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup with specified ID not found." 
        });
      }
      
      // Mark the backup as not deleted (restore)
      await db
        .update(backupHistory)
        .set({ deleted: false })
        .where(eq(backupHistory.id, backupId));
      
      res.json({ 
        success: true, 
        message: "Backup restored successfully" 
      });
    } catch (error) {
      console.error("Error restoring backup:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to restore backup" 
      });
    }
  });
  
  // Download the latest database backup
  app.get("/api/settings/backup/download", async (req, res) => {
    try {
      // Get the most recent backup from the database
      const [latestBackup] = await db
        .select()
        .from(backupHistory)
        .orderBy(desc(backupHistory.timestamp))
        .limit(1);
      
      if (!latestBackup) {
        return res.status(404).json({ 
          success: false, 
          error: "No backup found. Please create a backup first." 
        });
      }
      
      if (!latestBackup.filePath || !fs.existsSync(latestBackup.filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup file not found. The temporary file may have been deleted." 
        });
      }
      
      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename=${latestBackup.fileName}`);
      res.setHeader('Content-Type', 'application/json');
      
      // Update the downloaded status
      await db
        .update(backupHistory)
        .set({ downloaded: true })
        .where(eq(backupHistory.id, latestBackup.id));
      
      // Stream the file to client
      if (!latestBackup.filePath) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup file path is missing." 
        });
      }
      const fileStream = fs.createReadStream(latestBackup.filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to download backup file" 
      });
    }
  });
  
  // Get dashboard stats
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });
  
  // Get analytics data
  app.get("/api/analytics", async (req, res) => {
    try {
      const timeframe = req.query.timeframe as string || 'year';
      const dashboardStats = await storage.getDashboardStats();
      
      // Log the requested timeframe for debugging
      console.log(`Analytics request for timeframe: ${timeframe}`);
      
      // Get transaction history data for the charts
      const allTransactions = await db.select({
        transaction: transactionsTable,
        merchantName: merchantsTable.name
      })
      .from(transactionsTable)
      .innerJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id))
      .orderBy(transactionsTable.date);
      
      // Get unique merchant categories
      const merchantCategories = await db.select({
        category: merchantsTable.category, 
        count: count()
      })
      .from(merchantsTable)
      .where(isNotNull(merchantsTable.category))
      .groupBy(merchantsTable.category);
      
      // Prepare category data
      const categoryData = merchantCategories.map(cat => ({
        name: cat.category || "Uncategorized",
        value: Number(cat.count)
      }));
      
      // Special case for year view to show real transaction data by month
      if (timeframe === 'year') {
        console.log(`ANALYTICS - Total transactions found: ${allTransactions.length}`);
        
        // Print some sample data for diagnosis
        if (allTransactions.length > 0) {
          console.log("ANALYTICS - Sample transaction dates:");
          for (let i = 0; i < Math.min(10, allTransactions.length); i++) {
            console.log(`Transaction ${i}: ${new Date(allTransactions[i].transaction.date).toISOString()}`);
          }
        }
        
        // Group transactions by month and year based on actual data
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = new Map<string, { transactions: number; revenue: number; year: number }>();
        
        // Process all transactions to group by month/year
        allTransactions.forEach(item => {
          const { transaction } = item;
          const date = new Date(transaction.date);
          const year = date.getFullYear();
          const monthIndex = date.getMonth();
          const monthName = monthNames[monthIndex];
          const key = `${year}-${monthName}`;
          
          const amount = parseFloat(transaction.amount.toString());
          
          if (!monthlyData.has(key)) {
            monthlyData.set(key, { transactions: 0, revenue: 0, year });
          }
          
          const monthData = monthlyData.get(key)!;
          monthData.transactions++;
          
          // Add to revenue (respecting transaction type)
          if (transaction.type === "Credit" || transaction.type === "Sale") {
            monthData.revenue += amount;
          } else if (transaction.type === "Debit" || transaction.type === "Refund") {
            monthData.revenue -= amount;
          }
        });
        
        // Convert map to array format expected by frontend
        const finalMonthlyData = Array.from(monthlyData.entries()).map(([key, data]) => {
          const [year, monthName] = key.split('-');
          return {
            name: monthName,
            transactions: data.transactions,
            revenue: data.revenue,
            year: parseInt(year)
          };
        });
        
        // Get current year and previous year for display
        const currentYear = new Date().getFullYear();
        const previousYear = currentYear - 1;
        
        // Create complete month structure for both years if data exists
        const completeMonthlyData: any[] = [];
        
        // Check if we have data for current year or previous year
        const hasCurrentYearData = finalMonthlyData.some(d => d.year === currentYear);
        const hasPreviousYearData = finalMonthlyData.some(d => d.year === previousYear);
        
        // Add months for previous year if we have data
        if (hasPreviousYearData) {
          monthNames.forEach(monthName => {
            const existingData = finalMonthlyData.find(d => d.year === previousYear && d.name === monthName);
            completeMonthlyData.push({
              name: monthName,
              transactions: existingData?.transactions || 0,
              revenue: existingData?.revenue || 0,
              year: previousYear
            });
          });
        }
        
        // Add months for current year if we have data
        if (hasCurrentYearData) {
          monthNames.forEach(monthName => {
            const existingData = finalMonthlyData.find(d => d.year === currentYear && d.name === monthName);
            completeMonthlyData.push({
              name: monthName,
              transactions: existingData?.transactions || 0,
              revenue: existingData?.revenue || 0,
              year: currentYear
            });
          });
        }
        
        // If no current/previous year data, fall back to showing whatever years we have
        const dataToUse = completeMonthlyData.length > 0 ? completeMonthlyData : finalMonthlyData;
        
        // Sort by year and month
        dataToUse.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return monthNames.indexOf(a.name) - monthNames.indexOf(b.name);
        });
        
        console.log(`ANALYTICS - Generated monthly data from actual transactions`);
        console.log(`Generated monthly data: ${JSON.stringify(dataToUse)}`);
        
        // Calculate summary metrics from actual data
        const totalTransactions = dataToUse.reduce((sum, month) => sum + month.transactions, 0);
        const totalRevenue = dataToUse.reduce((sum, month) => sum + month.revenue, 0);
        const avgTransactionValue = totalTransactions > 0 
          ? Number((totalRevenue / totalTransactions).toFixed(2))
          : 0;
        
        res.json({
          transactionData: dataToUse,
          merchantCategoryData: categoryData,
          summary: {
            totalTransactions: totalTransactions,
            totalRevenue: totalRevenue,
            totalMerchants: dashboardStats.totalMerchants,
            avgTransactionValue: avgTransactionValue,
            growthRate: 0 // No growth data available without historical comparison
          }
        });
        return;
      }
      
      // For other timeframes, keep the original logic
      const groupedTransactions = new Map();
      
      // Define time range based on timeframe
      const now = new Date();
      let startDate = new Date();
      
      switch(timeframe) {
        case 'day':
          // For day view, start 24 hours ago
          startDate.setHours(now.getHours() - 24);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          startDate.setMonth(now.getMonth() - 3);
          break;
      }
      
      // Process transactions
      allTransactions.forEach(item => {
        const { transaction } = item;
        const txDate = new Date(transaction.date);
        
        // Skip if before our time range
        if (txDate < startDate) return;
        
        // Format date key based on timeframe
        let dateKey;
        if (timeframe === 'day') {
          // For day view, use hour format
          dateKey = txDate.getHours().toString() + ':00';
        } else if (timeframe === 'week') {
          // For week view, use day name
          dateKey = txDate.toLocaleDateString('en-US', { weekday: 'short' });
        } else if (timeframe === 'month') {
          // For month view, use day of month
          dateKey = txDate.getDate().toString();
        } else {
          // For quarter view, use month name
          dateKey = txDate.toLocaleDateString('en-US', { month: 'short' });
        }
        
        if (!groupedTransactions.has(dateKey)) {
          groupedTransactions.set(dateKey, { 
            name: dateKey, 
            transactions: 0, 
            revenue: 0 
          });
        }
        
        const entry = groupedTransactions.get(dateKey);
        entry.transactions++;
        
        // Calculate revenue based on transaction type
        const amount = parseFloat(transaction.amount.toString());
        if (transaction.type === "Credit") {
          entry.revenue += amount;
        } else if (transaction.type === "Debit") {
          entry.revenue -= amount;
        } else if (transaction.type === "Sale") {
          entry.revenue += amount;
        } else if (transaction.type === "Refund") {
          entry.revenue -= amount;
        }
      });
      
      // Convert to array and ensure chronological order
      const transactionData = Array.from(groupedTransactions.values());
      
      // Sort by month if needed (for timeframes longer than a week)
      if (timeframe !== 'week') {
        const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        transactionData.sort((a, b) => monthOrder.indexOf(a.name) - monthOrder.indexOf(b.name));
      }
      
      // Return analytics data
      res.json({
        transactionData,
        merchantCategoryData: categoryData,
        summary: {
          totalTransactions: dashboardStats.dailyTransactions,
          totalRevenue: dashboardStats.monthlyRevenue,
          totalMerchants: dashboardStats.totalMerchants,
          avgTransactionValue: 
            dashboardStats.dailyTransactions > 0 
              ? Number((dashboardStats.monthlyRevenue / dashboardStats.dailyTransactions).toFixed(2))
              : 0,
          growthRate: 12.7 // This would need historical data to calculate properly
        }
      });
    } catch (error) {
      console.error("Error fetching analytics data:", error);
      res.status(500).json({ error: "Failed to fetch analytics data" });
    }
  });

  // Get merchants with pagination and filters
  app.get("/api/merchants", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string || "All";
      const lastUpload = req.query.lastUpload as string || "Any time";
      const search = req.query.search as string || "";

      const result = await storage.getMerchants(page, limit, status, lastUpload, search);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchants" });
    }
  });

  // Upload CSV files
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const type = req.body.type;
      if (!type || (type !== "merchant" && type !== "transaction")) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      const fileId = await storage.processUploadedFile(req.file.path, type, req.file.originalname);
      res.json({ 
        fileId,
        success: true,
        message: "File uploaded successfully"
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload file" 
      });
    }
  });

  // Get file processor status
  app.get("/api/file-processor/status", async (req, res) => {
    try {
      const status = fileProcessorService.getProcessingStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting file processor status:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get processor status"
      });
    }
  });

  // Pause file processor
  app.post("/api/file-processor/pause", async (req, res) => {
    try {
      fileProcessorService.pause();
      res.json({ success: true, message: "File processor paused" });
    } catch (error) {
      console.error("Error pausing file processor:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to pause processor"
      });
    }
  });

  // Resume file processor
  app.post("/api/file-processor/resume", async (req, res) => {
    try {
      fileProcessorService.resume();
      res.json({ success: true, message: "File processor resumed" });
    } catch (error) {
      console.error("Error resuming file processor:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to resume processor"
      });
    }
  });
  
  // Force processing of unprocessed files
  app.post("/api/file-processor/force-process", async (req, res) => {
    try {
      const status = await fileProcessorService.forceProcessing();
      res.json({
        success: true,
        message: "File processing triggered",
        status
      });
    } catch (error) {
      console.error("Error forcing file processing:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to trigger file processing"
      });
    }
  });

  // Process uploaded files
  app.post("/api/process-uploads", async (req, res) => {
    try {
      console.log("Process-uploads request received:", req.body);
      
      const schema = z.object({
        fileIds: z.array(z.string())
      });

      const { fileIds } = schema.parse(req.body);
      
      if (fileIds.length === 0) {
        console.error("No files to process in request");
        return res.status(400).json({ error: "No files to process" });
      }
      
      console.log(`Processing ${fileIds.length} files with IDs:`, fileIds);

      // Mark these files as "pending processing" in the database
      for (const fileId of fileIds) {
        try {
          await db.update(uploadedFilesTable)
            .set({ 
              processed: false, 
              processingErrors: null 
            })
            .where(eq(uploadedFilesTable.id, fileId));
        } catch (updateError) {
          console.error(`Error updating file status for ${fileId}:`, updateError);
        }
      }
      
      // Let the file processor service handle the processing
      // The service runs every minute and will pick up these files
      res.json({ 
        success: true, 
        message: `${fileIds.length} files queued for processing. Files will be processed in background.`
      });
      
      // Also trigger immediate processing (but don't wait for it)
      fileProcessorService.forceProcessing()
        .catch(err => console.error("Error triggering file processing:", err));
        
    } catch (error) {
      console.error("Error in process-uploads endpoint:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process files" 
      });
    }
  });

  // Get upload file history
  app.get("/api/uploads/history", async (req, res) => {
    try {
      // Use raw SQL to get all uploaded files with processing status including processed_at
      const result = await db.execute(sql`
        SELECT 
          id, 
          original_filename as "originalFilename", 
          storage_path as "storagePath", 
          file_type as "fileType", 
          uploaded_at as "uploadedAt", 
          processed, 
          processing_errors as "processingErrors", 
          processed_at as "processedAt", 
          deleted 
        FROM uploaded_files 
        WHERE deleted = false 
        ORDER BY uploaded_at DESC
      `);
      
      res.json(result.rows);
    } catch (error) {
      console.error("Error retrieving upload history:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retrieve upload history" 
      });
    }
  });
  
  // Download original uploaded file
  app.get("/api/uploads/:id/download", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Get file info
      const [fileInfo] = await db.select()
        .from(uploadedFilesTable)
        .where(eq(uploadedFilesTable.id, fileId));
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      res.download(fileInfo.storagePath, fileInfo.originalFilename);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to download file"
      });
    }
  });
  
  // View file content
  app.get("/api/uploads/:id/content", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Get file info
      const [fileInfo] = await db.select()
        .from(uploadedFilesTable)
        .where(eq(uploadedFilesTable.id, fileId));
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Read the file content - limit to first 100 rows for performance
      const parser = fs.createReadStream(fileInfo.storagePath).pipe(
        parseCSV({
          columns: true,
          skip_empty_lines: true
        })
      );
      
      const rows: any[] = [];
      let headers: string[] = [];
      let rowCount = 0;
      
      parser.on("data", (row) => {
        if (rowCount === 0) {
          headers = Object.keys(row);
        }
        if (rowCount < 100) { // Limit to 100 rows
          rows.push(row);
        }
        rowCount++;
      });
      
      parser.on("error", (error) => {
        res.status(500).json({ error: "Failed to parse CSV file" });
      });
      
      parser.on("end", () => {
        res.json({
          headers,
          rows,
          totalRows: rowCount,
          truncated: rowCount > 100
        });
      });
    } catch (error) {
      console.error("Error retrieving file content:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to retrieve file content"
      });
    }
  });
  
  // Reprocess file
  app.post("/api/uploads/:id/reprocess", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Get file info
      const [fileInfo] = await db.select()
        .from(uploadedFilesTable)
        .where(eq(uploadedFilesTable.id, fileId));
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check if the file still exists
      if (!fs.existsSync(fileInfo.storagePath)) {
        // File doesn't exist anymore - update error in database
        await db.update(uploadedFilesTable)
          .set({ 
            processed: true,
            processingErrors: "Original file has been removed from the temporary storage. Please re-upload the file."
          })
          .where(eq(uploadedFilesTable.id, fileId));
          
        return res.status(404).json({ 
          error: "File no longer exists in temporary storage. Please re-upload the file."
        });
      }
      
      // Mark file as queued for reprocessing (not processed, no errors)
      await db.update(uploadedFilesTable)
        .set({ 
          processed: false,
          processingErrors: null,
          processedAt: null 
        })
        .where(eq(uploadedFilesTable.id, fileId));
      
      // Respond immediately that the file is queued
      res.json({ 
        success: true, 
        message: "File queued for reprocessing. Processing will happen in background.",
        status: "queued"
      });
      
      // Trigger background processing (but don't wait for it)
      fileProcessorService.forceProcessing()
        .catch(err => console.error("Error triggering file processing:", err));
        
    } catch (error) {
      console.error("Error queuing file for reprocessing:", error);
      
      // Update file with the error message
      if (req.params.id) {
        await db.update(uploadedFilesTable)
          .set({ 
            processed: true,
            processingErrors: error instanceof Error ? error.message : "Unknown error during reprocessing" 
          })
          .where(eq(uploadedFilesTable.id, req.params.id));
      }
      
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to queue file for reprocessing"
      });
    }
  });
  
  // Soft delete file
  app.delete("/api/uploads/:id", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Get file info
      const [fileInfo] = await db.select()
        .from(uploadedFilesTable)
        .where(eq(uploadedFilesTable.id, fileId));
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Mark file as deleted (soft delete)
      await db.update(uploadedFilesTable)
        .set({ deleted: true })
        .where(eq(uploadedFilesTable.id, fileId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to delete file"
      });
    }
  });

  // Download combined transaction CSV
  app.get("/api/export/transactions", async (req, res) => {
    try {
      const filePath = await storage.generateTransactionsExport();
      res.download(filePath, "combined_transactions.csv");
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate export" 
      });
    }
  });

  // Export endpoints for the dedicated Exports page
  app.get("/api/exports/merchants/download", async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      
      const csvFilePath = await storage.exportMerchantsToCSV(startDate, endDate);
      
      // Track the export in audit log
      await storage.createAuditLog({
        userId: req.user?.id || null,
        username: req.user?.username || 'unknown',
        action: 'export_merchants',
        entityType: 'merchants',
        entityId: `export_${Date.now()}`,
        notes: `Merchants export${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
      });
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `merchants_export_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting merchants:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export merchants" 
      });
    }
  });

  app.get("/api/exports/transactions/download", async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      
      const csvFilePath = await storage.exportTransactionsToCSV(undefined, startDate, endDate, undefined);
      
      // Track the export in audit log
      await storage.createAuditLog({
        userId: req.user?.id || null,
        username: req.user?.username || 'unknown',
        action: 'export_transactions',
        entityType: 'transactions',
        entityId: `export_${Date.now()}`,
        notes: `Transactions export${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
      });
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `transactions_export_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export transactions" 
      });
    }
  });

  app.get("/api/exports/batch-summary/download", async (req, res) => {
    try {
      const targetDate = req.query.targetDate as string;
      
      if (!targetDate) {
        return res.status(400).json({ 
          error: "Target date is required for batch summary export" 
        });
      }
      
      const csvFilePath = await storage.exportBatchSummaryToCSV(targetDate);
      
      // TODO: Fix audit logging for export operations
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `batch_summary_export_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting batch summary:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export batch summary" 
      });
    }
  });

  // Export all merchants for a specific date
  app.get("/api/exports/merchants-all/download", async (req, res) => {
    try {
      const targetDate = req.query.targetDate as string;
      
      if (!targetDate) {
        return res.status(400).json({ error: "Target date is required" });
      }
      
      const csvFilePath = await storage.exportAllMerchantsForDateToCSV(targetDate);
      
      // Track the export in audit log
      await storage.createAuditLog({
        userId: req.user?.id || null,
        username: req.user?.username || 'unknown',
        action: 'export_merchants_all',
        entityType: 'merchants',
        entityId: `export_all_${Date.now()}`,
        notes: `All merchants export for date ${targetDate}`
      });
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `merchants_all_${targetDate.replace(/[:.]/g, '-')}_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting all merchants:", error);
      res.status(500).json({
        error: "Failed to export all merchants to CSV"
      });
    }
  });

  // Export all data types for a specific date (ZIP file)
  app.get("/api/exports/all-data/download", isAuthenticated, async (req, res) => {
    try {
      const targetDate = req.query.targetDate as string;
      
      if (!targetDate) {
        return res.status(400).json({ error: "Target date is required" });
      }

      const { filePaths, zipPath } = await storage.exportAllDataForDateToCSV(targetDate);
      
      // Track the export in audit log
      await storage.createAuditLog({
        userId: req.user?.id || null,
        username: req.user?.username || 'unknown',
        action: 'export_all_data',
        entityType: 'export',
        entityId: `export_all_data_${Date.now()}`,
        notes: `All data export for date ${targetDate} - includes merchants, transactions, and batch summary`
      });
      
      // Set headers for ZIP download
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `all_exports_${targetDate.replace(/[/]/g, '-')}_${timestamp}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Send the ZIP file
      const fs = await import('fs');
      const fileStream = fs.createReadStream(zipPath);
      
      fileStream.on('end', () => {
        // Clean up the file after sending
        try {
          fs.unlinkSync(zipPath);
        } catch (cleanupError) {
          console.warn('Warning: Could not clean up export file:', cleanupError);
        }
      });
      
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error exporting all data for date:', error);
      res.status(500).json({ error: "Failed to export all data" });
    }
  });

  // Get export history from audit logs
  app.get("/api/exports/history", isAuthenticated, async (req, res) => {
    try {
      // Get export logs with proper filtering for export actions only
      const exportActions = ['export_merchants', 'export_transactions', 'export_batch_summary', 'export_merchants_all', 'export_all_data'];
      
      // Get logs for each export action and combine them
      let allExportLogs: any[] = [];
      for (const action of exportActions) {
        const logs = await storage.getAuditLogs({
          action: action,
          limit: 50,
          page: 1
        });
        allExportLogs = allExportLogs.concat(logs);
      }
      
      // Sort combined logs by timestamp (newest first) and limit to 50 most recent
      allExportLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const recentExportLogs = allExportLogs.slice(0, 50);
      
      // Transform audit logs into export history format
      const exportHistory = recentExportLogs.map(log => {
        const exportType = log.action.replace('export_', '');
        const timestamp = new Date(log.timestamp).toISOString().replace(/[:.]/g, '-');
        const dateStr = new Date(log.timestamp).toLocaleDateString('en-US');
        
        // Determine file extension and estimated size based on export type
        let fileExtension = '.csv';
        let estimatedSize = 50000; // Default 50KB
        
        if (exportType === 'all_data') {
          fileExtension = '.zip';
          estimatedSize = 300000; // 300KB for ZIP files
        } else if (exportType === 'transactions') {
          estimatedSize = 150000; // 150KB for transaction exports
        } else if (exportType === 'batch_summary') {
          estimatedSize = 25000; // 25KB for batch summaries
        } else if (exportType === 'merchants' || exportType === 'merchants_all') {
          estimatedSize = 75000; // 75KB for merchant exports
        }
        
        return {
          id: `export-${log.id}`,
          name: `${exportType}_export_${dateStr.replace(/\//g, '-')}${fileExtension}`,
          type: exportType.replace('_', '-'),
          createdAt: log.timestamp,
          size: estimatedSize,
          records: null, 
          status: "completed"
        };
      });
      
      res.json(exportHistory);
    } catch (error) {
      console.error("Error fetching export history:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch export history" 
      });
    }
  });

  // Download merchant demographics export
  app.get("/api/export/merchants", async (req, res) => {
    try {
      const filePath = await storage.generateMerchantsExport();
      res.download(filePath, "merchant_demographics.csv");
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate export" 
      });
    }
  });
  
  // Get merchant details by ID
  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const merchantDetails = await storage.getMerchantById(merchantId);
      res.json(merchantDetails);
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch merchant details" 
      });
    }
  });
  
  // Create a new merchant
  app.post("/api/merchants", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1, { message: "Name is required" }),
        clientMID: z.string().nullable().optional(),
        status: z.string().optional(),
        merchantType: z.string().nullable().optional(),
        salesChannel: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        category: z.string().nullable().optional()
      });
      
      const merchantData = schema.parse(req.body);
      
      // Set the updatedBy field to the logged-in user's username
      let updatedBy = "System";
      
      // If a user is logged in, use their username
      if (req.user && req.user.username) {
        updatedBy = req.user.username;
      }
      
      // Create merchant with current date
      const newMerchant = await storage.createMerchant({
        ...merchantData,
        id: `M${Date.now().toString().slice(-4)}`,
        createdAt: new Date(),
        editDate: new Date(),
        lastUploadDate: null,
        updatedBy: updatedBy
      });
      
      res.status(201).json({ 
        success: true, 
        merchant: newMerchant
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create merchant" 
      });
    }
  });
  
  // Update merchant details
  app.put("/api/merchants/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = req.params.id;
      const schema = z.object({
        name: z.string().optional(),
        clientMID: z.string().nullable().optional(),
        status: z.string().optional(),
        merchantType: z.string().nullable().optional(),
        salesChannel: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        category: z.string().nullable().optional()
      });
      
      const merchantData = schema.parse(req.body);
      
      // Set the updatedBy field to the logged-in user's username
      let updatedBy = "System";
      
      // If a user is logged in, use their username
      if (req.user && req.user.username) {
        updatedBy = req.user.username;
      }
      
      // Check if this is from a file upload by checking referrer or headers
      const referrer = req.get('Referrer') || '';
      if (referrer.includes('/uploads') || req.get('X-File-Upload')) {
        updatedBy = "System-Uploader";
      }
      
      // Always update the edit date and updatedBy when merchant details are changed
      const updatedMerchantData = {
        ...merchantData,
        editDate: new Date(),
        updatedBy: updatedBy
      };
      
      const updatedMerchant = await storage.updateMerchant(merchantId, updatedMerchantData);
      
      res.json({ 
        success: true, 
        merchant: updatedMerchant 
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update merchant" 
      });
    }
  });
  
  // Add transaction for a merchant
  app.post("/api/merchants/:id/transactions", async (req, res) => {
    try {
      const { id } = req.params;
      const transactionSchema = z.object({
        amount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
          message: "Amount must be a valid positive number"
        }),
        type: z.string(),
        date: z.string().refine(val => !isNaN(Date.parse(val)), {
          message: "Date must be valid"
        })
      });
      
      const transactionData = transactionSchema.parse(req.body);
      const newTransaction = await storage.addTransaction(id, transactionData);
      
      res.status(201).json(newTransaction);
    } catch (error) {
      console.error('Error adding transaction:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to add transaction" 
      });
    }
  });
  
  // Delete transactions
  app.post("/api/merchants/:id/transactions/delete", async (req, res) => {
    try {
      const schema = z.object({
        transactionIds: z.array(z.string())
      });
      
      const { transactionIds } = schema.parse(req.body);
      
      if (transactionIds.length === 0) {
        return res.status(400).json({ error: "No transaction IDs provided" });
      }
      
      await storage.deleteTransactions(transactionIds);
      
      res.json({ 
        success: true, 
        message: `${transactionIds.length} transaction(s) deleted successfully` 
      });
    } catch (error) {
      console.error('Error deleting transactions:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete transactions" 
      });
    }
  });
  
  // Global transaction deletion endpoint (for orphaned transactions)
  app.post("/api/transactions/delete", async (req, res) => {
    try {
      const schema = z.object({
        transactionIds: z.array(z.string())
      });
      
      const { transactionIds } = schema.parse(req.body);
      
      if (transactionIds.length === 0) {
        return res.status(400).json({ error: "No transaction IDs provided" });
      }
      
      await storage.deleteTransactions(transactionIds);
      
      res.json({ 
        success: true, 
        message: `${transactionIds.length} transaction(s) deleted successfully` 
      });
    } catch (error) {
      console.error('Error deleting transactions:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete transactions" 
      });
    }
  });
  
  // Get transactions with pagination and filtering
  app.get("/api/transactions", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string || '1');
      const limit = parseInt(req.query.limit as string || '20');
      const merchantId = req.query.merchantId as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const type = req.query.type as string | undefined;
      const transactionId = req.query.transactionId as string | undefined;
      
      console.log("Transaction query params:", { page, limit, merchantId, startDate, endDate, type, transactionId });
      
      const transactions = await storage.getTransactions(
        page,
        limit,
        merchantId,
        startDate,
        endDate,
        type,
        transactionId
      );
      
      console.log(`Returning ${transactions.transactions.length} transactions, total: ${transactions.pagination.totalItems}`);
      
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch transactions" 
      });
    }
  });
  
  // Export transactions to CSV
  app.get("/api/transactions/export", async (req, res) => {
    try {
      const merchantId = req.query.merchantId as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const type = req.query.type as string | undefined;
      const transactionId = req.query.transactionId as string | undefined;
      
      const csvFilePath = await storage.exportTransactionsToCSV(
        merchantId,
        startDate,
        endDate,
        type,
        transactionId
      );
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `transactions_export_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export transactions" 
      });
    }
  });
  
  // Delete multiple merchants
  app.post("/api/merchants/delete", async (req, res) => {
    try {
      const { merchantIds } = req.body;
      
      if (!merchantIds || !Array.isArray(merchantIds) || merchantIds.length === 0) {
        return res.status(400).json({ error: "Invalid request: merchantIds must be a non-empty array" });
      }
      
      await storage.deleteMerchants(merchantIds);
      res.json({ success: true, message: `Successfully deleted ${merchantIds.length} merchants` });
    } catch (error) {
      console.error('Error deleting merchants:', error);
      res.status(500).json({ error: "Failed to delete merchants" });
    }
  });

  // Database Connection Settings Routes
  
  // Get current database connection settings
  app.get("/api/settings/connection", isAuthenticated, async (req, res) => {
    try {
      const config = loadDatabaseConfig();
      
      // Mask the password for security
      if (config.password) {
        config.password = "";
      }
      
      res.json(config);
    } catch (error) {
      console.error("Error loading database connection settings:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to load database connection settings" 
      });
    }
  });
  
  // Update database connection settings
  app.post("/api/settings/connection", isAuthenticated, async (req, res) => {
    try {
      const config = req.body;
      
      // Basic validation
      if (config.url || (config.host && config.database && config.username)) {
        saveDatabaseConfig(config);
        
        // Return success
        res.json({ 
          success: true, 
          message: "Database connection settings updated successfully" 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: "Invalid database configuration. Please provide either a connection URL or host, database, and username." 
        });
      }
    } catch (error) {
      console.error("Error saving database connection settings:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to save database connection settings" 
      });
    }
  });
  
  // Test database connection
  app.post("/api/settings/connection/test", isAuthenticated, async (req, res) => {
    try {
      const config = req.body;
      
      // Test the connection
      try {
        const isConnected = await testDatabaseConnection(config);
        
        if (isConnected) {
          res.json({ 
            success: true, 
            message: "Successfully connected to the database" 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: "Failed to connect to the database with the provided settings" 
          });
        }
      } catch (connectionError) {
        console.error("Database connection test error:", connectionError);
        res.status(400).json({ 
          success: false, 
          error: connectionError instanceof Error ? connectionError.message : "Failed to connect to database" 
        });
      }
    } catch (error) {
      console.error("Error testing database connection:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to test database connection" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
