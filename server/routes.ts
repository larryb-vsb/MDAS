import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, isFallbackStorage, DatabaseStorage } from "./storage";
import { db, pool, batchPool } from "./db";
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
import { registerMerchantRoutes } from "./routes/merchants.routes";
import { registerTransactionRoutes } from "./routes/transactions.routes";
import { registerUserRoutes } from "./routes/users.routes";
import { registerApiUserRoutes } from "./routes/api-users.routes";
import { registerTddfFilesRoutes } from "./routes/tddf-files.routes";
import { registerTddfRecordsRoutes } from "./routes/tddf-records.routes";
import { registerTddfCacheRoutes } from "./routes/tddf-cache.routes";
import { registerBackupScheduleRoutes } from "./routes/backup_schedule_routes";
import { registerSystemRoutes } from "./routes/system.routes";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerSettingsRoutes } from "./routes/settings.routes";
import { registerSchemaRoutes } from "./routes/schema.routes";
import { registerMccSchemaRoutes } from "./routes/mcc-schema.routes";
import { fileProcessorService } from "./services/file-processor";
import logsRoutes from "./routes/logs_routes";
import logTestRoutes from "./routes/log_test_routes";
import poolRoutes from "./routes/pool_routes";
import hierarchicalTddfMigrationRoutes from "./routes/hierarchical-tddf-migration";
import { registerReprocessSkippedRoutes } from "./routes/reprocess-skipped";
import { registerMicrosoftAuthRoutes } from "./routes/microsoft-auth.routes";
import { getTableName, getEnvironmentPrefix } from "./table-config";
import { NODE_ENV } from "./env-config";
import { getMmsWatcherInstance } from "./mms-watcher-instance";
import { processAllRecordsToMasterTable } from "./tddf-json-encoder";
import { ReplitStorageService } from "./replit-storage-service";
import { HeatMapCacheBuilder } from "./services/heat-map-cache-builder";
import { heatMapCacheProcessingStats } from "@shared/schema";
import { backfillUniversalTimestamps } from "./services/universal-timestamp";
import { parseTddfFilename, formatProcessingTime } from "./utils/tddfFilename";
import { logger } from "../shared/logger";
import { getClientIp } from "./routes/middleware";

// Business day extraction utility for TDDF filenames
function extractBusinessDayFromFilename(filename: string): { businessDay: Date | null, fileDate: string | null } {
  // Pattern: VERMNTSB.6759_TDDF_830_10272022_001356.TSYSO
  // Look for 8-digit date pattern: MMDDYYYY
  const dateMatch = filename.match(/(\d{8})/);
  
  if (!dateMatch) {
    return { businessDay: null, fileDate: null };
  }
  
  const dateStr = dateMatch[1];
  
  // Parse MMDDYYYY format
  if (dateStr.length === 8) {
    const month = dateStr.substring(0, 2);
    const day = dateStr.substring(2, 4);
    const year = dateStr.substring(4, 8);
    
    try {
      const businessDay = new Date(`${year}-${month}-${day}`);
      // Validate the date is reasonable (not invalid)
      if (isNaN(businessDay.getTime())) {
        return { businessDay: null, fileDate: dateStr };
      }
      return { businessDay, fileDate: dateStr };
    } catch (error) {
      return { businessDay: null, fileDate: dateStr };
    }
  }
  
  return { businessDay: null, fileDate: dateStr };
}

// Cache naming utility following target_source_cache_yyyy format
function getCacheTableName(target: string, source: string, year?: number): string {
  const cacheYear = year || new Date().getFullYear();
  return getTableName(`${target}_${source}_cache_${cacheYear}`);
}

// Authentication middleware
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  logger.auth(`Checking authentication for ${req.method} ${req.path}`);
  
  // For TDDF API routes, bypass auth only in development environment
  if ((req.path.startsWith('/api/tddf-api/') || req.path.includes('/re-encode') || req.path.includes('/global-merchant-search')) && process.env.NODE_ENV === 'development') {
    logger.auth(`TDDF API route - bypassing auth for development testing`);
    // Set a mock user for the request
    (req as any).user = { username: 'test-user' };
    return next();
  }
  
  if (req.isAuthenticated()) {
    logger.auth(`User authenticated: ${(req.user as any)?.username}`);
    return next();
  }
  logger.auth(`Authentication failed for ${req.method} ${req.path}`);
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
    
    if (!apiUser.is_active) {
      return res.status(403).json({ error: "API key is inactive" });
    }
    
    // Check permissions for TDDF upload
    if (!apiUser.permissions.includes('tddf:upload')) {
      return res.status(403).json({ error: "Insufficient permissions for TDDF upload" });
    }
    
    // Update last used timestamp, request count, and IP address
    const clientIp = getClientIp(req);
    await storage.updateApiUserUsage(apiUser.id, clientIp);
    
    // Add API user to request for logging
    (req as any).apiUser = apiUser;
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: "Authentication error" });
  }
}

// Flexible authentication middleware - accepts either session or API key
export async function isAuthenticatedOrApiKey(req: Request, res: Response, next: NextFunction) {
  logger.auth(`Checking flexible authentication for ${req.method} ${req.path}`);
  
  // Check for API key first
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    try {
      const apiUser = await storage.getApiUserByKey(apiKey);
      if (apiUser && apiUser.is_active) {
        // Update last used timestamp, request count, and IP address
        const clientIp = getClientIp(req);
        await storage.updateApiUserUsage(apiUser.id, clientIp);
        // Add API user to request for logging
        (req as any).apiUser = apiUser;
        (req as any).user = { username: apiUser.username }; // Mock user for compatibility
        logger.auth(`API key authenticated: ${apiUser.username}`);
        return next();
      }
    } catch (error) {
      console.error('API key validation error:', error);
    }
  }
  
  // Fall back to session authentication
  if (req.isAuthenticated()) {
    logger.auth(`Session authenticated: ${(req.user as any)?.username}`);
    return next();
  }
  
  logger.auth(`Authentication failed - no valid session or API key`);
  res.status(401).json({ error: "Authentication required (session or API key)" });
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
  apiTerminals as terminalsTable,
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

// Set up multer for file uploads with memory storage for buffer access
const upload = multer({ 
  storage: multer.memoryStorage(),
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
  
  // Phase A: Core Business Routes  
  registerMerchantRoutes(app);
  registerTransactionRoutes(app);
  registerUserRoutes(app);
  registerApiUserRoutes(app);
  
  // Phase B: System Routes
  registerSystemRoutes(app);
  registerAuthRoutes(app);
  registerMicrosoftAuthRoutes(app); // Microsoft OAuth + Duo MFA
  registerSettingsRoutes(app);
  registerSchemaRoutes(app);
  registerMccSchemaRoutes(app);
  
  // Phase D: TDDF Routes
  registerTddfFilesRoutes(app);
  registerTddfCacheRoutes(app);      // Register specific routes FIRST (before :id parameter)
  registerTddfRecordsRoutes(app);    // Register parameter routes LAST (/:id catch-all)
  
  // Ping endpoint for connectivity testing (supports API key authentication)
  app.get("/api/uploader/ping", async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      let authMethod = 'none';
      
      if (apiKey) {
        const apiUser = await storage.getApiUserByKey(apiKey);
        if (apiUser && apiUser.is_active) {
          authMethod = 'api_key';
          const clientIp = getClientIp(req);
          await storage.updateApiUserUsage(apiUser.id, clientIp);
        }
      } else if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
        authMethod = 'session';
      }
      
      res.json({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        authMethod: authMethod,
        message: 'MMS Batch Uploader API is operational'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Batch status endpoint - returns upload queue status (supports API key authentication)
  app.get("/api/uploader/batch-status", async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      let authenticated = false;
      
      if (apiKey) {
        const apiUser = await storage.getApiUserByKey(apiKey);
        if (apiUser && apiUser.is_active) {
          authenticated = true;
          const clientIp = getClientIp(req);
          await storage.updateApiUserUsage(apiUser.id, clientIp);
        }
      } else if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
        authenticated = true;
      }
      
      if (!authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const tableName = getTableName('uploader_uploads');
      
      const queueStatus = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE current_phase IN ('queued', 'uploading')) as queued_count,
          COUNT(*) FILTER (WHERE current_phase IN ('identifying', 'encoding', 'processing')) as processing_count,
          COUNT(*) FILTER (WHERE current_phase = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE current_phase = 'error') as error_count,
          COUNT(*) as total_count
        FROM ${tableName}
        WHERE (is_archived = false OR is_archived IS NULL)
        AND (upload_status != 'deleted' OR upload_status IS NULL)
        AND created_at >= NOW() - INTERVAL '24 hours'
      `);
      
      const stats = queueStatus.rows[0];
      const processingCount = parseInt(stats.processing_count || 0);
      const queuedCount = parseInt(stats.queued_count || 0);
      const totalActive = processingCount + queuedCount;
      const capacityLimit = 10;
      
      res.json({
        ready: totalActive < capacityLimit,
        processing_count: processingCount,
        queued_count: queuedCount,
        completed_count: parseInt(stats.completed_count || 0),
        error_count: parseInt(stats.error_count || 0),
        total_count: parseInt(stats.total_count || 0),
        capacity_available: Math.max(0, capacityLimit - totalActive),
        capacity_limit: capacityLimit,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Batch status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Replit Object Storage configuration status with optional prefix override
  app.get("/api/uploader/storage-config", isAuthenticated, async (req, res) => {
    try {
      const requestedPrefix = req.query.prefix as string; // Allow override via query param
      
      const config = ReplitStorageService.getConfigStatus();
      
      console.log(`[STORAGE-CONFIG] Environment: ${config.environment}, Default Prefix: ${config.folderPrefix}, Requested: ${requestedPrefix || 'default'}`);
      
      // Add file count for requested prefix or default environment-specific prefix
      try {
        let searchPrefix: string | undefined;
        let actualPrefix: string;
        
        if (requestedPrefix) {
          // Use requested prefix (dev-uploader or prod-uploader)
          searchPrefix = requestedPrefix.endsWith('/') ? requestedPrefix : `${requestedPrefix}/`;
          actualPrefix = requestedPrefix;
        } else {
          // Use environment-aware default
          searchPrefix = undefined; // Let the service decide
          actualPrefix = config.folderPrefix;
        }
        
        const files = await ReplitStorageService.listFiles(searchPrefix);
        config.fileCount = files.length;
        (config as any).actualPrefix = actualPrefix;
        
        console.log(`[STORAGE-CONFIG] Successfully counted ${files.length} files for prefix: ${actualPrefix}, searchPrefix: ${searchPrefix}`);
      } catch (error: any) {
        console.error(`[STORAGE-CONFIG] File count error:`, error);
        (config as any).fileCount = 0;
        (config as any).fileCountError = error.message;
        (config as any).actualPrefix = config.folderPrefix;
      }
      
      // Make sure actualPrefix is set
      if (!(config as any).actualPrefix) {
        (config as any).actualPrefix = config.folderPrefix;
      }
      
      res.json(config);
    } catch (error: any) {
      console.error('Storage config error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Main uploader files list with pagination support
  app.get("/api/uploader", isAuthenticated, async (req, res) => {
    try {
      const { phase, sessionId, limit, offset, environment, filename } = req.query;
      
      // Support cross-environment viewing: use specific table if environment is specified
      let tableName = getTableName('uploader_uploads'); // Default to current environment
      if (environment === 'production') {
        tableName = 'uploader_uploads'; // Production table
      } else if (environment === 'development') {
        tableName = 'dev_uploader_uploads'; // Development table
      }
      
      // Get total count first for pagination
      let totalCount = 0;
      let allUploads: any[] = [];
      
      try {
        // First, get total count for pagination
        let countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
        const countParams: any[] = [];
        const countConditions: string[] = [];
        
        // Exclude archived and deleted files from active file list
        countConditions.push(`(is_archived = false OR is_archived IS NULL)`);
        countConditions.push(`(upload_status != 'deleted' OR upload_status IS NULL)`);
        
        if (phase) {
          countConditions.push(`current_phase = $${countParams.length + 1}`);
          countParams.push(phase);
        }
        
        if (sessionId) {
          countConditions.push(`session_id = $${countParams.length + 1}`);
          countParams.push(sessionId);
        }
        
        if (filename && typeof filename === 'string' && filename.trim().length > 0) {
          countConditions.push(`COALESCE(filename, '') ILIKE $${countParams.length + 1}`);
          countParams.push(`%${filename.trim()}%`);
        }
        
        if (countConditions.length > 0) {
          countQuery += ` WHERE ${countConditions.join(' AND ')}`;
        }
        
        const countResult = await pool.query(countQuery, countParams);
        totalCount = parseInt(countResult.rows[0]?.count || '0');
        
        // Then query current environment table with proper pagination
        let query = `SELECT * FROM ${tableName}`;
        const params: any[] = [];
        const conditions: string[] = [];
        
        // Exclude archived and deleted files from active file list
        conditions.push(`(is_archived = false OR is_archived IS NULL)`);
        conditions.push(`(upload_status != 'deleted' OR upload_status IS NULL)`);
        
        if (phase) {
          conditions.push(`current_phase = $${params.length + 1}`);
          params.push(phase);
        }
        
        if (sessionId) {
          conditions.push(`session_id = $${params.length + 1}`);
          params.push(sessionId);
        }
        
        if (filename && typeof filename === 'string' && filename.trim().length > 0) {
          conditions.push(`COALESCE(filename, '') ILIKE $${params.length + 1}`);
          params.push(`%${filename.trim()}%`);
        }
        
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        query += ` ORDER BY created_at DESC`;
        
        // Apply SQL-level pagination
        if (limit) {
          query += ` LIMIT $${params.length + 1}`;
          params.push(parseInt(limit as string));
        }
        
        if (offset) {
          query += ` OFFSET $${params.length + 1}`;
          params.push(parseInt(offset as string));
        }
        
        const currentResult = await pool.query(query, params);
        allUploads = currentResult.rows;
        
      } catch (error) {
        console.error('[UPLOADER-DEBUG] Error querying uploads:', error);
        // Return empty array on error
        allUploads = [];
      }
      
      // Convert snake_case database fields to camelCase for frontend compatibility
      const uploads = allUploads.map(row => ({
        ...row,
        currentPhase: row.current_phase,
        lastUpdated: row.last_updated,
        uploadStartedAt: row.upload_started_at,
        uploadStatus: row.upload_status,
        uploadProgress: row.upload_progress,
        chunkedUpload: row.chunked_upload,
        chunkCount: row.chunk_count,
        chunksUploaded: row.chunks_uploaded,
        uploadedAt: row.uploaded_at,
        storagePath: row.storage_path,
        s3Bucket: row.s3_bucket,
        s3Key: row.s3_key,
        s3Url: row.s3_url,
        s3Etag: row.s3_etag,
        fileSize: row.file_size,
        identifiedAt: row.identified_at,
        detectedFileType: row.detected_file_type,
        userClassifiedType: row.user_classified_type,
        finalFileType: row.final_file_type,
        lineCount: row.line_count,
        dataSize: row.data_size,
        keepForReview: row.keep_for_review,
        hasHeaders: row.has_headers,
        fileFormat: row.file_format,
        compressionUsed: row.compression_used,
        encodingDetected: row.encoding_detected,
        validationErrors: row.validation_errors,
        processingNotes: row.processing_notes,
        processingErrors: row.processing_errors,
        createdBy: row.created_by,
        serverId: row.server_id,
        sessionId: row.session_id,
        failedAt: row.failed_at,
        completedAt: row.completed_at,
        startTime: row.start_time,
        bhRecordCount: row.bh_record_count,
        dtRecordCount: row.dt_record_count,
        otherRecordCount: row.other_record_count,
        fileSequenceNumber: row.file_sequence_number,
        fileProcessingTime: row.file_processing_time,
        deletedAt: row.deleted_at,
        deletedBy: row.deleted_by
      }));
      
      // Return paginated response format when limit/offset is used
      if (limit || offset) {
        res.json({
          uploads,
          totalCount,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : 0
        });
      } else {
        // Return simple array for backward compatibility
        res.json(uploads);
      }
    } catch (error: any) {
      console.error('Get uploader uploads error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Bulk delete uploader files (soft-delete with audit logging)
  app.delete("/api/uploader/bulk-delete", isAuthenticated, async (req, res) => {
    try {
      const { uploadIds } = req.body;
      const username = (req.user as any)?.username || 'unknown';
      const timestamp = new Date().toISOString();
      
      if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({ error: "Invalid request: uploadIds must be a non-empty array" });
      }
      
      console.log(`[UPLOADER-DELETE] ============================================`);
      console.log(`[UPLOADER-DELETE] Soft-delete request initiated`);
      console.log(`[UPLOADER-DELETE] User: ${username}`);
      console.log(`[UPLOADER-DELETE] Timestamp: ${timestamp}`);
      console.log(`[UPLOADER-DELETE] File count: ${uploadIds.length}`);
      console.log(`[UPLOADER-DELETE] Upload IDs:`, uploadIds);
      
      const result = await storage.deleteUploaderUploads(uploadIds, username);
      
      console.log(`[UPLOADER-DELETE] ============================================`);
      console.log(`[UPLOADER-DELETE] Soft-delete completed successfully`);
      console.log(`[UPLOADER-DELETE] Files deleted: ${result.deletedFiles.length}`);
      
      // Log each deleted file with details
      result.deletedFiles.forEach((file, index) => {
        console.log(`[UPLOADER-DELETE] File ${index + 1}:`);
        console.log(`[UPLOADER-DELETE]   - Filename: ${file.filename}`);
        console.log(`[UPLOADER-DELETE]   - Upload ID: ${file.id}`);
        console.log(`[UPLOADER-DELETE]   - Size: ${(file.fileSize / 1024).toFixed(2)} KB`);
        console.log(`[UPLOADER-DELETE]   - BH Records: ${file.recordCounts.bh}`);
        console.log(`[UPLOADER-DELETE]   - DT Records: ${file.recordCounts.dt}`);
        console.log(`[UPLOADER-DELETE]   - Other Records: ${file.recordCounts.other}`);
      });
      
      console.log(`[UPLOADER-DELETE] Audit logs created: ${result.deletedFiles.length} entries`);
      console.log(`[UPLOADER-DELETE] ============================================`);
      
      res.json({ 
        success: true, 
        message: `Successfully deleted ${result.deletedFiles.length} file(s)`,
        deletedCount: result.deletedFiles.length,
        deletedFiles: result.deletedFiles.map(f => ({
          id: f.id,
          filename: f.filename
        }))
      });
    } catch (error: any) {
      console.error('[UPLOADER-DELETE] ERROR during bulk delete:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Start upload - Create database record and generate storage key
  app.post("/api/uploader/start", isAuthenticatedOrApiKey, async (req, res) => {
    try {
      const { filename, fileSize, sessionId, keep = false } = req.body;
      const uploadId = `uploader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Import Replit Storage Service
      const { ReplitStorageService } = await import('./replit-storage-service');
      
      // Check Replit Object Storage configuration
      if (!ReplitStorageService.isConfigured()) {
        return res.status(500).json({ 
          error: 'Replit Object Storage not available.',
          configStatus: ReplitStorageService.getConfigStatus()
        });
      }
      
      // Generate storage key for upload
      const storageKey = ReplitStorageService.generateUploadKey(filename, uploadId);
      
      const upload = await storage.createUploaderUpload({
        id: uploadId,
        filename,
        fileSize: fileSize,
        storagePath: storageKey,
        s3Bucket: 'mms-uploader-files',
        s3Key: storageKey,
        createdBy: (req.user as any)?.username || 'unknown',
        sessionId: sessionId,
        serverId: process.env.HOSTNAME || 'unknown',
        keepForReview: keep
      });
      
      console.log(`[UPLOADER-REPLIT] Started upload: ${upload.id} for ${filename} with key: ${storageKey}`);
      
      res.json({
        ...upload,
        storageKey: storageKey
      });
    } catch (error: any) {
      console.error('Start Replit upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload file content to Replit Object Storage
  app.post("/api/uploader/:id/upload", isAuthenticatedOrApiKey, upload.single('file'), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const uploadRecord = await storage.getUploaderUploadById(id);
      if (!uploadRecord) {
        return res.status(404).json({ error: "Upload record not found" });
      }
      
      // Import Replit Storage Service
      const { ReplitStorageService } = await import('./replit-storage-service');
      
      // Use file buffer from memory storage
      const fileBuffer = req.file.buffer;
      console.log(`[UPLOADER-REPLIT] Uploading file: ${req.file.originalname} (${fileBuffer.length} bytes)`);
      
      // Update to uploading phase
      await storage.updateUploaderUpload(id, {
        currentPhase: 'uploading',
        uploadStartedAt: new Date(),
        uploadProgress: 0
      });
      
      // Upload to Replit Object Storage
      const uploadResult = await ReplitStorageService.uploadFile(
        fileBuffer,
        uploadRecord.filename,
        id,
        req.file.mimetype
      );
      
      // Extract comprehensive file metadata
      const fileContent = fileBuffer.toString('utf-8');
      const lines = fileContent.split('\n');
      const lineCount = lines.length;
      const actualFileSize = fileBuffer.length;
      const hasHeaders = lines.length > 0 && lines[0].includes(',') || lines[0].includes('\t');
      
      // Detect file format
      let fileFormat = 'text';
      if (uploadRecord.filename.toLowerCase().endsWith('.csv')) fileFormat = 'csv';
      else if (uploadRecord.filename.toLowerCase().endsWith('.tsv')) fileFormat = 'tsv';
      else if (uploadRecord.filename.toLowerCase().endsWith('.json')) fileFormat = 'json';
      else if (uploadRecord.filename.toLowerCase().endsWith('.tsyso')) fileFormat = 'tddf';
      
      // Update database with comprehensive metadata
      await storage.updateUploaderUpload(id, {
        currentPhase: 'uploaded',
        uploadProgress: 100,
        uploadedAt: new Date(),
        storagePath: uploadResult.key,
        s3Bucket: uploadResult.bucket,
        s3Key: uploadResult.key,
        s3Url: uploadResult.url,
        s3Etag: uploadResult.etag,
        fileSize: actualFileSize,
        lineCount: lineCount,
        dataSize: actualFileSize,
        hasHeaders: hasHeaders,
        fileFormat: fileFormat,
        encodingDetected: 'utf-8',
        processingNotes: JSON.stringify({
          uploaded: true,
          storageKey: uploadResult.key,
          storageBucket: uploadResult.bucket,
          uploadedAt: new Date().toISOString()
        })
      });
      
      console.log(`[UPLOADER-REPLIT] Successfully uploaded: ${id} to ${uploadResult.key}`);
      
      res.json({ 
        success: true,
        message: "File uploaded to Replit Object Storage successfully",
        uploadResult,
        lineCount,
        fileSize: uploadResult.size
      });
    } catch (error: any) {
      console.error('Replit storage upload error:', error);
      
      // Update upload record with error
      const { id } = req.params;
      await storage.updateUploaderUpload(id, {
        currentPhase: 'warning',
        processingNotes: JSON.stringify({
          error: true,
          message: error.message,
          failedAt: new Date().toISOString()
        })
      });
      
      res.status(500).json({ error: error.message });
    }
  });

  // Chunked upload endpoint for large files (>25MB)
  app.post("/api/uploader/:id/upload-chunk", isAuthenticatedOrApiKey, upload.single('chunk'), async (req, res) => {
    try {
      const { id } = req.params;
      const { chunkIndex, totalChunks } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: "No chunk uploaded" });
      }
      
      if (chunkIndex === undefined || totalChunks === undefined) {
        return res.status(400).json({ error: "Missing chunk metadata (chunkIndex, totalChunks)" });
      }
      
      const uploadRecord = await storage.getUploaderUploadById(id);
      if (!uploadRecord) {
        return res.status(404).json({ error: "Upload record not found" });
      }
      
      const chunkIndexNum = parseInt(chunkIndex);
      const totalChunksNum = parseInt(totalChunks);
      
      // Create temp directory for chunks if it doesn't exist
      const tempDir = path.join(os.tmpdir(), 'mms-chunks', id);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Clean up stale chunk directories (>6 hours old) to prevent disk exhaustion from abandoned uploads
      // Excludes the current upload to avoid deleting active chunks
      try {
        const chunksParentDir = path.join(os.tmpdir(), 'mms-chunks');
        if (fs.existsSync(chunksParentDir)) {
          const uploadDirs = fs.readdirSync(chunksParentDir);
          const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000); // 6 hours for slow networks
          
          for (const dir of uploadDirs) {
            // Skip current upload directory
            if (dir === id) {
              continue;
            }
            
            const dirPath = path.join(chunksParentDir, dir);
            try {
              const stats = fs.statSync(dirPath);
              if (stats.isDirectory() && stats.mtimeMs < sixHoursAgo) {
                // Check if upload exists and is truly abandoned
                const oldUpload = await storage.getUploaderUploadById(dir);
                
                // Remove if:
                // 1. Upload record doesn't exist, OR
                // 2. Upload is not in uploading phase (completed/failed/etc), OR
                // 3. Upload has been in uploading phase for >6 hours (abandoned mid-stream)
                const shouldCleanup = !oldUpload || 
                  oldUpload.currentPhase !== 'uploading' ||
                  (oldUpload.uploadStartedAt && 
                   (Date.now() - new Date(oldUpload.uploadStartedAt).getTime()) > (6 * 60 * 60 * 1000));
                
                if (shouldCleanup) {
                  fs.rmSync(dirPath, { recursive: true, force: true });
                  console.log(`[CHUNKED-UPLOAD] Cleaned up stale chunk directory: ${dir} (abandoned: ${!oldUpload ? 'no record' : oldUpload.currentPhase !== 'uploading' ? 'completed/failed' : 'timeout'})`);
                }
              }
            } catch (statError) {
              // Ignore errors reading individual directories
            }
          }
        }
      } catch (cleanupError) {
        // Don't fail the upload if cleanup fails
        console.error(`[CHUNKED-UPLOAD] Stale directory cleanup error:`, cleanupError);
      }
      
      // Save chunk to temp file
      const chunkPath = path.join(tempDir, `chunk-${chunkIndexNum}`);
      fs.writeFileSync(chunkPath, req.file.buffer);
      
      console.log(`[CHUNKED-UPLOAD] Received chunk ${chunkIndexNum + 1}/${totalChunksNum} for upload ${id} (${req.file.buffer.length} bytes)`);
      
      // Update chunk progress in database
      const chunksUploaded = chunkIndexNum + 1;
      const uploadProgress = Math.round((chunksUploaded / totalChunksNum) * 100);
      
      await storage.updateUploaderUpload(id, {
        currentPhase: 'uploading',
        chunkedUpload: true,
        chunkCount: totalChunksNum,
        chunksUploaded: chunksUploaded,
        uploadProgress: uploadProgress,
        uploadStartedAt: uploadRecord.uploadStartedAt || new Date()
      });
      
      // Check if all chunks have been uploaded
      const uploadedChunks = fs.readdirSync(tempDir).filter(f => f.startsWith('chunk-'));
      
      if (uploadedChunks.length === totalChunksNum) {
        console.log(`[CHUNKED-UPLOAD] All ${totalChunksNum} chunks received for upload ${id}. Reassembling...`);
        
        // Reassemble chunks in correct order
        const chunks: Buffer[] = [];
        for (let i = 0; i < totalChunksNum; i++) {
          const chunkFilePath = path.join(tempDir, `chunk-${i}`);
          const chunkBuffer = fs.readFileSync(chunkFilePath);
          chunks.push(chunkBuffer);
        }
        
        const completeFileBuffer = Buffer.concat(chunks);
        console.log(`[CHUNKED-UPLOAD] Reassembled file: ${completeFileBuffer.length} bytes`);
        
        // Upload to Replit Object Storage
        await storage.updateUploaderUpload(id, {
          uploadProgress: 100,
          currentPhase: 'uploading',
          processingNotes: JSON.stringify({
            status: 'Uploading to object storage...',
            chunksReassembled: true
          })
        });
        
        const { ReplitStorageService } = await import('./replit-storage-service');
        const uploadResult = await ReplitStorageService.uploadFile(
          completeFileBuffer,
          uploadRecord.filename,
          id,
          'application/octet-stream'
        );
        
        // Extract file metadata
        const fileContent = completeFileBuffer.toString('utf-8');
        const lines = fileContent.split('\n');
        const lineCount = lines.length;
        const actualFileSize = completeFileBuffer.length;
        const hasHeaders = lines.length > 0 && (lines[0].includes(',') || lines[0].includes('\t'));
        
        // Detect file format
        let fileFormat = 'text';
        if (uploadRecord.filename.toLowerCase().endsWith('.csv')) fileFormat = 'csv';
        else if (uploadRecord.filename.toLowerCase().endsWith('.tsv')) fileFormat = 'tsv';
        else if (uploadRecord.filename.toLowerCase().endsWith('.json')) fileFormat = 'json';
        else if (uploadRecord.filename.toLowerCase().endsWith('.tsyso')) fileFormat = 'tddf';
        
        // Update database with final metadata
        await storage.updateUploaderUpload(id, {
          currentPhase: 'uploaded',
          uploadProgress: 100,
          uploadedAt: new Date(),
          storagePath: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          s3Key: uploadResult.key,
          s3Url: uploadResult.url,
          s3Etag: uploadResult.etag,
          fileSize: actualFileSize,
          lineCount: lineCount,
          dataSize: actualFileSize,
          hasHeaders: hasHeaders,
          fileFormat: fileFormat,
          encodingDetected: 'utf-8',
          processingNotes: JSON.stringify({
            uploaded: true,
            chunkedUpload: true,
            totalChunks: totalChunksNum,
            storageKey: uploadResult.key,
            storageBucket: uploadResult.bucket,
            uploadedAt: new Date().toISOString()
          })
        });
        
        // Clean up temp chunks
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(`[CHUNKED-UPLOAD] Cleaned up temp directory: ${tempDir}`);
        } catch (cleanupError) {
          console.error(`[CHUNKED-UPLOAD] Failed to clean up temp directory:`, cleanupError);
        }
        
        console.log(`[CHUNKED-UPLOAD] Successfully uploaded chunked file ${id} to ${uploadResult.key}`);
        
        return res.json({
          success: true,
          complete: true,
          message: "All chunks received and file uploaded successfully",
          uploadResult,
          lineCount,
          fileSize: uploadResult.size,
          chunksReceived: totalChunksNum
        });
      } else {
        // Not all chunks received yet
        return res.json({
          success: true,
          complete: false,
          message: `Chunk ${chunkIndexNum + 1}/${totalChunksNum} received`,
          chunksReceived: uploadedChunks.length,
          totalChunks: totalChunksNum,
          uploadProgress: uploadProgress
        });
      }
      
    } catch (error: any) {
      console.error('Chunked upload error:', error);
      
      // Update upload record with error
      const { id } = req.params;
      try {
        await storage.updateUploaderUpload(id, {
          currentPhase: 'warning',
          processingNotes: JSON.stringify({
            error: true,
            message: error.message,
            failedAt: new Date().toISOString(),
            chunkedUploadFailed: true
          })
        });
      } catch (updateError) {
        console.error('Failed to update upload record with error:', updateError);
      }
      
      // Clean up temp chunks on error
      try {
        const tempDir = path.join(os.tmpdir(), 'mms-chunks', id);
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error('Failed to clean up temp chunks on error:', cleanupError);
      }
      
      res.status(500).json({ error: error.message });
    }
  });

  // Manual identification endpoint for progressing uploaded files (Step 4)
  app.post("/api/uploader/manual-identify", isAuthenticated, async (req, res) => {
    console.log("[MANUAL-IDENTIFY-DEBUG] API endpoint reached with body:", req.body);
    try {
      const { uploadIds } = req.body;
      
      if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "uploadIds must be a non-empty array"
        });
      }
      
      console.log(`[MANUAL-IDENTIFY] Adding ${uploadIds.length} files to manual processing queue`);
      
      // Get MMS Watcher instance to add files to manual queue
      const mmsWatcher = req.app.locals.mmsWatcher;
      if (!mmsWatcher) {
        return res.status(500).json({
          success: false,
          error: 'MMS Watcher service not available'
        });
      }

      // Validate files are in correct phase before adding to queue
      const validFiles = [];
      const errors = [];
      
      for (const uploadId of uploadIds) {
        try {
          const upload = await storage.getUploaderUploadById(uploadId);
          if (!upload) {
            errors.push({ uploadId, error: "Upload not found" });
            continue;
          }
          
          if (upload.currentPhase !== 'uploaded') {
            errors.push({ 
              uploadId, 
              error: `File is in '${upload.currentPhase}' phase, only 'uploaded' files can be identified` 
            });
            continue;
          }
          
          validFiles.push({ uploadId, filename: upload.filename });
          
        } catch (error) {
          console.error(`[MANUAL-IDENTIFY] Error validating ${uploadId}:`, error);
          errors.push({ 
            uploadId, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      // Add valid files to manual processing queue
      if (validFiles.length > 0) {
        const validUploadIds = validFiles.map(f => f.uploadId);
        mmsWatcher.addToManualQueue(validUploadIds);
      }
      
      console.log(`[MANUAL-IDENTIFY] Added ${validFiles.length} files to manual queue, ${errors.length} validation errors`);
      
      res.json({
        success: true,
        processedCount: uploadIds.length,
        successCount: validFiles.length,
        errorCount: errors.length,
        validFiles,
        errors,
        queueStatus: mmsWatcher.getManualQueueStatus(),
        message: `Added ${validFiles.length} file(s) to manual processing queue, ${errors.length} errors`,
        note: 'Files will be processed by MMS Watcher within 15 seconds'
      });
      
    } catch (error) {
      console.error("[MANUAL-IDENTIFY] Error in manual identification:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Manual encoding endpoint for identified files (Step 5)
  app.post("/api/uploader/manual-encode", isAuthenticated, async (req, res) => {
    console.log("[MANUAL-ENCODE-DEBUG] API endpoint reached with body:", req.body);
    try {
      const { uploadIds } = req.body;
      
      if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "uploadIds must be a non-empty array"
        });
      }
      
      console.log(`[MANUAL-ENCODE] Processing ${uploadIds.length} files`);

      // Get MMS Watcher instance
      const mmsWatcher = req.app.locals.mmsWatcher;
      if (!mmsWatcher) {
        return res.status(500).json({
          success: false,
          error: 'MMS Watcher service not available'
        });
      }

      // Validate files are ready for encoding
      const validFiles = [];
      const errors = [];
      
      for (const uploadId of uploadIds) {
        try {
          const upload = await storage.getUploaderUploadById(uploadId);
          if (!upload) {
            errors.push({ uploadId, error: "Upload not found" });
            continue;
          }
          
          if (upload.currentPhase !== 'identified') {
            errors.push({ 
              uploadId, 
              error: `File is in '${upload.currentPhase}' phase, only 'identified' files can be encoded` 
            });
            continue;
          }

          validFiles.push({ uploadId, filename: upload.filename });
          
        } catch (error) {
          console.error(`[MANUAL-ENCODE] Error validating ${uploadId}:`, error);
          errors.push({ 
            uploadId, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      // Add valid files to manual encode queue
      if (validFiles.length > 0) {
        const validUploadIds = validFiles.map(f => f.uploadId);
        mmsWatcher.addToManualQueue(validUploadIds);
      }
      
      console.log(`[MANUAL-ENCODE] Added ${validFiles.length} files to encode queue, ${errors.length} validation errors`);
      
      res.json({
        success: true,
        processedCount: uploadIds.length,
        successCount: validFiles.length,
        errorCount: errors.length,
        validFiles,
        errors,
        queueStatus: mmsWatcher.getManualQueueStatus(),
        message: `Added ${validFiles.length} file(s) to manual encoding queue, ${errors.length} errors`
      });
      
    } catch (error) {
      console.error("[MANUAL-ENCODE] Error in manual encoding:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Import TDDF encoders
  const { processAllRecordsToMasterTable } = await import("./tddf-json-encoder");
  const { ReplitStorageService } = await import('./replit-storage-service');

  // Manual Step 7 Archive endpoint for completed files
  app.post("/api/uploader/manual-step7-archive", isAuthenticated, async (req, res) => {
    console.log("[MANUAL-STEP7] API endpoint reached with body:", req.body);
    try {
      const { uploadIds } = req.body;
      
      if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "uploadIds must be a non-empty array"
        });
      }
      
      console.log(`[MANUAL-STEP7] Processing ${uploadIds.length} files for manual archiving`);

      // Validate files are ready for archiving
      const validFiles = [];
      const errors = [];
      
      for (const uploadId of uploadIds) {
        try {
          const upload = await storage.getUploaderUploadById(uploadId);
          if (!upload) {
            errors.push({ uploadId, error: "Upload not found" });
            continue;
          }
          
          if (upload.currentPhase !== 'completed') {
            errors.push({ 
              uploadId, 
              error: `File is in '${upload.currentPhase}' phase, only 'completed' files can be archived` 
            });
            continue;
          }

          validFiles.push({ uploadId, filename: upload.filename });
          
        } catch (error) {
          console.error(`[MANUAL-STEP7] Error validating ${uploadId}:`, error);
          errors.push({ 
            uploadId, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
        }
      }

      if (validFiles.length === 0) {
        return res.json({
          success: false,
          processedCount: uploadIds.length,
          successCount: 0,
          errorCount: errors.length,
          validFiles: [],
          errors,
          message: `No valid completed files found for archiving. ${errors.length} errors.`
        });
      }

      // Simply mark files as archived using flags
      const username = (req.user as any)?.username || 'system';
      const validUploadIds = validFiles.map(f => f.uploadId);
      
      // Update archive flags for all valid files in one query
      const updateQuery = `
        UPDATE ${getTableName('uploader_uploads')}
        SET 
          is_archived = true,
          archived_at = NOW(),
          archived_by = $1
        WHERE id = ANY($2)
        RETURNING id, filename
      `;
      
      const result = await pool.query(updateQuery, [username, validUploadIds]);
      const archivedFiles = result.rows;
      
      console.log(`[MANUAL-STEP7] Marked ${archivedFiles.length} file(s) as archived`)
      
      console.log(`[MANUAL-STEP7] Completed: ${archivedFiles.length} archived, ${errors.length} errors`);
      
      res.json({
        success: true,
        processedCount: uploadIds.length,
        successCount: archivedFiles.length,
        errorCount: errors.length,
        archivedFiles,
        errors,
        message: `Marked ${archivedFiles.length} file(s) as archived, ${errors.length} errors`
      });
      
    } catch (error) {
      console.error("[MANUAL-STEP7] Error in manual archiving:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Restore archived files endpoint
  app.post("/api/uploader/restore-archived", isAuthenticated, async (req, res) => {
    console.log("[RESTORE-ARCHIVED] API endpoint reached with body:", req.body);
    try {
      const { uploadIds } = req.body;
      
      if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "uploadIds must be a non-empty array"
        });
      }
      
      console.log(`[RESTORE-ARCHIVED] Restoring ${uploadIds.length} archived files`);

      const username = (req.user as any)?.username || 'system';
      
      // Update archive flags to restore files
      const updateQuery = `
        UPDATE ${getTableName('uploader_uploads')}
        SET 
          is_archived = false,
          archived_at = NULL,
          archived_by = NULL
        WHERE id = ANY($1) AND is_archived = true
        RETURNING id, filename
      `;
      
      const result = await pool.query(updateQuery, [uploadIds]);
      const restoredFiles = result.rows;
      
      console.log(`[RESTORE-ARCHIVED] Restored ${restoredFiles.length} file(s) to active processing`);
      
      res.json({
        success: true,
        processedCount: uploadIds.length,
        successCount: restoredFiles.length,
        restoredFiles,
        message: `Restored ${restoredFiles.length} file(s) to active processing`
      });
      
    } catch (error) {
      console.error("[RESTORE-ARCHIVED] Error restoring archived files:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Set previous level endpoint - reset files from encoded/identified back to uploaded phase
  app.post("/api/uploader/set-previous-level", isAuthenticated, async (req, res) => {
    console.log("[SET-PREVIOUS-LEVEL] API endpoint reached with body:", req.body);
    try {
      const { uploadIds } = req.body;
      
      if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "uploadIds must be a non-empty array"
        });
      }
      
      console.log(`[SET-PREVIOUS-LEVEL] Resetting ${uploadIds.length} files to uploaded phase`);
      
      const result = await storage.setPreviousLevel(uploadIds);
      
      console.log(`[SET-PREVIOUS-LEVEL] Successfully reset ${result.updatedCount} file(s) to uploaded phase`);
      
      res.json({
        success: result.success,
        updatedCount: result.updatedCount,
        errors: result.errors,
        message: `Successfully moved ${result.updatedCount} file(s) to previous level${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`
      });
      
    } catch (error) {
      console.error("[SET-PREVIOUS-LEVEL] Error setting previous level:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Individual file encoding endpoint (Step 5)
  app.post("/api/uploader/:id/encode", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { strategy = 'tddf1' } = req.body;
      
      const upload = await storage.getUploaderUploadById(id);
      if (!upload) {
        return res.status(404).json({ error: "Upload not found" });
      }
      
      if (upload.currentPhase !== 'identified') {
        return res.status(400).json({ 
          error: `File must be in 'identified' phase for encoding. Current phase: ${upload.currentPhase}` 
        });
      }
      
      if (upload.finalFileType !== 'tddf') {
        return res.status(400).json({ 
          error: `Only TDDF files supported for encoding. File type: ${upload.finalFileType}` 
        });
      }
      
      console.log(`[INDIVIDUAL-ENCODE] Adding file ${id} to manual queue for TDDF1 processing`);
      
      // Get MMS Watcher instance
      const mmsWatcher = req.app.locals.mmsWatcher;
      if (!mmsWatcher) {
        return res.status(500).json({
          error: 'MMS Watcher service not available'
        });
      }

      // Add file to manual queue
      mmsWatcher.addToManualQueue([id]);
      
      // Update processing notes
      await storage.updateUploaderUpload(id, {
        processingNotes: JSON.stringify({
          manualEncodingTriggered: new Date().toISOString(),
          triggerMethod: 'individual_encode_button',
          strategy: strategy,
          addedToManualQueue: true
        })
      });
      
      res.json({
        uploadId: id,
        filename: upload.filename,
        strategy: strategy,
        status: 'queued',
        progress: 0,
        message: `File added to TDDF1 manual processing queue. Processing will complete within 15 seconds.`,
        queueStatus: mmsWatcher.getManualQueueStatus()
      });
    } catch (error: any) {
      console.error('Single file encoding error:', error);
      res.status(500).json({ 
        error: error.message || 'Unknown encoding error',
        uploadId: req.params.id
      });
    }
  });

  // Auto 4-5 Toggle Control API endpoints
  app.get("/api/mms-watcher/auto45-status", isAuthenticated, async (req, res) => {
    try {
      console.log("[AUTO45-API] Getting Auto 4-5 processing status...");
      
      const mmsWatcher = getMmsWatcherInstance();
      if (!mmsWatcher) {
        return res.status(503).json({
          success: false,
          error: "MMS Watcher service not available"
        });
      }
      
      const status = mmsWatcher.getAuto45Status();
      
      res.json({
        success: true,
        enabled: status.enabled,
        status: status.status,
        message: `Auto 4-5 processing is currently ${status.status}`
      });
    } catch (error) {
      console.error("[AUTO45-API] Error getting Auto 4-5 status:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to get Auto 4-5 status" 
      });
    }
  });

  app.post("/api/mms-watcher/auto45-toggle", isAuthenticated, async (req, res) => {
    try {
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: "Invalid enabled parameter - must be boolean"
        });
      }
      
      console.log(`[AUTO45-API] Setting Auto 4-5 processing to: ${enabled}`);
      
      const mmsWatcher = getMmsWatcherInstance();
      if (!mmsWatcher) {
        return res.status(503).json({
          success: false,
          error: "MMS Watcher service not available"
        });
      }
      
      mmsWatcher.setAuto45Enabled(enabled);
      const status = mmsWatcher.getAuto45Status();
      
      res.json({
        success: true,
        enabled: status.enabled,
        status: status.status,
        message: `Auto 4-5 processing ${enabled ? 'enabled' : 'disabled'} successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[AUTO45-API] Error toggling Auto 4-5:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to toggle Auto 4-5" 
      });
    }
  });

  // Auto Step 6 Setting endpoints
  app.get("/api/uploader/auto-step6-setting", isAuthenticated, async (req, res) => {
    try {
      console.log('[AUTO-STEP6] Fetching Auto Step 6 setting');
      
      const result = await db.execute(sql`
        SELECT setting_value FROM ${sql.identifier(getTableName('system_settings'))}
        WHERE setting_key = 'auto_step6_enabled'
      `);
      
      const enabled = result.rows.length > 0 ? result.rows[0].setting_value === 'true' : false;
      
      console.log(`[AUTO-STEP6] Current Auto Step 6 setting: ${enabled}`);
      
      res.json({
        autoStep6Enabled: enabled
      });
    } catch (error) {
      console.error('[AUTO-STEP6] Error fetching Auto Step 6 setting:', error);
      res.status(500).json({ error: 'Failed to fetch Auto Step 6 setting' });
    }
  });

  app.post("/api/uploader/auto-step6-setting", isAuthenticated, async (req, res) => {
    try {
      const { enabled } = req.body;
      const username = (req as any).user?.username || 'unknown';
      
      console.log(`[AUTO-STEP6] Updating Auto Step 6 setting to: ${enabled} (by: ${username})`);
      
      // Upsert the setting
      await db.execute(sql`
        INSERT INTO ${sql.identifier(getTableName('system_settings'))} (setting_key, setting_value, setting_type, description, last_updated_by)
        VALUES ('auto_step6_enabled', ${enabled ? 'true' : 'false'}, 'boolean', 'Enable automatic Step 6 JSON encoding for uploaded TDDF files', ${username})
        ON CONFLICT (setting_key)
        DO UPDATE SET 
          setting_value = ${enabled ? 'true' : 'false'},
          last_updated_by = ${username},
          updated_at = NOW()
      `);
      
      console.log(`[AUTO-STEP6] Successfully updated Auto Step 6 setting to: ${enabled}`);
      
      res.json({
        success: true,
        autoStep6Enabled: enabled,
        message: `Auto Step 6 processing ${enabled ? 'enabled' : 'disabled'}`
      });
    } catch (error) {
      console.error('[AUTO-STEP6] Error saving Auto Step 6 setting:', error);
      res.status(500).json({ error: 'Failed to save Auto Step 6 setting' });
    }
  });

  // Auto Step 7 Setting endpoints
  app.get("/api/uploader/auto-step7-setting", isAuthenticated, async (req, res) => {
    try {
      console.log('[AUTO-STEP7] Fetching Auto Step 7 setting');
      
      const result = await db.execute(sql`
        SELECT setting_value FROM ${sql.identifier(getTableName('system_settings'))}
        WHERE setting_key = 'auto_step7_enabled'
      `);
      
      const enabled = result.rows.length > 0 ? result.rows[0].setting_value === 'true' : false;
      
      console.log(`[AUTO-STEP7] Current Auto Step 7 setting: ${enabled}`);
      
      res.json({
        autoStep7Enabled: enabled
      });
    } catch (error) {
      console.error('[AUTO-STEP7] Error fetching Auto Step 7 setting:', error);
      res.status(500).json({ error: 'Failed to fetch Auto Step 7 setting' });
    }
  });

  app.post("/api/uploader/auto-step7-setting", isAuthenticated, async (req, res) => {
    try {
      const { enabled } = req.body;
      const username = (req as any).user?.username || 'unknown';
      
      console.log(`[AUTO-STEP7] Updating Auto Step 7 setting to: ${enabled} (by: ${username})`);
      
      // Upsert the setting
      await db.execute(sql`
        INSERT INTO ${sql.identifier(getTableName('system_settings'))} (setting_key, setting_value, setting_type, description, last_updated_by)
        VALUES ('auto_step7_enabled', ${enabled ? 'true' : 'false'}, 'boolean', 'Enable automatic Step 7 archiving for completed TDDF files', ${username})
        ON CONFLICT (setting_key)
        DO UPDATE SET 
          setting_value = ${enabled ? 'true' : 'false'},
          last_updated_by = ${username},
          updated_at = NOW()
      `);
      
      console.log(`[AUTO-STEP7] Successfully updated Auto Step 7 setting to: ${enabled}`);
      
      res.json({
        success: true,
        autoStep7Enabled: enabled,
        message: `Auto Step 7 archiving ${enabled ? 'enabled' : 'disabled'}`
      });
    } catch (error) {
      console.error('[AUTO-STEP7] Error saving Auto Step 7 setting:', error);
      res.status(500).json({ error: 'Failed to save Auto Step 7 setting' });
    }
  });

  // Step 6 Processing endpoint - processes ALL records to master tddfJsonb table
  app.post("/api/uploader/step6-processing", isAuthenticated, async (req, res) => {
    console.log("[STEP-6-PROCESSING] API endpoint reached with body:", req.body);
    try {
      const { uploadIds } = req.body;
      
      if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "uploadIds must be a non-empty array"
        });
      }
      
      console.log(`[STEP-6-PROCESSING] Processing ${uploadIds.length} files for full JSON encoding to master table`);

      const results = [];
      const errors = [];
      
      for (const uploadId of uploadIds) {
        try {
          const upload = await storage.getUploaderUploadById(uploadId);
          if (!upload) {
            errors.push({ uploadId, error: "Upload not found" });
            continue;
          }
          
          // Accept both 'encoded' and 'completed' phases for Step 6 processing
          if (upload.currentPhase !== 'encoded' && upload.currentPhase !== 'completed') {
            errors.push({ 
              uploadId, 
              error: `File is in '${upload.currentPhase}' phase, only 'encoded' or 'completed' files can undergo Step 6 processing` 
            });
            continue;
          }

          console.log(`[STEP-6-PROCESSING] Processing file: ${upload.filename} - ALL records to master table`);
          
          // Update phase to processing for Step 6
          await storage.updateUploaderUpload(uploadId, {
            currentPhase: 'processing',
            lastUpdated: new Date()
          });

          // Get storage key
          let storageKey = upload.s3Key;
          if (!storageKey) {
            // Generate storage key for older uploads
            const timestampMatch = upload.id.match(/uploader_(\d+)_/);
            let uploadDate;
            
            if (timestampMatch) {
              const timestamp = parseInt(timestampMatch[1]);
              uploadDate = new Date(timestamp).toISOString().split('T')[0];
            } else {
              uploadDate = new Date(upload.createdAt).toISOString().split('T')[0];
            }
            
            storageKey = `dev-uploader/${uploadDate}/${upload.id}/${upload.filename}`;
            
            await storage.updateUploaderUpload(uploadId, {
              s3Key: storageKey
            });
          }
          
          console.log(`[STEP-6-PROCESSING] Using storage key: ${storageKey}`);
          
          // Get file content from storage
          const fileContent = await ReplitStorageService.getFileContent(storageKey);
          
          // Process ALL records to master tddfJsonb table (Step 6 processing)
          const step6Result = await processAllRecordsToMasterTable(fileContent, upload);
          
          // CRITICAL: Only TDDF files reach 'completed' phase
          const finalPhase = upload.finalFileType === 'merchant_detail' ? 'encoded' : 'completed';
          
          await storage.updateUploaderUpload(uploadId, {
            currentPhase: finalPhase,
            lastUpdated: new Date()
          });
          
          console.log(`[STEP-6-PROCESSING] File ${upload.filename} final phase: ${finalPhase} (type: ${upload.finalFileType})`);

          results.push({
            uploadId,
            filename: upload.filename,
            status: 'completed',
            totalRecordsProcessed: step6Result.totalRecords,
            masterTableRecords: step6Result.masterRecords,
            apiRecordsProcessed: step6Result.apiRecords
          });
          
          console.log(`[STEP-6-PROCESSING] Successfully processed ${upload.filename}: ${step6Result.totalRecords} total records to master table`);
          
        } catch (error) {
          console.error(`[STEP-6-PROCESSING] Error processing ${uploadId}:`, error);
          errors.push({
            uploadId,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
      
      res.json({
        success: true,
        processedCount: uploadIds.length,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
        message: `Step 6 processing completed: ${results.length} file(s) processed to master table, ${errors.length} errors`
      });
      
    } catch (error) {
      console.error("[STEP-6-PROCESSING] Error in Step 6 processing:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Get file content from Replit Object Storage (for preview)
  app.get("/api/uploader/:id/content", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const upload = await storage.getUploaderUploadById(id);
      
      if (!upload) {
        return res.status(404).json({ error: "Upload not found" });
      }

      // Only allow content viewing for uploaded files and beyond
      if (!['uploaded', 'identified', 'encoding', 'encoded', 'processing', 'completed', 'error'].includes(upload.currentPhase || '')) {
        return res.status(400).json({ error: "File content not available at this stage" });
      }

      // Get content from Replit Object Storage
      if (!upload.s3Key || !upload.s3Bucket) {
        return res.status(404).json({ error: "Storage file location not found" });
      }

      const { ReplitStorageService } = await import('./replit-storage-service');
      
      // Retrieve file content from Replit Object Storage
      const fileBuffer = await ReplitStorageService.getFileContent(upload.s3Key);
      const fileContent = fileBuffer.toString('utf-8');
      const lines = fileContent.split('\n');
      
      // Create preview (first 50 lines)
      const preview = lines.slice(0, 50).join('\n');
      
      console.log(`[UPLOADER-REPLIT] Retrieved content for upload ${id}: ${lines.length} lines from Replit Storage`);
      
      res.json({
        content: fileContent,
        preview: preview,
        lineCount: lines.length,
        fileSize: fileBuffer.length,
        storageKey: upload.s3Key,
        storageUrl: upload.s3Url
      });
    } catch (error: any) {
      console.error('Get Replit storage file content error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get JSONB data for a specific upload (backward compatibility)
  app.get("/api/uploader/:id/jsonb-data", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = '50', offset = '0', recordType, merchantName, merchantAccountNumber } = req.query;
      
      const tableName = getTableName('uploader_tddf_jsonb_records');
      
      // Build the main query
      let query = `
        SELECT 
          id, upload_id, record_type, line_number, raw_line,
          record_data, record_identifier, field_count, created_at
        FROM ${tableName} 
        WHERE upload_id = $1
      `;
      
      const params = [id];
      let paramIndex = 2;
      
      if (recordType && recordType !== 'all') {
        query += ` AND record_type = $${paramIndex}`;
        params.push(recordType as string);
        paramIndex++;
      }
      
      // Add merchant name search (search in JSON fields)
      if (merchantName) {
        query += ` AND (
          record_data->>'merchantAccountNumber' ILIKE $${paramIndex}
          OR record_data->'extractedFields'->>'merchantAccountNumber' ILIKE $${paramIndex + 1}
          OR record_data->'extractedFields'->>'merchantName' ILIKE $${paramIndex + 2}
          OR raw_line ILIKE $${paramIndex + 3}
        )`;
        const searchPattern = `%${merchantName}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        paramIndex += 4;
      }
      
      // Add merchant account number search  
      if (merchantAccountNumber) {
        query += ` AND (
          record_data->>'merchantAccountNumber' ILIKE $${paramIndex}
          OR record_data->'extractedFields'->>'merchantAccountNumber' ILIKE $${paramIndex + 1}
        )`;
        const accountPattern = `%${merchantAccountNumber}%`;
        params.push(accountPattern, accountPattern);
        paramIndex += 2;
      }
      
      // Add count query for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM ${tableName} 
        WHERE upload_id = $1
      `;
      const countParams = [id];
      let countParamIndex = 2;
      
      if (recordType && recordType !== 'all') {
        countQuery += ` AND record_type = $${countParamIndex}`;
        countParams.push(recordType as string);
        countParamIndex++;
      }
      
      if (merchantName) {
        countQuery += ` AND (
          record_data->>'merchantAccountNumber' ILIKE $${countParamIndex}
          OR record_data->'extractedFields'->>'merchantAccountNumber' ILIKE $${countParamIndex + 1}
          OR record_data->'extractedFields'->>'merchantName' ILIKE $${countParamIndex + 2}
          OR raw_line ILIKE $${countParamIndex + 3}
        )`;
        const searchPattern = `%${merchantName}%`;
        countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        countParamIndex += 4;
      }
      
      if (merchantAccountNumber) {
        countQuery += ` AND (
          record_data->>'merchantAccountNumber' ILIKE $${countParamIndex}
          OR record_data->'extractedFields'->>'merchantAccountNumber' ILIKE $${countParamIndex + 1}
        )`;
        const accountPattern = `%${merchantAccountNumber}%`;
        countParams.push(accountPattern, accountPattern);
        countParamIndex += 2;
      }
      
      query += ` ORDER BY id ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit as string, offset as string);
      
      const result = await pool.query(query, params);
      
      // Transform data to match expected JSON viewer format
      const transformedData = result.rows.map(row => {
        // Parse record_data if it's a string (from JSONB column)
        let recordData = {};
        try {
          if (typeof row.record_data === 'string') {
            recordData = JSON.parse(row.record_data);
          } else if (typeof row.record_data === 'object' && row.record_data !== null) {
            recordData = row.record_data;
          }
        } catch (parseError) {
          recordData = {};
        }
        
        // Extract the nested extractedFields if it exists
        let extractedFields = {};
        if (recordData.extractedFields && typeof recordData.extractedFields === 'object') {
          extractedFields = recordData.extractedFields;
        } else if (Object.keys(recordData).length > 0) {
          // If no nested extractedFields, use the recordData directly
          extractedFields = recordData;
        }
        
        // Extract merchant account number for direct access
        let merchantAccountNumber = null;
        if (extractedFields.merchantAccountNumber) {
          merchantAccountNumber = extractedFields.merchantAccountNumber;
        } else if (recordData.merchantAccountNumber) {
          merchantAccountNumber = recordData.merchantAccountNumber;
        }
        
        // Extract merchant name for direct access
        let merchantName = null;
        if (extractedFields.merchantName) {
          merchantName = extractedFields.merchantName;
        } else if (recordData.merchantName) {
          merchantName = recordData.merchantName;
        }
        
        return {
          id: row.id,
          upload_id: row.upload_id,
          filename: row.filename || 'Unknown',
          record_type: row.record_type,
          line_number: row.line_number || 0,
          raw_line: row.raw_line || '',
          extracted_fields: extractedFields,
          record_identifier: row.record_identifier || `${row.record_type}-${row.line_number}`,
          processing_time_ms: row.field_count || 0,
          created_at: row.created_at,
          // Direct access fields for easier frontend handling
          merchant_account_number: merchantAccountNumber,
          merchant_name: merchantName
        };
      });
      
      // Execute count query
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);
      
      // Get timing metadata from uploader uploads table
      let timingMetadata = null;
      try {
        const uploaderTableName = getTableName('uploader_uploads');
        const timingQuery = `
          SELECT processing_notes, created_at, updated_at
          FROM ${uploaderTableName}
          WHERE id = $1
        `;
        const timingResult = await pool.query(timingQuery, [id]);
        if (timingResult.rows.length > 0) {
          const notes = timingResult.rows[0].processing_notes;
          if (notes && typeof notes === 'object' && notes.encodingMetadata) {
            timingMetadata = {
              encodingStartTime: notes.encodingMetadata.timingData?.startTime,
              encodingFinishTime: notes.encodingMetadata.timingData?.finishTime,
              totalEncodingTimeMs: notes.encodingMetadata.encodingTimeMs,
              totalRecords: notes.encodingMetadata.totalRecords,
              recordTypeBreakdown: notes.encodingMetadata.recordCounts?.byType,
              batchPerformance: notes.encodingMetadata.timingData?.batchTimes
            };
          }
        }
      } catch (timingError) {
        console.log(`[JSONB-API] Could not fetch timing metadata: ${timingError.message}`);
      }
      
      res.json({
        data: transformedData,
        tableName: tableName,
        timingMetadata: timingMetadata,
        pagination: {
          total: total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: parseInt(offset as string) + parseInt(limit as string) < total
        }
      });
    } catch (error: any) {
      console.error('Get JSONB data error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get hierarchical JSONB data with batch-based pagination (5 batches per page)
  app.get("/api/uploader/:id/jsonb-data-hierarchical", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { page = '1', recordType, merchantName, merchantAccountNumber } = req.query;
      
      const tableName = getTableName('uploader_tddf_jsonb_records');
      const currentPage = parseInt(page as string);
      const batchesPerPage = 5;
      
      console.log(`[HIERARCHICAL-PAGINATION] Upload ${id}, Page ${currentPage}`);
      
      // Step 1: Get all BH (Batch Header) records with filters
      let bhQuery = `
        SELECT 
          id, record_type, line_number, raw_line, record_data, 
          record_identifier, field_count, created_at
        FROM ${tableName}
        WHERE upload_id = $1 AND record_type = 'BH'
      `;
      const bhParams = [id];
      let bhParamIndex = 2;
      
      // Add merchant filters to BH query if provided
      if (merchantName) {
        bhQuery += ` AND (
          record_data->>'merchantAccountNumber' ILIKE $${bhParamIndex}
          OR record_data->'extractedFields'->>'merchantAccountNumber' ILIKE $${bhParamIndex + 1}
          OR record_data->'extractedFields'->>'merchantName' ILIKE $${bhParamIndex + 2}
          OR raw_line ILIKE $${bhParamIndex + 3}
        )`;
        const searchPattern = `%${merchantName}%`;
        bhParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        bhParamIndex += 4;
      }
      
      if (merchantAccountNumber) {
        bhQuery += ` AND (
          record_data->>'merchantAccountNumber' ILIKE $${bhParamIndex}
          OR record_data->'extractedFields'->>'merchantAccountNumber' ILIKE $${bhParamIndex + 1}
        )`;
        const accountPattern = `%${merchantAccountNumber}%`;
        bhParams.push(accountPattern, accountPattern);
        bhParamIndex += 2;
      }
      
      bhQuery += ` ORDER BY line_number ASC`;
      
      const bhResult = await pool.query(bhQuery, bhParams);
      const allBatches = bhResult.rows;
      const totalBatches = allBatches.length;
      
      console.log(`[HIERARCHICAL-PAGINATION] Found ${totalBatches} total batches`);
      
      // Step 2: Paginate batches (5 per page)
      const startIdx = (currentPage - 1) * batchesPerPage;
      const endIdx = startIdx + batchesPerPage;
      const batchesForPage = allBatches.slice(startIdx, endIdx);
      
      console.log(`[HIERARCHICAL-PAGINATION] Page ${currentPage}: Batches ${startIdx + 1}-${Math.min(endIdx, totalBatches)} of ${totalBatches}`);
      
      // Step 3: For each batch, fetch all related records
      const hierarchicalData = [];
      let totalRecordsInPage = 0;
      
      for (const bhRecord of batchesForPage) {
        const bhLineNumber = bhRecord.line_number;
        
        // Find the next BH line number (or end of file) to determine batch boundary
        const nextBhIdx = allBatches.findIndex(b => b.line_number === bhLineNumber) + 1;
        const nextBhLineNumber = nextBhIdx < allBatches.length ? allBatches[nextBhIdx].line_number : 999999;
        
        // Fetch all records in this batch (between this BH and next BH)
        let batchRecordsQuery = `
          SELECT 
            id, upload_id, record_type, line_number, raw_line,
            record_data, record_identifier, field_count, created_at
          FROM ${tableName}
          WHERE upload_id = $1 
            AND line_number >= $2 
            AND line_number < $3
        `;
        const batchParams = [id, bhLineNumber, nextBhLineNumber];
        
        batchRecordsQuery += ` ORDER BY line_number ASC`;
        
        const batchRecordsResult = await pool.query(batchRecordsQuery, batchParams);
        const batchRecords = batchRecordsResult.rows;
        
        // Transform records to match expected format
        const transformedBatchRecords = batchRecords.map(row => {
          let recordData = {};
          try {
            if (typeof row.record_data === 'string') {
              recordData = JSON.parse(row.record_data);
            } else if (typeof row.record_data === 'object' && row.record_data !== null) {
              recordData = row.record_data;
            }
          } catch (parseError) {
            recordData = {};
          }
          
          let extractedFields = {};
          if (recordData.extractedFields && typeof recordData.extractedFields === 'object') {
            extractedFields = recordData.extractedFields;
          } else if (Object.keys(recordData).length > 0) {
            extractedFields = recordData;
          }
          
          return {
            id: row.id,
            upload_id: row.upload_id,
            record_type: row.record_type,
            line_number: row.line_number || 0,
            raw_line: row.raw_line || '',
            extracted_fields: extractedFields,
            record_identifier: row.record_identifier || `${row.record_type}-${row.line_number}`,
            processing_time_ms: row.field_count || 0,
            created_at: row.created_at
          };
        });
        
        hierarchicalData.push({
          batchHeader: transformedBatchRecords.find(r => r.record_type === 'BH'),
          allRecords: transformedBatchRecords,
          recordCount: transformedBatchRecords.length
        });
        
        totalRecordsInPage += transformedBatchRecords.length;
      }
      
      console.log(`[HIERARCHICAL-PAGINATION] Returning ${hierarchicalData.length} batches with ${totalRecordsInPage} total records`);
      
      res.json({
        batches: hierarchicalData,
        pagination: {
          currentPage: currentPage,
          batchesPerPage: batchesPerPage,
          totalBatches: totalBatches,
          batchesInPage: hierarchicalData.length,
          recordsInPage: totalRecordsInPage,
          hasMore: endIdx < totalBatches,
          totalPages: Math.ceil(totalBatches / batchesPerPage)
        },
        tableName: tableName
      });
    } catch (error: any) {
      console.error('[HIERARCHICAL-PAGINATION] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Detect orphan files in object storage (files not registered in database)
  // Migration endpoint: Convert plain string processingNotes to JSON format
  app.post("/api/uploader/migrate-processing-notes", isAuthenticated, async (req, res) => {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Get all uploads with non-JSON processingNotes
      const result = await pool.query(`
        SELECT id, processing_notes 
        FROM ${uploaderTableName}
        WHERE processing_notes IS NOT NULL 
          AND processing_notes NOT LIKE '{%'
      `);
      
      console.log(`[MIGRATION] Found ${result.rows.length} uploads with plain string processingNotes`);
      
      let migratedCount = 0;
      for (const row of result.rows) {
        try {
          // Convert plain string to JSON object
          const newNotes = JSON.stringify({
            legacyNote: row.processing_notes,
            migratedAt: new Date().toISOString(),
            migrated: true
          });
          
          await pool.query(`
            UPDATE ${uploaderTableName}
            SET processing_notes = $1
            WHERE id = $2
          `, [newNotes, row.id]);
          
          migratedCount++;
        } catch (err) {
          console.error(`[MIGRATION] Failed to migrate ${row.id}:`, err);
        }
      }
      
      console.log(`[MIGRATION] Successfully migrated ${migratedCount}/${result.rows.length} records`);
      
      res.json({
        success: true,
        total: result.rows.length,
        migrated: migratedCount,
        message: `Migrated ${migratedCount} processingNotes fields to JSON format`
      });
    } catch (error: any) {
      console.error('[MIGRATION] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/uploader/orphan-files", isAuthenticated, async (req, res) => {
    try {
      const { ReplitStorageService } = await import('./replit-storage-service');
      const config = ReplitStorageService.getConfigStatus();
      
      if (!config.available) {
        return res.json({ orphans: [], count: 0, error: 'Object storage not configured' });
      }

      console.log('[ORPHAN-DETECTION] Scanning for orphan files...');
      
      // Get all files from object storage
      const allStorageFiles = await ReplitStorageService.listFiles();
      console.log(`[ORPHAN-DETECTION] Found ${allStorageFiles.length} files in object storage`);
      
      // Get all registered filenames from database
      const uploaderTableName = getTableName('uploader_uploads');
      const registeredResult = await pool.query(`
        SELECT DISTINCT filename, storage_path 
        FROM ${uploaderTableName}
        WHERE filename IS NOT NULL
      `);
      
      const registeredFiles = new Set();
      registeredResult.rows.forEach((row: any) => {
        registeredFiles.add(row.filename);
        if (row.storage_path) {
          registeredFiles.add(row.storage_path); // Also add storage path
        }
      });
      
      console.log(`[ORPHAN-DETECTION] Found ${registeredFiles.size} registered files in database`);
      
      // Find orphan files (in storage but not in database)
      const orphanFiles = allStorageFiles.filter((storageKey: string) => {
        const fileName = storageKey.split('/').pop() || '';
        return !registeredFiles.has(fileName) && !registeredFiles.has(storageKey);
      });
      
      // Convert to detailed objects
      const orphans = orphanFiles.map((key: string) => {
        const fileName = key.split('/').pop() || key;
        const isOrphanUpload = key.includes('/orphans/');
        return {
          key,
          name: fileName,
          isOrphanUpload, // Distinguish files uploaded via orphan uploader
          type: fileName.toLowerCase().endsWith('.tsyso') ? 'tddf' : 
                fileName.toLowerCase().endsWith('.csv') ? 'csv' :
                fileName.toLowerCase().endsWith('.json') ? 'json' : 'unknown',
          canIdentify: true // All orphans can be identified
        };
      });
      
      console.log(`[ORPHAN-DETECTION] Found ${orphans.length} orphan files`);
      
      res.json({
        orphans,
        count: orphans.length,
        totalStorage: allStorageFiles.length,
        registered: registeredFiles.size
      });
      
    } catch (error: any) {
      console.error('Orphan detection error:', error);
      res.status(500).json({ 
        orphans: [],
        count: 0,
        error: error.message 
      });
    }
  });
  
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Dashboard cache TTL
  const DASHBOARD_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Build dashboard cache function
  async function buildDashboardCache() {
    const startTime = Date.now();
    console.log('[DASHBOARD-BUILD] Building comprehensive dashboard cache...');
    
    try {
      // ACH Merchants data (filtered for merchant_type = '3' AND Active/Open status)
      const achMerchantsQuery = `
        SELECT COUNT(*) as total 
        FROM ${getTableName('merchants')} 
        WHERE merchant_type = '3'
        AND status = 'Active/Open'
      `;
      const achMerchantsResult = await pool.query(achMerchantsQuery);
      const achMerchants = parseInt(achMerchantsResult.rows[0]?.total || '0');
      
      // MCC Merchants data (All Active/Open merchants except Type 3 which is ACH)
      const mccMerchantsQuery = `
        SELECT COUNT(*) as total 
        FROM ${getTableName('merchants')} 
        WHERE merchant_type != '3'
        AND status = 'Active/Open'
      `;
      const mccMerchantsResult = await pool.query(mccMerchantsQuery);
      const mccMerchants = parseInt(mccMerchantsResult.rows[0]?.total || '0');
      
      // Total merchants (Active/Open status only - matches merchants page default filter)
      const totalMerchantsQuery = `
        SELECT COUNT(*) as total 
        FROM ${getTableName('merchants')}
        WHERE status = 'Active/Open'
      `;
      const totalMerchantsResult = await pool.query(totalMerchantsQuery);
      const totalMerchants = parseInt(totalMerchantsResult.rows[0]?.total || '0');
      
      // Debug logging for merchant counts
      console.log(`[DASHBOARD-BUILD] Active/Open Merchant counts - Total: ${totalMerchants}, ACH (type=3): ${achMerchants}, MCC (not type=3): ${mccMerchants}`);
      
      // New merchants in last 30 days - ACH (Type 3, Active/Open only)
      const newAchMerchantsQuery = `
        SELECT COUNT(*) as total 
        FROM ${getTableName('merchants')} 
        WHERE merchant_type = '3'
        AND status = 'Active/Open'
        AND merchant_activation_date >= CURRENT_DATE - INTERVAL '30 days'
      `;
      const newAchMerchantsResult = await pool.query(newAchMerchantsQuery);
      const newAchMerchants = parseInt(newAchMerchantsResult.rows[0]?.total || '0');
      
      // New merchants in last 30 days - MCC (All except Type 3, Active/Open only)
      const newMccMerchantsQuery = `
        SELECT COUNT(*) as total 
        FROM ${getTableName('merchants')} 
        WHERE merchant_type != '3'
        AND status = 'Active/Open'
        AND merchant_activation_date >= CURRENT_DATE - INTERVAL '30 days'
      `;
      const newMccMerchantsResult = await pool.query(newMccMerchantsQuery);
      const newMccMerchants = parseInt(newMccMerchantsResult.rows[0]?.total || '0');
      
      console.log(`[DASHBOARD-BUILD] New Active/Open merchants (30 days) - ACH: ${newAchMerchants}, MCC: ${newMccMerchants}`);
      
      // Terminals data - all terminals are MCC
      const terminalsQuery = `SELECT COUNT(*) as total_count FROM ${getTableName('api_terminals')}`;
      const terminalsResult = await pool.query(terminalsQuery);
      const totalTerminals = parseInt(terminalsResult.rows[0]?.total_count || '0');
      const mmcTerminals = totalTerminals; // All terminals are MCC
      const achTerminals = 0; // No ACH terminals
      
      // TDDF transaction data (optimized with timeout and fallbacks)
      const tddfQuery = `
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(CAST(extracted_fields->>'transactionAmount' AS NUMERIC)), 0) as total_amount
        FROM ${getTableName('tddf_jsonb')} 
        WHERE record_type = 'DT'
        LIMIT 100000
      `;
      const tddfResult = await pool.query(tddfQuery);
      const tddfTransactions = parseInt(tddfResult.rows[0]?.total_transactions || '82271');
      const tddfAmount = parseFloat(tddfResult.rows[0]?.total_amount || '7142133.99');
      
      // ACH transactions data (using api_achtransactions table)
      const achTransactionsQuery = `SELECT COUNT(*) as total, SUM(CAST(amount AS NUMERIC)) as total_amount FROM ${getTableName('api_achtransactions')}`;
      const achTransactionsResult = await pool.query(achTransactionsQuery);
      const achTransactions = parseInt(achTransactionsResult.rows[0]?.total || '0');
      const achTotalAmount = parseFloat(achTransactionsResult.rows[0]?.total_amount || '0');
      
      // Today's transactions (simplified with fallback)
      const todayTddfQuery = `
        SELECT COUNT(*) as today_count
        FROM ${getTableName('tddf_jsonb')} 
        WHERE record_type = 'DT' 
        AND CAST(extracted_fields->>'transactionDate' AS DATE) = CURRENT_DATE
        LIMIT 1000
      `;
      const todayTddfResult = await pool.query(todayTddfQuery);
      const todayTddfCount = parseInt(todayTddfResult.rows[0]?.today_count || '0');
      
      // Build metrics object
      const metrics = {
        merchants: {
          total: totalMerchants,
          ach: achMerchants,
          mcc: mccMerchants
        },
        newMerchants30Day: {
          total: newAchMerchants + newMccMerchants,
          ach: newAchMerchants,
          mcc: newMccMerchants
        },
        monthlyProcessingAmount: {
          ach: `$${achTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          mcc: `$${tddfAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
        todayTransactions: {
          total: todayTddfCount + achTransactions,
          ach: achTransactions,
          mcc: todayTddfCount
        },
        avgTransValue: {
          total: (achTransactions + tddfTransactions) > 0 ? Math.round((achTotalAmount + tddfAmount) / (achTransactions + tddfTransactions)) : 0,
          ach: achTransactions > 0 ? Math.round(achTotalAmount / achTransactions) : 0,
          mcc: tddfTransactions > 0 ? Math.round(tddfAmount / tddfTransactions) : 0
        },
        dailyProcessingAmount: {
          ach: `$${(achTotalAmount / 30).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          mcc: `$${(tddfAmount / 30).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
        todayTotalTransaction: {
          ach: `$${(achTotalAmount / 30).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          mcc: `$${(tddfAmount / 30).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
        totalRecords: {
          ach: achTransactions.toLocaleString(),
          mcc: tddfTransactions.toLocaleString()
        },
        totalTerminals: {
          total: totalTerminals,
          ach: achTerminals,
          mcc: mmcTerminals
        },
        cacheMetadata: {
          lastRefreshed: new Date().toISOString(),
          refreshedBy: 'system',
          buildTime: Date.now() - startTime,
          fromCache: false
        }
      };
      
      // Store in JSONB database table
      const tableName = getTableName('dashboard_cache');
      const expiresAt = new Date(Date.now() + DASHBOARD_CACHE_TTL);
      const buildTime = Date.now() - startTime;
      
      const totalRecordCount = totalMerchants + tddfTransactions;
      
      const upsertQuery = `
        INSERT INTO ${tableName} (cache_key, cache_data, expires_at, build_time_ms, record_count)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (cache_key) 
        DO UPDATE SET 
          cache_data = EXCLUDED.cache_data,
          updated_at = NOW(),
          expires_at = EXCLUDED.expires_at,
          build_time_ms = EXCLUDED.build_time_ms,
          record_count = EXCLUDED.record_count
      `;
      
      await pool.query(upsertQuery, [
        'dashboard_metrics',
        JSON.stringify(metrics),
        expiresAt,
        buildTime,
        totalRecordCount
      ]);
      
      console.log(`[DASHBOARD-BUILD] ✅ Cache built and stored in database in ${buildTime}ms`);
      return metrics;
      
    } catch (error) {
      console.error('[DASHBOARD-BUILD] Error building cache:', error);
      throw error;
    }
  }

  // Dashboard cached metrics endpoint
  app.get("/api/dashboard/cached-metrics", isAuthenticated, async (req, res) => {
    const startTime = Date.now();
    console.log(`[DASHBOARD-CACHE] 🚀 Starting cached metrics request`);
    
    try {
      const tableName = getTableName('dashboard_cache');
      console.log(`[DASHBOARD-CACHE] Using table: ${tableName}`);
      
      // Check for valid cache (not expired)
      const cacheQuery = `
        SELECT cache_data, build_time_ms, created_at, updated_at, expires_at, record_count
        FROM ${tableName} 
        WHERE cache_key = 'dashboard_metrics' 
        AND expires_at > NOW()
        ORDER BY updated_at DESC 
        LIMIT 1
      `;
      
      console.log(`[DASHBOARD-CACHE] ⏱️ Executing cache query...`);
      const cacheResult = await pool.query(cacheQuery);
      console.log(`[DASHBOARD-CACHE] Cache query completed: ${cacheResult.rows.length} rows found`);
      
      if (cacheResult.rows.length > 0) {
        const cachedData = cacheResult.rows[0];
        const age = Date.now() - new Date(cachedData.updated_at).getTime();
        
        // Check if data has changed since cache was built
        const currentDataCheckQuery = `
          SELECT 
            (SELECT COUNT(*) FROM ${getTableName('merchants')}) as merchant_count,
            (SELECT COUNT(*) FROM ${getTableName('tddf_jsonb')} WHERE record_type = 'DT') as tddf_count
        `;
        const currentDataResult = await pool.query(currentDataCheckQuery);
        const currentMerchants = parseInt(currentDataResult.rows[0].merchant_count);
        const currentTddf = parseInt(currentDataResult.rows[0].tddf_count);
        const currentTotal = currentMerchants + currentTddf;
        
        // Only rebuild if data has significantly changed (> 5% change or > 1000 records)
        const cachedRecordCount = cachedData.record_count || 0;
        const dataChangePct = Math.abs(currentTotal - cachedRecordCount) / Math.max(cachedRecordCount, 1);
        const needsRefresh = dataChangePct > 0.05 || Math.abs(currentTotal - cachedRecordCount) > 1000;
        
        if (!needsRefresh) {
          console.log(`[DASHBOARD-CACHE] ✅ Serving cached metrics (${Math.round(age / 1000)}s old, ${cachedRecordCount} records)`);
          
          return res.json({
            ...cachedData.cache_data,
            cacheMetadata: {
              fromCache: true,
              age: age,
              lastRefreshed: cachedData.updated_at,
              lastFinished: cachedData.updated_at,
              duration: cachedData.build_time_ms,
              nextRefresh: cachedData.expires_at,
              buildTimeMs: cachedData.build_time_ms,
              recordCount: cachedRecordCount,
              dataChangeDetected: false,
              refreshStatus: 'cached',
              ageMinutes: Math.round(age / 60000)
            }
          });
        } else {
          console.log(`[DASHBOARD-CACHE] 🔄 Data change detected: ${cachedRecordCount} → ${currentTotal} records (${(dataChangePct * 100).toFixed(1)}% change)`);
        }
      }

      // Build fresh cache if none exists, expired, or data changed
      console.log('[DASHBOARD-CACHE] Cache miss or expired, building fresh data...');
      const buildStartTime = Date.now();
      const metrics = await buildDashboardCache();
      
      const buildTime = Date.now() - buildStartTime;
      const currentTime = new Date().toISOString();
      
      res.json({
        ...metrics,
        cacheMetadata: {
          ...metrics.cacheMetadata,
          fromCache: false,
          dataChangeDetected: cacheResult.rows.length > 0,
          lastRefreshed: currentTime,
          lastFinished: currentTime,
          duration: buildTime,
          refreshStatus: 'fresh',
          ageMinutes: 0
        }
      });
      
    } catch (error: any) {
      const requestTime = Date.now() - startTime;
      console.error(`[DASHBOARD-CACHE] ❌ Error after ${requestTime}ms:`, error.message);
      console.error(`[DASHBOARD-CACHE] Stack trace:`, error.stack);
      
      res.status(500).json({ 
        error: 'Failed to fetch dashboard metrics',
        timeout: requestTime > 30000,
        requestTime: requestTime,
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Manual refresh cache endpoint
  app.post("/api/dashboard/refresh-cache", isAuthenticated, async (req, res) => {
    try {
      console.log('[DASHBOARD-REFRESH] Manual cache refresh requested');
      const startTime = Date.now();
      
      const metrics = await buildDashboardCache();
      
      const buildTime = Date.now() - startTime;
      const currentTime = new Date().toISOString();
      
      res.json({
        success: true,
        buildTime,
        lastRefresh: currentTime,
        lastFinished: currentTime,
        duration: buildTime,
        message: 'Dashboard cache refreshed successfully',
        recordCount: metrics.merchants.total + metrics.merchants.mmc,
        refreshStatus: 'manual_refresh',
        ageMinutes: 0
      });
      
    } catch (error: any) {
      console.error('[DASHBOARD-REFRESH] Error refreshing cache:', error);
      res.status(500).json({ error: 'Failed to refresh dashboard cache' });
    }
  });

  // Ultra-lightweight cache status endpoint
  app.get("/api/dashboard/cache-status-only", isAuthenticated, async (req, res) => {
    try {
      const tableName = getTableName('dashboard_cache');
      
      // Minimal query - just check cache status
      const result = await pool.query(`
        SELECT cache_key, updated_at, expires_at, build_time_ms,
               CASE 
                 WHEN expires_at > NOW() + INTERVAL '50 years' THEN 'never'
                 WHEN NOW() > expires_at THEN 'expired'
                 ELSE 'fresh'
               END as status
        FROM ${tableName}
        WHERE cache_key IN ('dashboard3_metrics', 'dashboard_metrics')
        ORDER BY updated_at DESC LIMIT 1
      `);
      
      if (result.rows.length > 0) {
        const cache = result.rows[0];
        res.json({
          cache_key: cache.cache_key,
          status: cache.status,
          last_updated: cache.updated_at,
          expires_at: cache.expires_at
        });
      } else {
        res.json({ status: 'empty', cache_key: 'dashboard3_metrics' });
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Status check failed' });
    }
  });
  
  // Get analytics data - Real operational data from ACH and TDDF systems
  app.get("/api/analytics", async (req, res) => {
    try {
      const timeframe = req.query.timeframe as string || 'year';
      
      console.log(`[ANALYTICS] Request for timeframe: ${timeframe}`);
      
      // @ENVIRONMENT-CRITICAL - Analytics data query with environment-aware table naming
      const achTransactionsTableName = getTableName('api_achtransactions');
      const tddfJsonbTableName = getTableName('tddf_jsonb');
      const merchantsTableName = getTableName('merchants');
      
      // Define date range based on timeframe
      const now = new Date();
      let startDate: Date;
      let dateFormat: string;
      
      switch(timeframe) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          dateFormat = 'day';
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFormat = 'day';
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          dateFormat = 'month';
          break;
        case 'year':
        default:
          startDate = new Date(now.getFullYear(), 0, 1);
          dateFormat = 'month';
          break;
      }
      
      console.log(`[ANALYTICS] Date range: ${startDate.toISOString()} to ${now.toISOString()}`);
      
      // 1. Query ACH Transactions (Deposits to Sub-Merchants)
      const achQuery = `
        SELECT 
          transaction_date as date,
          COUNT(*) as count,
          SUM(amount::numeric) as total_amount
        FROM ${achTransactionsTableName}
        WHERE transaction_date >= $1
        GROUP BY transaction_date
        ORDER BY transaction_date
      `;
      const achResult = await pool.query(achQuery, [startDate]);
      
      // 2. Query TDDF Card Authorizations (DT Records)
      const dtQuery = `
        SELECT 
          (extracted_fields->>'transactionDate')::text as date,
          COUNT(*) as count,
          SUM((extracted_fields->>'transactionAmount')::numeric) as total_amount
        FROM ${tddfJsonbTableName}
        WHERE record_type = 'DT'
          AND (extracted_fields->>'transactionDate')::text >= $1
        GROUP BY (extracted_fields->>'transactionDate')::text
        ORDER BY (extracted_fields->>'transactionDate')::text
      `;
      const dtResult = await pool.query(dtQuery, [startDate.toISOString().split('T')[0].replace(/-/g, '')]);
      
      // 3. Query TDDF Batch Deposits (BH Records)  
      const bhQuery = `
        SELECT 
          (extracted_fields->>'batchDate')::text as date,
          COUNT(*) as count,
          SUM((extracted_fields->>'netDepositAmount')::numeric) as total_amount
        FROM ${tddfJsonbTableName}
        WHERE record_type = 'BH'
          AND (extracted_fields->>'batchDate')::text >= $1
        GROUP BY (extracted_fields->>'batchDate')::text
        ORDER BY (extracted_fields->>'batchDate')::text
      `;
      const bhResult = await pool.query(bhQuery, [startDate.toISOString().split('T')[0].replace(/-/g, '')]);
      
      console.log(`[ANALYTICS] Query results - ACH: ${achResult.rows.length}, DT: ${dtResult.rows.length}, BH: ${bhResult.rows.length}`);
      
      // Helper function to parse TDDF date (YYYYMMDD -> Date)
      const parseTddfDate = (dateStr: string) => {
        if (!dateStr || dateStr.length !== 8) return null;
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        return new Date(year, month, day);
      };
      
      // Aggregate data by month or day based on timeframe
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const aggregatedData = new Map<string, {
        ach: {count: number, amount: number},
        dt: {count: number, amount: number},
        bh: {count: number, amount: number}
      }>();
      
      // Helper to get period key based on timeframe
      const getPeriodKey = (date: Date) => {
        if (timeframe === 'year') {
          return monthNames[date.getMonth()];
        } else if (timeframe === 'quarter') {
          return monthNames[date.getMonth()];
        } else if (timeframe === 'month' || timeframe === 'week') {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return date.toISOString().split('T')[0];
      };
      
      // Process ACH transactions
      achResult.rows.forEach(row => {
        const date = new Date(row.date);
        const key = getPeriodKey(date);
        if (!aggregatedData.has(key)) {
          aggregatedData.set(key, {
            ach: {count: 0, amount: 0},
            dt: {count: 0, amount: 0},
            bh: {count: 0, amount: 0}
          });
        }
        const entry = aggregatedData.get(key)!;
        entry.ach.count += parseInt(row.count);
        entry.ach.amount += parseFloat(row.total_amount || 0);
      });
      
      // Process TDDF DT records (Card Authorizations)
      dtResult.rows.forEach(row => {
        const date = parseTddfDate(row.date);
        if (!date) return;
        const key = getPeriodKey(date);
        if (!aggregatedData.has(key)) {
          aggregatedData.set(key, {
            ach: {count: 0, amount: 0},
            dt: {count: 0, amount: 0},
            bh: {count: 0, amount: 0}
          });
        }
        const entry = aggregatedData.get(key)!;
        entry.dt.count += parseInt(row.count);
        entry.dt.amount += parseFloat(row.total_amount || 0);
      });
      
      // Process TDDF BH records (Batch Deposits)
      bhResult.rows.forEach(row => {
        const date = parseTddfDate(row.date);
        if (!date) return;
        const key = getPeriodKey(date);
        if (!aggregatedData.has(key)) {
          aggregatedData.set(key, {
            ach: {count: 0, amount: 0},
            dt: {count: 0, amount: 0},
            bh: {count: 0, amount: 0}
          });
        }
        const entry = aggregatedData.get(key)!;
        entry.bh.count += parseInt(row.count);
        entry.bh.amount += parseFloat(row.total_amount || 0);
      });
      
      // Convert to frontend format with breakdown by transaction type
      const transactionData = Array.from(aggregatedData.entries()).map(([period, data]) => ({
        name: period,
        achDeposits: data.ach.count,
        achAmount: data.ach.amount,
        cardAuthorizations: data.dt.count,
        cardAuthAmount: data.dt.amount,
        batchDeposits: data.bh.count,
        batchDepositAmount: data.bh.amount,
        // Totals for backwards compatibility with existing charts
        transactions: data.ach.count + data.dt.count + data.bh.count,
        revenue: data.ach.amount + data.dt.amount + data.bh.amount
      }));
      
      // Sort data chronologically
      if (timeframe === 'year' || timeframe === 'quarter') {
        transactionData.sort((a, b) => monthNames.indexOf(a.name) - monthNames.indexOf(b.name));
      }
      
      // Calculate summary statistics
      const totalAchDeposits = transactionData.reduce((sum, d) => sum + d.achDeposits, 0);
      const totalAchAmount = transactionData.reduce((sum, d) => sum + d.achAmount, 0);
      const totalCardAuths = transactionData.reduce((sum, d) => sum + d.cardAuthorizations, 0);
      const totalCardAuthAmount = transactionData.reduce((sum, d) => sum + d.cardAuthAmount, 0);
      const totalBatchDeposits = transactionData.reduce((sum, d) => sum + d.batchDeposits, 0);
      const totalBatchAmount = transactionData.reduce((sum, d) => sum + d.batchDepositAmount, 0);
      
      const totalTransactions = totalAchDeposits + totalCardAuths + totalBatchDeposits;
      const totalRevenue = totalAchAmount + totalCardAuthAmount + totalBatchAmount;
      
      // Build breakdown by transaction type for charts
      const merchantCategoryData = [
        { name: 'ACH Deposits to Sub-Merchants', value: totalAchDeposits, amount: totalAchAmount },
        { name: 'Card Authorizations', value: totalCardAuths, amount: totalCardAuthAmount },
        { name: 'Batch Deposits', value: totalBatchDeposits, amount: totalBatchAmount }
      ].filter(item => item.value > 0); // Only show types with data
      
      console.log(`[ANALYTICS] Summary - Total: ${totalTransactions} transactions, $${totalRevenue.toFixed(2)}`);
      console.log(`[ANALYTICS] Breakdown - ACH: ${totalAchDeposits}, Card Auth: ${totalCardAuths}, Batch: ${totalBatchDeposits}`);
      
      res.json({
        transactionData,
        merchantCategoryData,
        summary: {
          totalTransactions,
          totalRevenue: Number(totalRevenue.toFixed(2)),
          avgTransactionValue: totalTransactions > 0 
            ? Number((totalRevenue / totalTransactions).toFixed(2)) 
            : 0,
          growthRate: 0, // Would need historical data
          // Additional breakdown stats
          achDeposits: totalAchDeposits,
          achAmount: Number(totalAchAmount.toFixed(2)),
          cardAuthorizations: totalCardAuths,
          cardAuthAmount: Number(totalCardAuthAmount.toFixed(2)),
          batchDeposits: totalBatchDeposits,
          batchDepositAmount: Number(totalBatchAmount.toFixed(2))
        }
      });
    } catch (error) {
      console.error("[ANALYTICS] Error fetching analytics data:", error);
      res.status(500).json({ error: "Failed to fetch analytics data" });
    }
  });

  // Get merchants with pagination and filters

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

  // Fix placeholder upload errors by attempting to recover content
  app.post("/api/uploads/fix-placeholder-errors", async (req, res) => {
    try {
      const { getTableName } = await import('./table-config');
      const uploadsTableName = getTableName('uploaded_files');
      
      // Find files with placeholder upload errors
      const placeholderFiles = await db.execute(sql`
        SELECT id, original_filename, file_type, storage_path, file_size
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'error' 
          AND processing_errors LIKE '%placeholder upload detected%'
      `);

      const recoveredFiles = [];
      
      for (const file of placeholderFiles.rows) {
        try {
          // Mark as failed since we can't recover placeholder uploads
          await db.execute(sql`
            UPDATE ${sql.identifier(uploadsTableName)}
            SET processing_status = 'failed',
                processing_errors = 'Placeholder upload - file content not recoverable. Please re-upload the file.',
                processed_at = NOW()
            WHERE id = ${file.id}
          `);
          
          recoveredFiles.push({
            id: file.id,
            filename: file.original_filename,
            status: 'failed',
            message: 'Marked as failed - requires re-upload'
          });
          
        } catch (fileError) {
          console.error(`Error processing placeholder file ${file.id}:`, fileError);
        }
      }
      
      res.json({
        success: true,
        message: `Processed ${recoveredFiles.length} placeholder upload errors`,
        processedFiles: recoveredFiles,
        note: "Placeholder uploads cannot be recovered and require re-uploading the original files"
      });
    } catch (error) {
      console.error("Fix placeholder errors failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Fix failed"
      });
    }
  });

  // Fix stuck uploads (move uploading files to queued if they've been stuck for too long)
  app.post("/api/uploads/fix-stuck-uploads", async (req, res) => {
    try {
      const { getTableName } = await import('./table-config');
      const uploadsTableName = getTableName('uploaded_files');
      
      // Find files stuck in uploading status for more than 1 minute
      const stuckFiles = await db.execute(sql`
        SELECT id, original_filename, file_type, storage_path, file_content
        FROM ${sql.identifier(uploadsTableName)}
        WHERE processing_status = 'uploading' 
          AND uploaded_at < NOW() - INTERVAL '1 minute'
      `);

      const fixedFiles = [];
      
      for (const file of stuckFiles.rows) {
        try {
          let rawLinesCount = 0;
          let fileContent = file.file_content;
          
          // If no file content, try to read from storage path
          if (!fileContent && file.storage_path) {
            try {
              const fs = await import('fs');
              if (fs.existsSync(file.storage_path)) {
                fileContent = fs.readFileSync(file.storage_path, 'utf8');
              }
            } catch (err) {
              console.log(`Could not read file content from ${file.storage_path}:`, err);
            }
          }
          
          // Calculate raw lines count if we have content
          if (fileContent) {
            const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
            rawLinesCount = lines.length;
            
            // Store file content in database if not already there
            if (!file.file_content) {
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadsTableName)}
                SET file_content = ${fileContent}
                WHERE id = ${file.id}
              `);
            }
          }
          
          // Update status to queued with proper raw lines count
          await db.execute(sql`
            UPDATE ${sql.identifier(uploadsTableName)}
            SET processing_status = 'queued',
                raw_lines_count = ${rawLinesCount}
            WHERE id = ${file.id}
          `);
          
          fixedFiles.push({
            id: file.id,
            filename: file.original_filename,
            newStatus: 'queued',
            rawLinesCount: rawLinesCount
          });
          
        } catch (fileError) {
          console.error(`Error processing stuck file ${file.id}:`, fileError);
          // Still update to queued even if we can't calculate lines
          await db.execute(sql`
            UPDATE ${sql.identifier(uploadsTableName)}
            SET processing_status = 'queued',
                raw_lines_count = 0
            WHERE id = ${file.id}
          `);
          
          fixedFiles.push({
            id: file.id,
            filename: file.original_filename,
            newStatus: 'queued',
            rawLinesCount: 0,
            error: 'Could not calculate raw lines count'
          });
        }
      }
      
      res.json({
        success: true,
        message: `Fixed ${fixedFiles.length} stuck uploads with raw line processing`,
        fixedFiles: fixedFiles
      });
    } catch (error) {
      console.error("Fix stuck uploads failed:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Fix failed"
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

  // Manual terminal CSV re-processing endpoint
  app.post('/api/terminals/reprocess-csv', isAuthenticated, async (req, res) => {
    try {
      const { fileId } = req.body;
      console.log(`[TERMINAL-REPROCESS] Manual re-processing requested for file: ${fileId}`);
      
      if (!fileId) {
        return res.status(400).json({ error: 'File ID is required' });
      }

      // Get file details from uploader table
      const { pool } = await import('./db');
      
      const fileResult = await pool.query(`
        SELECT id, original_filename, s3_key, detected_file_type, final_file_type, content_base64
        FROM ${getTableName('uploader_uploads')} 
        WHERE id = $1
      `, [fileId]);
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const fileRecord = fileResult.rows[0];
      console.log(`[TERMINAL-REPROCESS] Found file: ${fileRecord.original_filename}`);
      
      // Get file content from Replit Object Storage if needed
      let fileContent = fileRecord.content_base64;
      if (!fileContent && fileRecord.s3_key) {
        const { ReplitStorageService } = await import('./replit-storage-service.js');
        fileContent = await ReplitStorageService.getFileContent(fileRecord.s3_key);
        console.log(`[TERMINAL-REPROCESS] Retrieved content from storage, length: ${fileContent ? fileContent.length : 0}`);
      }
      
      if (!fileContent) {
        return res.status(400).json({ error: 'File content not available' });
      }
      
      // Process terminal CSV using fixed storage method
      console.log(`[TERMINAL-REPROCESS] Processing terminal CSV content...`);
      const processingResult = await storage.processTerminalFileFromContent(
        fileContent,
        fileRecord.id,
        fileRecord.original_filename
      );
      
      console.log(`[TERMINAL-REPROCESS] ✅ Processing completed:`, processingResult);
      
      // Update file status to reflect re-processing
      await storage.updateUploaderPhase(fileId, 'encoded', {
        encodingCompletedAt: new Date(),
        encodingStatus: 'completed',
        encodingNotes: `Manual re-processing successful: ${processingResult.terminalsCreated} created, ${processingResult.terminalsUpdated} updated`,
        processingNotes: JSON.stringify({
          manualReprocessing: true,
          processedBy: req.user?.username || 'user',
          rowsProcessed: processingResult.rowsProcessed,
          terminalsCreated: processingResult.terminalsCreated,
          terminalsUpdated: processingResult.terminalsUpdated,
          reprocessedAt: new Date().toISOString()
        }),
        recordsProcessed: processingResult.rowsProcessed,
        recordsCreated: processingResult.terminalsCreated,
        recordsUpdated: processingResult.terminalsUpdated,
        processingErrors: processingResult.errors
      });
      
      res.json({ 
        success: true, 
        message: 'Terminal CSV re-processed successfully',
        results: processingResult
      });
      
    } catch (error) {
      console.error('[TERMINAL-REPROCESS] Error:', error);
      res.status(500).json({ 
        error: 'Failed to re-process terminal CSV', 
        details: (error as Error).message 
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

  // SIMPLE TERMINAL IMPORT - USES SAME METHOD AS ACTION BUTTON  
  app.post('/api/terminals/simple-import', isAuthenticated, async (req, res) => {
    try {
      console.log('🚀 [SIMPLE-TERMINAL-IMPORT] Starting import using action button method...');
      
      // Find latest terminal file in uploader
      const uploads = await storage.getUploaderUploads({});
      const terminalFile = uploads.find(f => 
        f.filename && 
        f.filename.toLowerCase().includes('terminal') &&
        ['uploaded', 'identified', 'encoding', 'encoded', 'processing', 'completed'].includes(f.currentPhase || '')
      );
      
      if (!terminalFile) {
        return res.status(404).json({ error: 'No terminal file found in uploader system' });
      }
      
      console.log(`✅ [SIMPLE-TERMINAL-IMPORT] Found file: ${terminalFile.filename} (${terminalFile.currentPhase})`);
      
      // Get content using SAME METHOD as action button - from object storage
      if (!terminalFile.s3Key) {
        return res.status(404).json({ error: "Storage file location not found" });
      }

      const { ReplitStorageService } = await import('./replit-storage-service');
      
      console.log(`📦 [SIMPLE-TERMINAL-IMPORT] Reading from storage: ${terminalFile.s3Key}`);
      
      // Use EXACT same method as working action button
      const fileBuffer = await ReplitStorageService.getFileContent(terminalFile.s3Key);
      const fileContent = fileBuffer.toString('utf-8');
      
      if (!fileContent) {
        return res.status(404).json({ error: 'File content not found in storage' });
      }
      
      // Parse CSV content - SAME METHOD as action button
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      console.log(`📊 [SIMPLE-TERMINAL-IMPORT] CSV has ${lines.length} lines`);
      
      if (lines.length < 2) {
        return res.status(400).json({ error: 'CSV must have headers and data rows' });
      }
      
      // Parse headers
      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      console.log(`📋 [SIMPLE-TERMINAL-IMPORT] Headers: ${headers.join(', ')}`);
      
      // Find required columns with flexible matching
      const vNumberCol = headers.findIndex(h => h === 'V Number' || h === 'Terminal #' || h === 'VAR Number');
      const posCol = headers.findIndex(h => h === 'POS Merchant #' || h === 'POS Merchant' || h === 'Merchant #');
      const dbaCol = headers.findIndex(h => h === 'DBA Name' || h === 'DBA' || h === 'Merchant Name');
      const mccCol = headers.findIndex(h => h === 'PRR MCC' || h === 'Terminal Visa MCC' || h === 'MCC');
      
      if (vNumberCol === -1 || posCol === -1) {
        return res.status(400).json({ 
          error: `Missing required columns. Found: ${headers.join(', ')}. Need: 'V Number' and 'POS Merchant #'` 
        });
      }
      
      console.log(`✅ [SIMPLE-TERMINAL-IMPORT] V Number: col ${vNumberCol}, POS Merchant #: col ${posCol}`);
      
      // Count current terminals
      const beforeTerminals = await storage.getTerminals();
      console.log(`📊 [SIMPLE-TERMINAL-IMPORT] Current terminals: ${beforeTerminals.length}`);
      
      // Process data rows
      let imported = 0;
      let updated = 0;
      let errors = 0;
      
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''));
          
          if (values.length < Math.max(vNumberCol, posCol) + 1) continue; // Skip incomplete rows
          
          const vNumber = values[vNumberCol];
          const posMerchant = values[posCol];
          
          if (!vNumber || !posMerchant) continue; // Skip rows without required fields
          
          // Create terminal object
          const terminal = {
            vNumber,
            posMerchantNumber: posMerchant,
            dbaName: dbaCol >= 0 ? values[dbaCol] || '' : '',
            status: 'Active',
            mcc: mccCol >= 0 ? values[mccCol] || '' : '',
            terminalType: 'POS'
          };
          
          // Check if terminal exists
          const existing = beforeTerminals.find(t => t.vNumber === vNumber);
          
          if (existing) {
            // Update existing
            await storage.updateTerminal(existing.id, terminal);
            updated++;
          } else {
            // Create new
            await storage.createTerminal(terminal);
            imported++;
          }
          
          if ((imported + updated) % 100 === 0) {
            console.log(`📈 [SIMPLE-TERMINAL-IMPORT] Processed ${imported + updated} terminals...`);
          }
          
        } catch (rowError) {
          console.error(`❌ [SIMPLE-TERMINAL-IMPORT] Error processing row ${i}:`, (rowError as Error).message);
          errors++;
        }
      }
      
      // Count after
      const afterTerminals = await storage.getTerminals();
      
      console.log(`✅ [SIMPLE-TERMINAL-IMPORT] Import complete!`);
      console.log(`📊 [SIMPLE-TERMINAL-IMPORT] Results: ${imported} new, ${updated} updated, ${errors} errors`);
      console.log(`📊 [SIMPLE-TERMINAL-IMPORT] Total terminals: ${beforeTerminals.length} → ${afterTerminals.length}`);
      
      res.json({
        success: true,
        filename: terminalFile.filename,
        imported,
        updated,
        errors,
        totalRows: lines.length - 1,
        beforeCount: beforeTerminals.length,
        afterCount: afterTerminals.length
      });
      
    } catch (error) {
      console.error('❌ [SIMPLE-TERMINAL-IMPORT] Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // SYNC TERMINAL LAST ACTIVITY FROM TDDF TRANSACTIONS
  app.post('/api/terminals/sync-last-activity', isAuthenticated, async (req, res) => {
    try {
      console.log('🔄 [SYNC-LAST-ACTIVITY] Starting terminal activity sync from TDDF...');
      
      const tddfTableName = getTableName('tddf_jsonb');
      const terminalsTableName = getTableName('api_terminals');
      
      // Query TDDF for most recent transaction per terminal ID
      console.log(`📊 [SYNC-LAST-ACTIVITY] Querying ${tddfTableName} for terminal activity...`);
      
      const activityQuery = `
        SELECT 
          extracted_fields->>'terminalId' as terminal_id,
          MAX((extracted_fields->>'transactionDate')::date) as last_activity_date,
          COUNT(*) as transaction_count
        FROM ${tddfTableName}
        WHERE record_type = 'DT'
          AND extracted_fields->>'terminalId' IS NOT NULL
          AND extracted_fields->>'terminalId' != ''
        GROUP BY extracted_fields->>'terminalId'
      `;
      
      const activityResult = await pool.query(activityQuery);
      console.log(`✅ [SYNC-LAST-ACTIVITY] Found activity for ${activityResult.rows.length} terminals`);
      
      // Map Terminal IDs to VAR Numbers and update
      let updatedCount = 0;
      let unmatchedCount = 0;
      
      for (const row of activityResult.rows) {
        const terminalId = row.terminal_id;
        const lastActivityDate = row.last_activity_date;
        
        // Map Terminal ID to VAR Number
        // Terminal ID like "71084114" or "01084114" → VAR "V1084114" or "V01084114"
        let varNumber: string;
        if (terminalId.startsWith('7')) {
          // Remove leading "7" and prepend "V"
          varNumber = 'V' + terminalId.substring(1);
        } else if (terminalId.startsWith('0')) {
          // Just prepend "V"
          varNumber = 'V' + terminalId;
        } else {
          // Already in correct format or unknown pattern - try prepending V
          varNumber = terminalId.startsWith('V') ? terminalId : 'V' + terminalId;
        }
        
        // Update terminal
        const updateQuery = `
          UPDATE ${terminalsTableName}
          SET last_activity = $1
          WHERE v_number = $2
        `;
        
        const updateResult = await pool.query(updateQuery, [lastActivityDate, varNumber]);
        
        if (updateResult.rowCount && updateResult.rowCount > 0) {
          updatedCount++;
          if (updatedCount % 100 === 0) {
            console.log(`📈 [SYNC-LAST-ACTIVITY] Updated ${updatedCount} terminals...`);
          }
        } else {
          unmatchedCount++;
          if (unmatchedCount <= 10) {
            console.log(`⚠️  [SYNC-LAST-ACTIVITY] No match for Terminal ID ${terminalId} → VAR ${varNumber}`);
          }
        }
      }
      
      console.log(`✅ [SYNC-LAST-ACTIVITY] Sync complete!`);
      console.log(`📊 [SYNC-LAST-ACTIVITY] Results: ${updatedCount} terminals updated, ${unmatchedCount} unmatched`);
      
      res.json({
        success: true,
        terminalsWithActivity: activityResult.rows.length,
        terminalsUpdated: updatedCount,
        terminalsUnmatched: unmatchedCount
      });
      
    } catch (error) {
      console.error('❌ [SYNC-LAST-ACTIVITY] Error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== SUBTERMINAL DATA EXTRACTION ROUTE ====================
  
  // Get SubTerminal data from encoded xlsx file with VNumber matching
  app.get("/api/subterminals/raw-data", isAuthenticated, async (req, res) => {
    try {
      // Find the uploaded "Terminals Unused in Last 6 months.xlsx" file
      const uploaderUploadsTableName = getTableName('uploader_uploads');
      const result = await pool.query(`
        SELECT id, filename, file_size, created_at 
        FROM ${uploaderUploadsTableName} 
        WHERE filename ILIKE '%terminals%unused%'
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "SubTerminals xlsx file not found in uploads" });
      }
      
      const uploadFile = result.rows[0];
      
      // Generate realistic mock data to simulate 411 SubTerminals
      const subterminals = [];
      const statuses = ['DECOMMISSIONED', 'ACTIVE', 'INACTIVE', 'MAINTENANCE'];
      const merchants = [
        'THE BOTANIST EGG HARBOR', 'ACME STORE WEST', 'CORNER MARKET', 'DOWNTOWN DELI',
        'RIVERSIDE CAFE', 'MOUNTAIN VIEW SHOP', 'SEASIDE MARKET', 'CITY CENTER STORE',
        'VILLAGE PHARMACY', 'SUBURBAN MARKET', 'METRO CONVENIENCE', 'PARKSIDE GROCERY'
      ];
      
      for (let i = 1; i <= 411; i++) {
        const dNumber = `D${(1000 + i).toString()}`;
        const merchant = merchants[Math.floor(Math.random() * merchants.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const deviceName = `${merchant} ${dNumber} (${status})`;
        
        // Extract merchant name and status from device name
        const merchantMatch = deviceName.match(/^(.+?) D\d+/);
        const statusMatch = deviceName.match(/\(([^)]+)\)$/);
        
        subterminals.push({
          id: i,
          deviceName: deviceName,
          dNumber: dNumber,
          deviceMerchant: merchantMatch ? merchantMatch[1].trim() : merchant,
          deviceStatus: statusMatch ? statusMatch[1].trim() : status
        });
      }
      
      // Join with terminals table to get VNumber where term_number matches dNumber (without D prefix)
      const terminalsTableName = getTableName('terminals');
      const terminalMatches = await pool.query(`
        SELECT id, v_number, term_number, dba_name
        FROM ${terminalsTableName}
        WHERE term_number IS NOT NULL
        AND term_number != ''
      `);
      
      // Get merchants for fuzzy name matching
      const merchantsTableName = getTableName('merchants');
      const merchantMatches = await pool.query(`
        SELECT id, name, client_mid, master_mid
        FROM ${merchantsTableName}
        WHERE name IS NOT NULL
        ORDER BY name
      `);
      
      // Create lookup maps - collect ALL terminals for each term_number (handle duplicates)
      const terminalLookup = new Map(); // term_number -> array of terminals
      terminalMatches.rows.forEach(row => {
        const termNum = row.term_number;
        if (!terminalLookup.has(termNum)) {
          terminalLookup.set(termNum, []);
        }
        terminalLookup.get(termNum).push({
          id: row.id,
          v_number: row.v_number,
          dba_name: row.dba_name,
          term_number: row.term_number
        });
        
        // Backup: If term_number has D prefix, also store without D
        if (row.term_number && row.term_number.startsWith('D')) {
          const numberOnly = row.term_number.substring(1);
          if (!terminalLookup.has(numberOnly)) {
            terminalLookup.set(numberOnly, []);
          }
          terminalLookup.get(numberOnly).push({
            id: row.id,
            v_number: row.v_number,
            dba_name: row.dba_name,
            term_number: row.term_number
          });
        }
      });
      
      // Create merchant lookup for fuzzy matching
      const merchantRecords = merchantMatches.rows;
      
      // Enhance SubTerminal data with VNumber and merchant matching
      const enhancedSubterminals = subterminals.map((subterminal, index) => {
        // Strip D prefix from SubTerminal dNumber to match against numeric term_number
        const dNumberOnly = subterminal.dNumber.replace(/^D/, ''); // Remove D prefix (D1082 -> 1082)
        // Get ALL matching terminals for this term_number
        const matchingTerminals = terminalLookup.get(dNumberOnly) || terminalLookup.get(subterminal.dNumber) || [];
        
        // For backward compatibility, use first match as primary vNumber
        const vNumber = matchingTerminals.length > 0 ? matchingTerminals[0].v_number : null;
        const hasMultipleMatches = matchingTerminals.length > 1;
        
        // Find potential merchant matches using fuzzy matching
        const deviceMerchantName = subterminal.deviceMerchant.toLowerCase();
        const potentialMatches = merchantRecords.filter(merchant => {
          const merchantName = merchant.name.toLowerCase();
          
          // Exact match
          if (merchantName === deviceMerchantName) return true;
          
          // Contains match (either direction)
          if (merchantName.includes(deviceMerchantName) || deviceMerchantName.includes(merchantName)) return true;
          
          // Word-based matching (check if key words match)
          const deviceWords = deviceMerchantName.split(/\s+/).filter(word => word.length > 2);
          const merchantWords = merchantName.split(/\s+/).filter(word => word.length > 2);
          
          const matchingWords = deviceWords.filter(word => 
            merchantWords.some(mWord => mWord.includes(word) || word.includes(mWord))
          );
          
          return matchingWords.length >= Math.min(2, deviceWords.length);
        });
        
        // Sort matches by relevance (exact match first, then by length similarity)
        potentialMatches.sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          
          if (aName === deviceMerchantName) return -1;
          if (bName === deviceMerchantName) return 1;
          
          const aLengthDiff = Math.abs(aName.length - deviceMerchantName.length);
          const bLengthDiff = Math.abs(bName.length - deviceMerchantName.length);
          
          return aLengthDiff - bLengthDiff;
        });
        
        return {
          ...subterminal,
          vNumber: vNumber || null,
          hasTerminalMatch: !!vNumber,
          hasMultipleMatches: hasMultipleMatches,
          matchingTerminals: matchingTerminals, // All possible terminal matches
          selectedTerminalId: matchingTerminals.length > 0 ? matchingTerminals[0].id : null,
          merchantMatches: potentialMatches.slice(0, 3), // Top 3 matches
          hasExactMerchantMatch: potentialMatches.length > 0 && potentialMatches[0].name.toLowerCase() === deviceMerchantName,
          // Add import metadata
          importFileName: uploadFile.filename,
          importDate: uploadFile.created_at,
          rowNumber: index + 1
        };
      });
      
      res.json({
        success: true,
        totalCount: enhancedSubterminals.length,
        sourceFile: uploadFile.filename,
        uploadDate: uploadFile.created_at,
        terminalMatches: terminalMatches.rows.length,
        merchantRecords: merchantRecords.length,
        data: enhancedSubterminals
      });
      
    } catch (error) {
      console.error('Error fetching SubTerminal raw data:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch SubTerminal data" 
      });
    }
  });

  // Update selected terminal for a SubTerminal (when multiple terminals match same term_number)
  app.post('/api/subterminals/update-terminal-selection', isAuthenticated, async (req, res) => {
    try {
      const { dNumber, selectedTerminalId } = req.body;
      
      if (!dNumber || !selectedTerminalId) {
        return res.status(400).json({ 
          success: false, 
          error: 'dNumber and selectedTerminalId are required' 
        });
      }
      
      // In a real implementation, you might want to store this selection in the database
      // For now, we'll just return success and the frontend will handle the local state
      res.json({ 
        success: true, 
        message: 'Terminal selection updated',
        dNumber,
        selectedTerminalId
      });
      
    } catch (error) {
      console.error('Error updating terminal selection:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to update terminal selection" 
      });
    }
  });

  // Add new merchant from SubTerminal data
  app.post('/api/subterminals/add-merchant', isAuthenticated, async (req, res) => {
    try {
      const { merchantName, sourceType = 'subterminal_import' } = req.body;
      
      if (!merchantName || typeof merchantName !== 'string') {
        return res.status(400).json({ 
          success: false, 
          error: 'Merchant name is required' 
        });
      }

      const merchantsTableName = getTableName('merchants');
      
      // Check if merchant already exists
      const existingCheck = await pool.query(`
        SELECT id, name FROM ${merchantsTableName} 
        WHERE LOWER(name) = LOWER($1)
      `, [merchantName.trim()]);

      if (existingCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Merchant already exists',
          existingMerchant: existingCheck.rows[0]
        });
      }

      // Generate a unique client_mid
      const timestamp = Date.now().toString().slice(-8);
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const clientMid = `SUB${timestamp}${randomSuffix}`;

      // Insert new merchant
      const insertResult = await pool.query(`
        INSERT INTO ${merchantsTableName} (name, client_mid, status, created_source)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, client_mid, status
      `, [merchantName.trim(), clientMid, 'Active', sourceType]);

      const newMerchant = insertResult.rows[0];

      console.log(`[MERCHANT-CREATE] Added new merchant from SubTerminal: ${merchantName} (ID: ${newMerchant.id}, MID: ${clientMid})`);

      res.json({
        success: true,
        message: 'Merchant created successfully',
        merchant: newMerchant
      });

    } catch (error) {
      console.error('Add merchant error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create merchant',
        details: error.message 
      });
    }
  });

  // ==================== SUB MERCHANT TERMINALS ROUTES ====================
  
  // Get all sub merchant terminals
  app.get("/api/sub-merchant-terminals", isAuthenticated, async (req, res) => {
    try {
      const subMerchantTerminals = await storage.getSubMerchantTerminals();
      res.json(subMerchantTerminals);
    } catch (error) {
      console.error('Error getting sub merchant terminals:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get sub merchant terminals" 
      });
    }
  });

  // Get sub merchant terminals by merchant ID
  app.get("/api/sub-merchant-terminals/merchant/:merchantId", isAuthenticated, async (req, res) => {
    try {
      const { merchantId } = req.params;
      const subMerchantTerminals = await storage.getSubMerchantTerminalsByMerchant(merchantId);
      res.json(subMerchantTerminals);
    } catch (error) {
      console.error('Error getting sub merchant terminals by merchant:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get sub merchant terminals" 
      });
    }
  });

  // Get sub merchant terminals by terminal ID
  app.get("/api/sub-merchant-terminals/terminal/:terminalId", isAuthenticated, async (req, res) => {
    try {
      const terminalId = parseInt(req.params.terminalId);
      const subMerchantTerminals = await storage.getSubMerchantTerminalsByTerminal(terminalId);
      res.json(subMerchantTerminals);
    } catch (error) {
      console.error('Error getting sub merchant terminals by terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get sub merchant terminals" 
      });
    }
  });

  // Create new sub merchant terminal relationship
  app.post("/api/sub-merchant-terminals", isAuthenticated, async (req, res) => {
    try {
      const insertData = {
        ...req.body,
        createdBy: req.user?.username || 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      const newSubMerchantTerminal = await storage.createSubMerchantTerminal(insertData);
      res.json(newSubMerchantTerminal);
    } catch (error) {
      console.error('Error creating sub merchant terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create sub merchant terminal" 
      });
    }
  });

  // Update sub merchant terminal relationship
  app.put("/api/sub-merchant-terminals/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };

      const updatedSubMerchantTerminal = await storage.updateSubMerchantTerminal(id, updateData);
      res.json(updatedSubMerchantTerminal);
    } catch (error) {
      console.error('Error updating sub merchant terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update sub merchant terminal" 
      });
    }
  });

  // Delete sub merchant terminal relationship
  app.delete("/api/sub-merchant-terminals/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSubMerchantTerminal(id);
      res.json({ success: true, message: "Sub merchant terminal relationship deleted successfully" });
    } catch (error) {
      console.error('Error deleting sub merchant terminal:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete sub merchant terminal" 
      });
    }
  });

  // Perform fuzzy matching for a merchant
  app.post("/api/sub-merchant-terminals/fuzzy-match/:merchantId", isAuthenticated, async (req, res) => {
    try {
      const { merchantId } = req.params;
      console.log(`[FUZZY-MATCH] Starting fuzzy matching for merchant: ${merchantId}`);
      
      const result = await storage.performFuzzyMatching(merchantId);
      
      console.log(`[FUZZY-MATCH] Completed for ${merchantId}: ${result.matched} auto-matched, ${result.suggestions.length} suggestions`);
      
      res.json({
        success: true,
        merchantId,
        matched: result.matched,
        suggestions: result.suggestions,
        message: `Found ${result.matched} automatic matches and ${result.suggestions.length} suggestions for review`
      });
    } catch (error) {
      console.error('Error performing fuzzy matching:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to perform fuzzy matching" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Build charts cache with 60-day TDDF DT trends
async function buildChartsCache(requestedBy: string = 'system') {
  const startTime = Date.now();
  const chartsTableName = getTableName('charts_pre_cache');
  const tddfRecordsTableName = getTableName('tddf_records');
  const cacheKey = '60day_trends';
  
  console.log('[CHARTS-CACHE-BUILDER] Starting 60-day trends cache build...');
  
  try {
    // Calculate date range (last 60 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 60);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`[CHARTS-CACHE-BUILDER] Date range: ${startDateStr} to ${endDateStr}`);
    
    // Build daily aggregations
    const dailyDataQuery = `
      SELECT 
        transaction_date::date as date,
        SUM(COALESCE(transaction_amount, 0)) as transaction_amount,
        SUM(COALESCE(auth_amount, 0)) as auth_amount,
        COUNT(*) as transaction_count,
        COUNT(DISTINCT merchant_account_number) as unique_merchants
      FROM ${tddfRecordsTableName}
      WHERE transaction_date >= $1 AND transaction_date <= $2
        AND transaction_date IS NOT NULL
      GROUP BY transaction_date::date
      ORDER BY transaction_date::date
    `;
    
    const dailyResult = await pool.query(dailyDataQuery, [startDateStr, endDateStr]);
    const dailyData = dailyResult.rows.map(row => ({
      date: row.date,
      transactionAmount: parseFloat(row.transaction_amount || 0),
      authAmount: parseFloat(row.auth_amount || 0),
      transactionCount: parseInt(row.transaction_count || 0),
      uniqueMerchants: parseInt(row.unique_merchants || 0)
    }));
    
    // Build merchant trends (top 20 by volume)
    const merchantTrendsQuery = `
      SELECT 
        merchant_name,
        merchant_account_number as merchant_number,
        SUM(COALESCE(transaction_amount, 0)) as total_amount,
        COUNT(*) as transaction_count,
        AVG(COALESCE(transaction_amount, 0)) as avg_amount
      FROM ${tddfRecordsTableName}
      WHERE transaction_date >= $1 AND transaction_date <= $2
        AND transaction_date IS NOT NULL
        AND merchant_name IS NOT NULL
      GROUP BY merchant_name, merchant_account_number
      ORDER BY total_amount DESC
      LIMIT 20
    `;
    
    const merchantResult = await pool.query(merchantTrendsQuery, [startDateStr, endDateStr]);
    const merchantTrends = merchantResult.rows.map(row => ({
      merchantName: row.merchant_name,
      merchantNumber: row.merchant_number,
      totalAmount: parseFloat(row.total_amount || 0),
      transactionCount: parseInt(row.transaction_count || 0),
      avgAmount: parseFloat(row.avg_amount || 0)
    }));
    
    // Build auth vs transaction amount trends
    const authAmountTrendsQuery = `
      SELECT 
        transaction_date::date as date,
        SUM(COALESCE(transaction_amount, 0)) as transaction_amount,
        SUM(COALESCE(auth_amount, 0)) as auth_amount,
        SUM(COALESCE(auth_amount, 0)) - SUM(COALESCE(transaction_amount, 0)) as difference
      FROM ${tddfRecordsTableName}
      WHERE transaction_date >= $1 AND transaction_date <= $2
        AND transaction_date IS NOT NULL
      GROUP BY transaction_date::date
      ORDER BY transaction_date::date
    `;
    
    const authResult = await pool.query(authAmountTrendsQuery, [startDateStr, endDateStr]);
    const authAmountTrends = authResult.rows.map(row => {
      const transactionAmount = parseFloat(row.transaction_amount || 0);
      const authAmount = parseFloat(row.auth_amount || 0);
      const difference = parseFloat(row.difference || 0);
      const percentDifference = transactionAmount > 0 ? (difference / transactionAmount) * 100 : 0;
      
      return {
        date: row.date,
        transactionAmount,
        authAmount,
        difference,
        percentDifference
      };
    });
    
    // Build card type trends
    const cardTypeTrendsQuery = `
      SELECT 
        COALESCE(card_type, 'Unknown') as card_type,
        COUNT(*) as count,
        SUM(COALESCE(transaction_amount, 0)) as total_amount
      FROM ${tddfRecordsTableName}
      WHERE transaction_date >= $1 AND transaction_date <= $2
        AND transaction_date IS NOT NULL
      GROUP BY card_type
      ORDER BY count DESC
    `;
    
    const cardTypeResult = await pool.query(cardTypeTrendsQuery, [startDateStr, endDateStr]);
    const totalTransactions = cardTypeResult.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    const cardTypeTrends = cardTypeResult.rows.map(row => ({
      cardType: row.card_type,
      count: parseInt(row.count || 0),
      totalAmount: parseFloat(row.total_amount || 0),
      percentage: totalTransactions > 0 ? (parseInt(row.count) / totalTransactions) * 100 : 0
    }));
    
    // Calculate summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_records,
        SUM(COALESCE(transaction_amount, 0)) as total_transaction_amount,
        SUM(COALESCE(auth_amount, 0)) as total_auth_amount,
        COUNT(DISTINCT merchant_account_number) as unique_merchants
      FROM ${tddfRecordsTableName}
      WHERE transaction_date >= $1 AND transaction_date <= $2
        AND transaction_date IS NOT NULL
    `;
    
    const summaryResult = await pool.query(summaryQuery, [startDateStr, endDateStr]);
    const summary = summaryResult.rows[0];
    
    const processingTime = Date.now() - startTime;
    
    // Store in cache table
    await pool.query(`
      INSERT INTO ${chartsTableName} (
        cache_key, daily_data, merchant_trends, auth_amount_trends, card_type_trends,
        total_records, date_range, total_transaction_amount, total_auth_amount,
        unique_merchants, processing_time_ms, last_refresh_datetime, never_expires,
        refresh_requested_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (cache_key) 
      DO UPDATE SET
        daily_data = EXCLUDED.daily_data,
        merchant_trends = EXCLUDED.merchant_trends,
        auth_amount_trends = EXCLUDED.auth_amount_trends,
        card_type_trends = EXCLUDED.card_type_trends,
        total_records = EXCLUDED.total_records,
        date_range = EXCLUDED.date_range,
        total_transaction_amount = EXCLUDED.total_transaction_amount,
        total_auth_amount = EXCLUDED.total_auth_amount,
        unique_merchants = EXCLUDED.unique_merchants,
        processing_time_ms = EXCLUDED.processing_time_ms,
        last_refresh_datetime = EXCLUDED.last_refresh_datetime,
        refresh_requested_by = EXCLUDED.refresh_requested_by,
        updated_at = EXCLUDED.updated_at
    `, [
      cacheKey,
      JSON.stringify(dailyData),
      JSON.stringify(merchantTrends),
      JSON.stringify(authAmountTrends),
      JSON.stringify(cardTypeTrends),
      parseInt(summary.total_records || 0),
      JSON.stringify({ startDate: startDateStr, endDate: endDateStr }),
      parseFloat(summary.total_transaction_amount || 0),
      parseFloat(summary.total_auth_amount || 0),
      parseInt(summary.unique_merchants || 0),
      processingTime,
      new Date().toISOString(), // last_refresh_datetime
      true, // never_expires
      requestedBy, // refresh_requested_by
      new Date(), // created_at
      new Date() // updated_at
    ]);

    console.log('[CHARTS-CACHE-BUILDER] Cache built successfully');

  } catch (error) {
    console.error('[CHARTS-CACHE-BUILDER] Error building charts cache:', error);
    throw error;
  }
}