import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, pool } from "./db";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { createReadStream, createWriteStream } from "fs";
import { parse as parseCSV } from "csv-parse";
import { format as formatCSV } from "csv-format";
import multer from "multer";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { count } from "drizzle-orm";
import { merchants as merchantsTable, transactions as transactionsTable, uploadedFiles as uploadedFilesTable } from "@shared/schema";

const execPromise = promisify(exec);

// Set up multer for file uploads
const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Get database statistics and info for settings page
  app.get("/api/settings/database", async (req, res) => {
    try {
      // Get PostgreSQL version
      const versionResult = await pool.query("SELECT version()");
      const version = versionResult.rows[0].version.split(" ")[1];
      
      // Get table information
      const tables = ['merchants', 'transactions', 'uploaded_files'];
      const tableStats = [];
      let totalRows = 0;
      let totalSizeBytes = 0;
      
      for (const tableName of tables) {
        // Get row count for each table
        const rowCountResult = await db.select({ count: count() }).from(
          tableName === 'merchants' ? merchantsTable : 
          tableName === 'transactions' ? transactionsTable : uploadedFilesTable
        );
        const rowCount = parseInt(rowCountResult[0].count.toString(), 10);
        
        // Get table size in bytes
        const sizeResult = await pool.query(`
          SELECT pg_total_relation_size('${tableName}') as size
        `);
        const sizeBytes = parseInt(sizeResult.rows[0].size, 10);
        
        tableStats.push({
          name: tableName,
          rowCount,
          sizeBytes
        });
        
        totalRows += rowCount;
        totalSizeBytes += sizeBytes;
      }
      
      // Get last backup info if exists
      let lastBackup = null;
      const backupInfoPath = path.join(os.tmpdir(), 'last_backup_info.json');
      if (fs.existsSync(backupInfoPath)) {
        const backupInfoContent = fs.readFileSync(backupInfoPath, 'utf8');
        try {
          const backupInfo = JSON.parse(backupInfoContent);
          lastBackup = backupInfo.timestamp;
        } catch (e) {
          console.error('Error parsing backup info:', e);
        }
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
  
  // Create database backup using direct SQL queries
  app.post("/api/settings/backup", async (req, res) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `mms_backup_${timestamp}.json`;
      const backupFilePath = path.join(os.tmpdir(), backupFileName);
      
      // Create backup by directly querying tables
      const backupData = {
        timestamp,
        merchants: [],
        transactions: [],
        uploadedFiles: []
      };
      
      // Get merchants data
      const merchantsData = await db.select().from(merchantsTable);
      backupData.merchants = merchantsData;
      
      // Get transactions data
      const transactionsData = await db.select().from(transactionsTable);
      backupData.transactions = transactionsData;
      
      // Get uploaded files data
      const uploadedFilesData = await db.select().from(uploadedFilesTable);
      backupData.uploadedFiles = uploadedFilesData;
      
      // Write backup to file as JSON
      fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));
      
      // Save backup timestamp and filename for later download
      const backupInfo = {
        timestamp: new Date().toISOString(),
        filePath: backupFilePath,
        fileName: backupFileName
      };
      fs.writeFileSync(path.join(os.tmpdir(), 'last_backup_info.json'), JSON.stringify(backupInfo));
      
      // Add to backup history log
      const backupLogPath = path.join(os.tmpdir(), 'backup_history.json');
      let backupHistory = [];
      
      // Read existing history if available
      if (fs.existsSync(backupLogPath)) {
        try {
          const existingData = fs.readFileSync(backupLogPath, 'utf8');
          backupHistory = JSON.parse(existingData);
        } catch (err) {
          console.error('Error reading backup history:', err);
        }
      }
      
      // Add new backup to history with size information
      const stats = fs.statSync(backupFilePath);
      backupHistory.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        fileName: backupFileName,
        filePath: backupFilePath,
        size: stats.size,
        tables: {
          merchants: backupData.merchants.length,
          transactions: backupData.transactions.length,
          uploadedFiles: backupData.uploadedFiles.length
        }
      });
      
      // Sort by timestamp descending (newest first)
      backupHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Keep only the last 20 backups in history
      if (backupHistory.length > 20) {
        backupHistory = backupHistory.slice(0, 20);
      }
      
      // Save updated history
      fs.writeFileSync(backupLogPath, JSON.stringify(backupHistory, null, 2));
      
      // Success response
      res.json({
        success: true,
        message: "Database backup created successfully",
        timestamp: new Date().toISOString(),
        backupPath: backupFilePath,
        fileName: backupFileName
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
  app.get("/api/settings/backup/history", async (req, res) => {
    try {
      const backupLogPath = path.join(os.tmpdir(), 'backup_history.json');
      
      // Return empty array if no history exists yet
      if (!fs.existsSync(backupLogPath)) {
        return res.json([]);
      }
      
      // Read and return backup history
      const historyData = fs.readFileSync(backupLogPath, 'utf8');
      const backupHistory = JSON.parse(historyData);
      
      // Return history without full file paths for security
      const safeHistory = backupHistory.map(backup => ({
        id: backup.id,
        timestamp: backup.timestamp,
        fileName: backup.fileName,
        size: backup.size,
        tables: backup.tables
      }));
      
      res.json(safeHistory);
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
      const backupLogPath = path.join(os.tmpdir(), 'backup_history.json');
      
      if (!fs.existsSync(backupLogPath)) {
        return res.status(404).json({ 
          success: false, 
          error: "No backup history found." 
        });
      }
      
      // Find the backup with matching ID
      const historyData = fs.readFileSync(backupLogPath, 'utf8');
      const backupHistory = JSON.parse(historyData);
      const backup = backupHistory.find(b => b.id === backupId);
      
      if (!backup) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup with specified ID not found." 
        });
      }
      
      if (!fs.existsSync(backup.filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup file not found. The temporary file may have been deleted." 
        });
      }
      
      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename=${backup.fileName}`);
      res.setHeader('Content-Type', 'application/json');
      
      // Stream the file to client
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
  
  // Download the latest database backup
  app.get("/api/settings/backup/download", async (req, res) => {
    try {
      // Check if backup info exists
      const backupInfoPath = path.join(os.tmpdir(), 'last_backup_info.json');
      
      if (!fs.existsSync(backupInfoPath)) {
        return res.status(404).json({ 
          success: false, 
          error: "No backup found. Please create a backup first." 
        });
      }
      
      // Get backup info
      const backupInfoContent = fs.readFileSync(backupInfoPath, 'utf8');
      const backupInfo = JSON.parse(backupInfoContent);
      
      if (!fs.existsSync(backupInfo.filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup file not found. The temporary file may have been deleted." 
        });
      }
      
      // Set download headers
      res.setHeader('Content-Disposition', `attachment; filename=${backupInfo.fileName}`);
      res.setHeader('Content-Type', 'application/json');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(backupInfo.filePath);
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

  // Get merchants with pagination and filters
  app.get("/api/merchants", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string || "All";
      const lastUpload = req.query.lastUpload as string || "Any time";

      const result = await storage.getMerchants(page, limit, status, lastUpload);
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

  // Process uploaded files
  app.post("/api/process-uploads", async (req, res) => {
    try {
      const schema = z.object({
        fileIds: z.array(z.string())
      });

      const { fileIds } = schema.parse(req.body);
      
      if (fileIds.length === 0) {
        return res.status(400).json({ error: "No files to process" });
      }

      await storage.combineAndProcessUploads(fileIds);
      res.json({ success: true, message: "Files processed successfully" });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process files" 
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

  const httpServer = createServer(app);
  return httpServer;
}
