import { Request, Response, NextFunction, Express } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { merchants, transactions, uploadedFiles, schemaVersions, backupHistory, backupSchedules } from "@shared/schema";
import { db } from "./db";
import { CURRENT_SCHEMA_VERSION, SchemaVersionManager } from "./schema_version";
import { createServer, Server } from "http";
import { setupVite, serveStatic } from "./vite";
import { eq, desc, like, and, or, sql, asc, between } from "drizzle-orm";
import { storage } from "./storage";
import { backupManager } from "./backup/backup_manager";
import { PathLike } from "fs";
import { registerBackupScheduleRoutes } from "./routes/backup_schedule_routes";
import { registerS3Routes } from "./routes/s3_routes";
import { setupAuth } from "./auth";

/**
 * Middleware to check if a user is authenticated
 */
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

/**
 * Utility to format data as CSV
 */
function formatCSV(data: any[]) {
  if (!data || data.length === 0) {
    return "";
  }
  
  // Get headers from first object keys
  const headers = Object.keys(data[0]);
  
  // Create header row
  let csv = headers.join(",") + "\n";
  
  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => {
      const val = row[header];
      // Handle values that might contain commas
      if (val === null || val === undefined) {
        return '';
      } else if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      } else {
        return val;
      }
    });
    csv += values.join(",") + "\n";
  });
  
  return csv;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // File upload configuration
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = './tmp_uploads';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  });
  
  const upload = multer({ storage });
  
  // Configure auth routes (login, register, etc)
  setupAuth(app);
  
  // API Routes
  app.get("/api/hello", (req, res) => {
    res.json({ message: "Hello from the API!" });
  });
  
  // Get Dashboard Stats
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      res.status(500).json({ error: "Failed to get dashboard stats" });
    }
  });
  
  // Get all merchants with pagination
  app.get("/api/merchants", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const status = req.query.status as string;
      const lastUpload = req.query.lastUpload as string;
      
      const result = await storage.getMerchants(page, pageSize, status, lastUpload);
      
      res.json(result);
    } catch (error) {
      console.error("Error retrieving merchants:", error);
      res.status(500).json({ error: "Failed to retrieve merchants" });
    }
  });
  
  // Get merchant by ID
  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const result = await storage.getMerchantById(merchantId);
      
      if (!result.merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error retrieving merchant details:", error);
      res.status(500).json({ error: "Failed to retrieve merchant details" });
    }
  });
  
  // Create a new merchant
  app.post("/api/merchants", async (req, res) => {
    try {
      const merchantData = req.body;
      const merchant = await storage.createMerchant(merchantData);
      res.status(201).json(merchant);
    } catch (error) {
      console.error("Error creating merchant:", error);
      res.status(500).json({ error: "Failed to create merchant" });
    }
  });
  
  // Update a merchant
  app.put("/api/merchants/:id", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const merchantData = req.body;
      const updatedMerchant = await storage.updateMerchant(merchantId, merchantData);
      res.json(updatedMerchant);
    } catch (error) {
      console.error("Error updating merchant:", error);
      res.status(500).json({ error: "Failed to update merchant" });
    }
  });
  
  // Delete multiple merchants
  app.delete("/api/merchants", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: "Invalid request. Expected array of merchant IDs" });
      }
      
      await storage.deleteMerchants(ids);
      res.json({ success: true, message: `Successfully deleted ${ids.length} merchants` });
    } catch (error) {
      console.error("Error deleting merchants:", error);
      res.status(500).json({ error: "Failed to delete merchants" });
    }
  });
  
  // Get transactions with filters and pagination
  app.get("/api/transactions", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const merchantId = req.query.merchantId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const type = req.query.type as string;
      
      const result = await storage.getTransactions(page, pageSize, merchantId, startDate, endDate, type);
      
      res.json(result);
    } catch (error) {
      console.error("Error retrieving transactions:", error);
      res.status(500).json({ error: "Failed to retrieve transactions" });
    }
  });
  
  // Export transactions to CSV
  app.get("/api/transactions/export", async (req, res) => {
    try {
      const merchantId = req.query.merchantId as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const type = req.query.type as string;
      
      const csvData = await storage.exportTransactionsToCSV(merchantId, startDate, endDate, type);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      res.send(csvData);
    } catch (error) {
      console.error("Error exporting transactions:", error);
      res.status(500).json({ error: "Failed to export transactions" });
    }
  });
  
  // Add a transaction to a merchant
  app.post("/api/merchants/:id/transactions", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const transactionData = req.body;
      
      const transaction = await storage.addTransaction(merchantId, transactionData);
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error adding transaction:", error);
      res.status(500).json({ error: "Failed to add transaction" });
    }
  });
  
  // Delete multiple transactions
  app.delete("/api/transactions", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: "Invalid request. Expected array of transaction IDs" });
      }
      
      await storage.deleteTransactions(ids);
      res.json({ success: true, message: `Successfully deleted ${ids.length} transactions` });
    } catch (error) {
      console.error("Error deleting transactions:", error);
      res.status(500).json({ error: "Failed to delete transactions" });
    }
  });
  
  // File upload endpoint
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const filePath = req.file.path;
      const fileType = req.body.type;
      const originalFilename = req.file.originalname;
      
      // Process the file
      const fileId = await storage.processUploadedFile(
        filePath, 
        fileType, 
        originalFilename
      );
      
      res.json({
        success: true,
        message: "File uploaded successfully",
        fileId
      });
    } catch (error) {
      console.error("Error processing uploaded file:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Error processing uploaded file" 
      });
    }
  });
  
  // Get upload history
  app.get("/api/uploads/history", async (req, res) => {
    try {
      const uploadsHistory = await db
        .select()
        .from(uploadedFiles)
        .where(eq(uploadedFiles.deleted, false))
        .orderBy(desc(uploadedFiles.uploadedAt));
      
      res.json(uploadsHistory);
    } catch (error) {
      console.error("Error retrieving upload history:", error);
      res.status(500).json({ error: "Failed to retrieve upload history" });
    }
  });
  
  // Delete an uploaded file
  app.delete("/api/uploads/:id", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Mark as deleted in the database
      await db
        .update(uploadedFiles)
        .set({ deleted: true })
        .where(eq(uploadedFiles.id, fileId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });
  
  // Re-process an uploaded file
  app.post("/api/uploads/:id/process", async (req, res) => {
    try {
      const fileId = req.params.id;
      
      // Get the file details
      const [file] = await db
        .select()
        .from(uploadedFiles)
        .where(eq(uploadedFiles.id, fileId));
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      // Check if file exists on disk
      if (!fs.existsSync(file.storagePath)) {
        return res.status(404).json({ error: "File no longer exists on disk" });
      }
      
      // Process the file
      if (file.fileType === "merchants") {
        await storage.processMerchantFile(file.storagePath);
      } else if (file.fileType === "transactions") {
        await storage.processTransactionFile(file.storagePath);
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }
      
      // Update the file status
      await db
        .update(uploadedFiles)
        .set({ 
          processed: true,
          processingErrors: null
        })
        .where(eq(uploadedFiles.id, fileId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error re-processing file:", error);
      
      // Update the file with the error
      await db
        .update(uploadedFiles)
        .set({ 
          processed: false,
          processingErrors: error instanceof Error ? error.message : "Unknown error"
        })
        .where(eq(uploadedFiles.id, req.params.id));
      
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Error re-processing file" 
      });
    }
  });
  
  // Combine and process multiple uploads
  app.post("/api/uploads/combine", async (req, res) => {
    try {
      const { fileIds } = req.body;
      
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: "No files selected" });
      }
      
      await storage.combineAndProcessUploads(fileIds);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error combining files:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Error combining files" 
      });
    }
  });
  
  // Generate exports
  app.get("/api/exports/transactions", async (req, res) => {
    try {
      const filePath = await storage.generateTransactionsExport();
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=transactions_export.csv`);
      
      // Send the file
      res.sendFile(filePath as string, { root: '.' });
    } catch (error) {
      console.error("Error generating transactions export:", error);
      res.status(500).json({ error: "Failed to generate transactions export" });
    }
  });
  
  app.get("/api/exports/merchants", async (req, res) => {
    try {
      const filePath = await storage.generateMerchantsExport();
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=merchants_export.csv`);
      
      // Send the file
      res.sendFile(filePath as string, { root: '.' });
    } catch (error) {
      console.error("Error generating merchants export:", error);
      res.status(500).json({ error: "Failed to generate merchants export" });
    }
  });
  
  // Get users list (Admin only)
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      // Get current user
      const currentUser = req.user;
      
      // Check if admin
      if (!currentUser || (currentUser as any).role !== 'admin') {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error retrieving users:", error);
      res.status(500).json({ error: "Failed to retrieve users" });
    }
  });
  
  // Create a new user (Admin only)
  app.post("/api/users", isAuthenticated, async (req, res) => {
    try {
      // Check if admin
      const currentUser = req.user;
      if (!currentUser || (currentUser as any).role !== 'admin') {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  // Update a user (Admin only)
  app.put("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      // Check if admin
      const currentUser = req.user;
      if (!currentUser || (currentUser as any).role !== 'admin') {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      
      const userId = parseInt(req.params.id);
      const userData = req.body;
      const user = await storage.updateUser(userId, userData);
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  
  // Delete a user (Admin only)
  app.delete("/api/users/:id", isAuthenticated, async (req, res) => {
    try {
      // Check if admin
      const currentUser = req.user;
      if (!currentUser || (currentUser as any).role !== 'admin') {
        return res.status(403).json({ error: "Forbidden. Admin access required." });
      }
      
      const userId = parseInt(req.params.id);
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  
  // Change user password
  app.post("/api/users/:id/change-password", isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { newPassword } = req.body;
      
      // Check permissions - users can change their own password, admins can change any password
      const currentUser = req.user;
      if (userId !== (currentUser as any).id && (currentUser as any).role !== 'admin') {
        return res.status(403).json({ error: "Forbidden. You can only change your own password." });
      }
      
      await storage.updateUserPassword(userId, newPassword);
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  
  // Create a database backup
  app.post("/api/settings/backup", isAuthenticated, async (req, res) => {
    try {
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
  app.get("/api/backups", async (req, res) => {
    try {
      // Check if we should include deleted backups
      const includeDeleted = req.query.includeDeleted === 'true';
      
      let backupRecords;
      
      if (includeDeleted) {
        // If including deleted, get all records
        backupRecords = await db
          .select({
            id: backupHistory.id,
            timestamp: backupHistory.timestamp,
            fileName: backupHistory.fileName,
            fileSize: backupHistory.size, // Changed from fileSize to size
            tables: backupHistory.tables,
            downloaded: backupHistory.downloaded,
            deleted: backupHistory.deleted,
            storageType: backupHistory.storageType,
            notes: backupHistory.notes,
            s3Bucket: backupHistory.s3Bucket,
            s3Key: backupHistory.s3Key
          })
          .from(backupHistory)
          .orderBy(desc(backupHistory.timestamp))
          .limit(20);
      } else {
        // If not including deleted, filter out deleted records
        backupRecords = await db
          .select({
            id: backupHistory.id,
            timestamp: backupHistory.timestamp,
            fileName: backupHistory.fileName,
            fileSize: backupHistory.size, // Changed from fileSize to size
            tables: backupHistory.tables,
            downloaded: backupHistory.downloaded,
            deleted: backupHistory.deleted,
            storageType: backupHistory.storageType,
            notes: backupHistory.notes,
            s3Bucket: backupHistory.s3Bucket,
            s3Key: backupHistory.s3Key
          })
          .from(backupHistory)
          .where(eq(backupHistory.deleted, false))
          .orderBy(desc(backupHistory.timestamp))
          .limit(20);
      }
      
      res.json(backupRecords);
    } catch (error) {
      console.error("Error retrieving backup history:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to retrieve backup history" 
      });
    }
  });
  
  // Download a specific backup by ID
  app.get("/api/backups/download/:id", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup record in the database
      const [backup] = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ error: "Backup not found" });
      }
      
      // Check if this is a local backup
      if (backup.storageType === "local") {
        // Validate file path for security
        const filePath = backup.filePath;
        if (!filePath) {
          return res.status(404).json({ error: "Backup file path not found" });
        }
        
        // Ensure the file exists
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: "Backup file not found on disk" });
        }
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${backup.fileName}`);
        
        // Update the download flag
        await db
          .update(backupHistory)
          .set({ downloaded: true })
          .where(eq(backupHistory.id, backupId));
        
        // Send the file
        return res.sendFile(path.resolve(filePath));
      } 
      // S3 backup
      else if (backup.storageType === "s3") {
        const downloadLink = await backupManager.getS3DownloadLink(backup.s3Bucket as string, backup.s3Key as string);
        
        // Update the download flag
        await db
          .update(backupHistory)
          .set({ downloaded: true })
          .where(eq(backupHistory.id, backupId));
        
        return res.json({ downloadLink });
      }
      
      res.status(400).json({ error: "Unsupported backup storage type" });
    } catch (error) {
      console.error("Error downloading backup:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to download backup" 
      });
    }
  });
  
  // Delete a backup
  app.delete("/api/settings/backup/:id", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup
      const [backup] = await db
        .select()
        .from(backupHistory)
        .where(eq(backupHistory.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ error: "Backup not found" });
      }
      
      // Delete the physical file for local backups
      if (backup.storageType === "local" && backup.filePath) {
        try {
          // Check if the file exists before attempting to delete
          if (fs.existsSync(backup.filePath)) {
            fs.unlinkSync(backup.filePath);
          }
        } catch (fileError) {
          console.error("Error deleting backup file:", fileError);
          // Continue even if file deletion fails
        }
      }
      // For S3 backups, delete the S3 object
      else if (backup.storageType === "s3" && backup.s3Bucket && backup.s3Key) {
        try {
          await backupManager.deleteS3Backup(backup.s3Bucket, backup.s3Key);
        } catch (s3Error) {
          console.error("Error deleting S3 backup:", s3Error);
          // Continue even if S3 deletion fails
        }
      }
      
      // Mark as deleted in the database
      await db
        .update(backupHistory)
        .set({ deleted: true })
        .where(eq(backupHistory.id, backupId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting backup:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete backup" 
      });
    }
  });
  
  // Get database schema versions
  app.get("/api/schema/versions", async (req, res) => {
    try {
      const versions = await SchemaVersionManager.getAllVersions();
      res.json({ 
        versions,
        currentVersion: CURRENT_SCHEMA_VERSION 
      });
    } catch (error) {
      console.error("Error retrieving schema versions:", error);
      res.status(500).json({ error: "Failed to retrieve schema versions" });
    }
  });
  
  // Get database statistics for the settings page
  app.get("/api/settings/database", async (req, res) => {
    try {
      // Get connection status
      const connectionStatus = "connected"; // This is always connected if we got this far
      
      // Get database version
      const versionResult = await db.execute(sql`SELECT version()`);
      const dbVersion = versionResult.rows && versionResult.rows.length > 0 
        ? versionResult.rows[0].version 
        : "Unknown";
      
      // Get schema version
      const currentSchemaVersion = await SchemaVersionManager.getCurrentVersion();
      
      // Check if current version matches
      const isCurrentVersion = await SchemaVersionManager.isVersionMatch(CURRENT_SCHEMA_VERSION);
      
      // Get table statistics (row counts and sizes)
      const tableList = [
        { name: "merchants", table: merchants },
        { name: "transactions", table: transactions },
        { name: "uploaded_files", table: uploadedFiles },
        { name: "backup_history", table: backupHistory },
        { name: "schema_versions", table: schemaVersions }
      ];
      
      // Get stats for each table
      const tableStats = [];
      
      for (const tableInfo of tableList) {
        console.log(`Processing table: ${tableInfo.name}`);
        // Select the table object for debugging
        console.log(`Selected table object for ${tableInfo.name}`);
        
        // Get row count
        const countResult = await db.execute(
          sql`SELECT COUNT(*) as count FROM ${sql.identifier(tableInfo.name)}`
        );
        console.log(`Row count result for ${tableInfo.name}:`, countResult.rows);
        
        // Get table size
        const sizeResult = await db.execute(
          sql`SELECT pg_relation_size(${sql.raw(`'${tableInfo.name}'`)}) as size`
        );
        console.log(`Size result for ${tableInfo.name}:`, sizeResult.rows);
        
        const count = countResult.rows[0].count;
        const size = sizeResult.rows[0].size;
        
        tableStats.push({
          name: tableInfo.name,
          rowCount: parseInt(count),
          size: parseInt(size),
          sizeFormatted: formatSize(parseInt(size))
        });
        
        console.log(`Added ${tableInfo.name} to tableStats`);
      }
      
      res.json({
        connectionStatus,
        version: dbVersion,
        schemaVersion: currentSchemaVersion?.version || "Not set",
        isCurrentVersion,
        expectedVersion: CURRENT_SCHEMA_VERSION,
        tables: tableStats,
        totalSize: tableStats.reduce((acc, table) => acc + table.size, 0),
        totalSizeFormatted: formatSize(tableStats.reduce((acc, table) => acc + table.size, 0))
      });
    } catch (error) {
      console.error("Error getting database stats:", error);
      res.status(500).json({ 
        connectionStatus: "error",
        error: error instanceof Error ? error.message : "Failed to get database stats"
      });
    }
    
    // Helper function to format byte sizes
    function formatSize(bytes: number): string {
      if (bytes < 1024) return bytes + " B";
      else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
      else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
      else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }
  });
  
  // Setup backup schedule routes
  registerBackupScheduleRoutes(app);
  
  // Setup S3 configuration routes
  registerS3Routes(app);
  
  // Get backup history for the Backups page
  app.get("/api/backups", isAuthenticated, async (req, res) => {
    try {
      // Check if should include deleted backups
      const includeDeleted = req.query.includeDeleted === "true";
      let backupRecords;
      
      // If including deleted, just get all records
      if (includeDeleted) {
        backupRecords = await db
          .select({
            id: backupHistory.id,
            timestamp: backupHistory.timestamp,
            fileName: backupHistory.fileName,
            fileSize: backupHistory.size, // Use size
            tables: backupHistory.tables,
            downloaded: backupHistory.downloaded,
            deleted: backupHistory.deleted,
            storageType: backupHistory.storageType,
            notes: backupHistory.notes,
            s3Bucket: backupHistory.s3Bucket,
            s3Key: backupHistory.s3Key
          })
          .from(backupHistory)
          .orderBy(desc(backupHistory.timestamp))
          .limit(20);
      } else {
        backupRecords = await db
          .select({
            id: backupHistory.id,
            timestamp: backupHistory.timestamp,
            fileName: backupHistory.fileName,
            fileSize: backupHistory.size, // Use size
            tables: backupHistory.tables,
            downloaded: backupHistory.downloaded,
            deleted: backupHistory.deleted,
            storageType: backupHistory.storageType,
            notes: backupHistory.notes,
            s3Bucket: backupHistory.s3Bucket,
            s3Key: backupHistory.s3Key
          })
          .from(backupHistory)
          .where(eq(backupHistory.deleted, false))
          .orderBy(desc(backupHistory.timestamp))
          .limit(20);
      }
      
      res.json(backupRecords);
    } catch (error) {
      console.error("Error retrieving backup history:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to retrieve backup history" 
      });
    }
  });
  
  // Handle all API 404 requests
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });
  
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Set up Vite development server
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }
  
  // Catch-all route for SPA
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(process.cwd(), process.env.NODE_ENV === "development" ? "index.html" : "dist/client/index.html"));
  });
  
  return httpServer;
}