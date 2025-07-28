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
import { count, desc, eq, isNotNull, and, gte, between, sql, isNull, lte } from "drizzle-orm";
import { setupAuth } from "./auth";
import { loadDatabaseConfig, saveDatabaseConfig, testDatabaseConnection } from "./config";
import { registerS3Routes } from "./routes/s3_routes";
import { registerBackupScheduleRoutes } from "./routes/backup_schedule_routes";
import { fileProcessorService } from "./services/file-processor";
import logsRoutes from "./routes/logs_routes";
import logTestRoutes from "./routes/log_test_routes";
import poolRoutes from "./routes/pool_routes";
import hierarchicalTddfMigrationRoutes from "./routes/hierarchical-tddf-migration";
import { registerReprocessSkippedRoutes } from "./routes/reprocess-skipped";
import { getTableName } from "./table-config";

// Authentication middleware
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Not authenticated" });
}

// API key authentication middleware
export async function isApiKeyAuthenticated(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: "API key required in X-API-Key header" });
    }
    
    // Verify API key with storage
    const apiUser = await storage.getApiUserByKey(apiKey);
    
    if (!apiUser) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    
    if (!apiUser.isActive) {
      return res.status(403).json({ error: "API key is inactive" });
    }
    
    // Check permissions for TDDF upload
    if (!apiUser.permissions.includes('tddf:upload')) {
      return res.status(403).json({ error: "Insufficient permissions for TDDF upload" });
    }
    
    // Update last used timestamp and request count
    await storage.updateApiUserUsage(apiUser.id);
    
    // Add API user to request for logging
    (req as any).apiUser = apiUser;
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: "Authentication error" });
  }
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

// Global processing pause state
let processingPaused = false;

export function isProcessingPaused(): boolean {
  return processingPaused;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize authentication system
  setupAuth(app);
  
  // Register S3 configuration routes
  registerS3Routes(app);
  
  // Register logs routes
  app.use(logsRoutes);
  app.use(logTestRoutes);
  
  // Register pool monitoring routes
  app.use("/api/pools", isAuthenticated, poolRoutes);
  
  // Hierarchical TDDF migration routes
  app.use("/api/hierarchical-tddf", hierarchicalTddfMigrationRoutes);
  
  // Register reprocessing skipped records routes
  registerReprocessSkippedRoutes(app);
  
  // Import the restore function from restore-env-backup
  const { restoreBackupToEnvironment } = await import('./restore-env-backup');

  // Global pause/resume controls for processing
  app.post("/api/system/pause-processing", isAuthenticated, (req, res) => {
    processingPaused = true;
    console.log("[SYSTEM] 🛑 PROCESSING PAUSED by user request");
    res.json({ status: "paused", message: "All processing activities have been paused" });
  });

  app.post("/api/system/resume-processing", isAuthenticated, (req, res) => {
    processingPaused = false;
    console.log("[SYSTEM] ▶️ PROCESSING RESUMED by user request");
    res.json({ status: "resumed", message: "Processing activities have been resumed" });
  });

  app.get("/api/system/processing-status", isAuthenticated, (req, res) => {
    res.json({ 
      paused: processingPaused,
      status: processingPaused ? "paused" : "running"
    });
  });
  
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

  // API User management endpoints
  app.get("/api/api-users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUsers = await storage.getApiUsers();
      res.json(apiUsers);
    } catch (error) {
      console.error("Error fetching API users:", error);
      res.status(500).json({ error: "Failed to fetch API users" });
    }
  });

  app.post("/api/api-users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUser = await storage.createApiUser({
        ...req.body,
        createdBy: req.user?.username || "System"
      });
      
      res.status(201).json(apiUser);
    } catch (error) {
      console.error("Error creating API user:", error);
      res.status(500).json({ error: "Failed to create API user" });
    }
  });

  app.put("/api/api-users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUserId = parseInt(req.params.id);
      const updatedApiUser = await storage.updateApiUser(apiUserId, req.body);
      
      res.json(updatedApiUser);
    } catch (error) {
      console.error("Error updating API user:", error);
      res.status(500).json({ error: "Failed to update API user" });
    }
  });

  app.delete("/api/api-users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUserId = parseInt(req.params.id);
      await storage.deleteApiUser(apiUserId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting API user:", error);
      res.status(500).json({ error: "Failed to delete API user" });
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
      
      // Get TDDF raw import statistics with hierarchical record type breakdown using environment-specific table names
      const tddfRawStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_raw_lines,
          COUNT(CASE WHEN processed_into_table = '${tddfRecordsTableName}' THEN 1 END) as dt_records_processed,
          COUNT(CASE WHEN skip_reason = 'non_dt_record' THEN 1 END) as non_dt_records_skipped,
          COUNT(CASE WHEN skip_reason IS NOT NULL 
                  AND skip_reason != 'non_dt_record' 
                  AND skip_reason NOT LIKE 'duplicate_%' 
                  AND processing_status = 'skipped' THEN 1 END) as other_skipped
        FROM ${tddfRawImportTableName}
      `);
      
      // Get hierarchical record counts using separate simple queries to avoid subquery issues
      const bhCountResult = await pool.query(`SELECT COUNT(*) as count FROM ${getTableName('tddf_batch_headers')}`);
      const p1TableResult = await pool.query(`SELECT COUNT(*) as count FROM ${getTableName('tddf_purchasing_extensions')}`);
      const p2TableResult = await pool.query(`SELECT COUNT(*) as count FROM ${getTableName('tddf_purchasing_extensions_2')}`);
      const p1RawResult = await pool.query(`SELECT COUNT(*) as count FROM ${tddfRawImportTableName} WHERE record_type = 'P1' AND processing_status = 'processed'`);
      const p2RawResult = await pool.query(`SELECT COUNT(*) as count FROM ${tddfRawImportTableName} WHERE record_type = 'P2' AND processing_status = 'processed'`);
      const otherCountResult = await pool.query(`SELECT COUNT(*) as count FROM ${getTableName('tddf_other_records')}`);
      
      // Combine the results
      const hierarchicalStats = {
        bh_records_processed: parseInt(bhCountResult.rows[0]?.count || '0'),
        p1_total_processed: parseInt(p1TableResult.rows[0]?.count || '0') + parseInt(p1RawResult.rows[0]?.count || '0'),
        p2_total_processed: parseInt(p2TableResult.rows[0]?.count || '0') + parseInt(p2RawResult.rows[0]?.count || '0'),
        other_records_processed: parseInt(otherCountResult.rows[0]?.count || '0')
      };

      const stats = result.rows[0];
      const recentTransactions = parseInt(transactionSpeedResult.rows[0]?.recent_transactions || '0');
      const recentTddfRecords = parseInt(tddfSpeedResult.rows[0]?.recent_tddf_records || '0');
      
      // Calculate actual processing speeds (10 minutes = 600 seconds)
      const transactionsPerSecond = recentTransactions > 0 ? recentTransactions / 600 : 0;
      const tddfRecordsPerSecond = recentTddfRecords > 0 ? recentTddfRecords / 600 : 0;
      
      const tddfStats = tddfStatsResult.rows[0];
      const tddfRawStats = tddfRawStatsResult.rows[0];
      // hierarchicalStats is already constructed above
      
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
          bhRecordsProcessed: parseInt(hierarchicalStats.bh_records_processed) || 0,
          p1RecordsProcessed: parseInt(hierarchicalStats.p1_total_processed) || 0,
          p2RecordsProcessed: parseInt(hierarchicalStats.p2_total_processed) || 0,
          otherRecordsProcessed: parseInt(hierarchicalStats.other_records_processed) || 0,
          nonDtRecordsSkipped: parseInt(tddfRawStats.non_dt_records_skipped) || 0,
          otherSkipped: parseInt(tddfRawStats.other_skipped) || 0
        }
      };

      // Get current peaks from latest database record
      const latestPeakResult = await pool.query(`
        SELECT peak_transactions_per_second, peak_records_per_minute 
        FROM ${metricsTableName} 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);
      
      const currentTxnPeak = latestPeakResult.rows[0]?.peak_transactions_per_second || 0;
      const currentRecordsPeak = latestPeakResult.rows[0]?.peak_records_per_minute || 0;
      const newTxnPeak = Math.max(parseFloat(currentTxnPeak), currentStats.transactionsPerSecond);
      // Calculate records per minute using both transaction and TDDF records
      const totalRecordsPerSecond = currentStats.transactionsPerSecond + currentStats.tddfRecordsPerSecond;
      const recordsPerMinute = totalRecordsPerSecond * 60;
      const newRecordsPeak = Math.max(parseFloat(currentRecordsPeak), recordsPerMinute);
      
      // Save metrics snapshot to database with raw line processing data
      try {
        await pool.query(`
          INSERT INTO ${metricsTableName} (
            transactions_per_second, 
            peak_transactions_per_second,
            records_per_minute,
            peak_records_per_minute,
            total_files,
            queued_files, 
            processed_files,
            files_with_errors,
            currently_processing,
            system_status,
            metric_type,
            raw_lines_processed,
            raw_lines_skipped,
            raw_lines_total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          currentStats.transactionsPerSecond,
          newTxnPeak,
          recordsPerMinute,
          newRecordsPeak,
          currentStats.totalFiles,
          currentStats.queuedFiles,
          currentStats.processedFiles,
          currentStats.filesWithErrors,
          currentStats.currentlyProcessing,
          currentStats.currentlyProcessing > 0 ? 'processing' : 'idle',
          'snapshot',
          currentStats.tddfOperations.dtRecordsProcessed || 0,
          (currentStats.tddfOperations.nonDtRecordsSkipped || 0) + (currentStats.tddfOperations.otherSkipped || 0),
          currentStats.tddfOperations.totalRawLines || 0
        ]);
      } catch (dbError) {
        console.error('Error saving processing metrics to database:', dbError);
        // Continue without failing the API response
      }
      
      res.json({
        ...currentStats,
        peakTransactionsPerSecond: newTxnPeak,
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
          records_per_minute,
          peak_records_per_minute,
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
          currentRecordsPerMinute: 0.0,
          peakRecordsPerMinute: 0.0,
          systemStatus: 'idle',
          lastUpdated: new Date().toISOString()
        });
      }
      
      const metrics = result.rows[0];
      res.json({
        currentSpeed: parseFloat(metrics.transactions_per_second),
        peakSpeed: parseFloat(metrics.peak_transactions_per_second),
        currentRecordsPerMinute: parseFloat(metrics.records_per_minute || 0),
        peakRecordsPerMinute: parseFloat(metrics.peak_records_per_minute || 0),
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
      
      // @ENVIRONMENT-CRITICAL - Analytics data query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses raw SQL for environment awareness 
      const transactionsTableName = getTableName('transactions');
      const merchantsTableName = getTableName('merchants');
      
      // Get transaction history data for the charts using raw SQL
      const transactionQuery = `
        SELECT t.*, m.name as merchant_name 
        FROM ${transactionsTableName} t
        INNER JOIN ${merchantsTableName} m ON t.merchant_id = m.id
        ORDER BY t.date
      `;
      const transactionsResult = await pool.query(transactionQuery);
      const allTransactions = transactionsResult.rows.map(row => ({
        transaction: row,
        merchantName: row.merchant_name
      }));
      
      // Get unique merchant categories using raw SQL
      const categoriesQuery = `
        SELECT category, COUNT(*) as count 
        FROM ${merchantsTableName}
        WHERE category IS NOT NULL
        GROUP BY category
      `;
      const categoriesResult = await pool.query(categoriesQuery);
      const merchantCategories = categoriesResult.rows;
      
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
        
        // Read file content properly for different file types
        let fileContent: string;
        let fileContentBase64: string;
        
        if (type === 'tddf') {
          // For TDDF files, read as binary first then convert to UTF-8 to avoid encoding issues
          const rawBuffer = fs.readFileSync(file.path);
          fileContent = rawBuffer.toString('utf8');
          fileContentBase64 = rawBuffer.toString('base64');
        } else {
          // For CSV files, read as UTF-8 text
          fileContent = fs.readFileSync(file.path, 'utf8');
          fileContentBase64 = Buffer.from(fileContent, 'utf8').toString('base64');
        }
        
        console.log(`Storing file content for ${fileId}: ${fileContent.length} characters, ${fileContentBase64.length} base64 chars`);
        
        console.log(`[UPLOAD] Using table: ${uploadedFilesTableName} for file: ${fileId}, environment: ${currentEnvironment}`);
        
        // Get file size and line count information
        const fileStats = fs.statSync(file.path);
        const fileSize = fileStats.size;
        const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
        const rawLinesCount = lines.length;
        
        console.log(`[UPLOAD] File ${fileId}: ${fileSize} bytes, ${rawLinesCount} lines`);
        
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
              file_size,
              raw_lines_count,
              upload_environment,
              processing_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            fileId,
            file.originalname,
            file.path,
            type,
            new Date(),
            false,
            false,
            fileContentBase64,
            fileSize,
            rawLinesCount,
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
                file_size,
                raw_lines_count,
                processing_status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
              fileId,
              file.originalname,
              file.path,
              type,
              new Date(),
              false,
              false,
              fileContentBase64,
              fileSize,
              rawLinesCount,
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
          
          // Use already calculated line count from upload
          const lineCount = rawLinesCount;
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
          file_size,
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
      } else if (sortBy === 'processingTime') {
        orderClause = sql`ORDER BY processing_time_ms ${direction}`;
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
        fileSize: row.file_size,
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
          processing_server_id,
          file_size,
          raw_lines_count,
          processing_notes
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
      } else if (sortBy === 'processingTime') {
        orderClause = sql`ORDER BY processing_time_ms ${direction}`;
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
        processingServerId: row.processing_server_id,
        fileSize: row.file_size,
        rawLinesCount: row.raw_lines_count,
        processingNotes: row.processing_notes
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
          sortBy: ['uploadDate', 'processingTime', 'filename']
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
      
      // @ENVIRONMENT-CRITICAL - File reprocess query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Get file info using environment-aware table name
      const result = await pool.query(`
        SELECT id, original_filename, storage_path, file_type, uploaded_at, processed, processing_errors, deleted
        FROM ${uploadedFilesTableName}
        WHERE id = $1
      `, [fileId]);
      const fileInfo = result.rows[0];
      
      if (!fileInfo) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check if the file still exists
      if (!fs.existsSync(fileInfo.storage_path)) {
        // File doesn't exist anymore - update error in database using environment-aware table name
        await pool.query(`
          UPDATE ${uploadedFilesTableName}
          SET processed = true, processing_errors = 'Original file has been removed from the temporary storage. Please re-upload the file.'
          WHERE id = $1
        `, [fileId]);
          
        return res.status(404).json({ 
          error: "File no longer exists in temporary storage. Please re-upload the file."
        });
      }
      
      // Mark file as queued for reprocessing (not processed, no errors) using environment-aware table name
      await pool.query(`
        UPDATE ${uploadedFilesTableName}
        SET processed = false, processing_errors = NULL, processed_at = NULL
        WHERE id = $1
      `, [fileId]);
      
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
  // Get transactions for a specific merchant by merchant ID
  app.get("/api/transactions/by-merchant/:merchantId", async (req, res) => {
    try {
      const { merchantId } = req.params;
      const transactions = await storage.getTransactionsByMerchantId(merchantId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions by merchant:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

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
      console.log("Storage type:", storage.constructor.name);
      
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
      console.log("Transaction result sample:", transactions.transactions.slice(0, 2));
      
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
        // @ENVIRONMENT-CRITICAL - Merchant merge source lookup with environment-aware table naming
        // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
        const merchantsTableName = getTableName('merchants'); 
        
        // Get the source merchant directly from database since it's been removed (using raw SQL)
        const sourceMerchantResult = await pool.query(`
          SELECT * FROM ${merchantsTableName} WHERE id = $1
        `, [sourceMerchantId]);
        const sourceMerchant = sourceMerchantResult.rows[0];
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
          
          // @ENVIRONMENT-CRITICAL - Audit log creation with environment-aware table naming
          // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
          const auditLogsTableName = getTableName('audit_logs');
          
          console.log('[POST-MERGE LOGGING] Creating audit log entry:', auditLogData);
          
          // Create audit log using raw SQL with environment-aware table name
          const auditLogColumns = Object.keys(auditLogData).join(', ');
          const auditLogPlaceholders = Object.keys(auditLogData).map((_, i) => `$${i + 1}`).join(', ');
          const auditLogValues = Object.values(auditLogData).map(val => 
            typeof val === 'object' ? JSON.stringify(val) : val
          );
          
          const auditLogResult = await pool.query(`
            INSERT INTO ${auditLogsTableName} (${auditLogColumns}) VALUES (${auditLogPlaceholders}) RETURNING id
          `, auditLogValues);
          console.log('[POST-MERGE LOGGING] Audit log created successfully with ID:', auditLogResult.rows[0]?.id);
          
          // Verify the audit log was actually inserted using environment-aware table name
          const verifyAudit = await pool.query(`
            SELECT id FROM ${auditLogsTableName} WHERE id = $1
          `, [auditLogResult.rows[0]?.id]);
          console.log('[POST-MERGE LOGGING] Audit log verification:', verifyAudit.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
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
      
      // @ENVIRONMENT-CRITICAL - Upload log verification with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Verify the upload log was actually inserted using environment-aware table name
      const verifyResult = await pool.query(`
        SELECT id FROM ${uploadedFilesTableName} WHERE id = $1
      `, [logId]);
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
      // @ENVIRONMENT-CRITICAL - System log creation with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const systemLogsTableName = getTableName('system_logs');
      
      console.log('[POST-MERGE LOGGING] Creating system log entry:', systemLogData);
      
      // Create system log using raw SQL with environment-aware table name
      const systemLogColumns = Object.keys(systemLogData).join(', ');
      const systemLogPlaceholders = Object.keys(systemLogData).map((_, i) => `$${i + 1}`).join(', ');
      const systemLogValues = Object.values(systemLogData).map(val => 
        typeof val === 'object' ? JSON.stringify(val) : val
      );
      
      const systemLogResult = await pool.query(`
        INSERT INTO ${systemLogsTableName} (${systemLogColumns}) VALUES (${systemLogPlaceholders}) RETURNING id
      `, systemLogValues);
      console.log('[POST-MERGE LOGGING] System log created successfully with ID:', systemLogResult.rows[0]?.id);
      
      // Verify the system log was actually inserted using environment-aware table name
      const verifySystem = await pool.query(`
        SELECT id FROM ${systemLogsTableName} WHERE id = $1
      `, [systemLogResult.rows[0]?.id]);
      console.log('[POST-MERGE LOGGING] System log verification:', verifySystem.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
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

  // Get historical records per minute data for chart visualization with time navigation
  app.get("/api/processing/records-per-minute-history", async (req, res) => {
    try {
      const metricsTableName = getTableName('processing_metrics');
      const hours = parseFloat(req.query.hours as string) || 24; // Default to 24 hours (support decimal values)
      const timeOffset = parseFloat(req.query.timeOffset as string) || 0; // Hours to offset from current time
      
      // Calculate time range with offset
      const endTime = timeOffset > 0 ? `NOW() - INTERVAL '${timeOffset} hours'` : 'NOW()';
      const startTime = `${endTime} - INTERVAL '${hours} hours'`;
      
      // Generate complete time series with zero values for missing time slots
      // Use 1-minute intervals for 1-hour view, 5-minute intervals for longer views
      const intervalMinutes = hours <= 1 ? 1 : 5; // Use raw numbers for generate_series
      const maxIntervals = hours <= 1 ? Math.ceil(hours * 60) : Math.ceil((hours * 60) / 5); // Calculate intervals based on actual hours
      
      const result = await pool.query(`
        WITH time_series AS (
          SELECT 
            (DATE_TRUNC('minute', ${startTime}) + (i * INTERVAL '${intervalMinutes} minute')) as time_slot
          FROM generate_series(0, ${maxIntervals - 1}) i
        )
        SELECT 
          ts.time_slot as timestamp,
          COALESCE(pm.records_per_minute, 0) as records_per_minute,
          COALESCE(pm.system_status, 'idle') as system_status,
          COALESCE(pm.transactions_per_second, 0.0) as transactions_per_second,
          COALESCE(
            CASE 
              WHEN pm.metric_type = 'combined' AND pm.records_per_minute IS NOT NULL THEN 
                pm.records_per_minute - (pm.transactions_per_second * 60)
              ELSE 0.0 
            END, 0.0
          ) as tddf_records_per_minute,
          COALESCE(pm.transactions_per_second * 60, 0.0) as transaction_records_per_minute,
          COALESCE(pm.metric_type, 'idle') as metric_type
        FROM time_series ts
        LEFT JOIN (
          SELECT 
            DATE_TRUNC('minute', timestamp) as minute_slot,
            AVG(records_per_minute) as records_per_minute,
            AVG(transactions_per_second) as transactions_per_second,
            MODE() WITHIN GROUP (ORDER BY system_status) as system_status,
            CASE 
              WHEN COUNT(CASE WHEN metric_type = 'tddf_raw_import' THEN 1 END) > 0 THEN 'tddf_raw_import'
              WHEN COUNT(CASE WHEN metric_type = 'hierarchical_dt_migration' THEN 1 END) > 0 THEN 'hierarchical_dt_migration'
              ELSE MODE() WITHIN GROUP (ORDER BY metric_type)
            END as metric_type
          FROM ${metricsTableName}
          WHERE timestamp >= ${startTime}
            AND timestamp <= ${endTime}
            AND (metric_type IN ('combined', 'snapshot', 'tddf_raw_import', 'hierarchical_dt_migration'))
          GROUP BY DATE_TRUNC('minute', timestamp)
        ) pm ON pm.minute_slot = ts.time_slot
        ORDER BY ts.time_slot ASC
      `);
      
      // Format data for chart with enhanced time formatting and record type breakdown
      const chartData = await Promise.all(result.rows.map(async (row) => {
        const timestamp = new Date(row.timestamp);
        const totalRecords = parseFloat(row.records_per_minute) || 0;
        const transactionRecords = parseFloat(row.transaction_records_per_minute) || 0;
        const tddfRecords = parseFloat(row.tddf_records_per_minute) || 0;
        
        // Enhanced hierarchical migration record tracking with proper record type breakdown
        const isHierarchicalMigration = row.metric_type === 'hierarchical_dt_migration' || row.metric_type === 'tddf_raw_import';
        
        if (isHierarchicalMigration) {
          // For hierarchical migration, get actual record type breakdown from raw import data
          const timeSlot = new Date(row.timestamp);
          const minuteStart = new Date(timeSlot.getFullYear(), timeSlot.getMonth(), timeSlot.getDate(), timeSlot.getHours(), timeSlot.getMinutes(), 0);
          const minuteEnd = new Date(minuteStart.getTime() + 60000); // Add 1 minute
          
          // Get hierarchical record type counts for this minute slot
          const hierarchicalBreakdown = await storage.getHierarchicalRecordBreakdown(minuteStart, minuteEnd);
          
          const dtRecords = hierarchicalBreakdown.dtCount || 0;
          const bhRecords = hierarchicalBreakdown.bhCount || 0; 
          const p1Records = hierarchicalBreakdown.p1Count || 0;
          const otherRecords = hierarchicalBreakdown.otherCount || 0;
          
          return {
            timestamp: row.timestamp,
            recordsPerMinute: dtRecords + bhRecords + p1Records + otherRecords,
            dtRecords: dtRecords,
            bhRecords: bhRecords,
            p1Records: p1Records,
            otherRecords: otherRecords,
            status: row.system_status || 'processing',
            formattedTime: timestamp.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Chicago'
            }),
            formattedDateTime: timestamp.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/Chicago'
            })
          };
        } else {
          // Standard transaction processing
          const dtRecords = transactionRecords;
          const bhRecords = 0;
          const p1Records = 0; 
          const otherRecords = tddfRecords;
          
          return {
            timestamp: row.timestamp,
            recordsPerMinute: totalRecords,
            dtRecords: dtRecords,
            bhRecords: bhRecords,
            p1Records: p1Records,
            otherRecords: otherRecords,
            status: row.system_status || 'idle',
            formattedTime: timestamp.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Chicago'
            }),
            formattedDateTime: timestamp.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'America/Chicago'
            })
          };
        }
      }));
      
      // Determine time range label
      const timeRangeLabel = timeOffset > 0 
        ? `${hours}h (${timeOffset}h ago)` 
        : `${hours}h (live)`;
      
      res.json({
        data: chartData,
        totalPoints: chartData.length,
        timeRange: timeRangeLabel,
        timeOffset: timeOffset,
        lastUpdated: new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'America/Chicago'
        })
      });
    } catch (error) {
      console.error("Error getting records per minute history:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get historical data" 
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
  
  // TDDF API ping endpoint for connectivity testing
  app.get("/api/tddf/ping", isApiKeyAuthenticated, async (req, res) => {
    try {
      const apiUser = (req as any).apiUser;
      console.log(`[TDDF API PING] Ping request from API user: ${apiUser.clientName}`);
      
      res.json({ 
        success: true, 
        message: "TDDF API is operational", 
        timestamp: new Date().toISOString(),
        apiUser: apiUser.clientName,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('[TDDF API PING] Error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Ping failed" 
      });
    }
  });
  
  // Get all TDDF records with pagination
  app.get("/api/tddf", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Use storage layer to get properly formatted TDDF records
      const result = await storage.getTddfRecords({
        page,
        limit,
        startDate: req.query.txnDateFrom as string,
        endDate: req.query.txnDateTo as string,
        merchantId: req.query.merchantId as string,
        cardType: req.query.cardType as string,
        search: req.query.search as string,
        vNumber: req.query.vNumber as string,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as string
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records" 
      });
    }
  });

  // Get raw TDDF processing status
  app.get("/api/tddf/raw-status", isAuthenticated, async (req, res) => {
    try {
      const status = await storage.getTddfRawProcessingStatus();
      res.json(status);
    } catch (error) {
      console.error('Error fetching TDDF raw status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF raw status" 
      });
    }
  });

  // Get TDDF batch headers with pagination (must come before :id route)
  app.get("/api/tddf/batch-headers", isAuthenticated, async (req, res) => {
    try {
      console.log('[BH API] Batch headers request received');
      console.log('[BH API] User authenticated:', !!req.user);
      console.log('[BH API] Query params:', req.query);
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const merchantAccount = req.query.merchantAccount as string;
      
      console.log('[BH API] Calling storage.getTddfBatchHeaders with:', { page, limit, merchantAccount });
      
      const result = await storage.getTddfBatchHeaders({
        page,
        limit,
        merchantAccount
      });
      
      console.log('[BH API] Storage returned:', result.data.length, 'records out of', result.pagination.totalItems, 'total');
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching BH records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch BH records" 
      });
    }
  });

  // Get TDDF purchasing extensions (P1 records) with pagination
  app.get("/api/tddf/purchasing-extensions", isAuthenticated, async (req, res) => {
    try {
      console.log('[P1 API] P1 purchasing extensions request received');
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await storage.getTddfPurchasingExtensions({
        page,
        limit
      });
      
      console.log('[P1 API] Storage returned:', result.data.length, 'records out of', result.pagination.totalItems, 'total');
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching P1 records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch P1 records" 
      });
    }
  });

  // Get TDDF other records (E1, G2, AD, DR, etc.) with pagination and filtering
  app.get("/api/tddf/other-records", isAuthenticated, async (req, res) => {
    try {
      console.log('[OTHER API] Other records request received');
      console.log('[OTHER API] Query params:', req.query);
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const recordType = req.query.recordType as string;
      
      // Validate parameters
      if (isNaN(page) || page < 1) {
        return res.status(400).json({ error: "Invalid page parameter" });
      }
      if (isNaN(limit) || limit < 1 || limit > 500) {
        return res.status(400).json({ error: "Invalid limit parameter" });
      }
      
      console.log('[OTHER API] Calling storage with:', { page, limit, recordType });
      
      const result = await storage.getTddfOtherRecords({
        page,
        limit,
        recordType
      });
      
      console.log('[OTHER API] Storage returned:', result.data.length, 'records out of', result.pagination.totalItems, 'total');
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching other records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch other records" 
      });
    }
  });

  // Get TDDF purchasing extensions 2 (P2 records) with pagination
  app.get("/api/tddf/purchasing-extensions-2", isAuthenticated, async (req, res) => {
    try {
      console.log('[P2 API] P2 purchasing extensions request received');
      
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await storage.getTddfPurchasingExtensions2({
        page,
        limit
      });
      
      console.log('[P2 API] Storage returned:', result.data.length, 'records out of', result.pagination.totalItems, 'total');
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching P2 records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch P2 records" 
      });
    }
  });

  // Delete TDDF batch headers (bulk)
  app.delete("/api/tddf/batch-headers", isAuthenticated, async (req, res) => {
    try {
      const { recordIds } = req.body;
      
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({ error: "recordIds must be a non-empty array" });
      }

      console.log('[BH DELETE] Attempting to delete BH records:', recordIds);
      
      await storage.deleteTddfBatchHeaders(recordIds);
      
      console.log('[BH DELETE] Successfully deleted BH records:', recordIds);
      
      res.json({ 
        success: true, 
        message: `Successfully deleted ${recordIds.length} BH record${recordIds.length !== 1 ? 's' : ''}`,
        deletedCount: recordIds.length
      });
    } catch (error) {
      console.error('Error in bulk delete BH records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete BH records" 
      });
    }
  });



  // Chunked file upload endpoints for large files
  const chunks = new Map<string, { chunks: Buffer[], metadata: any }>();
  
  app.post("/api/uploads/chunked", upload.single('chunk'), isAuthenticated, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No chunk provided" });
      }

      const { uploadId, chunkIndex, totalChunks, fileName, fileType } = req.body;
      
      if (!uploadId || chunkIndex === undefined || !totalChunks || !fileName || !fileType) {
        return res.status(400).json({ error: "Missing chunk metadata" });
      }

      // Read chunk data
      const chunkData = fs.readFileSync(req.file.path);
      
      // Initialize upload if first chunk
      if (!chunks.has(uploadId)) {
        chunks.set(uploadId, { 
          chunks: new Array(parseInt(totalChunks)), 
          metadata: { fileName, fileType, totalChunks: parseInt(totalChunks) }
        });
      }

      // Store chunk
      const upload = chunks.get(uploadId)!;
      upload.chunks[parseInt(chunkIndex)] = chunkData;

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      console.log(`[CHUNKED UPLOAD] Received chunk ${parseInt(chunkIndex) + 1}/${totalChunks} for ${fileName}`);
      
      res.json({ 
        success: true, 
        message: `Chunk ${parseInt(chunkIndex) + 1}/${totalChunks} uploaded` 
      });

    } catch (error) {
      console.error("Chunked upload error:", error);
      res.status(500).json({ error: "Failed to upload chunk" });
    }
  });

  app.post("/api/uploads/chunked/finalize", isAuthenticated, async (req, res) => {
    try {
      const { uploadId, fileName, fileType } = req.body;
      
      if (!uploadId || !fileName || !fileType) {
        return res.status(400).json({ error: "Missing finalize parameters" });
      }

      const uploadData = chunks.get(uploadId);
      if (!uploadData) {
        return res.status(400).json({ error: "Upload not found" });
      }

      // Verify all chunks received
      const missingChunks = uploadData.chunks.findIndex(chunk => !chunk);
      if (missingChunks !== -1) {
        return res.status(400).json({ error: `Missing chunk ${missingChunks}` });
      }

      // Reconstruct file
      const completeFile = Buffer.concat(uploadData.chunks);
      const fileContent = completeFile.toString('utf8');
      const fileContentBase64 = completeFile.toString('base64');

      // Process raw data for diagnostics
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      const rawLinesCount = lines.length;
      
      // Detect headers and analyze content
      let processingNotes = `Chunked upload: ${uploadData.metadata.totalChunks} chunks, ${(completeFile.length / 1024 / 1024).toFixed(1)}MB total`;
      if (lines.length > 0) {
        const firstLine = lines[0];
        const hasHeaders = /^[a-zA-Z]/.test(firstLine) && (firstLine.includes(',') || firstLine.includes('\t'));
        processingNotes += hasHeaders ? `, Headers detected: ${firstLine.substring(0, 50)}...` : ', No headers detected';
      }

      // Store in database
      const uploadedFilesTableName = getTableName('uploaded_files');
      const currentEnvironment = process.env.NODE_ENV || 'development';
      const fileId = `chunked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await pool.query(`
        INSERT INTO ${uploadedFilesTableName} (
          id, original_filename, storage_path, file_type, uploaded_at, 
          processed, deleted, file_content, upload_environment,
          raw_lines_count, processing_notes, processing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        fileId,
        fileName,
        `chunked_${uploadId}`,
        fileType,
        new Date(),
        false,
        false,
        fileContentBase64,
        currentEnvironment,
        rawLinesCount,
        processingNotes,
        'queued'
      ]);

      // Clean up chunks from memory
      chunks.delete(uploadId);

      console.log(`[CHUNKED UPLOAD] Finalized ${fileName} (${(completeFile.length / 1024 / 1024).toFixed(1)}MB, ${rawLinesCount} lines)`);

      res.json({ 
        success: true, 
        fileId,
        message: `Successfully uploaded ${fileName}`,
        size: completeFile.length,
        lines: rawLinesCount
      });

    } catch (error) {
      console.error("Chunked upload finalization error:", error);
      res.status(500).json({ error: "Failed to finalize upload" });
    }
  });

  // Multi-stream JSON TDDF upload endpoint (for PowerShell agent)
  app.post("/api/tddf/upload-json", isApiKeyAuthenticated, async (req, res) => {
    try {
      const { streamId, batchId, recordCount, records } = req.body;
      
      if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "No records provided" });
      }
      
      console.log(`[JSON UPLOAD] Stream ${streamId}, Batch ${batchId}: Processing ${recordCount} records`);
      
      let processedCount = 0;
      let dtRecordsCreated = 0;
      let errors = 0;
      
      // Use connection pool for optimal performance
      const { pool } = await import('./db');
      
      // Generate unique file ID for this batch
      const fileId = `json_stream_${streamId}_batch_${batchId}_${Date.now()}`;
      const currentEnvironment = process.env.NODE_ENV || 'production';
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Create file record for tracking
      await pool.query(`
        INSERT INTO ${uploadedFilesTableName} (
          id, original_filename, storage_path, file_type, uploaded_at, 
          processed, deleted, file_content, upload_environment, 
          raw_lines_count, processing_notes, processing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        fileId,
        `stream_${streamId}_batch_${batchId}.json`,
        'json_stream',
        'tddf',
        new Date(),
        false,
        false,
        Buffer.from(JSON.stringify(records)).toString('base64'),
        currentEnvironment,
        recordCount,
        `JSON stream upload: ${recordCount} records from stream ${streamId}`,
        'processing'
      ]);
      
      // Process each record
      for (const record of records) {
        try {
          processedCount++;
          
          // Only process DT (Detail Transaction) records
          if (record.recordType === 'DT' && record.transactionFields) {
            const txnFields = record.transactionFields;
            
            // Parse amount (convert from cents to dollars)
            const txnAmount = parseFloat(txnFields.transactionAmount) / 100;
            const authAmount = parseFloat(txnFields.authorizationAmount) / 100;
            
            // Parse date (MMDDCCYY format)
            const dateStr = txnFields.transactionDate;
            let txnDate = null;
            if (dateStr && dateStr.length === 8) {
              const month = dateStr.substring(0, 2);
              const day = dateStr.substring(2, 4);
              const year = dateStr.substring(4, 8);
              txnDate = new Date(`${year}-${month}-${day}`);
            }
            
            // Create TDDF record using connection pool with comprehensive schema
            const tddfRecordsTableName = getTableName('tddf_records');
            
            // Extract all available fields from comprehensive schema
            const comprehensiveFields = {
              // Core identification
              id: `STREAM_${streamId}_${batchId}_${record.lineNumber}`,
              reference_number: txnFields.referenceNumber || '',
              merchant_account_number: txnFields.merchantAccountNumber || '',
              
              // Transaction amounts (convert from cents)
              transaction_amount: txnAmount,
              authorization_amount: authAmount,
              fee_amount: parseFloat(txnFields.feeAmount || '0') / 100,
              cashback_amount: parseFloat(txnFields.cashbackAmount || '0') / 100,
              tip_amount: parseFloat(txnFields.tipAmount || '0') / 100,
              tax_amount: parseFloat(txnFields.taxAmount || '0') / 100,
              
              // Transaction dates and times
              transaction_date: txnDate,
              local_transaction_date: txnFields.localTransactionDate || '',
              transaction_time: txnFields.transactionTime || '',
              local_transaction_time: txnFields.localTransactionTime || '',
              
              // Card information
              card_number: txnFields.cardNumber || '',
              expiration_date: txnFields.cardExpirationDate || txnFields.expirationDate || '',
              card_type: txnFields.cardType || '',
              card_product_type: txnFields.cardProductType || '',
              card_level: txnFields.cardLevel || '',
              debit_credit_indicator: txnFields.debitCreditIndicator || '',
              
              // Merchant information
              merchant_name: txnFields.merchantName || '',
              merchant_city: txnFields.merchantCity || '',
              merchant_state: txnFields.merchantState || '',
              merchant_zip: txnFields.merchantZip || '',
              merchant_dba_name: txnFields.merchantDbaName || '',
              merchant_phone_number: txnFields.merchantPhoneNumber || '',
              merchant_url: txnFields.merchantUrl || '',
              
              // MCC and merchant categorization
              mcc_code: txnFields.mccCode || '',
              merchant_type: txnFields.merchantType || '',
              merchant_category_code_mcc: txnFields.merchantCategoryCodeMcc || '',
              
              // Authorization information
              authorization_code: txnFields.authorizationCode || '',
              authorization_response_code: txnFields.authorizationResponseCode || '',
              response_code: txnFields.responseCode || '',
              
              // Transaction processing
              transaction_type: txnFields.transactionTypeIndicator || txnFields.transactionType || '',
              processing_code: txnFields.processingCode || '',
              function_code: txnFields.functionCode || '',
              
              // Terminal information
              terminal_id: txnFields.terminalId || '',
              terminal_capability: txnFields.terminalCapability || '',
              
              // POS environment
              pos_entry_mode: txnFields.posEntryMode || '',
              pos_condition_code: txnFields.posConditionCode || '',
              pos_card_presence: txnFields.posCardPresence || '',
              pos_cardholder_presence: txnFields.posCardholderPresence || '',
              
              // Network and trace
              network_transaction_id: txnFields.networkTransactionId || '',
              system_trace_audit_number: txnFields.systemTraceAuditNumber || '',
              retrieval_reference_number: txnFields.retrievalReferenceNumber || '',
              
              // Batch and sequence
              batch_id: txnFields.batchId || '',
              batch_sequence_number: txnFields.batchSequenceNumber || '',
              transaction_sequence_number: txnFields.transactionSequenceNumber || '',
              
              // Additional reference numbers
              invoice_number: txnFields.invoiceNumber || '',
              order_number: txnFields.orderNumber || '',
              customer_reference_number: txnFields.customerReferenceNumber || '',
              
              // AMEX specific fields
              amex_merchant_address: txnFields.amexMerchantAddress || '',
              amex_merchant_postal_code: txnFields.amexMerchantPostalCode || '',
              amex_phone_number: txnFields.amexPhoneNumber || '',
              amex_email_address: txnFields.amexEmailAddress || '',
              
              // Currency and conversion
              currency_code: txnFields.currencyCode || '',
              transaction_currency_code: txnFields.transactionCurrencyCode || '',
              settlement_currency_code: txnFields.settlementCurrencyCode || '',
              conversion_rate: txnFields.conversionRate || '',
              
              // Security verification
              address_verification_result: txnFields.addressVerificationResult || '',
              card_verification_result: txnFields.cardVerificationResult || '',
              three_d_secure_result: txnFields.threeDSecureResult || '',
              
              // E-commerce indicators
              ecommerce_indicator: txnFields.ecommerceIndicator || '',
              mail_phone_order_indicator: txnFields.mailPhoneOrderIndicator || '',
              recurring_transaction_indicator: txnFields.recurringTransactionIndicator || '',
              
              // Processing flags
              partial_approval_indicator: txnFields.partialApprovalIndicator || '',
              duplicate_transaction_indicator: txnFields.duplicateTransactionIndicator || '',
              reversal_indicator: txnFields.reversalIndicator || '',
              
              // Card brand specific
              visa_product_id: txnFields.visaProductId || '',
              mastercard_product_id: txnFields.mastercardProductId || '',
              discover_product_id: txnFields.discoverProductId || '',
              
              // Metadata
              recorded_at: new Date(),
              source_file_id: fileId,
              raw_line_number: record.lineNumber
            };
            
            // Build dynamic INSERT query based on available fields
            const fieldNames = Object.keys(comprehensiveFields);
            const placeholders = fieldNames.map((_, index) => `$${index + 1}`).join(', ');
            const values = fieldNames.map(field => comprehensiveFields[field]);
            
            await pool.query(`
              INSERT INTO ${tddfRecordsTableName} (${fieldNames.join(', ')})
              VALUES (${placeholders})
            `, values);
            
            dtRecordsCreated++;
          }
        } catch (recordError) {
          console.error(`[JSON UPLOAD] Error processing record ${record.lineNumber}:`, recordError);
          errors++;
        }
      }
      
      // Update file status to completed
      await pool.query(`
        UPDATE ${uploadedFilesTableName} 
        SET processed = true, 
            processing_status = 'completed',
            processing_notes = $1
        WHERE id = $2
      `, [
        `Processed ${processedCount} records, created ${dtRecordsCreated} DT records, ${errors} errors`,
        fileId
      ]);
      
      console.log(`[JSON UPLOAD] Stream ${streamId} Batch ${batchId} completed: ${dtRecordsCreated} DT records created`);
      
      res.json({
        success: true,
        streamId,
        batchId,
        recordsProcessed: processedCount,
        dtRecordsCreated,
        errors,
        fileId
      });
      
    } catch (error) {
      console.error("[JSON UPLOAD] Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process JSON upload" 
      });
    }
  });

  // Upload TDDF file via API key authentication (for PowerShell agent)
  app.post("/api/tddf/upload", upload.single('file'), isApiKeyAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF API UPLOAD] Request received from PowerShell agent');
      
      if (!req.file) {
        console.error('[TDDF API UPLOAD] No file provided in request');
        return res.status(400).json({ error: "No file provided" });
      }
      
      const apiUser = (req as any).apiUser;
      console.log(`[TDDF API UPLOAD] Processing file from API user: ${apiUser.clientName}`);
      
      // Generate unique file ID
      const fileId = `TDDF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Read file content
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      const fileContentBase64 = Buffer.from(fileContent).toString('base64');
      
      // Store in database with environment-specific table
      const uploadedFilesTableName = getTableName('uploaded_files');
      const currentEnvironment = process.env.NODE_ENV || 'development';
      
      console.log(`[TDDF API UPLOAD] Storing in table: ${uploadedFilesTableName}, environment: ${currentEnvironment}`);
      
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
        req.file.originalname,
        req.file.path,
        'tddf',
        new Date(),
        false,
        false,
        fileContentBase64,
        currentEnvironment,
        'queued'
      ]);
      
      // SEPARATED ARCHITECTURE: Store TDDF raw data only (no processing during upload)
      try {
        console.log(`[TDDF API UPLOAD] Storing raw TDDF data for file: ${fileId}`);
        const storageResult = await storage.storeTddfFileAsRawImport(fileContentBase64, fileId, req.file.originalname);
        
        // Update upload record with storage results
        await pool.query(`
          UPDATE ${uploadedFilesTableName} 
          SET raw_lines_count = $1, 
              processing_notes = $2,
              processing_status = 'completed'
          WHERE id = $3
        `, [
          storageResult.rowsStored,
          `API Upload - Raw import stored: ${storageResult.rowsStored} lines, Record types: ${Object.entries(storageResult.recordTypes).map(([type, count]) => `${type}:${count}`).join(', ')}, ${storageResult.errors} errors`,
          fileId
        ]);
        
        console.log(`[TDDF API UPLOAD] Successfully stored: ${storageResult.rowsStored} lines, ${Object.keys(storageResult.recordTypes).length} record types, ${storageResult.errors} errors`);
        
        // Clean up temporary file
        fs.unlinkSync(req.file.path);
        
        res.json({
          success: true,
          message: "TDDF file uploaded and stored successfully (processing queued separately)",
          fileId: fileId,
          fileName: req.file.originalname,
          storageResults: {
            rawLinesStored: storageResult.rowsStored,
            recordTypes: storageResult.recordTypes,
            errors: storageResult.errors,
            processingStatus: "Raw data stored - DT processing queued"
          },
          uploadedBy: apiUser.clientName,
          uploadedAt: new Date().toISOString()
        });
        
      } catch (storageError) {
        console.error('[TDDF API UPLOAD] Error storing TDDF content:', storageError);
        
        // Update file status to failed
        await pool.query(`
          UPDATE ${uploadedFilesTableName} 
          SET processing_status = 'failed',
              processing_notes = $1
          WHERE id = $2
        `, [
          `Storage failed: ${storageError instanceof Error ? storageError.message : "Storage error"}`,
          fileId
        ]);
        
        res.status(500).json({
          success: false,
          message: "TDDF file upload failed during storage",
          fileId: fileId,
          fileName: req.file.originalname,
          storageError: storageError instanceof Error ? storageError.message : "Storage failed",
          uploadedBy: apiUser.clientName,
          uploadedAt: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('[TDDF API UPLOAD] Upload error:', error);
      
      // Clean up temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload TDDF file",
        details: "Check server logs for more information"
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

  // Retry single failed TDDF file endpoint
  app.post("/api/tddf/retry/:fileId", isAuthenticated, async (req, res) => {
    try {
      const { fileId } = req.params;
      console.log(`Retry TDDF file request: ${fileId}`);
      
      const result = await storage.retryFailedTddfFile(fileId);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error: any) {
      console.error("Error retrying TDDF file:", error);
      res.status(500).json({ 
        error: "Failed to retry TDDF file", 
        details: error.message 
      });
    }
  });

  // Retry all failed TDDF files endpoint
  app.post("/api/tddf/retry-all-failed", isAuthenticated, async (req, res) => {
    try {
      console.log(`Retry all failed TDDF files request`);
      
      const result = await storage.retryAllFailedTddfFiles();
      
      res.json({
        success: true,
        message: `Successfully retried ${result.filesRetried} failed TDDF files`,
        filesRetried: result.filesRetried,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("Error retrying all failed TDDF files:", error);
      res.status(500).json({ 
        error: "Failed to retry all failed TDDF files", 
        details: error.message 
      });
    }
  });

  // Process pending BH records from raw import into hierarchical table
  app.post("/api/tddf/process-pending-bh", isAuthenticated, async (req, res) => {
    try {
      const { fileId, maxRecords } = req.body;
      
      console.log(`[BH PROCESSING API] Processing pending BH records - fileId: ${fileId}, maxRecords: ${maxRecords}`);
      
      const result = await storage.processPendingTddfBhRecords(fileId, maxRecords);
      
      res.json({
        success: true,
        message: `BH processing complete: ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`,
        ...result
      });
    } catch (error) {
      console.error('Error processing pending BH records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process BH records" 
      });
    }
  });



  // POST /api/tddf/process-pending - Process pending DT records for completed files
  app.post("/api/tddf/process-pending", isAuthenticated, async (req, res) => {
    try {
      console.log(`\n=== MANUAL DT PROCESSING TRIGGERED ===`);
      
      // Get all completed files with pending DT records
      const pendingFiles = await storage.getCompletedFilesWithPendingDTRecords();
      console.log(`Found ${pendingFiles.length} completed files with pending DT records`);
      
      let totalProcessed = 0;
      let totalErrors = 0;
      
      for (const file of pendingFiles) {
        try {
          console.log(`\nProcessing file: ${file.originalFilename} (${file.id})`);
          const result = await storage.processPendingDTRecordsForFile(file.id);
          totalProcessed += result.processed;
          totalErrors += result.errors;
          console.log(`  ✅ Processed: ${result.processed} records, Errors: ${result.errors}`);
        } catch (fileError: any) {
          console.error(`  ❌ Error processing file ${file.id}:`, fileError.message);
          totalErrors++;
        }
      }
      
      console.log(`\n=== MANUAL PROCESSING COMPLETE ===`);
      console.log(`Total records processed: ${totalProcessed}`);
      console.log(`Total errors: ${totalErrors}`);
      
      res.json({ 
        success: true, 
        filesProcessed: pendingFiles.length,
        recordsProcessed: totalProcessed,
        errors: totalErrors
      });
    } catch (error: any) {
      console.error("Error in manual DT processing:", error);
      res.status(500).json({ error: `Failed to process pending DT records: ${error.message}` });
    }
  });

  // POST /api/tddf/process-pending-dt - Process pending DT records for a specific file (even if still processing)
  app.post("/api/tddf/process-pending-dt", isAuthenticated, async (req, res) => {
    try {
      const { fileId } = req.body;
      
      if (!fileId) {
        return res.status(400).json({ error: "fileId is required" });
      }
      
      console.log(`\n=== PROCESSING PENDING DT RECORDS FOR SPECIFIC FILE ===`);
      console.log(`File ID: ${fileId}`);
      
      // Check if file exists
      const file = await storage.getFileById(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // First skip all non-DT records
      const skippedCount = await storage.skipNonDTRecordsForFile(fileId);
      
      // Then process pending DT records for this specific file
      const result = await storage.processPendingDTRecordsForFile(fileId);
      
      console.log(`\n=== SPECIFIC FILE PROCESSING COMPLETE ===`);
      console.log(`Non-DT records skipped: ${skippedCount}`);
      console.log(`DT records processed: ${result.processed}`);
      console.log(`Errors: ${result.errors}`);
      
      res.json({ 
        success: true, 
        fileId,
        filename: file.originalFilename,
        recordsSkipped: skippedCount,
        recordsProcessed: result.processed,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("Error processing pending DT records for file:", error);
      res.status(500).json({ error: `Failed to process pending DT records: ${error.message}` });
    }
  });

  // Switch-based TDDF processing endpoint for specific record types
  app.post("/api/tddf/process-pending-switch", isAuthenticated, async (req, res) => {
    try {
      const { batchSize = 2000, recordTypes = ["E1"], fileId } = req.body;
      
      console.log(`[SWITCH-API] Processing request for record types: ${recordTypes.join(', ')}, batch size: ${batchSize}`);
      
      // Use the switch-based processing method
      const result = await storage.processPendingTddfRecordsSwitchBased(fileId, batchSize);
      
      res.json({
        success: true,
        message: `Switch-based processing completed: ${result.totalProcessed} processed, ${result.totalSkipped} skipped, ${result.totalErrors} errors`,
        totalProcessed: result.totalProcessed,
        totalSkipped: result.totalSkipped,
        totalErrors: result.totalErrors,
        breakdown: result.breakdown,
        processingTimeMs: result.processingTime
      });
    } catch (error: any) {
      console.error("Error in switch-based TDDF processing:", error);
      res.status(500).json({ 
        error: "Failed to process pending TDDF records", 
        details: error.message 
      });
    }
  });

  // Get TDDF activity data for heat map (DT records only)
  app.get("/api/tddf/activity-heatmap", isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const tddfRecordsTableName = getTableName('tddf_records');
      
      console.log(`[TDDF ACTIVITY HEATMAP] Getting DT activity data for year: ${year}`);
      
      // Simplified query for DT records only
      const activityData = await pool.query(`
        SELECT 
          DATE(transaction_date) as date,
          COUNT(*) as "dtCount"
        FROM ${tddfRecordsTableName}
        WHERE EXTRACT(YEAR FROM transaction_date) = $1
          AND transaction_date IS NOT NULL
        GROUP BY DATE(transaction_date)
        ORDER BY DATE(transaction_date)
      `, [year]);
      
      console.log(`[TDDF ACTIVITY HEATMAP] Found ${activityData.rows.length} days with DT activity for year ${year}`);
      res.json(activityData.rows);
    } catch (error) {
      console.error('Error fetching TDDF activity heatmap data:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF activity data" 
      });
    }
  });

  // Get merchant-specific activity data for heat map
  app.get("/api/tddf/merchant-activity-heatmap/:merchantAccountNumber", isAuthenticated, async (req, res) => {
    try {
      const { merchantAccountNumber } = req.params;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const tddfRecordsTableName = getTableName('tddf_records');
      
      console.log(`[MERCHANT ACTIVITY HEATMAP] Getting activity data for merchant: ${merchantAccountNumber}, year: ${year}`);
      
      // Query for merchant-specific transaction activity
      const activityData = await pool.query(`
        SELECT 
          DATE(transaction_date) as date,
          COUNT(*) as "transactionCount"
        FROM ${tddfRecordsTableName}
        WHERE merchant_account_number = $1
          AND EXTRACT(YEAR FROM transaction_date) = $2
          AND transaction_date IS NOT NULL
        GROUP BY DATE(transaction_date)
        ORDER BY DATE(transaction_date)
      `, [merchantAccountNumber, year]);
      
      console.log(`[MERCHANT ACTIVITY HEATMAP] Found ${activityData.rows.length} days with activity for merchant ${merchantAccountNumber} in year ${year}`);
      res.json(activityData.rows);
    } catch (error) {
      console.error('Error fetching merchant activity heatmap data:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch merchant activity data" 
      });
    }
  });

  // Get TDDF merchants aggregated from DT records
  app.get("/api/tddf/merchants", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      console.log('[TDDF MERCHANTS API] Query params:', {
        page,
        limit,
        search: req.query.search,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        minAmount: req.query.minAmount,
        maxAmount: req.query.maxAmount,
        minTransactions: req.query.minTransactions,
        maxTransactions: req.query.maxTransactions,
        minTerminals: req.query.minTerminals,
        maxTerminals: req.query.maxTerminals
      });
      
      const result = await storage.getTddfMerchants({
        page,
        limit,
        search: req.query.search as string,
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as string,
        minAmount: req.query.minAmount as string,
        maxAmount: req.query.maxAmount as string,
        minTransactions: req.query.minTransactions as string,
        maxTransactions: req.query.maxTransactions as string,
        minTerminals: req.query.minTerminals as string,
        maxTerminals: req.query.maxTerminals as string
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching TDDF merchants:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF merchants" 
      });
    }
  });

  // Get terminals for a specific TDDF merchant account number
  app.get("/api/tddf/merchants/:merchantAccountNumber/terminals", isAuthenticated, async (req, res) => {
    try {
      const merchantAccountNumber = req.params.merchantAccountNumber;
      const terminals = await storage.getTddfMerchantTerminals(merchantAccountNumber);
      
      res.json(terminals);
    } catch (error) {
      console.error('Error fetching TDDF merchant terminals:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch merchant terminals" 
      });
    }
  });

  // Get TDDF record by ID
  app.get("/api/tddf/:id", isAuthenticated, async (req, res) => {
    try {
      // @ENVIRONMENT-CRITICAL - TDDF record lookup with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
      const recordId = parseInt(req.params.id);
      const tddfRecordsTableName = getTableName('tddf_records');
      
      const recordResult = await pool.query(`
        SELECT * FROM ${tddfRecordsTableName} WHERE id = $1
      `, [recordId]);
      const record = recordResult.rows[0];
      
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

  // Get single TDDF merchant details for heat map
  app.get("/api/tddf/merchants/details/:merchantAccountNumber", isAuthenticated, async (req, res) => {
    try {
      const merchantAccountNumber = req.params.merchantAccountNumber;
      console.log('[MERCHANT DETAILS API] Getting details for merchant:', merchantAccountNumber);
      
      const merchant = await storage.getTddfMerchantDetails(merchantAccountNumber);
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      res.json(merchant);
    } catch (error) {
      console.error('Error fetching TDDF merchant details:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch merchant details" 
      });
    }
  });

  // Get TDDF records by merchant ID with pagination and performance optimization
  app.get("/api/tddf/merchant/:merchantId", isAuthenticated, async (req, res) => {
    try {
      const merchantId = req.params.merchantId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50; // Optimized default page size
      const sortBy = req.query.sortBy as string;
      const sortOrder = req.query.sortOrder as string;
      const dateFilter = req.query.dateFilter as string;
      
      console.log(`[TDDF MERCHANT TRANSACTIONS] Query params:`, {
        merchantId,
        page,
        limit,
        sortBy,
        sortOrder,
        dateFilter
      });
      
      const result = await storage.getTddfTransactionsByMerchant(merchantId, {
        page,
        limit,
        sortBy,
        sortOrder,
        dateFilter
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching TDDF records by merchant:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records" 
      });
    }
  });

  // Refresh cache for specific merchant
  app.post("/api/tddf/merchant/:merchantId/refresh", isAuthenticated, async (req, res) => {
    try {
      const merchantId = req.params.merchantId;
      
      console.log(`[CACHE REFRESH] Refreshing cache for merchant: ${merchantId}`);
      
      // For now, just return success - the cache refresh functionality will be implemented
      res.json({ success: true, message: "Cache refresh initiated" });
    } catch (error) {
      console.error("[CACHE REFRESH API] Error:", error);
      res.status(500).json({ error: "Failed to refresh cache" });
    }
  });

  // Get orphan terminals (Terminal IDs that exist in TDDF but not in terminals table)
  app.get("/api/tddf/orphan-terminals", isAuthenticated, async (req, res) => {
    try {
      const tddfRecordsTableName = getTableName('tddf_records');
      const terminalsTableName = getTableName('terminals');
      
      console.log(`[ORPHAN TERMINALS] Getting orphan terminals from ${tddfRecordsTableName} not in ${terminalsTableName}`);
      
      // Query to find Terminal IDs in TDDF records that don't exist in terminals table
      const orphanTerminals = await pool.query(`
        SELECT 
          terminal_id as "terminalId",
          COUNT(*) as "transactionCount",
          SUM(CAST(transaction_amount AS DECIMAL)) as "totalAmount",
          MIN(transaction_date) as "firstSeen",
          MAX(transaction_date) as "lastSeen",
          merchant_name as "merchantName",
          mcc_code as "mccCode",
          AVG(CAST(transaction_amount AS DECIMAL)) as "averageTransaction"
        FROM ${tddfRecordsTableName} t1
        WHERE terminal_id IS NOT NULL 
          AND terminal_id != ''
          AND NOT EXISTS (
            SELECT 1 FROM ${terminalsTableName} t2 
            WHERE ('7' || SUBSTRING(t2.v_number FROM 2)) = t1.terminal_id
          )
        GROUP BY terminal_id, merchant_name, mcc_code
        ORDER BY "transactionCount" DESC, "totalAmount" DESC
      `);
      
      // Calculate additional metrics for each orphan terminal
      const orphanTerminalsWithMetrics = orphanTerminals.rows.map((terminal: any) => {
        const firstSeen = new Date(terminal.firstSeen);
        const lastSeen = new Date(terminal.lastSeen);
        const daysDiff = Math.ceil((lastSeen.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        return {
          ...terminal,
          totalAmount: parseFloat(terminal.totalAmount) || 0,
          averageTransaction: parseFloat(terminal.averageTransaction) || 0,
          dailyAverage: terminal.transactionCount / daysDiff,
          activeDays: daysDiff
        };
      });
      
      console.log(`[ORPHAN TERMINALS] Found ${orphanTerminalsWithMetrics.length} orphan terminals`);
      res.json(orphanTerminalsWithMetrics);
    } catch (error) {
      console.error('Error fetching orphan terminals:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch orphan terminals" 
      });
    }
  });

  // Get details for a specific orphan terminal
  app.get("/api/tddf/orphan-terminals/:terminalId", isAuthenticated, async (req, res) => {
    try {
      const terminalId = req.params.terminalId;
      const tddfRecordsTableName = getTableName('tddf_records');
      
      console.log(`[ORPHAN TERMINAL DETAILS] Getting details for orphan terminal: ${terminalId}`);
      
      // Query for detailed information about this specific orphan terminal
      const terminalDetails = await pool.query(`
        SELECT 
          terminal_id as "terminalId",
          COUNT(*) as "transactionCount",
          SUM(CAST(transaction_amount AS DECIMAL)) as "totalAmount",
          MIN(transaction_date) as "firstSeen",
          MAX(transaction_date) as "lastSeen",
          merchant_name as "merchantName",
          mcc_code as "mccCode",
          AVG(CAST(transaction_amount AS DECIMAL)) as "averageTransaction"
        FROM ${tddfRecordsTableName}
        WHERE terminal_id = $1
        GROUP BY terminal_id, merchant_name, mcc_code
      `, [terminalId]);
      
      if (terminalDetails.rows.length === 0) {
        return res.status(404).json({ error: "Orphan terminal not found" });
      }
      
      const terminal = terminalDetails.rows[0];
      const firstSeen = new Date(terminal.firstSeen);
      const lastSeen = new Date(terminal.lastSeen);
      const daysDiff = Math.ceil((lastSeen.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const orphanTerminalDetails = {
        ...terminal,
        totalAmount: parseFloat(terminal.totalAmount) || 0,
        averageTransaction: parseFloat(terminal.averageTransaction) || 0,
        dailyAverage: terminal.transactionCount / daysDiff,
        activeDays: daysDiff
      };
      
      console.log(`[ORPHAN TERMINAL DETAILS] Found details for terminal ${terminalId}: ${terminal.transactionCount} transactions`);
      res.json(orphanTerminalDetails);
    } catch (error) {
      console.error('Error fetching orphan terminal details:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch orphan terminal details" 
      });
    }
  });



  // Get TDDF records by terminal ID (VAR number mapping)
  app.get("/api/tddf/by-terminal/:terminalId", isAuthenticated, async (req, res) => {
    try {
      const terminalId = req.params.terminalId;
      console.log(`[TDDF TERMINAL] Fetching TDDF records for Terminal ID: ${terminalId}`);
      
      // @ENVIRONMENT-CRITICAL - TDDF terminal records with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
      const tddfRecordsTableName = getTableName('tddf_records');
      
      // Query TDDF records where Terminal ID field matches the extracted terminal ID from VAR
      // VAR V8357055 = Terminal ID 78357055 (remove V prefix) using raw SQL
      const recordsResult = await pool.query(`
        SELECT * FROM ${tddfRecordsTableName} 
        WHERE terminal_id = $1 
        ORDER BY transaction_date DESC 
        LIMIT 100
      `, [terminalId]);
      const records = recordsResult.rows;
      
      console.log(`[TDDF TERMINAL] Found ${records.length} TDDF records for Terminal ID ${terminalId}`);
      
      // Transform records to include consistent field names for frontend
      // Fix field name mapping: database uses snake_case, frontend expects camelCase
      const transformedRecords = records.map(record => ({
        id: record.id,
        referenceNumber: record.reference_number,
        merchantName: record.merchant_name,
        transactionAmount: record.transaction_amount,
        transactionDate: record.transaction_date,
        recordedAt: record.recorded_at,
        terminalId: record.terminal_id,
        cardType: record.card_type,
        authorizationNumber: record.authorization_number,
        merchantAccountNumber: record.merchant_account_number,
        mccCode: record.mcc_code,
        transactionTypeIdentifier: record.transaction_type_identifier,
        mmsRawLine: record.mms_raw_line, // Include raw TDDF line data for details modal
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        sourceRowNumber: record.source_row_number,
        // Add any other fields needed for display
        amount: record.transaction_amount, // Alias for amount field
        date: record.transaction_date    // Alias for date field
      }));
      
      res.json(transformedRecords);
    } catch (error) {
      console.error('Error fetching TDDF records by terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records by terminal" 
      });
    }
  });

  // Get TDDF records by batch ID
  app.get("/api/tddf/batch/:batchId", isAuthenticated, async (req, res) => {
    try {
      // @ENVIRONMENT-CRITICAL - TDDF batch records with environment-aware table naming  
      // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
      const batchId = req.params.batchId;
      const tddfRecordsTableName = getTableName('tddf_records');
      
      const recordsResult = await pool.query(`
        SELECT * FROM ${tddfRecordsTableName} 
        WHERE batch_julian_date = $1 
        ORDER BY transaction_date DESC
      `, [batchId]);
      const records = recordsResult.rows;
      
      res.json(records);
    } catch (error) {
      console.error('Error fetching TDDF records by batch:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF records" 
      });
    }
  });

  // 🚀 CLEAN BULK PROCESSING - Single-path switch architecture (primary endpoint)
  app.post("/api/tddf/process-bulk-clean", isAuthenticated, async (req, res) => {
    try {
      const batchSize = parseInt(req.body.batchSize) || 2000;
      console.log(`🚀 API request for CLEAN BULK PROCESSING with single-path architecture (batch size: ${batchSize})`);
      
      const result = await storage.processAllPendingTddfRecordsBulk(batchSize);
      
      res.json({
        success: true,
        message: "Clean bulk processing completed using single-path switch architecture",
        processed: result.processed,
        bulkWarnings: result.bulkWarnings,
        errors: result.errors,
        breakdown: result.breakdown,
        methodology: "clean_single_path_bulk_processing"
      });
    } catch (error) {
      console.error("Error in clean bulk processing:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to execute clean bulk processing"
      });
    }
  });

  // 🆘 EMERGENCY R1 SINGLE-LINE PROCESSING - Separate thread troubleshooting
  app.post("/api/tddf/emergency-r1-processing", isAuthenticated, async (req, res) => {
    try {
      const { recordId, recordType } = req.body;
      
      if (!recordId || !recordType) {
        return res.status(400).json({
          success: false,
          error: "Missing required parameters: recordId and recordType"
        });
      }

      console.log(`🆘 API request for emergency R1 single-line processing: ${recordType} record ${recordId}`);
      
      const result = await storage.emergencyR1SingleLineProcessing(recordId, recordType);
      
      res.json({
        success: result.success,
        errorCode: result.errorCode,
        details: result.details,
        methodology: "emergency_r1_single_line_troubleshooting"
      });
    } catch (error) {
      console.error("Error in emergency R1 processing:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        errorCode: "SYS001",
        message: "Failed to execute emergency R1 processing"
      });
    }
  });

  // LEGACY: Process pending raw TDDF lines (redirects to clean bulk processing)
  app.post("/api/tddf/process-backlog", isAuthenticated, async (req, res) => {
    try {
      const batchSize = parseInt(req.query.batchSize as string) || 2000;
      console.log(`⚠️  LEGACY: Redirecting backlog processing to clean bulk processing architecture`);
      
      const result = await storage.processAllPendingTddfRecordsBulk(batchSize);
      
      res.json({
        success: true,
        message: `Processed ${result.processed} pending raw TDDF lines (redirected to clean bulk processing)`,
        processed: result.processed,
        bulkWarnings: result.bulkWarnings,
        errors: result.errors,
        methodology: "clean_single_path_bulk_processing_via_legacy_redirect"
      });
    } catch (error) {
      console.error('Error processing TDDF backlog:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process TDDF backlog" 
      });
    }
  });

  // Skip all pending non-DT records (P1, BH, etc.)
  app.post("/api/tddf/skip-non-dt-backlog", isAuthenticated, async (req, res) => {
    try {
      const batchSize = parseInt(req.query.batchSize as string) || 500;
      const result = await storage.processNonDtPendingLines(batchSize);
      
      res.json({
        success: true,
        message: `Skipped ${result.skipped} pending non-DT raw TDDF lines`,
        details: result
      });
    } catch (error) {
      console.error('Error skipping non-DT TDDF backlog:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to skip non-DT TDDF backlog" 
      });
    }
  });

  // Analyze stuck TDDF records (diagnostic tool)
  app.get("/api/tddf/analyze-stuck", isAuthenticated, async (req, res) => {
    try {
      const analysis = await storage.analyzeStuckTddfLines();
      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error('Error analyzing stuck TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to analyze stuck TDDF records" 
      });
    }
  });

  // Requeue stuck TDDF records
  app.post("/api/tddf/requeue-stuck", isAuthenticated, async (req, res) => {
    try {
      const criteria = {
        recordTypes: req.body.recordTypes || [],
        sourceFileIds: req.body.sourceFileIds || [],
        olderThanHours: req.body.olderThanHours || 24,
        batchSize: req.body.batchSize || 1000
      };
      
      const result = await storage.requeueStuckTddfLines(criteria);
      
      res.json({
        success: true,
        message: `Requeued ${result.requeued} stuck TDDF records`,
        details: result,
        criteria
      });
    } catch (error) {
      console.error('Error requeuing stuck TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to requeue stuck TDDF records" 
      });
    }
  });

  // NEW: Switch-based TDDF processing API (Alternative approach)
  app.post("/api/tddf/process-switch", (req, res, next) => {
    // Allow internal requests from processing watcher to bypass authentication
    if (req.headers['x-internal-request'] === 'true') {
      return next();
    }
    return isAuthenticated(req, res, next);
  }, async (req, res) => {
    try {
      const { fileId, batchSize = 2000 } = req.body;
      
      console.log(`[SWITCH-BASED API] Processing ${batchSize} records using switch logic${fileId ? ` for file ${fileId}` : ''}`);
      
      const result = await storage.processPendingTddfRecordsSwitchBased(fileId, batchSize);
      
      res.json({
        success: true,
        message: `Switch-based processing complete - Processed ${result.totalProcessed} records, skipped ${result.totalSkipped}, errors: ${result.totalErrors} in ${result.processingTime}ms`,
        details: {
          totalProcessed: result.totalProcessed,
          totalSkipped: result.totalSkipped,
          totalErrors: result.totalErrors,
          breakdown: result.breakdown,
          processingTime: result.processingTime,
          fileId: fileId || 'all_files',
          batchSize,
          approach: 'switch-based'
        }
      });
    } catch (error) {
      console.error('Error in switch-based TDDF processing:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process TDDF records with switch-based method" 
      });
    }
  });

  // Process pending TDDF records (unified DT and BH) with transactional integrity
  app.post("/api/tddf/process-unified", isAuthenticated, async (req, res) => {
    try {
      const { batchSize = 100, recordTypes = ['DT', 'BH'] } = req.body;
      
      // Validate record types
      const validTypes = ['DT', 'BH', 'P1', 'P2', 'AD', 'DR', 'G2'];
      const invalidTypes = recordTypes.filter((type: string) => !validTypes.includes(type));
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          error: `Invalid record types: ${invalidTypes.join(', ')}. Valid types are: ${validTypes.join(', ')}`
        });
      }
      
      console.log(`[UNIFIED PROCESSING API] Processing ${batchSize} records of types: ${recordTypes.join(', ')}`);
      
      const result = await storage.processPendingTddfRecordsUnified(batchSize, recordTypes);
      
      res.json({
        success: true,
        message: `Unified processing complete - Processed ${result.processed} records, errors: ${result.errors}`,
        details: {
          totalProcessed: result.processed,
          totalErrors: result.errors,
          breakdown: result.breakdown,
          sampleRecord: result.sampleRecord,
          recordTypes: recordTypes,
          batchSize
        }
      });
    } catch (error) {
      console.error('Error in unified TDDF processing:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process TDDF records with unified method" 
      });
    }
  });

  // SEPARATED PROCESSING: Process pending DT records from raw import table
  app.post("/api/tddf/process-pending-dt", isAuthenticated, async (req, res) => {
    try {
      const { fileId, maxRecords } = req.body;
      
      console.log(`[TDDF PROCESSING API] Processing pending DT records. FileId: ${fileId || 'all'}, MaxRecords: ${maxRecords || 'unlimited'}`);
      
      const result = await storage.processPendingTddfDtRecords(fileId, maxRecords);
      
      res.json({
        success: true,
        message: `Processed ${result.processed} DT records successfully`,
        results: result,
        fileId: fileId || null,
        processedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error processing pending TDDF DT records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process pending TDDF DT records" 
      });
    }
  });

  // Scanly-Watcher endpoints
  app.get("/api/scanly-watcher/status", isAuthenticated, async (req, res) => {
    try {
      const { scanlyWatcher } = await import("./services/processing-watcher");
      const status = scanlyWatcher.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting Scanly-Watcher status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get Scanly-Watcher status" 
      });
    }
  });

  app.get("/api/scanly-watcher/alerts", isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const { scanlyWatcher } = await import("./services/processing-watcher");
      const alerts = scanlyWatcher.getRecentAlerts(limit);
      res.json({ alerts });
    } catch (error) {
      console.error('Error getting Scanly-Watcher alerts:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get Scanly-Watcher alerts" 
      });
    }
  });

  app.post("/api/scanly-watcher/force-check", isAuthenticated, async (req, res) => {
    try {
      const { scanlyWatcher } = await import("./services/processing-watcher");
      const alerts = await scanlyWatcher.forceHealthCheck();
      res.json({ success: true, alertsGenerated: alerts.length, alerts });
    } catch (error) {
      console.error('Error forcing Scanly-Watcher health check:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to force Scanly-Watcher health check" 
      });
    }
  });

  // Enhanced Scanly-Watcher prerogative endpoints
  app.post("/api/scanly-watcher/emergency-processing", isAuthenticated, async (req, res) => {
    try {
      const { scanlyWatcher } = await import("./services/processing-watcher");
      
      // Get current backlog first
      const tddfRawImportTable = getTableName('tddf_raw_import');
      const { db } = await import("./db");
      const backlogResult = await db.execute(sql`
        SELECT COUNT(*) as backlog_count FROM ${sql.identifier(tddfRawImportTable)}
        WHERE processing_status = 'pending'
      `);
      const currentBacklog = parseInt(String((backlogResult as any).rows[0]?.backlog_count)) || 0;
      
      const result = await scanlyWatcher.performAlexStyleEmergencyProcessing(currentBacklog);
      res.json(result);
    } catch (error) {
      console.error('Error performing Alex-style emergency processing:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to perform Alex-style emergency processing" 
      });
    }
  });

  app.get("/api/scanly-watcher/system-resources", isAuthenticated, async (req, res) => {
    try {
      const { scanlyWatcher } = await import("./services/processing-watcher");
      const alerts = await scanlyWatcher.monitorSystemResources();
      res.json({ success: true, resourceAlerts: alerts });
    } catch (error) {
      console.error('Error monitoring system resources:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to monitor system resources" 
      });
    }
  });

  app.post("/api/scanly-watcher/proactive-cleanup", isAuthenticated, async (req, res) => {
    try {
      const { scanlyWatcher } = await import("./services/processing-watcher");
      const result = await scanlyWatcher.executeProactiveCleanup();
      res.json(result);
    } catch (error) {
      console.error('Error executing proactive cleanup:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to execute proactive cleanup" 
      });
    }
  });

  // Enhanced Performance KPIs with Color-Coded Record Type Breakdown
  app.get("/api/processing/performance-kpis", isAuthenticated, async (req, res) => {
    try {
      const metricsTableName = getTableName('processing_metrics');
      
      // Get latest and previous metrics for rate calculation with detailed breakdown
      const result = await pool.query(`
        SELECT 
          timestamp,
          tddf_records,
          tddf_raw_lines,
          tddf_pending_lines,
          dt_processed, dt_pending, dt_skipped,
          bh_processed, bh_pending, bh_skipped,
          p1_processed, p1_pending, p1_skipped,
          e1_processed, e1_pending, e1_skipped,
          g2_processed, g2_pending, g2_skipped,
          ad_processed, ad_skipped,
          dr_processed, dr_skipped,
          p2_processed, p2_skipped,
          other_processed, other_skipped
        FROM ${metricsTableName} 
        WHERE metric_type = 'scanly_watcher_snapshot'
          AND timestamp >= NOW() - INTERVAL '10 minutes'
        ORDER BY timestamp DESC 
        LIMIT 3
      `);
      
      const metrics = result.rows;
      
      if (metrics.length < 2) {
        return res.json({
          tddfPerMinute: 0,
          recordsPerMinute: 0,
          hasData: false,
          message: "Insufficient historical data for KPI calculation",
          colorBreakdown: {
            dt: { processed: 0, pending: 0, skipped: 0 },
            bh: { processed: 0, pending: 0, skipped: 0 },
            p1: { processed: 0, pending: 0, skipped: 0 },
            e1: { processed: 0, pending: 0, skipped: 0 },
            g2: { processed: 0, pending: 0, skipped: 0 },
            ad: { processed: 0, skipped: 0 },
            dr: { processed: 0, skipped: 0 },
            p2: { processed: 0, skipped: 0 },
            other: { processed: 0, skipped: 0 },
            totalSkipped: 0
          }
        });
      }
      
      // Calculate rates using the last two data points
      const latest = metrics[0];
      const previous = metrics[1];
      
      const timeDiffMinutes = (new Date(latest.timestamp) - new Date(previous.timestamp)) / (1000 * 60);
      const rawLineDiff = latest.tddf_raw_lines - previous.tddf_raw_lines;
      const recordsDiff = latest.tddf_records - previous.tddf_records;
      
      // Calculate per-minute rates
      const rawLinesPerMinute = timeDiffMinutes > 0 ? rawLineDiff / timeDiffMinutes : 0;
      const recordsPerMinute = timeDiffMinutes > 0 ? recordsDiff / timeDiffMinutes : 0;
      
      // Calculate total skipped records for red display
      const totalSkipped = (latest.dt_skipped || 0) + (latest.bh_skipped || 0) + (latest.p1_skipped || 0) + 
                          (latest.e1_skipped || 0) + (latest.g2_skipped || 0) + (latest.ad_skipped || 0) + 
                          (latest.dr_skipped || 0) + (latest.p2_skipped || 0) + (latest.other_skipped || 0);
      
      res.json({
        tddfPerMinute: Math.max(0, Math.round(rawLinesPerMinute)), // TDDF lines per minute
        recordsPerMinute: Math.max(0, Math.round(recordsPerMinute)), // DT records per minute
        hasData: true,
        lastUpdate: latest.timestamp,
        timePeriod: "10 min", // Fixed display period instead of actual calculation window
        colorBreakdown: {
          dt: { 
            processed: latest.dt_processed || 0, 
            pending: latest.dt_pending || 0, 
            skipped: latest.dt_skipped || 0,
            color: '#3b82f6' // blue
          },
          bh: { 
            processed: latest.bh_processed || 0, 
            pending: latest.bh_pending || 0, 
            skipped: latest.bh_skipped || 0,
            color: '#10b981' // green
          },
          p1: { 
            processed: latest.p1_processed || 0, 
            pending: latest.p1_pending || 0, 
            skipped: latest.p1_skipped || 0,
            color: '#f59e0b' // orange
          },
          e1: { 
            processed: latest.e1_processed || 0, 
            pending: latest.e1_pending || 0, 
            skipped: latest.e1_skipped || 0,
            color: '#6b7280' // gray
          },
          g2: { 
            processed: latest.g2_processed || 0, 
            pending: latest.g2_pending || 0, 
            skipped: latest.g2_skipped || 0,
            color: '#6b7280' // gray
          },
          ad: { 
            processed: latest.ad_processed || 0, 
            skipped: latest.ad_skipped || 0,
            color: '#6b7280' // gray
          },
          dr: { 
            processed: latest.dr_processed || 0, 
            skipped: latest.dr_skipped || 0,
            color: '#6b7280' // gray
          },
          p2: { 
            processed: latest.p2_processed || 0, 
            skipped: latest.p2_skipped || 0,
            color: '#6b7280' // gray
          },
          other: { 
            processed: latest.other_processed || 0, 
            skipped: latest.other_skipped || 0,
            color: '#6b7280' // gray
          },
          totalSkipped: totalSkipped,
          skippedColor: '#ef4444' // red for all skipped records
        },
        rawData: {
          latest: latest,
          previous: previous,
          timeDiffMinutes: timeDiffMinutes,
          rawLineDiff: rawLineDiff,
          recordsDiff: recordsDiff
        }
      });
    } catch (error) {
      console.error('Error calculating performance KPIs:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to calculate performance KPIs",
        tddfPerMinute: 0,
        recordsPerMinute: 0,
        hasData: false
      });
    }
  });

  // Records gauge peak value from performance metrics database (direct access)
  app.get("/api/processing/records-peak", async (req, res) => {
    try {
      const peakData = await storage.getRecordsPeakFromDatabase();
      res.json(peakData);
    } catch (error) {
      console.error('Error fetching records peak:', error);
      res.status(500).json({ 
        error: "Failed to fetch records peak",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Historical Performance Chart Data from Scanly-Watcher Metrics
  app.get("/api/processing/performance-chart-history", isAuthenticated, async (req, res) => {
    try {
      const hoursParam = parseFloat(req.query.hours as string) || 1;
      const hours = Math.min(Math.max(hoursParam, 1/60), 24); // Allow as low as 1 minute (1/60 hours), max 24 hours
      
      const metricsTableName = getTableName('processing_metrics');
      
      // Get historical performance metrics with detailed record type breakdown for chart display
      const result = await pool.query(`
        SELECT 
          timestamp,
          tddf_records,
          tddf_raw_lines,
          tddf_pending_lines,
          dt_processed, dt_pending, dt_skipped,
          bh_processed, bh_pending, bh_skipped,
          p1_processed, p1_pending, p1_skipped,
          e1_processed, e1_pending, e1_skipped,
          g2_processed, g2_pending, g2_skipped,
          ad_processed, ad_skipped,
          dr_processed, dr_skipped,
          p2_processed, p2_skipped,
          other_processed, other_skipped,
          LAG(dt_processed) OVER (ORDER BY timestamp) as prev_dt_processed,
          LAG(bh_processed) OVER (ORDER BY timestamp) as prev_bh_processed,
          LAG(p1_processed) OVER (ORDER BY timestamp) as prev_p1_processed,
          LAG(e1_processed) OVER (ORDER BY timestamp) as prev_e1_processed,
          LAG(g2_processed) OVER (ORDER BY timestamp) as prev_g2_processed,
          LAG(ad_processed) OVER (ORDER BY timestamp) as prev_ad_processed,
          LAG(dr_processed) OVER (ORDER BY timestamp) as prev_dr_processed,
          LAG(p2_processed) OVER (ORDER BY timestamp) as prev_p2_processed,
          LAG(other_processed) OVER (ORDER BY timestamp) as prev_other_processed,
          LAG(dt_skipped + bh_skipped + p1_skipped + e1_skipped + g2_skipped + ad_skipped + dr_skipped + p2_skipped + other_skipped) OVER (ORDER BY timestamp) as prev_total_skipped,
          LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp
        FROM ${metricsTableName} 
        WHERE metric_type = 'scanly_watcher_snapshot'
          AND timestamp >= NOW() - INTERVAL '${hours} hours'
        ORDER BY timestamp ASC
      `);
      
      const chartData = result.rows.map((row, index) => {
        if (index === 0 || !row.prev_timestamp) {
          // First row - no rate calculation possible
          return {
            timestamp: row.timestamp,
            dtRecords: 0,
            bhRecords: 0,
            p1Records: 0,
            e1Records: 0,
            g2Records: 0,
            adRecords: 0,
            drRecords: 0,
            p2Records: 0,
            otherRecords: 0,
            skippedRecords: 0,
            rawLines: 0,
            colorMapping: {
              dtRecords: '#3b82f6',    // blue
              bhRecords: '#10b981',    // green
              p1Records: '#f59e0b',    // orange
              skippedRecords: '#ef4444', // red
              otherRecords: '#6b7280'   // gray (E1, G2, AD, DR, P2, other)
            }
          };
        }
        
        // Calculate rates based on difference from previous data point
        const timeDiffMinutes = (new Date(row.timestamp) - new Date(row.prev_timestamp)) / (1000 * 60);
        
        // Calculate per-minute processing rates for each record type
        const dtRate = timeDiffMinutes > 0 ? ((row.dt_processed || 0) - (row.prev_dt_processed || 0)) / timeDiffMinutes : 0;
        const bhRate = timeDiffMinutes > 0 ? ((row.bh_processed || 0) - (row.prev_bh_processed || 0)) / timeDiffMinutes : 0;
        const p1Rate = timeDiffMinutes > 0 ? ((row.p1_processed || 0) - (row.prev_p1_processed || 0)) / timeDiffMinutes : 0;
        const e1Rate = timeDiffMinutes > 0 ? ((row.e1_processed || 0) - (row.prev_e1_processed || 0)) / timeDiffMinutes : 0;
        const g2Rate = timeDiffMinutes > 0 ? ((row.g2_processed || 0) - (row.prev_g2_processed || 0)) / timeDiffMinutes : 0;
        const adRate = timeDiffMinutes > 0 ? ((row.ad_processed || 0) - (row.prev_ad_processed || 0)) / timeDiffMinutes : 0;
        const drRate = timeDiffMinutes > 0 ? ((row.dr_processed || 0) - (row.prev_dr_processed || 0)) / timeDiffMinutes : 0;
        const p2Rate = timeDiffMinutes > 0 ? ((row.p2_processed || 0) - (row.prev_p2_processed || 0)) / timeDiffMinutes : 0;
        const otherRate = timeDiffMinutes > 0 ? ((row.other_processed || 0) - (row.prev_other_processed || 0)) / timeDiffMinutes : 0;
        
        // Calculate total skipped records rate
        const currentTotalSkipped = (row.dt_skipped || 0) + (row.bh_skipped || 0) + (row.p1_skipped || 0) + 
                                   (row.e1_skipped || 0) + (row.g2_skipped || 0) + (row.ad_skipped || 0) + 
                                   (row.dr_skipped || 0) + (row.p2_skipped || 0) + (row.other_skipped || 0);
        const skippedRate = timeDiffMinutes > 0 ? (currentTotalSkipped - (row.prev_total_skipped || 0)) / timeDiffMinutes : 0;
        
        // Combine P1 and P2 into single p1Records for chart display (purchasing card extensions)
        const combinedP1P2Rate = p1Rate + p2Rate;
        
        // Combine gray record types (E1, G2, AD, DR, other) - P2 now grouped with P1
        const combinedOtherRate = e1Rate + g2Rate + adRate + drRate + otherRate;
        
        return {
          timestamp: row.timestamp,
          dtRecords: Math.max(0, Math.round(dtRate)),
          bhRecords: Math.max(0, Math.round(bhRate)),
          p1Records: Math.max(0, Math.round(combinedP1P2Rate)), // Combined P1/P2 purchasing extensions
          otherRecords: Math.max(0, Math.round(combinedOtherRate)), // Combined gray categories (excluding P2)
          skippedRecords: Math.max(0, Math.round(skippedRate)), // Red for all skipped
          rawLines: Math.max(0, Math.round(dtRate + bhRate + combinedP1P2Rate + combinedOtherRate + skippedRate)),
          colorMapping: {
            dtRecords: '#3b82f6',      // blue
            bhRecords: '#10b981',      // green
            p1Records: '#f59e0b',      // orange
            skippedRecords: '#ef4444', // red
            otherRecords: '#6b7280'    // gray
          }
        };
      });
      
      // Format period based on duration
      let periodText = '';
      if (hours < 1) {
        const minutes = Math.round(hours * 60);
        periodText = `${minutes} minute${minutes > 1 ? 's' : ''}`;
      } else {
        periodText = `${hours} hour${hours > 1 ? 's' : ''}`;
      }
      
      res.json({
        data: chartData,
        period: periodText,
        dataSource: 'scanly_watcher_performance_metrics',
        lastUpdate: chartData.length > 0 ? chartData[chartData.length - 1].timestamp : null
      });
    } catch (error) {
      console.error('Error fetching performance chart history:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch performance chart history",
        data: []
      });
    }
  });

  // Scanly-Watcher Processing Status Cache Endpoint
  app.get("/api/scanly-watcher/processing-status", isAuthenticated, async (req, res) => {
    try {
      const { scanlyWatcher } = await import("./services/processing-watcher");
      const cachedData = scanlyWatcher.getProcessingStatusCache();
      const isFresh = scanlyWatcher.isCacheFresh();
      
      if (cachedData && isFresh) {
        res.json({
          success: true,
          data: cachedData,
          cached: true,
          updateSource: 'scanly_watcher_30_second_cache'
        });
      } else {
        // Return indication that cache is stale or not available
        res.json({
          success: false,
          message: "Processing status cache not available or stale",
          cached: false,
          lastUpdate: cachedData?.lastUpdated || null,
          recommendation: "Use standard processing status endpoints"
        });
      }
    } catch (error) {
      console.error('Error getting cached processing status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get cached processing status" 
      });
    }
  });

  // Delete TDDF record
  app.delete("/api/tddf/:id", isAuthenticated, async (req, res) => {
    try {
      // @ENVIRONMENT-CRITICAL - TDDF record deletion with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
      const recordId = parseInt(req.params.id);
      const tddfRecordsTableName = getTableName('tddf_records');
      
      // Check if record exists using raw SQL
      const existingRecordResult = await pool.query(`
        SELECT id FROM ${tddfRecordsTableName} WHERE id = $1
      `, [recordId]);
      
      if (existingRecordResult.rows.length === 0) {
        return res.status(404).json({ error: "TDDF record not found" });
      }
      
      // Delete the record using raw SQL
      await pool.query(`
        DELETE FROM ${tddfRecordsTableName} WHERE id = $1
      `, [recordId]);
      
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
      // @ENVIRONMENT-CRITICAL - TDDF export query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const batchId = req.query.batchId as string;
      const merchantId = req.query.merchantId as string;
      const tddfRecordsTableName = getTableName('tddf_records');
      
      // Build raw SQL query with environment-aware table name
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      
      if (startDate) {
        whereConditions.push(`transaction_date >= $${paramIndex}`);
        queryParams.push(new Date(startDate));
        paramIndex++;
      }
      if (endDate) {
        whereConditions.push(`transaction_date <= $${paramIndex}`);
        queryParams.push(new Date(endDate));
        paramIndex++;
      }
      if (batchId) {
        whereConditions.push(`batch_julian_date = $${paramIndex}`);
        queryParams.push(batchId);
        paramIndex++;
      }
      if (merchantId) {
        whereConditions.push(`merchant_account_number = $${paramIndex}`);
        queryParams.push(merchantId);
        paramIndex++;
      }
      
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const sqlQuery = `
        SELECT * FROM ${tddfRecordsTableName} 
        ${whereClause}
        ORDER BY transaction_date DESC
      `;
      
      const recordsResult = await pool.query(sqlQuery, queryParams);
      const records = recordsResult.rows;
      
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

  // Add manual TDDF processing route (no auth required for backlog processing)
  app.post("/api/tddf/process-backlog", async (req, res) => {
    try {
      console.log('🚀 [MANUAL TDDF] Starting processing of pending DT records...');
      
      const batchSize = parseInt(req.body.batchSize) || 100;
      const tableName = getTableName('tddf_raw_import');
      
      // Get pending DT records
      const result = await pool.query(`
        SELECT id, source_file_id, line_number, raw_line, record_type, record_description
        FROM ${tableName}
        WHERE processing_status = 'pending' 
        AND record_type = 'DT'
        ORDER BY source_file_id, line_number
        LIMIT $1
      `, [batchSize]);
      
      const pendingLines = result.rows;
      console.log(`📄 [MANUAL TDDF] Found ${pendingLines.length} pending DT records to process`);
      
      let processed = 0;
      let errors = 0;
      const results = [];
      
      for (const rawLine of pendingLines) {
        try {
          const line = rawLine.raw_line;
          const fileId = rawLine.source_file_id;
          
          // Parse TDDF data using the same logic as the storage method
          const tddfRecord = {
            // Core TDDF header fields (positions 1-23)
            sequenceNumber: line.substring(0, 7).trim() || null,
            entryRunNumber: line.substring(7, 13).trim() || null,
            sequenceWithinRun: line.substring(13, 17).trim() || null,
            recordIdentifier: line.substring(17, 19).trim() || null,
            bankNumber: line.substring(19, 23).trim() || null,
            
            // Account and merchant fields (positions 24-61)
            merchantAccountNumber: line.substring(23, 39).trim() || null,
            associationNumber1: line.substring(39, 45).trim() || null,
            groupNumber: line.substring(45, 51).trim() || null,
            transactionCode: line.substring(51, 55).trim() || null,
            associationNumber2: line.substring(55, 61).trim() || null,
            
            // Core transaction fields (positions 62-142)
            referenceNumber: line.substring(61, 84).trim() || null,
            transactionDate: parseDate(line.substring(84, 92).trim()),
            transactionAmount: parseAmount(line.substring(92, 103).trim()),
            batchJulianDate: line.substring(103, 108).trim() || null,
            netDeposit: parseAmount(line.substring(108, 123).trim()),
            cardholderAccountNumber: line.substring(123, 142).trim() || null,
            
            // Additional key fields
            merchantName: line.length > 242 ? line.substring(217, 242).trim() || null : null,
            authAmount: parseAmount(line.substring(191, 203).trim()),
            
            // System fields
            sourceFileId: fileId,
            sourceRowNumber: rawLine.line_number,
            mmsRawLine: line
          };
          
          // Use the corrected upsertTddfRecord method (which now uses raw SQL)
          const createdRecord = await storage.upsertTddfRecord(tddfRecord);
          
          // Mark raw line as processed
          await pool.query(`
            UPDATE ${tableName} 
            SET processing_status = 'processed',
                processed_into_table = 'dev_tddf_records',
                processed_record_id = $2,
                processed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `, [rawLine.id, createdRecord.id.toString()]);
          
          processed++;
          results.push({
            lineId: rawLine.id,
            recordId: createdRecord.id,
            referenceNumber: tddfRecord.referenceNumber,
            amount: tddfRecord.transactionAmount,
            status: 'processed'
          });
          
          if (processed % 10 === 0) {
            console.log(`✅ [MANUAL TDDF] Processed ${processed} records so far...`);
          }
          
        } catch (lineError: any) {
          errors++;
          console.error(`❌ [MANUAL TDDF] Error processing line ${rawLine.id}:`, lineError.message);
          
          // Mark as skipped
          await pool.query(`
            UPDATE ${tableName} 
            SET processing_status = 'skipped',
                skip_reason = $2,
                processed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
          `, [rawLine.id, `manual_processing_error: ${lineError.message.substring(0, 100)}`]);
          
          results.push({
            lineId: rawLine.id,
            error: lineError.message,
            status: 'error'
          });
        }
      }
      
      console.log(`🎉 [MANUAL TDDF] Processing complete - Processed: ${processed}, Errors: ${errors}`);
      
      res.json({
        success: true,
        summary: {
          totalProcessed: processed,
          totalErrors: errors,
          batchSize: pendingLines.length
        },
        results: results.slice(0, 10) // Return first 10 results for verification
      });
      
    } catch (error: any) {
      console.error('❌ [MANUAL TDDF] Processing error:', error);
      res.status(500).json({
        error: error.message,
        success: false
      });
    }
  });

  // TDDF Switch-Based Processing Route
  app.post('/api/tddf/process-pending-switch-based', isAuthenticated, async (req, res) => {
    try {
      const { batchSize, fileId } = req.body;
      
      console.log(`[SWITCH-API] Starting switch-based processing: batchSize=${batchSize || 'default'}, fileId=${fileId || 'all files'}`);
      
      const result = await storage.processPendingTddfRecordsSwitchBased(fileId, batchSize);
      
      console.log(`[SWITCH-API] ✅ Processing complete: ${result.totalProcessed} processed, ${result.totalSkipped} skipped, ${result.totalErrors} errors in ${result.processingTime}ms`);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('[SWITCH-API] Error in switch-based processing:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // TDDF Merchants Cache Management Routes
  app.post('/api/tddf-merchants/refresh-cache', isAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF CACHE] Starting cache refresh...');
      
      const result = await storage.refreshTddfMerchantsCache();
      
      console.log(`[TDDF CACHE] ✅ Cache refresh completed: ${result.rebuilt} merchants`);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('[TDDF CACHE] Error refreshing cache:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/tddf-merchants/cache-stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getTddfMerchantsCacheStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error: any) {
      console.error('[TDDF CACHE] Error getting cache stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Dev Upload routes for compressed storage testing
  app.post("/api/dev-uploads", isAuthenticated, async (req, res) => {
    try {
      const { filename, compressed_payload, schema_info } = req.body;
      
      if (!filename || !compressed_payload || !schema_info) {
        return res.status(400).json({ 
          error: "Missing required fields: filename, compressed_payload, schema_info" 
        });
      }

      const devUpload = await storage.createDevUpload({
        id: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        filename,
        compressed_payload,
        schema_info,
        upload_date: new Date(),
        status: 'uploaded'
      });

      res.json({ success: true, upload: devUpload });
    } catch (error: any) {
      console.error('Dev upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/dev-uploads", isAuthenticated, async (req, res) => {
    try {
      const uploads = await storage.getDevUploads();
      res.json(uploads);
    } catch (error: any) {
      console.error('Get dev uploads error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/dev-uploads/:id", isAuthenticated, async (req, res) => {
    try {
      const upload = await storage.getDevUploadById(req.params.id);
      if (!upload) {
        return res.status(404).json({ error: "Upload not found" });
      }
      res.json(upload);
    } catch (error: any) {
      console.error('Get dev upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper functions for manual TDDF processing
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.length !== 8) return null;
  
  // MMDDCCYY format
  const month = parseInt(dateStr.substring(0, 2));
  const day = parseInt(dateStr.substring(2, 4));
  const year = parseInt(dateStr.substring(4, 8));
  
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  
  return new Date(year, month - 1, day);
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;
  
  const cleanAmount = amountStr.replace(/[^\d.-]/g, '');
  if (!cleanAmount) return null;
  
  const amount = parseFloat(cleanAmount);
  if (isNaN(amount)) return null;
  
  // Convert from cents to dollars (divide by 100)
  return amount / 100;
}
