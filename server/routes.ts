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
  backupHistory,
  InsertBackupHistory,
  schemaVersions
} from "@shared/schema";
import { SchemaVersionManager, CURRENT_SCHEMA_VERSION } from "./schema_version";

const execPromise = promisify(exec);

// Set up multer for file uploads
const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
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
      await db.insert(backupHistory).values({
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
      
      let backupRecords;
      
      if (includeDeleted) {
        // If including deleted, get all records
        backupRecords = await db
          .select({
            id: backupHistory.id,
            timestamp: backupHistory.timestamp,
            fileName: backupHistory.fileName,
            size: backupHistory.size,
            tables: backupHistory.tables,
            downloaded: backupHistory.downloaded,
            deleted: backupHistory.deleted
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
            size: backupHistory.size,
            tables: backupHistory.tables,
            downloaded: backupHistory.downloaded,
            deleted: backupHistory.deleted
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
        .update(backupHistory)
        .set({ downloaded: true })
        .where(eq(backupHistory.id, backupId));
      
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
        .update(backupHistory)
        .set({ downloaded: true })
        .where(eq(backupHistory.id, latestBackup.id));
      
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

  // Get upload file history
  app.get("/api/uploads/history", async (req, res) => {
    try {
      // Get all uploaded files with processing status
      const uploadedFiles = await db.select()
        .from(uploadedFilesTable)
        .where(eq(uploadedFilesTable.deleted, false))
        .orderBy(desc(uploadedFilesTable.uploadedAt));
      
      res.json(uploadedFiles);
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
      
      // Process based on file type
      if (fileInfo.fileType === "merchant") {
        await storage.processMerchantFile(fileInfo.storagePath);
      } else if (fileInfo.fileType === "transaction") {
        await storage.processTransactionFile(fileInfo.storagePath);
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }
      
      // Mark file as processed successfully
      await db.update(uploadedFilesTable)
        .set({ 
          processed: true,
          processingErrors: null 
        })
        .where(eq(uploadedFilesTable.id, fileId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error reprocessing file:", error);
      
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
        error: error instanceof Error ? error.message : "Failed to reprocess file"
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
  app.post("/api/merchants", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1, { message: "Name is required" }),
        clientMID: z.string().nullable().optional(),
        status: z.string().optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        category: z.string().nullable().optional()
      });
      
      const merchantData = schema.parse(req.body);
      
      // Create merchant with current date
      const newMerchant = await storage.createMerchant({
        ...merchantData,
        id: `M${Date.now().toString().slice(-4)}`,
        createdAt: new Date(),
        lastUploadDate: null
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
  app.put("/api/merchants/:id", async (req, res) => {
    try {
      const merchantId = req.params.id;
      const schema = z.object({
        name: z.string().optional(),
        clientMID: z.string().nullable().optional(),
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
