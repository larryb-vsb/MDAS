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
import { count, desc, eq } from "drizzle-orm";
import { 
  merchants as merchantsTable, 
  transactions as transactionsTable, 
  uploadedFiles as uploadedFilesTable,
  backupHistory as backupHistoryTable,
  InsertBackupHistory
} from "@shared/schema";

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
      const tables = ['merchants', 'transactions', 'uploaded_files', 'backup_history'];
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
            tableName === 'backup_history' ? backupHistoryTable : uploadedFilesTable;
          
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
          .select({ timestamp: backupHistoryTable.timestamp })
          .from(backupHistoryTable)
          .orderBy(desc(backupHistoryTable.timestamp))
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
      
      // No need to save backup info to a separate file anymore as we're using the database
      
      // Get information about the backup
      const stats = fs.statSync(backupFilePath);
      
      // Count the number of uploaded files that have been processed
      const processedFiles = backupData.uploadedFiles.filter(file => file.processed).length;
      
      // Store backup in database history
      const backupId = Date.now().toString();
      const tables = {
        merchants: backupData.merchants.length,
        transactions: backupData.transactions.length,
        uploadedFiles: processedFiles
      };
      
      // Insert backup record into database
      await db.insert(backupHistoryTable).values({
        id: backupId,
        fileName: backupFileName,
        filePath: backupFilePath,
        timestamp: new Date(),
        size: stats.size,
        tables: tables,
        notes: "Created via API",
        downloaded: false
      });
      
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
      // Check if we should include deleted backups
      const includeDeleted = req.query.includeDeleted === 'true';
      
      // Create query builder
      let query = db
        .select({
          id: backupHistoryTable.id,
          timestamp: backupHistoryTable.timestamp,
          fileName: backupHistoryTable.fileName,
          size: backupHistoryTable.size,
          tables: backupHistoryTable.tables,
          downloaded: backupHistoryTable.downloaded,
          deleted: backupHistoryTable.deleted
        })
        .from(backupHistoryTable)
        .orderBy(desc(backupHistoryTable.timestamp))
        .limit(20);
      
      // Filter out deleted backups unless specifically requested
      if (!includeDeleted) {
        query = query.where(eq(backupHistoryTable.deleted, false));
      }
      
      const backupRecords = await query;
      
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
  app.get("/api/settings/backup/download/:id", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup record in the database
      const [backup] = await db
        .select()
        .from(backupHistoryTable)
        .where(eq(backupHistoryTable.id, backupId));
      
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
      
      // Update the downloaded status
      await db
        .update(backupHistoryTable)
        .set({ downloaded: true })
        .where(eq(backupHistoryTable.id, backupId));
      
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
  
  // Soft delete a backup
  app.delete("/api/settings/backup/:id", async (req, res) => {
    try {
      const backupId = req.params.id;
      
      // Find the backup record
      const [backup] = await db
        .select()
        .from(backupHistoryTable)
        .where(eq(backupHistoryTable.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup with specified ID not found." 
        });
      }
      
      // Mark the backup as deleted (soft delete)
      await db
        .update(backupHistoryTable)
        .set({ deleted: true })
        .where(eq(backupHistoryTable.id, backupId));
      
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
        .from(backupHistoryTable)
        .where(eq(backupHistoryTable.id, backupId));
      
      if (!backup) {
        return res.status(404).json({ 
          success: false, 
          error: "Backup with specified ID not found." 
        });
      }
      
      // Mark the backup as not deleted (restore)
      await db
        .update(backupHistoryTable)
        .set({ deleted: false })
        .where(eq(backupHistoryTable.id, backupId));
      
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
        .from(backupHistoryTable)
        .orderBy(desc(backupHistoryTable.timestamp))
        .limit(1);
      
      if (!latestBackup) {
        return res.status(404).json({ 
          success: false, 
          error: "No backup found. Please create a backup first." 
        });
      }
      
      if (!fs.existsSync(latestBackup.filePath)) {
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
        .update(backupHistoryTable)
        .set({ downloaded: true })
        .where(eq(backupHistoryTable.id, latestBackup.id));
      
      // Stream the file to client
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
  
  // Update merchant details
  app.put("/api/merchants/:id", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const schema = z.object({
        name: z.string().optional(),
        status: z.string().optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        category: z.string().nullable().optional()
      });
      
      const merchantData = schema.parse(req.body);
      const updatedMerchant = await storage.updateMerchant(merchantId, merchantData);
      
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

  const httpServer = createServer(app);
  return httpServer;
}
