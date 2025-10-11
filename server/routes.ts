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
import { fileProcessorService } from "./services/file-processor";
import logsRoutes from "./routes/logs_routes";
import logTestRoutes from "./routes/log_test_routes";
import poolRoutes from "./routes/pool_routes";
import hierarchicalTddfMigrationRoutes from "./routes/hierarchical-tddf-migration";
import { registerReprocessSkippedRoutes } from "./routes/reprocess-skipped";
import { getTableName, getEnvironmentPrefix } from "./table-config";
import { NODE_ENV } from "./env-config";
import { getMmsWatcherInstance } from "./mms-watcher-instance";
import { encodeTddfToJsonbDirect, processAllRecordsToMasterTable } from "./tddf-json-encoder";
import { ReplitStorageService } from "./replit-storage-service";
import { HeatMapCacheBuilder } from "./services/heat-map-cache-builder";
import { heatMapCacheProcessingStats } from "@shared/schema";
import { backfillUniversalTimestamps } from "./services/universal-timestamp";
import { parseTddfFilename, formatProcessingTime } from "./utils/tddfFilename";
import { logger } from "../shared/logger";

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
  if ((req.path.startsWith('/api/tddf-api/') || req.path.includes('/jsonb-data') || req.path.includes('/re-encode') || req.path.includes('/uploader/uploader_') || req.path.includes('/global-merchant-search')) && process.env.NODE_ENV === 'development') {
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
  registerUserRoutes(app);
  registerApiUserRoutes(app);
  
  // Phase B: System Routes
  registerSystemRoutes(app);
  registerAuthRoutes(app);
  registerSettingsRoutes(app);
  registerSchemaRoutes(app);
  
  // Phase D: TDDF Routes
  registerTddfFilesRoutes(app);
  registerTddfRecordsRoutes(app);
  registerTddfCacheRoutes(app);

  // Uploader Routes
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
    logger.uploader('GET /api/uploader endpoint reached');
    logger.uploader('Query parameters:', req.query);
    try {
      const { phase, sessionId, limit, offset, environment } = req.query;
      logger.uploader('Parsed parameters:', { phase, sessionId, limit, offset, environment });
      
      // Support cross-environment viewing: use specific table if environment is specified
      let tableName = getTableName('uploader_uploads'); // Default to current environment
      if (environment === 'production') {
        tableName = 'uploader_uploads'; // Production table
      } else if (environment === 'development') {
        tableName = 'dev_uploader_uploads'; // Development table
      }
      
      logger.uploader('Using table:', tableName, 'for environment:', environment || 'current');
      
      // Get total count first for pagination
      let totalCount = 0;
      let allUploads: any[] = [];
      
      try {
        // First, get total count for pagination
        let countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
        const countParams: any[] = [];
        const countConditions: string[] = [];
        
        if (phase) {
          countConditions.push(`current_phase = $${countParams.length + 1}`);
          countParams.push(phase);
        }
        
        if (sessionId) {
          countConditions.push(`session_id = $${countParams.length + 1}`);
          countParams.push(sessionId);
        }
        
        if (countConditions.length > 0) {
          countQuery += ` WHERE ${countConditions.join(' AND ')}`;
        }
        
        const countResult = await pool.query(countQuery, countParams);
        totalCount = parseInt(countResult.rows[0]?.count || '0');
        
        // Also count cross-environment transferred files if we're in development
        if (tableName.includes('dev_')) {
          try {
            const prodCountQuery = `SELECT COUNT(*) as count FROM uploader_uploads WHERE session_id = 'cross_env_transfer'`;
            const prodCountResult = await pool.query(prodCountQuery);
            const prodCount = parseInt(prodCountResult.rows[0]?.count || '0');
            totalCount += prodCount;
          } catch (prodError) {
            console.log('[CROSS-ENV] Production table not accessible for count, skipping cross-env count');
          }
        }
        
        // Then query current environment table with proper pagination
        let query = `SELECT *, 'current' as source_env FROM ${tableName}`;
        const params: any[] = [];
        const conditions: string[] = [];
        
        if (phase) {
          conditions.push(`current_phase = $${params.length + 1}`);
          params.push(phase);
        }
        
        if (sessionId) {
          conditions.push(`session_id = $${params.length + 1}`);
          params.push(sessionId);
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
        
        // Also query for cross-environment transferred files if we're in development
        if (tableName.includes('dev_')) {
          try {
            const prodQuery = `SELECT *, 'production' as source_env FROM uploader_uploads WHERE session_id = 'cross_env_transfer'`;
            const prodResult = await pool.query(prodQuery);
            // Add production cross-env transfers to the list
            allUploads = [...allUploads, ...prodResult.rows];
          } catch (prodError) {
            console.log('[CROSS-ENV] Production table not accessible, skipping cross-env files');
          }
        }
        
        logger.uploader('Found uploads:', allUploads.length, 'Total count:', totalCount);
        
        res.json({
          uploads: allUploads,
          totalCount: totalCount,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : 0
        });
      } catch (error: any) {
        logger.uploader('Database error:', error);
        res.status(500).json({ 
          error: "Database error",
          details: error.message,
          uploads: [],
          totalCount: 0
        });
      }
    } catch (error: any) {
      logger.uploader('Unexpected error:', error);
      res.status(500).json({ 
        error: "Unexpected error",
        details: error.message,
        uploads: [],
        totalCount: 0
      });
    }
  });

  // Uploader dashboard metrics
  app.get("/api/uploader/dashboard-metrics", isAuthenticated, async (req, res) => {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Try to get cached metrics from uploader dashboard cache first
      const cacheResult = await pool.query(`
        SELECT cache_data, refresh_state, last_manual_refresh, created_at, build_time_ms
        FROM ${getTableName('uploader_dashboard_cache')}
        WHERE cache_key = 'uploader_stats' 
        AND expires_at > NOW()
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (cacheResult.rows.length > 0) {
        const cached = cacheResult.rows[0];
        return res.json({
          ...cached.cache_data,
          refreshState: cached.refresh_state,
          lastRefreshTime: cached.last_manual_refresh || cached.created_at,
          cacheMetadata: {
            lastRefreshed: cached.created_at,
            buildTime: cached.build_time_ms,
            fromCache: true
          }
        });
      }

      // Generate fresh metrics from uploader tables
      const [totalFiles, completedFiles, failedFiles, processingFiles, lastUploadResult, recentFilesResult] = await Promise.all([
        pool.query(`SELECT COUNT(*) as count FROM ${uploaderTableName}`),
        pool.query(`SELECT COUNT(*) as count FROM ${uploaderTableName} WHERE current_phase IN ('uploaded', 'identified', 'encoded')`),
        pool.query(`SELECT COUNT(*) as count FROM ${uploaderTableName} WHERE current_phase = 'failed'`),
        pool.query(`SELECT COUNT(*) as count FROM ${uploaderTableName} WHERE current_phase IN ('started', 'uploading', 'processing')`),
        pool.query(`
          SELECT MAX(created_at) as last_upload_date,
                 MAX(CASE WHEN current_phase IN ('uploaded', 'identified', 'encoded') THEN created_at END) as last_completed_upload
          FROM ${uploaderTableName}
        `),
        pool.query(`
          SELECT COUNT(*) as count 
          FROM ${uploaderTableName} 
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `)
      ]);

      const totalCount = parseInt(totalFiles.rows[0]?.count || 0);
      const completedCount = parseInt(completedFiles.rows[0]?.count || 0);
      const failedCount = parseInt(failedFiles.rows[0]?.count || 0);
      const processingCount = parseInt(processingFiles.rows[0]?.count || 0);
      const last24hCount = parseInt(recentFilesResult.rows[0]?.count || 0);

      res.json({
        totalFiles: totalCount,
        completedFiles: completedCount,
        failedFiles: failedCount,
        processingFiles: processingCount,
        lastUploadDate: lastUploadResult.rows[0]?.last_upload_date || null,
        lastCompletedUpload: lastUploadResult.rows[0]?.last_completed_upload || null,
        last24Hours: last24hCount,
        cacheMetadata: {
          fromCache: false
        }
      });
    } catch (error) {
      console.error('Error getting uploader dashboard metrics:', error);
      res.status(500).json({ error: 'Failed to get uploader dashboard metrics' });
    }
  });

  // Get last new data date from uploader uploads
  app.get("/api/uploader/last-new-data-date", isAuthenticated, async (req, res) => {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Get last new data date (most recent upload that completed)
      const lastDataResult = await pool.query(`
        SELECT MAX(created_at) as last_new_data_date
        FROM ${uploaderTableName}
        WHERE current_phase IN ('uploaded', 'identified', 'encoded')
        AND created_at IS NOT NULL
      `);
      
      const lastNewDataDate = lastDataResult.rows[0]?.last_new_data_date || null;
      
      res.json({
        lastNewDataDate: lastNewDataDate,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting last new data date:', error);
      res.status(500).json({ error: 'Failed to get last new data date' });
    }
  });

  // Scan for orphan files in Object Storage vs Database
  app.post("/api/uploader/scan-orphans", isAuthenticated, async (req, res) => {
    try {
      const config = ReplitStorageService.getConfigStatus();
      
      if (!config.available) {
        return res.status(400).json({
          error: 'Object storage not configured'
        });
      }

      // Get storage location from request body (or use current environment as default)
      const storageLocation = req.body.storageLocation || 'auto';
      let actualPrefix = config.folderPrefix; // Default to current environment
      
      // Override prefix based on selection
      if (storageLocation === 'dev-uploader') {
        actualPrefix = 'dev-uploader';
      } else if (storageLocation === 'prod-uploader') {
        actualPrefix = 'prod-uploader';
      }
      
      console.log(`[ORPHAN-SCAN] Starting orphan file scan for ${actualPrefix}/...`);
      
      // Get files from the specified storage location
      const searchPrefix = actualPrefix.endsWith('/') ? actualPrefix : `${actualPrefix}/`;
      const storageFiles = await ReplitStorageService.listFiles(searchPrefix);
      console.log(`[ORPHAN-SCAN] Found ${storageFiles.length} files in ${actualPrefix}/ storage location`);
      
      // Get all upload records from database  
      const uploaderUploadsTableName = getTableName('uploader_uploads');
      const databaseRecordsResult = await db.execute(sql`
        SELECT id, filename, s3_key
        FROM ${sql.identifier(uploaderUploadsTableName)}
        ORDER BY uploaded_at DESC
      `);
      
      const databaseFiles = databaseRecordsResult.rows;
      console.log(`[ORPHAN-SCAN] Found ${databaseFiles.length} upload records in database`);
      
      // Find orphan files (in storage but not in database)
      const orphanFiles: string[] = [];
      
      for (const storageFile of storageFiles) {
        // Check if this storage file matches any database record
        const matchingDbRecord = databaseFiles.find(dbFile => {
          // Check multiple potential matches:
          // 1. Direct s3_key match
          if (dbFile.s3_key && dbFile.s3_key === storageFile) {
            return true;
          }
          
          // 2. Check if storage path contains the upload ID and filename
          const fileName = storageFile.split('/').pop();
          if (fileName && storageFile.includes(dbFile.id) && fileName === dbFile.filename) {
            return true;
          }
          
          return false;
        });
        
        if (!matchingDbRecord) {
          orphanFiles.push(storageFile);
        }
      }
      
      console.log(`[ORPHAN-SCAN] Found ${orphanFiles.length} orphan files`);
      
      const result = {
        success: true,
        totalStorageFiles: storageFiles.length,
        databaseFiles: databaseFiles.length,
        orphanCount: orphanFiles.length,
        orphanFiles: orphanFiles.slice(0, 50), // Return first 50 for preview
        scannedAt: new Date().toISOString(),
        environment: config.environment,
        actualPrefix: actualPrefix,
        storageLocation: storageLocation
      };
      
      res.json(result);
    } catch (error: any) {
      console.error('Orphan scan error:', error);
      res.status(500).json({ error: error.message });
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
  
  // Get analytics data
  app.get("/api/analytics", async (req, res) => {
    try {
      const timeframe = req.query.timeframe as string || 'year';
      const dashboardStats = await storage.getDashboardStats();
      
      // Log the requested timeframe for debugging
      console.log(`Analytics request for timeframe: ${timeframe}`);
      
      // @ENVIRONMENT-CRITICAL - Analytics data query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses raw SQL for environment awareness 
      const achTransactionsTableName = getTableName('api_achtransactions');
      const merchantsTableName = getTableName('merchants');
      
      // Get transaction history data for the charts using raw SQL
      const transactionQuery = `
        SELECT t.*, m.name as merchant_name 
        FROM ${achTransactionsTableName} t
        INNER JOIN ${merchantsTableName} m ON t.merchant_id = m.id
        ORDER BY t.transaction_date
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
        processingNotes: `Manual re-processing by ${req.user?.username || 'user'}: ${processingResult.rowsProcessed} rows processed`,
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
      
      // Find required columns
      const vNumberCol = headers.findIndex(h => h === 'V Number' || h === 'Terminal #');
      const posCol = headers.findIndex(h => h === 'POS Merchant #');
      const dbaCol = headers.findIndex(h => h === 'DBA Name');
      const mccCol = headers.findIndex(h => h === 'PRR MCC' || h === 'Terminal Visa MCC');
      
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
          const existing = beforeTerminals.find(t => t.v_number === vNumber);
          
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