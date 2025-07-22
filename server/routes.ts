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
import { getTableName } from "./table-config";

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
  auditLogs as auditLogsTable,
  systemLogs as systemLogsTable,
  backupHistory,
  InsertBackupHistory,
  schemaVersions,
  backupSchedules as backupSchedulesTable,
  users as usersTable,
  terminals as terminalsTable,
  tddfRecords as tddfRecordsTable,
  insertTerminalSchema,
  tddfRecordsSchema,
  TddfRecord,
  InsertTddfRecord
} from "@shared/schema";
import { SchemaVersionManager, CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_HISTORY, getCurrentFileVersion } from "./schema_version";

const execPromise = promisify(exec);

// Create persistent upload directory
const uploadDir = path.join(process.cwd(), 'tmp_uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Created upload directory: ${uploadDir}`);
}

// Set up multer for file uploads with persistent storage
const upload = multer({ 
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for large TDDF files
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
      
      // Log user creation
      await storage.createAuditLog({
        entityType: "user",
        entityId: `${user.id}`,
        action: "create",
        oldValues: {},
        newValues: {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        },
        username: req.user?.username || "System",
        notes: `New user '${user.username}' created with role '${user.role}'`,
        timestamp: new Date()
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
      
      // Get original user data for audit logging
      const originalUser = await storage.getUser(userId);
      if (!originalUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Don't allow password updates through this endpoint
      const { password, ...userData } = req.body;
      
      const updatedUser = await storage.updateUser(userId, userData);
      
      // Log user update
      await storage.createAuditLog({
        entityType: "user",
        entityId: `${userId}`,
        action: "update",
        oldValues: {
          username: originalUser.username,
          email: originalUser.email,
          firstName: originalUser.firstName,
          lastName: originalUser.lastName,
          role: originalUser.role
        },
        newValues: {
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role
        },
        username: req.user?.username || "System",
        notes: `User '${originalUser.username}' profile updated`,
        timestamp: new Date()
      });
      
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
      
      // Get user data before deletion for audit logging
      const userToDelete = await storage.getUser(userId);
      if (!userToDelete) {
        return res.status(404).json({ error: "User not found" });
      }
      
      await storage.deleteUser(userId);
      
      // Log user deletion
      await storage.createAuditLog({
        entityType: "user",
        entityId: `${userId}`,
        action: "delete",
        oldValues: {
          username: userToDelete.username,
          email: userToDelete.email,
          firstName: userToDelete.firstName,
          lastName: userToDelete.lastName,
          role: userToDelete.role
        },
        newValues: {},
        username: req.user?.username || "System",
        notes: `User '${userToDelete.username}' (${userToDelete.role}) was deleted`,
        timestamp: new Date()
      });
      
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
      
      // Get user data for audit logging
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // For regular users, require current password
      if (req.user?.role !== "admin" && req.user?.id === userId) {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: "Current password and new password are required" });
        }
        
        if (!(await storage.verifyPassword(currentPassword, targetUser.password))) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
        
        await storage.updateUserPassword(userId, newPassword);
        
        // Log password change by user
        await storage.createAuditLog({
          entityType: "user",
          entityId: `${userId}`,
          action: "password_change",
          oldValues: { passwordChanged: false },
          newValues: { passwordChanged: true },
          username: req.user?.username || "System",
          notes: `User '${targetUser.username}' changed their own password`,
          timestamp: new Date()
        });
        
        return res.json({ success: true });
      } else {
        // Admin can change password without knowing current password
        const { newPassword } = req.body;
        if (!newPassword) {
          return res.status(400).json({ error: "New password is required" });
        }
        
        await storage.updateUserPassword(userId, newPassword);
        
        // Log admin password reset
        await storage.createAuditLog({
          entityType: "user",
          entityId: `${userId}`,
          action: "password_reset",
          oldValues: { passwordChanged: false },
          newValues: { passwordChanged: true },
          username: req.user?.username || "System",
          notes: `Admin '${req.user?.username}' reset password for user '${targetUser.username}'`,
          timestamp: new Date()
        });
        
        return res.json({ success: true });
      }
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  // Get database statistics and info for settings page
  // Get schema version information
  // Import current schema content into database
  app.post("/api/schema/import", async (req, res) => {
    try {
      const fs = await import('fs');
      const crypto = await import('crypto');
      const path = await import('path');
      
      // Read current schema file
      const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const contentHash = crypto.createHash('sha256').update(schemaContent).digest('hex');
      
      // Check if this content already exists
      const existing = await pool.query(`
        SELECT id, version FROM schema_content 
        WHERE content_hash = $1
      `, [contentHash]);
      
      if (existing.rows.length > 0) {
        return res.json({ 
          message: 'Schema content already exists in database',
          version: existing.rows[0].version,
          existing: true
        });
      }
      
      // Extract version from file header
      const versionMatch = schemaContent.match(/Version: ([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : '1.3.0';
      
      // Insert schema content
      const result = await pool.query(`
        INSERT INTO schema_content (
          version, content, file_name, stored_by, content_hash, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, version, stored_at
      `, [
        version,
        schemaContent,
        'schema.ts',
        req.user?.username || 'Alex-ReplitAgent',
        contentHash,
        `MMS-Master-Schema import: Complete schema file content for version ${version}`
      ]);
      
      const record = result.rows[0];
      console.log(`📦 Schema imported: Version ${version} (${schemaContent.length} chars)`);
      
      res.status(201).json({
        message: 'Schema content imported successfully',
        version: version,
        id: record.id,
        contentLength: schemaContent.length,
        storedAt: record.stored_at
      });
      
    } catch (error: any) {
      console.error('Schema import error:', error);
      res.status(500).json({ 
        error: 'Failed to import schema content', 
        details: error.message 
      });
    }
  });

  // Get schema content from database (replaces file system access)
  app.get("/api/schema/raw", async (req, res) => {
    try {
      const { version } = req.query;
      
      let query = `
        SELECT content, version, stored_at 
        FROM schema_content`;
      let params: any[] = [];
      
      if (version && version !== 'current') {
        query += ` WHERE version = $1`;
        params.push(version);
      }
      
      query += ` ORDER BY stored_at DESC LIMIT 1`;
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'No schema content found', 
          suggestion: 'Import schema content first using POST /api/schema/import' 
        });
      }
      
      const schemaRecord = result.rows[0];
      console.log(`📖 Serving schema content: Version ${schemaRecord.version} (${schemaRecord.content.length} chars)`);
      
      res.setHeader('Content-Type', 'text/plain');
      res.send(schemaRecord.content);
      
    } catch (error: any) {
      console.error('Schema retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve schema content', details: error.message });
    }
  });

  // Get available schema versions for selector
  app.get("/api/schema/versions-list", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT version, stored_at, stored_by, file_name, 
               LENGTH(content) as content_size, notes
        FROM schema_content 
        ORDER BY stored_at DESC
      `);
      
      const versions = result.rows.map(row => ({
        version: row.version,
        storedAt: row.stored_at,
        storedBy: row.stored_by,
        fileName: row.file_name,
        contentSize: row.content_size,
        notes: row.notes
      }));
      
      // Get current file version dynamically
      const currentFileVersion = getCurrentFileVersion();
      
      res.json({ 
        versions,
        currentFileVersion: currentFileVersion
      });
      
    } catch (error: any) {
      console.error('Schema versions list error:', error);
      res.status(500).json({ error: 'Failed to retrieve schema versions', details: error.message });
    }
  });

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
      const currentFileVersion = getCurrentFileVersion();
      
      if (!currentFileVersion) {
        return res.status(404).json({ error: "Current file version could not be determined" });
      }
      
      const newVersion = await SchemaVersionManager.addVersion({
        version: currentFileVersion,
        description: `Updated to schema version ${currentFileVersion}`,
        changes: [`Updated database schema to match file version ${currentFileVersion}`],
        appliedBy: req.user ? req.user.username : 'Alex-ReplitAgent',
      });
      
      res.json({
        success: true,
        version: newVersion,
        updatedTo: currentFileVersion
      });
    } catch (error) {
      console.error("Error updating schema version:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update schema version" 
      });
    }
  });

  // Real-time database processing statistics endpoint with TDDF operations
  app.get("/api/processing/real-time-stats", async (req, res) => {
    try {
      // Use environment-specific table names
      const uploadedFilesTableName = getTableName('uploaded_files');
      const transactionsTableName = getTableName('transactions');
      const tddfRecordsTableName = getTableName('tddf_records');
      const tddfRawImportTableName = getTableName('tddf_raw_import');
      
      console.log(`[REAL-TIME STATS] Using tables: ${uploadedFilesTableName}, ${transactionsTableName}, ${tddfRecordsTableName}`);
      
      // Get real-time file processing statistics using new processing_status field
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_files,
          COUNT(CASE WHEN processing_status = 'queued' AND deleted = false THEN 1 END) as queued_files,
          COUNT(CASE WHEN processing_status = 'completed' AND deleted = false THEN 1 END) as processed_files,
          COUNT(CASE WHEN processing_status = 'processing' AND deleted = false THEN 1 END) as currently_processing,
          COUNT(CASE WHEN processing_status = 'failed' AND deleted = false THEN 1 END) as files_with_errors,
          COUNT(CASE WHEN deleted = false AND uploaded_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_files,
          COUNT(CASE WHEN file_type = 'tddf' AND processing_status = 'completed' AND deleted = false THEN 1 END) as tddf_files_processed,
          COUNT(CASE WHEN file_type = 'tddf' AND processing_status = 'queued' AND deleted = false THEN 1 END) as tddf_files_queued
        FROM ${uploadedFilesTableName}
      `);

      // Calculate transaction processing speed based on recent transaction completion timestamps
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const transactionSpeedResult = await pool.query(`
        SELECT COUNT(*) as recent_transactions
        FROM ${transactionsTableName} 
        WHERE recorded_at >= $1
      `, [tenMinutesAgo]);

      // Calculate TDDF records per second from recent TDDF processing (last 10 minutes)
      const tddfSpeedResult = await pool.query(`
        SELECT COUNT(*) as recent_tddf_records
        FROM ${tddfRecordsTableName}
        WHERE recorded_at >= $1
      `, [tenMinutesAgo]);
      
      // Get TDDF-specific statistics
      const tddfStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_tddf_records,
          COALESCE(SUM(transaction_amount::numeric), 0) as total_tddf_amount,
          COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '24 hours' THEN 1 END) as tddf_records_today,
          COUNT(CASE WHEN recorded_at > NOW() - INTERVAL '1 hour' THEN 1 END) as tddf_records_last_hour
        FROM ${tddfRecordsTableName}
      `);
      
      // Get TDDF raw import statistics for comprehensive processing overview
      const tddfRawStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_raw_lines,
          COUNT(CASE WHEN processed_into_table = 'tddf_records' THEN 1 END) as dt_records_processed,
          COUNT(CASE WHEN skip_reason = 'non_dt_record' THEN 1 END) as non_dt_records_skipped,
          COUNT(CASE WHEN skip_reason IS NOT NULL AND skip_reason != 'non_dt_record' THEN 1 END) as other_skipped
        FROM ${tddfRawImportTableName}
      `);

      const stats = result.rows[0];
      const recentTransactions = parseInt(transactionSpeedResult.rows[0]?.recent_transactions || '0');
      const recentTddfRecords = parseInt(tddfSpeedResult.rows[0]?.recent_tddf_records || '0');
      
      // Calculate actual processing speeds (10 minutes = 600 seconds)
      const transactionsPerSecond = recentTransactions > 0 ? recentTransactions / 600 : 0;
      const tddfRecordsPerSecond = recentTddfRecords > 0 ? recentTddfRecords / 600 : 0;
      
      const tddfStats = tddfStatsResult.rows[0];
      const tddfRawStats = tddfRawStatsResult.rows[0];
      
      // Store metrics in database for persistent tracking
      const metricsTableName = getTableName('processing_metrics');
      const currentStats = {
        totalFiles: parseInt(stats.total_files),
        queuedFiles: parseInt(stats.queued_files),
        processedFiles: parseInt(stats.processed_files),
        currentlyProcessing: parseInt(stats.currently_processing),
        filesWithErrors: parseInt(stats.files_with_errors),
        recentFiles: parseInt(stats.recent_files),
        tddfFilesProcessed: parseInt(stats.tddf_files_processed),
        tddfFilesQueued: parseInt(stats.tddf_files_queued),
        transactionsPerSecond: parseFloat(transactionsPerSecond.toFixed(1)),
        tddfRecordsPerSecond: parseFloat(tddfRecordsPerSecond.toFixed(1)),
        tddfOperations: {
          totalTddfRecords: parseInt(tddfStats.total_tddf_records) || 0,
          totalTddfAmount: parseFloat(tddfStats.total_tddf_amount) || 0,
          tddfRecordsToday: parseInt(tddfStats.tddf_records_today) || 0,
          tddfRecordsLastHour: parseInt(tddfStats.tddf_records_last_hour) || 0,
          totalRawLines: parseInt(tddfRawStats.total_raw_lines) || 0,
          dtRecordsProcessed: parseInt(tddfRawStats.dt_records_processed) || 0,
          nonDtRecordsSkipped: parseInt(tddfRawStats.non_dt_records_skipped) || 0,
          otherSkipped: parseInt(tddfRawStats.other_skipped) || 0
        }
      };

      // Get current peak from latest database record
      const latestPeakResult = await pool.query(`
        SELECT peak_transactions_per_second 
        FROM ${metricsTableName} 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      const currentPeak = latestPeakResult.rows[0]?.peak_transactions_per_second || 0;
      const newPeak = Math.max(parseFloat(currentPeak), currentStats.transactionsPerSecond);
      
      // Save metrics snapshot to database
      try {
        await pool.query(`
          INSERT INTO ${metricsTableName} (
            transactions_per_second, 
            peak_transactions_per_second,
            total_files,
            queued_files, 
            processed_files,
            files_with_errors,
            currently_processing,
            system_status,
            metric_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          currentStats.transactionsPerSecond,
          newPeak,
          currentStats.totalFiles,
          currentStats.queuedFiles,
          currentStats.processedFiles,
          currentStats.filesWithErrors,
          currentStats.currentlyProcessing,
          currentStats.currentlyProcessing > 0 ? 'processing' : 'idle',
          'snapshot'
        ]);
      } catch (dbError) {
        console.error('Error saving processing metrics to database:', dbError);
        // Continue without failing the API response
      }
      
      res.json({
        ...currentStats,
        peakTransactionsPerSecond: newPeak,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching real-time processing stats:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch processing statistics" 
      });
    }
  });

  // Get gauge metrics for persistent peak tracking
  app.get("/api/processing/gauge-metrics", async (req, res) => {
    try {
      const metricsTableName = getTableName('processing_metrics');
      
      // Get latest peak value and current speed
      const result = await pool.query(`
        SELECT 
          transactions_per_second,
          peak_transactions_per_second,
          timestamp,
          system_status
        FROM ${metricsTableName} 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        return res.json({
          currentSpeed: 0.0,
          peakSpeed: 0.0,
          systemStatus: 'idle',
          lastUpdated: new Date().toISOString()
        });
      }
      
      const metrics = result.rows[0];
      res.json({
        currentSpeed: parseFloat(metrics.transactions_per_second),
        peakSpeed: parseFloat(metrics.peak_transactions_per_second),
        systemStatus: metrics.system_status,
        lastUpdated: metrics.timestamp
      });
    } catch (error) {
      console.error("Error getting gauge metrics:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get gauge metrics" 
      });
    }
  });

  app.get("/api/settings/database", async (req, res) => {
    try {
      // Get PostgreSQL version
      const versionResult = await pool.query("SELECT version()");
      const version = versionResult.rows[0].version.split(" ")[1];
      
      // Get environment-specific table names for data tables, use shared tables for system tables
      const envMerchants = getTableName('merchants');
      const envTransactions = getTableName('transactions');
      const envUploadedFiles = getTableName('uploaded_files');
      
      // System tables are shared across environments (no prefixes)
      const systemBackupHistory = 'backup_history';
      const systemSchemaVersions = 'schema_versions';
      
      // Get table information using environment-specific table names for data, shared for system
      const tables = [
        { name: 'merchants', tableName: envMerchants, tableObj: merchantsTable },
        { name: 'transactions', tableName: envTransactions, tableObj: transactionsTable },
        { name: 'uploaded_files', tableName: envUploadedFiles, tableObj: uploadedFilesTable },
        { name: 'backup_history', tableName: systemBackupHistory, tableObj: backupHistory },
        { name: 'schema_versions', tableName: systemSchemaVersions, tableObj: schemaVersions }
      ];
      
      const tableStats = [];
      let totalRows = 0;
      let totalSizeBytes = 0;
      
      for (const { name, tableName, tableObj } of tables) {
        try {
          console.log(`[SETTINGS DATABASE] Processing table: ${name} (${tableName})`);
          
          const rowCountResult = await db.select({ count: count() }).from(tableObj);
          console.log(`[SETTINGS DATABASE] Row count result for ${name}:`, rowCountResult);
          
          const rowCount = parseInt(rowCountResult[0].count.toString(), 10);
          
          // Get table size in bytes using environment-specific table name
          const sizeResult = await pool.query(`
            SELECT pg_total_relation_size('${tableName}') as size
          `);
          console.log(`[SETTINGS DATABASE] Size result for ${name}:`, sizeResult.rows);
          
          const sizeBytes = parseInt(sizeResult.rows[0].size, 10);
          
          tableStats.push({
            name: name,  // Use display name, not actual table name
            rowCount,
            sizeBytes
          });
          console.log(`[SETTINGS DATABASE] Added ${name} (${tableName}) to tableStats`);
          
          totalRows += rowCount;
          totalSizeBytes += sizeBytes;
        } catch (error) {
          console.error(`[SETTINGS DATABASE] Error processing table ${name}:`, error);
          // If we can't get stats for this table, still add a placeholder
          tableStats.push({
            name: name,
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

  // Upload CSV files - pure SQL implementation (multiple files support)
  app.post("/api/uploads", upload.array("files"), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const type = req.body.type;
      if (!type || (type !== "merchant" && type !== "transaction" && type !== "terminal" && type !== "tddf")) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      const uploads = [];
      const uploadedFilesTableName = getTableName('uploaded_files');
      const currentEnvironment = process.env.NODE_ENV || 'production';

      for (const file of req.files as Express.Multer.File[]) {
        // Create file record with basic information and file content
        const fileId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Read file content and encode as base64 for database storage
        const fileContent = fs.readFileSync(file.path, 'utf8');
        const fileContentBase64 = Buffer.from(fileContent).toString('base64');
        
        console.log(`Storing file content for ${fileId}: ${fileContent.length} characters, ${fileContentBase64.length} base64 chars`);
        
        console.log(`[UPLOAD] Using table: ${uploadedFilesTableName} for file: ${fileId}, environment: ${currentEnvironment}`);
        
        // Direct SQL insertion using environment-specific table with environment tracking
        try {
          await pool.query(`
            INSERT INTO ${uploadedFilesTableName} (
              id, 
              original_filename, 
              storage_path, 
              file_type, 
              uploaded_at, 
              processed, 
              deleted,
              file_content,
              upload_environment,
              processing_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            fileId,
            file.originalname,
            file.path,
            type,
            new Date(),
            false,
            false,
            fileContentBase64,
            currentEnvironment,
            'queued'
          ]);
        } catch (error: any) {
          // Fallback for environments where upload_environment column doesn't exist yet
          if (error.message?.includes('upload_environment') || error.message?.includes('column does not exist')) {
            console.log(`[UPLOAD] upload_environment column doesn't exist, inserting without environment tracking`);
            await pool.query(`
              INSERT INTO ${uploadedFilesTableName} (
                id, 
                original_filename, 
                storage_path, 
                file_type, 
                uploaded_at, 
                processed, 
                deleted,
                file_content,
                processing_status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              fileId,
              file.originalname,
              file.path,
              type,
              new Date(),
              false,
              false,
              fileContentBase64,
              'queued'
            ]);
          } else {
            throw error;
          }
        }
        
        console.log(`Successfully stored file record for ${fileId}`);
        
        // Process raw data for all file types during upload
        try {
          console.log(`[RAW DATA] Processing raw data for ${type} file: ${fileId}`);
          
          // Count lines and get basic file info for all file types
          const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
          const lineCount = lines.length;
          let processingNotes = '';
          let processingResult = null;
          
          if (type === "tddf") {
            // TDDF files get full raw import processing
            processingResult = await storage.processTddfFileFromContent(fileContentBase64, fileId, file.originalname);
            processingNotes = `Raw import: ${processingResult.rowsProcessed} lines, ${processingResult.tddfRecordsCreated} DT records created, ${processingResult.errors} errors`;
            console.log(`[TDDF UPLOAD] Raw line processing completed: ${processingResult.rowsProcessed} rows, ${processingResult.tddfRecordsCreated} records, ${processingResult.errors} errors`);
          } else {
            // Other file types get line count and basic info
            const hasHeader = lines.length > 0 && (lines[0].includes(',') || lines[0].includes('\t'));
            const sampleFields = hasHeader ? lines[0].split(/[,\t]/).length : 0;
            processingNotes = `Raw data: ${lineCount} lines, ${hasHeader ? 'has header row, ' : ''}${sampleFields} fields detected`;
            console.log(`[RAW DATA] ${type.toUpperCase()} file analyzed: ${lineCount} lines, ${hasHeader ? 'header detected, ' : ''}${sampleFields} fields`);
          }
          
          // Update the upload record with raw processing stats for all file types
          await pool.query(`
            UPDATE ${uploadedFilesTableName} 
            SET raw_lines_count = $1, 
                processing_notes = $2
            WHERE id = $3
          `, [
            processingResult ? processingResult.rowsProcessed : lineCount,
            processingNotes,
            fileId
          ]);
          
          console.log(`[RAW DATA] Updated upload record with raw data count: ${processingResult ? processingResult.rowsProcessed : lineCount}`);
        } catch (rawDataError) {
          console.error(`[RAW DATA] Error processing raw data for ${fileId}:`, rawDataError);
          // Update upload record with error info
          await pool.query(`
            UPDATE ${uploadedFilesTableName} 
            SET raw_lines_count = 0, 
                processing_notes = $1
            WHERE id = $2
          `, [
            `Raw data error: ${rawDataError.message}`,
            fileId
          ]);
        }
        
        uploads.push({
          fileId,
          originalName: file.originalname,
          success: true
        });
        
        // Clean up temporary file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }

      res.json({ 
        uploads,
        success: true,
        message: `${uploads.length} file(s) uploaded successfully`
      });
    } catch (error) {
      // Clean up temporary files if error occurs
      if (req.files) {
        for (const file of req.files as Express.Multer.File[]) {
          if (file?.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
      console.error("Upload error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload files" 
      });
    }
  });

  // Upload CSV files - pure SQL implementation (single file support for compatibility)
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const type = req.body.type;
      if (!type || (type !== "merchant" && type !== "transaction" && type !== "terminal" && type !== "tddf")) {
        return res.status(400).json({ error: "Invalid file type" });
      }

      // Create file record with basic information and file content
      const fileId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Read file content and encode as base64 for database storage
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      const fileContentBase64 = Buffer.from(fileContent).toString('base64');
      
      console.log(`Storing file content for ${fileId}: ${fileContent.length} characters, ${fileContentBase64.length} base64 chars`);
      
      // Use environment-specific table for file uploads
      const uploadedFilesTableName = getTableName('uploaded_files');
      const currentEnvironment = process.env.NODE_ENV || 'production';
      console.log(`[UPLOAD] Using table: ${uploadedFilesTableName} for file: ${fileId}, environment: ${currentEnvironment}`);
      
      // Direct SQL insertion using environment-specific table with environment tracking
      try {
        await pool.query(`
          INSERT INTO ${uploadedFilesTableName} (
            id, 
            original_filename, 
            storage_path, 
            file_type, 
            uploaded_at, 
            processed, 
            deleted,
            file_content,
            upload_environment
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          fileId,
          req.file.originalname,
          req.file.path,
          type,
          new Date(),
          false,
          false,
          fileContentBase64,
          currentEnvironment
        ]);
      } catch (error: any) {
        // Fallback for environments where upload_environment column doesn't exist yet
        if (error.message?.includes('upload_environment') || error.message?.includes('column does not exist')) {
          console.log(`[UPLOAD] upload_environment column doesn't exist, inserting without environment tracking`);
          await pool.query(`
            INSERT INTO ${uploadedFilesTableName} (
              id, 
              original_filename, 
              storage_path, 
              file_type, 
              uploaded_at, 
              processed, 
              deleted,
              file_content
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            fileId,
            req.file.originalname,
            req.file.path,
            type,
            new Date(),
            false,
            false,
            fileContentBase64
          ]);
        } else {
          throw error;
        }
      }
      
      console.log(`Successfully stored file record for ${fileId}`);
      
      // Process raw data for all file types during upload
      try {
        console.log(`[RAW DATA] Processing raw data for ${type} file: ${fileId}`);
        
        // Count lines and get basic file info for all file types
        const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
        const lineCount = lines.length;
        let processingNotes = '';
        let processingResult = null;
        
        if (type === "tddf") {
          // TDDF files get full raw import processing
          processingResult = await storage.processTddfFileFromContent(fileContentBase64, fileId, req.file.originalname);
          processingNotes = `Raw import: ${processingResult.rowsProcessed} lines, ${processingResult.tddfRecordsCreated} DT records created, ${processingResult.errors} errors`;
          console.log(`[TDDF UPLOAD] Raw line processing completed: ${processingResult.rowsProcessed} rows, ${processingResult.tddfRecordsCreated} records, ${processingResult.errors} errors`);
        } else {
          // Other file types get line count and basic info
          const hasHeader = lines.length > 0 && (lines[0].includes(',') || lines[0].includes('\t'));
          const sampleFields = hasHeader ? lines[0].split(/[,\t]/).length : 0;
          processingNotes = `Raw data: ${lineCount} lines, ${hasHeader ? 'has header row, ' : ''}${sampleFields} fields detected`;
          console.log(`[RAW DATA] ${type.toUpperCase()} file analyzed: ${lineCount} lines, ${hasHeader ? 'header detected, ' : ''}${sampleFields} fields`);
        }
        
        // Update the upload record with raw processing stats for all file types
        await pool.query(`
          UPDATE ${uploadedFilesTableName} 
          SET raw_lines_count = $1, 
              processing_notes = $2
          WHERE id = $3
        `, [
          processingResult ? processingResult.rowsProcessed : lineCount,
          processingNotes,
          fileId
        ]);
        
        console.log(`[RAW DATA] Updated upload record with raw data count: ${processingResult ? processingResult.rowsProcessed : lineCount}`);
      } catch (rawDataError) {
        console.error(`[RAW DATA] Error processing raw data for ${fileId}:`, rawDataError);
        // Update upload record with error info
        await pool.query(`
          UPDATE ${uploadedFilesTableName} 
          SET raw_lines_count = 0, 
              processing_notes = $1
          WHERE id = $2
        `, [
          `Raw data error: ${rawDataError.message}`,
          fileId
        ]);
      }

      res.json({ 
        fileId,
        success: true,
        message: "File uploaded successfully"
      });
    } catch (error) {
      // Clean up temporary file if error occurs
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error("Upload error:", error);
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



  // Get files currently in processing queue with detailed status
  app.get("/api/uploads/queue-status", async (req, res) => {
    try {
      // Get files that are queued or currently processing
      const queuedFiles = await storage.getQueuedFiles();
      const processingFile = fileProcessorService.getProcessingStatus().currentlyProcessingFile;
      
      // Get recent processing activity (last 5 completed files)
      const recentlyCompleted = await storage.getRecentlyProcessedFiles(5);

      res.json({
        queuedFiles,
        currentlyProcessing: processingFile,
        recentlyCompleted,
        queueLength: queuedFiles.length,
        estimatedWaitTime: queuedFiles.length * 60 // Rough estimate: 1 minute per file
      });
    } catch (error) {
      console.error("Error getting queue status:", error);
      res.status(500).json({ error: "Failed to get queue status" });
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

      // Mark these files as "pending processing" in the database using environment-specific table
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      for (const fileId of fileIds) {
        try {
          await db.execute(sql`
            UPDATE ${sql.identifier(uploadedFilesTableName)}
            SET processed = false, processing_errors = NULL 
            WHERE id = ${fileId}
          `);
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

  // Get upload file history with pagination and optimized performance
  app.get("/api/uploads/history", async (req, res) => {
    try {
      const { limit = '50', page = '1', sortBy = 'uploadDate', sortOrder = 'desc' } = req.query;
      const limitNum = parseInt(limit as string) || 50;
      const pageNum = parseInt(page as string) || 1;
      const offset = (pageNum - 1) * limitNum;
      
      // Use environment-specific table for uploads
      const tableName = getTableName('uploaded_files');
      console.log(`[UPLOADS API] Using table: ${tableName} for environment: ${process.env.NODE_ENV}`);
      
      // PERFORMANCE FIX: Exclude file_content field which can be massive (hundreds of KB)
      // Only fetch it when specifically needed for file viewing/download
      let baseQuery = sql`
        SELECT 
          id,
          original_filename,
          storage_path,
          file_type,
          uploaded_at,
          processed,
          processing_errors,
          deleted,
          processed_at,
          processing_status,
          processing_started_at,
          processing_completed_at,
          processing_server_id,
          records_processed,
          records_skipped,
          records_with_errors,
          processing_time_ms,
          processing_details,
          raw_lines_count,
          processing_notes
        FROM ${sql.identifier(tableName)}
        WHERE deleted = false
      `;

      // Add dynamic sorting
      let orderClause;
      const direction = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;
      
      if (sortBy === 'uploadDate') {
        orderClause = sql`ORDER BY uploaded_at ${direction}`;
      } else if (sortBy === 'processedDate') {
        orderClause = sql`ORDER BY 
          CASE 
            WHEN processing_completed_at IS NOT NULL THEN processing_completed_at 
            ELSE processed_at 
          END ${direction}`;
      } else if (sortBy === 'filename') {
        orderClause = sql`ORDER BY original_filename ${direction}`;
      } else {
        // Default fallback
        orderClause = sql`ORDER BY uploaded_at ${direction}`;
      }
      
      const finalQuery = sql`${baseQuery} ${orderClause} LIMIT ${limitNum} OFFSET ${offset}`;
      const result = await db.execute(finalQuery);
      
      // Get total count for pagination
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM ${sql.identifier(tableName)}
        WHERE deleted = false
      `);
      
      const total = Number(countResult.rows[0]?.total || 0);
      const totalPages = Math.ceil(total / limitNum);
      
      const uploadedFiles = result.rows.map(row => ({
        id: row.id,
        originalFilename: row.original_filename,
        storagePath: row.storage_path,
        fileType: row.file_type,
        uploadedAt: row.uploaded_at,
        processed: row.processed,
        processingErrors: row.processing_errors,
        deleted: row.deleted,
        // PERFORMANCE: file_content excluded - fetch separately when needed
        processedAt: row.processed_at,
        processingStatus: row.processing_status || (row.processed ? 'completed' : 'queued'),
        processingStartedAt: row.processing_started_at,
        processingCompletedAt: row.processing_completed_at,
        processingServerId: row.processing_server_id,
        recordsProcessed: row.records_processed,
        recordsSkipped: row.records_skipped,
        recordsWithErrors: row.records_with_errors,
        processingTimeMs: row.processing_time_ms,
        processingDetails: row.processing_details,
        rawLinesCount: row.raw_lines_count,
        processingNotes: row.processing_notes
      }));
      
      res.json({
        uploads: uploadedFiles,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1
        }
      });
    } catch (error) {
      console.error("Error retrieving upload history:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retrieve upload history" 
      });
    }
  });

  // Get enhanced processing status with filters
  app.get("/api/uploads/processing-status", isAuthenticated, async (req, res) => {
    try {
      const { status = 'all', fileType = 'all', sortBy = 'uploadDate', sortOrder = 'desc', limit = '20', page = '1' } = req.query;
      const limitNum = parseInt(limit as string) || 20;
      const pageNum = parseInt(page as string) || 1;
      const offset = (pageNum - 1) * limitNum;
      
      // Build query based on status filter to get relevant files
      const { getTableName } = await import("./table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      let baseQuery = sql`
        SELECT 
          id,
          original_filename,
          storage_path,
          file_type,
          uploaded_at,
          processed,
          processing_errors,
          deleted,
          processed_at,
          processing_status,
          processing_started_at,
          processing_completed_at,
          processing_server_id
        FROM ${sql.identifier(uploadsTableName)}
        WHERE deleted = false
      `;

      // Add status-specific conditions to improve performance
      if (status === 'completed') {
        baseQuery = sql`${baseQuery} AND (processing_status = 'completed' OR (processed = true AND processing_errors IS NULL))`;
      } else if (status === 'processing') {
        baseQuery = sql`${baseQuery} AND processing_status = 'processing'`;
      } else if (status === 'queued') {
        baseQuery = sql`${baseQuery} AND (processing_status = 'queued' OR (processed = false AND processing_errors IS NULL))`;
      } else if (status === 'error') {
        baseQuery = sql`${baseQuery} AND processing_errors IS NOT NULL`;
      }

      // Add file type filter to query if needed
      if (fileType !== 'all') {
        baseQuery = sql`${baseQuery} AND file_type = ${fileType}`;
      }

      // Get total count first for pagination
      const countQuery = sql`
        SELECT COUNT(*) as total 
        FROM ${sql.identifier(uploadsTableName)}
        WHERE deleted = false
        ${status === 'completed' ? sql`AND (processing_status = 'completed' OR (processed = true AND processing_errors IS NULL))` : sql``}
        ${status === 'processing' ? sql`AND processing_status = 'processing'` : sql``}
        ${status === 'queued' ? sql`AND (processing_status = 'queued' OR (processed = false AND processing_errors IS NULL))` : sql``}
        ${status === 'error' ? sql`AND processing_errors IS NOT NULL` : sql``}
        ${fileType !== 'all' ? sql`AND file_type = ${fileType}` : sql``}
      `;
      
      const countResult = await db.execute(countQuery);
      const totalFiles = Number(countResult.rows[0]?.total || 0);
      const totalPages = Math.ceil(totalFiles / limitNum);

      // Add dynamic sorting
      let orderClause;
      const direction = sortOrder === 'asc' ? sql`ASC` : sql`DESC`;
      
      if (sortBy === 'uploadDate') {
        orderClause = sql`ORDER BY uploaded_at ${direction}`;
      } else if (sortBy === 'processedDate') {
        orderClause = sql`ORDER BY 
          CASE 
            WHEN processing_completed_at IS NOT NULL THEN processing_completed_at 
            ELSE processed_at 
          END ${direction}`;
      } else if (sortBy === 'filename') {
        orderClause = sql`ORDER BY original_filename ${direction}`;
      } else {
        // Default fallback
        orderClause = sql`ORDER BY uploaded_at ${direction}`;
      }
      
      baseQuery = sql`${baseQuery} ${orderClause} LIMIT ${limitNum} OFFSET ${offset}`;

      const result = await db.execute(baseQuery);
      
      const uploads = result.rows.map(row => ({
        id: row.id,
        originalFilename: row.original_filename,
        storagePath: row.storage_path,
        fileType: row.file_type,
        uploadedAt: row.uploaded_at,
        processed: row.processed,
        processingErrors: row.processing_errors,
        deleted: row.deleted,
        // file_content excluded for performance - fetch separately when needed
        processedAt: row.processed_at,
        processingStatus: row.processing_status || (row.processed ? 'completed' : 'queued'),
        processingStartedAt: row.processing_started_at,
        processingCompletedAt: row.processing_completed_at,
        processingServerId: row.processing_server_id
      }));

      const processorStatus = {
        isRunning: true,
        currentlyProcessingFile: uploads.find(f => f.processingStatus === 'processing'),
        queuedFiles: uploads.filter(f => f.processingStatus === 'queued')
      };
      
      res.json({
        uploads: uploads,
        pagination: {
          currentPage: pageNum,
          totalItems: totalFiles,
          itemsPerPage: limitNum,
          totalPages: totalPages,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1
        },
        processorStatus,
        filters: {
          status: ['all', 'queued', 'processing', 'completed', 'error'],
          fileType: ['all', 'merchant', 'transaction', 'terminal', 'tddf'],
          sortBy: ['uploadDate', 'processedDate', 'filename']
        }
      });
    } catch (error) {
      console.error("Error getting upload processing status:", error);
      console.error("Stack trace:", error instanceof Error ? error.stack : error);
      res.status(500).json({ 
        error: "Failed to get upload processing status",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Processing metrics endpoint for detailed evidence
  app.get("/api/uploads/processing-metrics", isAuthenticated, async (req, res) => {
    try {
      const processorStatus = fileProcessorService.getStatus();
      const currentlyProcessing = fileProcessorService.getCurrentlyProcessingFile();
      
      // Get recent processing times from database with evidence
      const { getTableName } = await import("./table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      const recentCompletedFiles = await db.execute(sql`
        SELECT id, original_filename, file_type, processed_at, 
               processing_started_at, processing_completed_at,
               processing_errors
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'completed' 
          AND processing_started_at IS NOT NULL 
          AND processing_completed_at IS NOT NULL
          AND deleted = false
        ORDER BY processing_completed_at DESC 
        LIMIT 15
      `);
      
      // Calculate detailed processing times with evidence
      const processingTimes = recentCompletedFiles.rows.map(file => {
        const startTime = new Date(file.processing_started_at as string);
        const endTime = new Date(file.processing_completed_at as string);
        const processingTimeMs = endTime.getTime() - startTime.getTime();
        const processingTimeSec = (processingTimeMs / 1000).toFixed(2);
        
        return {
          id: file.id,
          filename: file.original_filename,
          fileType: file.file_type,
          processingTimeSeconds: parseFloat(processingTimeSec),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          hasErrors: !!file.processing_errors
        };
      });
      
      // Calculate performance metrics
      const averageProcessingTime = processingTimes.length > 0 
        ? (processingTimes.reduce((sum, p) => sum + p.processingTimeSeconds, 0) / processingTimes.length).toFixed(2)
        : 0;
      
      const fastestTime = processingTimes.length > 0 
        ? Math.min(...processingTimes.map(p => p.processingTimeSeconds)).toFixed(2)
        : 0;
        
      const slowestTime = processingTimes.length > 0 
        ? Math.max(...processingTimes.map(p => p.processingTimeSeconds)).toFixed(2)
        : 0;
      
      res.json({
        processorStatus,
        currentlyProcessing,
        performanceMetrics: {
          averageProcessingTimeSeconds: parseFloat(averageProcessingTime as string),
          fastestProcessingTimeSeconds: parseFloat(fastestTime as string),
          slowestProcessingTimeSeconds: parseFloat(slowestTime as string),
          totalRecentFiles: processingTimes.length,
          filesWithErrors: processingTimes.filter(p => p.hasErrors).length
        },
        recentProcessingEvidence: processingTimes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting processing metrics:", error);
      res.status(500).json({ error: "Failed to get processing metrics" });
    }
  });

  // Get queue status for real-time monitoring
  app.get("/api/uploads/queue-status", isAuthenticated, async (req, res) => {
    try {
      // Get queued files
      const queuedFiles = await storage.getQueuedFiles();
      
      // Get recently completed files (last 5)
      const recentlyCompleted = await storage.getRecentlyProcessedFiles(5);
      
      // Find currently processing file
      const currentlyProcessing = queuedFiles.find(f => f.processingStatus === 'processing');
      
      // Calculate estimated wait time (rough estimate: 1 minute per file)
      const queueLength = queuedFiles.filter(f => f.processingStatus === 'queued').length;
      const estimatedWaitTime = queueLength * 60; // seconds
      
      res.json({
        queuedFiles,
        currentlyProcessing,
        recentlyCompleted,
        queueLength,
        estimatedWaitTime
      });
    } catch (error) {
      console.error("Error getting queue status:", error);
      res.status(500).json({ 
        error: "Failed to get queue status"
      });
    }
  });

  // Clean up orphaned file records (files that no longer exist on disk)
  app.post("/api/uploads/cleanup-orphaned", isAuthenticated, async (req, res) => {
    try {
      console.log("Starting orphaned file cleanup...");
      
      // Get all non-deleted uploaded files using environment-specific table
      const { getTableName } = await import("./table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      const result = await db.execute(sql`
        SELECT id, original_filename, storage_path, file_type, uploaded_at, processed, processing_errors, deleted
        FROM ${sql.identifier(uploadsTableName)}
        WHERE deleted = false
      `);
      const uploadedFiles = result.rows;
      
      let orphanedCount = 0;
      let cleanedUpIds: string[] = [];
      
      // Check each file to see if it exists on disk
      for (const file of uploadedFiles) {
        try {
          // Check if the file exists at the storage path
          if (!fs.existsSync(file.storagePath)) {
            console.log(`Orphaned file found: ${file.originalFilename} (${file.id}) - path: ${file.storagePath}`);
            
            // Mark the file as deleted (soft delete)
            await db.execute(sql`
              UPDATE ${sql.identifier(uploadsTableName)}
              SET deleted = true, processing_errors = 'File not found: The temporary file may have been removed by the system.'
              WHERE id = ${file.id}
            `);
            
            orphanedCount++;
            cleanedUpIds.push(file.id);
          }
        } catch (checkError) {
          console.error(`Error checking file ${file.id}:`, checkError);
        }
      }
      
      console.log(`Cleanup completed: ${orphanedCount} orphaned files marked as deleted`);
      
      res.json({
        success: true,
        message: `Cleanup completed: ${orphanedCount} orphaned files removed`,
        orphanedCount,
        cleanedUpIds,
        totalChecked: uploadedFiles.length
      });
    } catch (error) {
      console.error("Error cleaning up orphaned files:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to cleanup orphaned files"
      });
    }
  });
  
  // Download original uploaded file
  app.get("/api/uploads/:id/download", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Get file info including content from database using environment-specific table
      const { getTableName } = await import("./table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      const result = await pool.query(`
        SELECT id, original_filename, storage_path, file_type, uploaded_at, processed, processing_errors, deleted, file_content
        FROM ${uploadsTableName}
        WHERE id = $1
      `, [fileId]);
      
      const fileInfo = result.rows[0];
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Try database content first (but not if it's a placeholder)
      if (fileInfo.file_content && !fileInfo.file_content.startsWith('MIGRATED_PLACEHOLDER_')) {
        console.log(`Downloading file content from database for file: ${fileId}`);
        const fileContent = Buffer.from(fileInfo.file_content, 'base64');
        
        res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.original_filename}"`);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Length', fileContent.length.toString());
        res.send(fileContent);
      }
      // Fallback to file system if database content is placeholder or not available
      else if (fs.existsSync(fileInfo.storage_path)) {
        console.log(`Downloading file from file system (database has placeholder): ${fileInfo.storage_path}`);
        res.download(fileInfo.storage_path, fileInfo.original_filename);
      }
      else {
        return res.status(404).json({ 
          error: "File not available for download",
          details: "File has been processed and cleaned up. Content is no longer accessible."
        });
      }
      
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
      
      // Get file info including content from database using environment-specific table
      const { getTableName } = await import("./table-config");
      const uploadsTableName = getTableName('uploaded_files');
      
      const result = await pool.query(`
        SELECT id, original_filename, storage_path, file_type, uploaded_at, processed, processing_errors, deleted, file_content
        FROM ${uploadsTableName}
        WHERE id = $1
      `, [fileId]);
      
      const fileInfo = result.rows[0];
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      let csvContent = null;
      
      // Try database content first
      if (fileInfo.file_content && !fileInfo.file_content.startsWith('MIGRATED_PLACEHOLDER_')) {
        console.log(`Reading file content from database for file: ${fileId}`);
        csvContent = Buffer.from(fileInfo.file_content, 'base64').toString('utf8');
      }
      // If database content is a placeholder, try file system
      else if (fs.existsSync(fileInfo.storage_path)) {
        console.log(`Reading file content from file system (database has placeholder): ${fileInfo.storage_path}`);
        csvContent = fs.readFileSync(fileInfo.storage_path, 'utf8');
      }
      else {
        return res.status(404).json({ 
          error: "File content not available",
          details: "File has been processed and cleaned up. Content is no longer accessible."
        });
      }
      
      // Parse CSV content
      const parser = parseCSV({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        skip_records_with_error: true
      });
      
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
        console.error("Error parsing CSV content:", error);
        console.log("CSV content causing error:", csvContent.substring(0, 500));
        res.status(500).json({ error: "Failed to parse CSV file", details: error.message });
      });
      
      parser.on("end", () => {
        res.json({
          headers,
          rows,
          totalRows: rowCount,
          truncated: rowCount > 100
        });
      });
      
      // Write CSV content to parser
      parser.write(csvContent);
      parser.end();
      
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
      const result = await db.execute(sql`
        SELECT id, original_filename, storage_path, file_type, uploaded_at, processed, processing_errors, deleted
        FROM uploaded_files 
        WHERE id = ${fileId}
      `);
      const fileInfo = result.rows[0];
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check if the file still exists
      if (!fs.existsSync(fileInfo.storage_path)) {
        // File doesn't exist anymore - update error in database
        await db.execute(sql`
          UPDATE uploaded_files 
          SET processed = true, processing_errors = 'Original file has been removed from the temporary storage. Please re-upload the file.'
          WHERE id = ${fileId}
        `);
          
        return res.status(404).json({ 
          error: "File no longer exists in temporary storage. Please re-upload the file."
        });
      }
      
      // Mark file as queued for reprocessing (not processed, no errors)
      await db.execute(sql`
        UPDATE uploaded_files 
        SET processed = false, processing_errors = NULL, processed_at = NULL
        WHERE id = ${fileId}
      `);
      
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
        await db.execute(sql`
          UPDATE uploaded_files 
          SET processed = true, processing_errors = ${error instanceof Error ? error.message : "Unknown error during reprocessing"}
          WHERE id = ${req.params.id}
        `);
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
      const tableName = getTableName('uploaded_files');
      
      // Check if file exists and is not already deleted
      const result = await pool.query(`
        SELECT id, original_filename, file_type, processing_errors
        FROM ${tableName} 
        WHERE id = $1 AND deleted = false
      `, [fileId]);
      
      if (result.rows.length === 0) {
        // File not found - log the deletion attempt and mark record as deleted if it exists at all
        console.log(`[DELETE API] File not found for deletion: ${fileId}`);
        
        const anyRecordResult = await pool.query(`
          SELECT id, original_filename, processing_errors 
          FROM ${tableName} 
          WHERE id = $1
        `, [fileId]);
        
        if (anyRecordResult.rows.length > 0) {
          // Record exists but may have errors - mark as deleted and note the error
          const fileRecord = anyRecordResult.rows[0];
          await pool.query(`
            UPDATE ${tableName} 
            SET deleted = true, 
                processing_errors = COALESCE(processing_errors, '') || '; File removal - record cleanup due to missing file'
            WHERE id = $1
          `, [fileId]);
          
          console.log(`[UPLOADS API] File record cleaned up: ${fileRecord.original_filename}`);
          return res.json({ 
            success: true, 
            message: "File record cleaned up - file was not accessible",
            fileWasNotAccessible: true 
          });
        } else {
          return res.status(404).json({ error: "File not found in database" });
        }
      }
      
      const fileRecord = result.rows[0];
      
      // For TDDF files, also clean up raw import records
      if (fileRecord.file_type === 'tddf') {
        const rawTableName = getTableName('tddf_raw_import');
        const rawRecordsResult = await pool.query(`
          SELECT COUNT(*) as count FROM ${rawTableName} WHERE source_file_id = $1
        `, [fileId]);
        
        if (rawRecordsResult.rows[0].count > 0) {
          await pool.query(`
            DELETE FROM ${rawTableName} WHERE source_file_id = $1
          `, [fileId]);
          console.log(`[UPLOADS API] Cleaned up ${rawRecordsResult.rows[0].count} raw TDDF import records for ${fileId}`);
        }
      }
      
      // Mark file as deleted (soft delete)
      await pool.query(`
        UPDATE ${tableName} 
        SET deleted = true 
        WHERE id = $1
      `, [fileId]);
      
      console.log(`[UPLOADS API] File deleted successfully: ${fileRecord.original_filename} (${fileId})`);
      res.json({ success: true, fileName: fileRecord.original_filename });
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
      
      // API returns complete merchant details with user tracking
      
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
      
      // Debug: Log user information
      console.log('[MERCHANT CREATE] User info:', {
        hasUser: !!req.user,
        username: req.user?.username,
        userId: req.user?.id,
        role: req.user?.role
      });
      
      // If a user is logged in, use their username
      if (req.user && req.user.username) {
        updatedBy = req.user.username;
        console.log('[MERCHANT CREATE] Setting updatedBy to:', updatedBy);
      } else {
        console.log('[MERCHANT CREATE] No user found, using System');
      }
      
      // Auto-generate merchant ID for manual creation (user-friendly approach)
      // CSV imports use authentic IDs, manual creation gets auto-generated IDs
      let merchantId = merchantData.id;
      if (!merchantId) {
        // Generate a timestamp-based merchant ID for manual creation
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        merchantId = `MMS${timestamp}${randomSuffix}`;
        console.log(`[MANUAL MERCHANT] Auto-generated ID: ${merchantId} for merchant: ${merchantData.name}`);
      }
      
      const newMerchant = await storage.createMerchant({
        ...merchantData,
        id: merchantId,
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
  
  // Delete multiple merchants (POST route for backward compatibility)
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

  // Delete multiple merchants (DELETE route)
  app.delete("/api/merchants", isAuthenticated, async (req, res) => {
    try {
      console.log(`[DELETE MERCHANTS API] Received DELETE request for merchants`);
      console.log(`[DELETE MERCHANTS API] Request body:`, req.body);
      console.log(`[DELETE MERCHANTS API] User authenticated:`, req.isAuthenticated());
      
      const { merchantIds } = req.body;
      
      if (!merchantIds || !Array.isArray(merchantIds) || merchantIds.length === 0) {
        console.log(`[DELETE MERCHANTS API] Invalid request: merchantIds must be a non-empty array`);
        return res.status(400).json({ error: "Invalid request: merchantIds must be a non-empty array" });
      }
      
      console.log(`[DELETE MERCHANTS API] Attempting to delete ${merchantIds.length} merchants:`, merchantIds);
      
      await storage.deleteMerchants(merchantIds);
      
      console.log(`[DELETE MERCHANTS API] Successfully deleted ${merchantIds.length} merchants`);
      res.json({ success: true, message: `Successfully deleted ${merchantIds.length} merchants` });
    } catch (error) {
      console.error('[DELETE MERCHANTS API] Error deleting merchants:', error);
      res.status(500).json({ error: "Failed to delete merchants" });
    }
  });

  // Merge merchants endpoint
  // Function to process merge logs after response is sent
  async function processPostMergeLogs(targetMerchantId: string, sourceMerchantIds: string[], result: any, username: string) {
    try {
      // Create audit log entries for each merged merchant
      for (const sourceMerchantId of sourceMerchantIds) {
        // Get the source merchant directly from database since it's been removed
        const [sourceMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, sourceMerchantId));
        if (sourceMerchant) {
          const auditLogData = {
            entityType: 'merchant',
            entityId: targetMerchantId,
            action: 'merge',
            userId: null,
            username,
            oldValues: sourceMerchant,
            newValues: result.targetMerchant,
            changedFields: ['transactions'],
            notes: `Merged merchant "${sourceMerchant.name}" (${sourceMerchantId}) into "${result.targetMerchant.name}" (${targetMerchantId}). Transferred ${result.transactionsTransferred} transactions.`
          };
          
          console.log('[POST-MERGE LOGGING] Creating audit log entry:', auditLogData);
          const [auditLog] = await db.insert(auditLogsTable).values(auditLogData).returning();
          console.log('[POST-MERGE LOGGING] Audit log created successfully with ID:', auditLog.id);
          
          // Verify the audit log was actually inserted
          const verifyAudit = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, auditLog.id));
          console.log('[POST-MERGE LOGGING] Audit log verification:', verifyAudit.length > 0 ? 'FOUND' : 'NOT FOUND');
        }
      }
      
      // Create upload log entry
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const mergeLogData = {
        id: `merge_${timestamp}_${randomId}`,
        originalFilename: `Merchant Merge Operation: ${result.targetMerchant.name}`,
        storagePath: `/logs/merge_${targetMerchantId}_${timestamp}.log`,
        fileType: 'merchant',
        uploadedAt: new Date(),
        processed: true,
        processingErrors: null,
        deleted: false
      };
      
      console.log('[POST-MERGE LOGGING] Creating upload log entry:', mergeLogData);
      const uploadLogResult = await db.execute(sql`
        INSERT INTO uploaded_files (
          id, 
          original_filename, 
          storage_path, 
          file_type, 
          uploaded_at, 
          processed, 
          deleted,
          file_content,
          file_size,
          mime_type,
          processing_status
        ) VALUES (
          ${mergeLogData.id},
          ${mergeLogData.originalFilename},
          ${mergeLogData.storagePath},
          ${mergeLogData.fileType},
          ${mergeLogData.uploadedAt},
          ${mergeLogData.processed},
          ${mergeLogData.deleted},
          ${mergeLogData.fileContent || ''},
          ${mergeLogData.fileSize || 0},
          ${mergeLogData.mimeType || 'application/octet-stream'},
          ${mergeLogData.processingStatus || 'completed'}
        )
        RETURNING id
      `);
      const logId = uploadLogResult.rows[0]?.id;
      console.log('[POST-MERGE LOGGING] Upload log created successfully with ID:', uploadLogResult?.id);
      
      // Verify the upload log was actually inserted
      const verifyResult = await db.execute(sql`
        SELECT id FROM uploaded_files WHERE id = ${logId}
      `);
      console.log('[POST-MERGE LOGGING] Upload log verification:', verifyResult.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
      
      // Create system log entry for the merge operation
      const systemLogData = {
        level: 'info',
        source: 'MerchantMerge',
        message: `Merchant merge completed successfully: ${result.merchantsRemoved} merchants merged into ${result.targetMerchant.name}`,
        details: {
          targetMerchantId,
          sourceMerchantIds,
          transactionsTransferred: result.transactionsTransferred,
          merchantsRemoved: result.merchantsRemoved,
          targetMerchantName: result.targetMerchant.name,
          performedBy: username,
          timestamp: new Date().toISOString()
        }
      };
      console.log('[POST-MERGE LOGGING] Creating system log entry:', systemLogData);
      const [systemLogResult] = await db.insert(systemLogsTable).values(systemLogData).returning();
      console.log('[POST-MERGE LOGGING] System log created successfully with ID:', systemLogResult?.id);
      
      // Verify the system log was actually inserted
      const verifySystem = await db.select().from(systemLogsTable).where(eq(systemLogsTable.id, systemLogResult.id));
      console.log('[POST-MERGE LOGGING] System log verification:', verifySystem.length > 0 ? 'FOUND' : 'NOT FOUND');
    } catch (error) {
      console.error('[POST-MERGE LOGGING] Failed to create logs:', error);
    }
  }

  app.post("/api/merchants/merge", isAuthenticated, async (req, res) => {
    try {
      console.log('[MERGE REQUEST] Received merge request:', { 
        targetMerchantId: req.body.targetMerchantId, 
        sourceMerchantIds: req.body.sourceMerchantIds 
      });
      
      const { targetMerchantId, sourceMerchantIds } = req.body;
      
      if (!targetMerchantId || !sourceMerchantIds || !Array.isArray(sourceMerchantIds) || sourceMerchantIds.length === 0) {
        console.log('[MERGE ERROR] Invalid request parameters:', { targetMerchantId, sourceMerchantIds });
        return res.status(400).json({ 
          error: "Invalid request: targetMerchantId and sourceMerchantIds array required" 
        });
      }
      
      const username = req.user?.username || 'System';
      console.log('[MERGE START] Starting merge process with user:', username);
      
      const result = await storage.mergeMerchants(targetMerchantId, sourceMerchantIds, username);
      
      console.log('[MERGE SUCCESS] Merge completed successfully:', result);
      
      // Logging is now handled directly in storage.ts within the merge transaction
      console.log('[MERGE LOGGING] Logs created within merge transaction');
      
      // Send response after logs are created
      res.json({
        success: true,
        message: `Successfully merged ${result.merchantsRemoved} merchants into ${result.targetMerchant.name}`,
        ...result
      });
    } catch (error) {
      console.error('[MERGE ERROR] Error merging merchants:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to merge merchants" 
      });
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

  // Migration endpoint for file storage to database
  app.post("/api/migrate/file-storage", isAuthenticated, async (req, res) => {
    try {
      const { migrateFileStorageToDatabase, verifyMigration } = await import("./migration/file-storage-migration");
      
      console.log("Starting file storage migration...");
      const stats = await migrateFileStorageToDatabase();
      
      console.log("Verifying migration...");
      await verifyMigration();
      
      res.json({
        success: true,
        message: "File storage migration completed",
        stats: stats
      });
    } catch (error) {
      console.error("Migration failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Migration failed"
      });
    }
  });

  // Cleanup orphaned files endpoint
  app.post("/api/uploads/cleanup-orphaned", isAuthenticated, async (req, res) => {
    try {
      // Mark orphaned files as deleted
      const result = await db.execute(sql`
        UPDATE uploaded_files 
        SET deleted = true, processing_errors = 'File removed - orphaned record cleanup'
        WHERE deleted = false 
          AND file_content IS NULL 
          AND storage_path IS NOT NULL
      `);
      
      res.json({
        success: true,
        message: `Cleaned up orphaned file records`,
        result
      });
    } catch (error) {
      console.error("Cleanup failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Cleanup failed"
      });
    }
  });

  // Import all file content to database
  app.post("/api/import-file-content", isAuthenticated, async (req, res) => {
    try {
      const { migrateFileContent } = await import('./migrate-file-content');
      const result = await migrateFileContent();
      
      res.json({
        success: true,
        ...result,
        message: `Migration complete! Successfully migrated: ${result.migratedCount} files, Already migrated: ${result.alreadyMigrated}, Errors: ${result.errorCount}`
      });
      
    } catch (error) {
      console.error('Import failed:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Import failed"
      });
    }
  });

  // Multi-node concurrency management endpoints
  app.get("/api/processing/concurrency-stats", async (req, res) => {
    try {
      const { ConcurrencyCleanupService } = await import("./services/concurrency-cleanup");
      const stats = await ConcurrencyCleanupService.getProcessingStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching concurrency stats:", error);
      res.status(500).json({ error: "Failed to fetch concurrency statistics" });
    }
  });

  app.post("/api/processing/cleanup-stale-locks", async (req, res) => {
    try {
      const { ConcurrencyCleanupService } = await import("./services/concurrency-cleanup");
      const cleanedCount = await ConcurrencyCleanupService.cleanupStaleProcessingLocks();
      res.json({ 
        success: true, 
        cleanedFiles: cleanedCount,
        message: cleanedCount > 0 
          ? `Cleaned up ${cleanedCount} stale processing locks` 
          : "No stale processing locks found"
      });
    } catch (error) {
      console.error("Error cleaning up stale locks:", error);
      res.status(500).json({ error: "Failed to cleanup stale processing locks" });
    }
  });

  app.get("/api/processing/server-info", async (req, res) => {
    try {
      const { getCachedServerId, getShortServerId } = await import("./utils/server-id");
      const os = await import("os");
      
      res.json({
        serverId: getCachedServerId(),
        shortServerId: getShortServerId(),
        hostname: os.hostname(),
        platform: os.platform(),
        architecture: os.arch(),
        nodeVersion: process.version,
        processId: process.pid,
        environment: process.env.NODE_ENV || 'production',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      });
    } catch (error) {
      console.error("Error fetching server info:", error);
      res.status(500).json({ error: "Failed to fetch server information" });
    }
  });

  // Terminal management endpoints
  
  // Get all terminals
  app.get("/api/terminals", isAuthenticated, async (req, res) => {
    try {
      const terminals = await storage.getTerminals();
      res.json(terminals);
    } catch (error) {
      console.error('Error fetching terminals:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch terminals" 
      });
    }
  });

  // Get terminal by ID
  app.get("/api/terminals/:id", isAuthenticated, async (req, res) => {
    try {
      const terminalId = parseInt(req.params.id);
      const terminal = await storage.getTerminalById(terminalId);
      
      if (!terminal) {
        return res.status(404).json({ error: "Terminal not found" });
      }
      
      res.json(terminal);
    } catch (error) {
      console.error('Error fetching terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch terminal" 
      });
    }
  });

  // Get terminals by POS Merchant #
  app.get("/api/terminals/by-master-mid/:masterMID", isAuthenticated, async (req, res) => {
    try {
      const masterMID = req.params.masterMID;
      const terminals = await storage.getTerminalsByMasterMID(masterMID);
      res.json(terminals);
    } catch (error) {
      console.error('Error fetching terminals by POS Merchant #:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch terminals" 
      });
    }
  });

  // Create new terminal
  app.post("/api/terminals", isAuthenticated, async (req, res) => {
    try {
      const terminalData = insertTerminalSchema.parse(req.body);
      
      // Set created timestamp and user
      const newTerminalData = {
        ...terminalData,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUpdate: new Date(),
        updateSource: `Form: ${req.user?.username || "System"}`,
        createdBy: req.user?.username || "System",
        updatedBy: req.user?.username || "System"
      };
      
      const terminal = await storage.createTerminal(newTerminalData);
      res.status(201).json(terminal);
    } catch (error: any) {
      console.error('Error creating terminal:', error);
      
      // Handle duplicate V Number error with user-friendly message
      if (error.code === '23505' && error.constraint && error.constraint.includes('v_number_key')) {
        // Log duplicate V Number attempt to system logs
        try {
          const { pool } = await import('./db');
          const { getTableName } = await import('./table-config');
          const systemLogsTable = getTableName('system_logs');
          await pool.query(
            `INSERT INTO ${systemLogsTable} (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5)`,
            [
              'warning',
              'Terminal Creation',
              `Duplicate V Number attempt blocked: ${req.body.vNumber}`,
              JSON.stringify({
                vNumber: req.body.vNumber,
                username: req.user?.username || 'Unknown',
                ipAddress: req.ip || 'unknown',
                error: 'V Number already exists'
              }),
              new Date()
            ]
          );
        } catch (logError) {
          console.error('Failed to log duplicate V Number attempt:', logError);
        }
        
        return res.status(400).json({
          error: `A terminal with V Number "${req.body.vNumber}" already exists. Please use a different V Number.`
        });
      }
      
      // Handle validation errors
      if (error.name === 'ZodError') {
        // Log validation error to system logs
        try {
          const { pool } = await import('./db');
          const { getTableName } = await import('./table-config');
          const systemLogsTable = getTableName('system_logs');
          await pool.query(
            `INSERT INTO ${systemLogsTable} (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5)`,
            [
              'warning',
              'Terminal Creation',
              'Terminal creation validation failed',
              JSON.stringify({
                username: req.user?.username || 'Unknown',
                ipAddress: req.ip || 'unknown',
                error: 'Form validation errors',
                validationIssues: error.issues || []
              }),
              new Date()
            ]
          );
        } catch (logError) {
          console.error('Failed to log validation error:', logError);
        }
        
        return res.status(400).json({
          error: "Please check that all required fields are filled out correctly."
        });
      }
      
      // Log general terminal creation error
      try {
        const { pool } = await import('./db');
        const { getTableName } = await import('./table-config');
        const systemLogsTable = getTableName('system_logs');
        await pool.query(
          `INSERT INTO ${systemLogsTable} (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5)`,
          [
            'error',
            'Terminal Creation',
            'Terminal creation failed with unexpected error',
            JSON.stringify({
              username: req.user?.username || 'Unknown',
              ipAddress: req.ip || 'unknown',
              error: error.message || 'Unknown error',
              errorCode: error.code || 'N/A'
            }),
            new Date()
          ]
        );
      } catch (logError) {
        console.error('Failed to log general terminal creation error:', logError);
      }
      
      res.status(500).json({ 
        error: "Failed to create terminal. Please try again."
      });
    }
  });

  // Update terminal
  app.put("/api/terminals/:id", isAuthenticated, async (req, res) => {
    try {
      const terminalId = parseInt(req.params.id);
      const terminalData = insertTerminalSchema.partial().parse(req.body);
      
      // Set updated timestamp and user
      const updateData = {
        ...terminalData,
        updatedAt: new Date(),
        lastUpdate: new Date(),
        updateSource: `Form: ${req.user?.username || "System"}`,
        updatedBy: req.user?.username || "System"
      };
      
      const terminal = await storage.updateTerminal(terminalId, updateData);
      res.json(terminal);
    } catch (error) {
      console.error('Error updating terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update terminal" 
      });
    }
  });

  // Delete terminal
  app.delete("/api/terminals/:id", isAuthenticated, async (req, res) => {
    try {
      const terminalId = parseInt(req.params.id);
      await storage.deleteTerminal(terminalId);
      res.json({ success: true, message: "Terminal deleted successfully" });
    } catch (error) {
      console.error('Error deleting terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete terminal" 
      });
    }
  });

  // Bulk delete terminals
  app.delete("/api/terminals", isAuthenticated, async (req, res) => {
    try {
      const { terminalIds } = req.body;
      
      if (!Array.isArray(terminalIds) || terminalIds.length === 0) {
        return res.status(400).json({ error: "terminalIds must be a non-empty array" });
      }

      console.log('[BACKEND DELETE] Attempting to delete terminals:', terminalIds);
      
      // Delete each terminal
      const deletionResults = [];
      for (const terminalId of terminalIds) {
        try {
          await storage.deleteTerminal(terminalId);
          deletionResults.push({ terminalId, success: true });
        } catch (error) {
          console.error(`Error deleting terminal ${terminalId}:`, error);
          deletionResults.push({ 
            terminalId, 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }
      
      const successfulDeletes = deletionResults.filter(r => r.success);
      const failedDeletes = deletionResults.filter(r => !r.success);
      
      console.log('[BACKEND DELETE] Results:', { 
        successful: successfulDeletes.length, 
        failed: failedDeletes.length 
      });
      
      res.json({ 
        success: true, 
        message: `Successfully deleted ${successfulDeletes.length} terminal${successfulDeletes.length !== 1 ? 's' : ''}`,
        deletionResults,
        successfulCount: successfulDeletes.length,
        failedCount: failedDeletes.length
      });
    } catch (error) {
      console.error('Error in bulk delete terminals:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete terminals" 
      });
    }
  });

  // ==================== TDDF ROUTES ====================
  
  // Get all TDDF records with pagination
  app.get("/api/tddf", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      // Get TDDF records with pagination
      const tddfRecords = await db.select()
        .from(tddfRecordsTable)
        .orderBy(desc(tddfRecordsTable.createdAt))
        .limit(limit)
        .offset(offset);
      
      // Get total count for pagination
      const countResult = await db.select({ count: count() }).from(tddfRecordsTable);
      const totalItems = parseInt(countResult[0].count.toString());
      const totalPages = Math.ceil(totalItems / limit);
      
      res.json({
        data: tddfRecords,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      });
    } catch (error) {
      console.error('Error fetching TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records" 
      });
    }
  });

  // Get TDDF record by ID
  app.get("/api/tddf/:id", isAuthenticated, async (req, res) => {
    try {
      const recordId = parseInt(req.params.id);
      const record = await storage.getTddfRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ error: "TDDF record not found" });
      }
      
      res.json(record);
    } catch (error) {
      console.error('Error fetching TDDF record:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF record" 
      });
    }
  });

  // Delete TDDF records (bulk)
  app.delete("/api/tddf", isAuthenticated, async (req, res) => {
    try {
      const { recordIds } = req.body;
      
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({ error: "recordIds must be a non-empty array" });
      }

      console.log('[BACKEND DELETE] Attempting to delete TDDF records:', recordIds);
      
      await storage.deleteTddfRecords(recordIds);
      
      console.log('[BACKEND DELETE] Successfully deleted TDDF records:', recordIds);
      
      res.json({ 
        success: true, 
        message: `Successfully deleted ${recordIds.length} TDDF record${recordIds.length !== 1 ? 's' : ''}`,
        deletedCount: recordIds.length
      });
    } catch (error) {
      console.error('Error in bulk delete TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete TDDF records" 
      });
    }
  });

  // Get TDDF record by ID
  app.get("/api/tddf/:id", isAuthenticated, async (req, res) => {
    try {
      const recordId = parseInt(req.params.id);
      const [record] = await db.select()
        .from(tddfRecordsTable)
        .where(eq(tddfRecordsTable.id, recordId));
      
      if (!record) {
        return res.status(404).json({ error: "TDDF record not found" });
      }
      
      res.json(record);
    } catch (error) {
      console.error('Error fetching TDDF record:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF record" 
      });
    }
  });

  // Get TDDF records by merchant ID
  app.get("/api/tddf/merchant/:merchantId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = req.params.merchantId;
      const records = await db.select()
        .from(tddfRecordsTable)
        .where(eq(tddfRecordsTable.merchantAccountNumber, merchantId))
        .orderBy(desc(tddfRecordsTable.transactionDate));
      
      res.json(records);
    } catch (error) {
      console.error('Error fetching TDDF records by merchant:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records" 
      });
    }
  });

  // Get TDDF records by batch ID
  app.get("/api/tddf/batch/:batchId", isAuthenticated, async (req, res) => {
    try {
      const batchId = req.params.batchId;
      const records = await db.select()
        .from(tddfRecordsTable)
        .where(eq(tddfRecordsTable.batchJulianDate, batchId))
        .orderBy(desc(tddfRecordsTable.transactionDate));
      
      res.json(records);
    } catch (error) {
      console.error('Error fetching TDDF records by batch:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records" 
      });
    }
  });

  // Delete TDDF record
  app.delete("/api/tddf/:id", isAuthenticated, async (req, res) => {
    try {
      const recordId = parseInt(req.params.id);
      
      // Check if record exists
      const [existingRecord] = await db.select()
        .from(tddfRecordsTable)
        .where(eq(tddfRecordsTable.id, recordId));
      
      if (!existingRecord) {
        return res.status(404).json({ error: "TDDF record not found" });
      }
      
      // Delete the record
      await db.delete(tddfRecordsTable)
        .where(eq(tddfRecordsTable.id, recordId));
      
      res.json({ 
        success: true, 
        message: "TDDF record deleted successfully" 
      });
    } catch (error) {
      console.error('Error deleting TDDF record:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete TDDF record" 
      });
    }
  });

  // Export TDDF records to CSV
  app.get("/api/tddf/export", isAuthenticated, async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const batchId = req.query.batchId as string;
      const merchantId = req.query.merchantId as string;
      
      let query = db.select().from(tddfRecordsTable);
      
      // Apply filters
      const conditions = [];
      if (startDate) {
        conditions.push(gte(tddfRecordsTable.transactionDate, new Date(startDate)));
      }
      if (endDate) {
        conditions.push(lte(tddfRecordsTable.transactionDate, new Date(endDate)));
      }
      if (batchId) {
        conditions.push(eq(tddfRecordsTable.batchJulianDate, batchId));
      }
      if (merchantId) {
        conditions.push(eq(tddfRecordsTable.merchantAccountNumber, merchantId));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      const records = await query.orderBy(desc(tddfRecordsTable.transactionDate));
      
      // Convert to CSV format
      const csvData = records.map(record => ({
        'Reference Number': record.referenceNumber || '',
        'Merchant Account': record.merchantAccountNumber || '',
        'Merchant Name': record.merchantName || '',
        'Amount': record.transactionAmount || 0,
        'Date': record.transactionDate?.toISOString().split('T')[0] || '',
        'Transaction Code': record.transactionCode || '',
        'Auth Number': record.authorizationNumber || '',
        'Card Type': record.cardType || '',
        'Terminal ID': record.terminalId || '',
        'MCC Code': record.mccCode || '',
        'Batch Date': record.batchJulianDate || '',
        'Created At': record.createdAt?.toISOString() || ''
      }));
      
      const csvContent = formatCSV(csvData);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="tddf_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
      
    } catch (error) {
      console.error('Error exporting TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export TDDF records" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
