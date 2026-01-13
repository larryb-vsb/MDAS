import { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage, isFallbackStorage } from "../storage";
import { isAuthenticated, setProcessingPaused } from "./middleware";
import { getTableName } from "../../shared/schema";
import { NODE_ENV } from "../env-config";

export function registerSystemRoutes(app: Express) {
  // TABLE VALIDATION: Check if required tables exist in database
  app.get("/api/system/validate-tables", async (req, res) => {
    try {
      console.log("[TABLE-VALIDATION] Starting table validation check...");
      
      const environment = NODE_ENV;
      
      // List of critical tables required for connection logging, IP blocking, and host approvals
      const requiredTables = [
        { name: 'connection_log', description: 'Connection logging for security monitoring' },
        { name: 'ip_blocklist', description: 'IP blocking for security' },
        { name: 'host_approvals', description: 'Host approval system for batch uploaders' }
      ];
      
      const results = [];
      
      for (const table of requiredTables) {
        const fullTableName = getTableName(table.name);
        
        try {
          const exists = await db.execute(sql`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public'
                AND table_name = ${fullTableName}
            );
          `);
          
          const tableExists = exists.rows[0]?.exists || false;
          
          results.push({
            table: table.name,
            fullName: fullTableName,
            exists: tableExists,
            description: table.description,
            status: tableExists ? 'OK' : 'MISSING'
          });
          
          if (!tableExists) {
            console.log(`⚠️ [TABLE-VALIDATION] Missing table: ${fullTableName}`);
          }
        } catch (error: any) {
          results.push({
            table: table.name,
            fullName: fullTableName,
            exists: false,
            description: table.description,
            status: 'ERROR',
            error: error?.message || 'Unknown error'
          });
        }
      }
      
      const missingTables = results.filter(r => !r.exists);
      const allTablesExist = missingTables.length === 0;
      
      const response = {
        environment,
        allTablesExist,
        tablesChecked: results.length,
        missingCount: missingTables.length,
        tables: results,
        ...(missingTables.length > 0 && {
          fix: {
            message: "Run database migration to create missing tables",
            command: "npm run db:push",
            missingTables: missingTables.map(t => t.fullName)
          }
        })
      };
      
      if (!allTablesExist) {
        console.log(`❌ [TABLE-VALIDATION] ${missingTables.length} table(s) missing in ${environment}:`, missingTables.map(t => t.fullName));
      } else {
        console.log(`✅ [TABLE-VALIDATION] All required tables exist in ${environment}`);
      }
      
      res.json(response);
      
    } catch (error) {
      console.error("[TABLE-VALIDATION] Error:", error);
      res.status(500).json({
        error: "Table validation failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // DATABASE CLEANUP: Drop users table and fix session table naming
  app.post("/api/system/cleanup-tables", async (req, res) => {
    try {
      const { secret } = req.body;
      
      if (secret !== "emergency-admin-init-2025") {
        return res.status(403).json({ error: "Invalid secret" });
      }
      
      console.log("[DB-CLEANUP] Starting database table cleanup...");
      const results = [];
      
      // Step 1: Check dependencies on users table
      console.log("[DB-CLEANUP] Checking dependencies on users table...");
      const userDependencies = await db.execute(sql`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_name = 'users';
      `);
      
      results.push({
        step: "check_dependencies",
        dependencies: userDependencies.rows
      });
      
      // Step 2: Drop users table with CASCADE
      console.log("[DB-CLEANUP] Dropping users table with CASCADE...");
      try {
        await db.execute(sql`DROP TABLE IF EXISTS users CASCADE;`);
        console.log("[DB-CLEANUP] ✅ users table dropped successfully");
        results.push({
          step: "drop_users_table",
          success: true,
          message: "users table dropped successfully"
        });
      } catch (dropError) {
        console.log("[DB-CLEANUP] ❌ Failed to drop users table:", dropError);
        results.push({
          step: "drop_users_table", 
          success: false,
          error: dropError instanceof Error ? dropError.message : String(dropError)
        });
      }
      
      // Step 3: Check if session table exists
      console.log("[DB-CLEANUP] Checking session table...");
      const sessionExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'session'
        );
      `);
      
      if (sessionExists.rows[0]?.exists) {
        // Step 4: Rename session to dev_session
        console.log("[DB-CLEANUP] Renaming session table to dev_session...");
        try {
          await db.execute(sql`ALTER TABLE session RENAME TO dev_session;`);
          console.log("[DB-CLEANUP] ✅ session table renamed to dev_session");
          results.push({
            step: "rename_session_table",
            success: true,
            message: "session table renamed to dev_session"
          });
        } catch (renameError) {
          console.log("[DB-CLEANUP] ❌ Failed to rename session table:", renameError);
          results.push({
            step: "rename_session_table",
            success: false,
            error: renameError instanceof Error ? renameError.message : String(renameError)
          });
        }
      } else {
        results.push({
          step: "rename_session_table",
          success: false,
          message: "session table does not exist"
        });
      }
      
      console.log("[DB-CLEANUP] Database cleanup completed");
      res.json({
        success: true,
        message: "Database cleanup completed",
        results
      });
      
    } catch (error) {
      console.error("[DB-CLEANUP] Error:", error);
      res.status(500).json({
        error: "Database cleanup failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // DATABASE ANALYSIS: Check table dependencies and constraints
  app.get("/api/system/analyze-tables", async (req, res) => {
    try {
      console.log("[TABLE-ANALYSIS] Starting table dependency analysis...");
      
      // Check foreign key constraints that reference the users table
      const userConstraints = await db.execute(sql`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND (ccu.table_name = 'users' OR tc.table_name = 'users')
        ORDER BY tc.table_name;
      `);
      
      // Get all tables and their prefixes
      const allTables = await db.execute(sql`
        SELECT 
          table_name,
          CASE 
            WHEN table_name LIKE 'dev_%' THEN 'dev_prefixed'
            ELSE 'no_prefix'
          END as prefix_type
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY prefix_type, table_name;
      `);
      
      // Check session table dependencies specifically  
      const sessionConstraints = await db.execute(sql`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND (ccu.table_name = 'session' OR tc.table_name = 'session');
      `);
      
      const analysis = {
        userTableConstraints: userConstraints.rows,
        sessionTableConstraints: sessionConstraints.rows,
        tablesByPrefix: {
          dev_prefixed: allTables.rows.filter(r => r.prefix_type === 'dev_prefixed'),
          no_prefix: allTables.rows.filter(r => r.prefix_type === 'no_prefix')
        },
        summary: {
          total_tables: allTables.rows.length,
          dev_prefixed_count: allTables.rows.filter(r => r.prefix_type === 'dev_prefixed').length,
          no_prefix_count: allTables.rows.filter(r => r.prefix_type === 'no_prefix').length
        }
      };
      
      console.log("[TABLE-ANALYSIS] Analysis complete:", JSON.stringify(analysis, null, 2));
      res.json(analysis);
      
    } catch (error) {
      console.error("[TABLE-ANALYSIS] Error:", error);
      res.status(500).json({
        error: "Table analysis failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // DATABASE REPAIR: Copy admin from dev_users to users table for production
  app.post("/api/system/fix-admin-tables", async (req, res) => {
    try {
      const { secret } = req.body;
      
      if (secret !== "emergency-admin-init-2025") {
        return res.status(403).json({ error: "Invalid secret" });
      }
      
      console.log("[DATABASE REPAIR] Starting admin table repair...");
      
      // Check if admin exists in both tables
      const devAdminResult = await db.execute(sql`
        SELECT * FROM dev_users WHERE username = 'admin' LIMIT 1
      `);
      
      const prodAdminResult = await db.execute(sql`
        SELECT * FROM users WHERE username = 'admin' LIMIT 1
      `);
      
      console.log(`[DATABASE REPAIR] Dev admin found: ${devAdminResult.rows.length > 0}`);
      console.log(`[DATABASE REPAIR] Prod admin found: ${prodAdminResult.rows.length > 0}`);
      
      if (devAdminResult.rows.length > 0 && prodAdminResult.rows.length === 0) {
        // Copy admin from dev_users to users
        const devAdmin = devAdminResult.rows[0];
        console.log("[DATABASE REPAIR] Copying admin from dev_users to users...");
        
        await db.execute(sql`
          INSERT INTO users (username, password, email, first_name, last_name, role, developer_flag, default_dashboard, theme_preference, created_at, last_login)
          VALUES (${devAdmin.username}, ${devAdmin.password}, ${devAdmin.email}, ${devAdmin.first_name}, ${devAdmin.last_name}, ${devAdmin.role}, ${devAdmin.developer_flag}, ${devAdmin.default_dashboard}, ${devAdmin.theme_preference}, ${devAdmin.created_at}, ${devAdmin.last_login})
          ON CONFLICT (username) DO UPDATE SET 
            password = EXCLUDED.password,
            role = EXCLUDED.role,
            developer_flag = EXCLUDED.developer_flag
        `);
        
        console.log("[DATABASE REPAIR] ✅ Admin copied successfully");
        res.json({ 
          success: true, 
          message: "Admin user copied from dev_users to users table",
          credentials: "admin/admin123"
        });
      } else {
        res.json({ 
          success: false, 
          message: "Admin already exists in production table or missing from dev table",
          devAdmin: devAdminResult.rows.length > 0,
          prodAdmin: prodAdminResult.rows.length > 0
        });
      }
      
    } catch (error) {
      console.error("[DATABASE REPAIR] Error:", error);
      res.status(500).json({ 
        error: "Database repair failed", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // EMERGENCY: Admin user initialization endpoint for production database fixes
  app.post("/api/system/init-admin", async (req, res) => {
    try {
      const { secret } = req.body;
      
      // Security check - require a secret to prevent abuse
      if (secret !== "emergency-admin-init-2025") {
        return res.status(403).json({ error: "Invalid secret" });
      }
      
      console.log("[EMERGENCY ADMIN INIT] Starting admin user initialization...");
      
      // Force admin user creation using the ensureAdminUser function
      const { ensureAdminUser } = await import('../database-helpers');
      await ensureAdminUser();
      
      console.log("[EMERGENCY ADMIN INIT] Admin user created/updated successfully");
      res.json({ 
        success: true, 
        message: "Admin user initialized successfully",
        credentials: "admin/admin123"
      });
      
    } catch (error) {
      console.error("[EMERGENCY ADMIN INIT] Error:", error);
      res.status(500).json({ 
        error: "Failed to initialize admin user", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Global pause/resume controls for processing
  app.post("/api/system/pause-processing", isAuthenticated, (req, res) => {
    setProcessingPaused(true);
    console.log("[SYSTEM] 🛑 PROCESSING PAUSED by user request");
    res.json({ status: "paused", message: "All processing activities have been paused" });
  });

  app.post("/api/system/resume-processing", isAuthenticated, (req, res) => {
    setProcessingPaused(false);
    console.log("[SYSTEM] ▶️ PROCESSING RESUMED by user request");
    res.json({ status: "resumed", message: "Processing activities have been resumed" });
  });

  app.get("/api/system/processing-status", isAuthenticated, (req, res) => {
    const { isProcessingPaused } = require('./middleware');
    res.json({ 
      paused: isProcessingPaused(),
      status: isProcessingPaused() ? "paused" : "running"
    });
  });

  // System information endpoint with fallback storage status
  app.get("/api/system/info", async (req, res) => {
    try {
      // Get environment information from env-config
      const { NODE_ENV, isProd, isDev, isTest } = await import('../env-config');
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

  // Project documentation endpoint - serves replit.md content
  app.get("/api/system/replit-md", async (req, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const filePath = path.join(process.cwd(), 'replit.md');
      const content = await fs.readFile(filePath, 'utf-8');
      
      res.json({
        success: true,
        content,
        lastModified: (await fs.stat(filePath)).mtime
      });
    } catch (error) {
      console.error("Error reading replit.md:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to read project documentation"
      });
    }
  });

  // Verbose logging configuration endpoints for automation/AI monitoring
  // Get current verbose logging configuration
  app.get("/api/system/verbose-config", isAuthenticated, async (req, res) => {
    try {
      const { logConfig } = await import('../../shared/logger');
      res.json({
        success: true,
        config: { ...logConfig },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[VERBOSE-CONFIG] Error getting config:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get verbose config"
      });
    }
  });

  // Update verbose logging configuration
  app.put("/api/system/verbose-config", isAuthenticated, async (req, res) => {
    try {
      const { logConfig, updateLogConfig } = await import('../../shared/logger');
      const updates = req.body;
      
      // Validate updates
      const validKeys = ['auth', 'navigation', 'uploader', 'charts', 'tddfProcessing', 'database', 'all'];
      const invalidKeys = Object.keys(updates).filter(key => !validKeys.includes(key));
      
      if (invalidKeys.length > 0) {
        return res.status(400).json({
          error: "Invalid configuration keys",
          invalidKeys,
          validKeys
        });
      }
      
      // Validate values are boolean
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value !== 'boolean') {
          return res.status(400).json({
            error: `Value for '${key}' must be boolean`,
            received: typeof value
          });
        }
      }
      
      // Apply updates
      updateLogConfig(updates);
      
      console.log("[VERBOSE-CONFIG] Configuration updated:", updates);
      console.log("[VERBOSE-CONFIG] New config:", { ...logConfig });
      
      res.json({
        success: true,
        message: "Verbose logging configuration updated",
        config: { ...logConfig },
        updated: updates,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[VERBOSE-CONFIG] Error updating config:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update verbose config"
      });
    }
  });

  // Reset verbose logging configuration to defaults
  app.post("/api/system/verbose-config/reset", isAuthenticated, async (req, res) => {
    try {
      const { logConfig, resetLogConfig } = await import('../../shared/logger');
      
      resetLogConfig();
      
      console.log("[VERBOSE-CONFIG] Configuration reset to defaults");
      console.log("[VERBOSE-CONFIG] Current config:", { ...logConfig });
      
      res.json({
        success: true,
        message: "Verbose logging configuration reset to defaults",
        config: { ...logConfig },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("[VERBOSE-CONFIG] Error resetting config:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to reset verbose config"
      });
    }
  });

  // Dump system logs to object storage
  app.post("/api/system/dump-logs", isAuthenticated, async (req, res) => {
    try {
      const { minutes } = req.body;
      
      // Validate minutes parameter
      const validMinutes = [5, 15, 30];
      const dumpMinutes = validMinutes.includes(minutes) ? minutes : 30;
      
      console.log(`[LOG-DUMP] Starting log dump for last ${dumpMinutes} minutes...`);
      
      const systemLogsTable = getTableName('system_logs');
      const securityLogsTable = getTableName('security_logs');
      const cutoffTime = new Date(Date.now() - dumpMinutes * 60 * 1000);
      
      // Fetch system logs from the specified time window
      const systemLogsResult = await db.execute(sql`
        SELECT * FROM ${sql.raw(systemLogsTable)}
        WHERE timestamp >= ${cutoffTime.toISOString()}
        ORDER BY timestamp DESC
      `);
      
      // Fetch security logs from the specified time window
      let securityLogs: any[] = [];
      try {
        const securityLogsResult = await db.execute(sql`
          SELECT * FROM ${sql.raw(securityLogsTable)}
          WHERE created_at >= ${cutoffTime.toISOString()}
          ORDER BY created_at DESC
        `);
        securityLogs = securityLogsResult.rows || [];
      } catch (e) {
        console.log('[LOG-DUMP] Security logs table not available, skipping');
      }
      
      const systemLogs = systemLogsResult.rows || [];
      
      // Create log dump content
      const dumpContent = {
        metadata: {
          dumpedAt: new Date().toISOString(),
          environment: NODE_ENV,
          minutesCovered: dumpMinutes,
          cutoffTime: cutoffTime.toISOString(),
          systemLogCount: systemLogs.length,
          securityLogCount: securityLogs.length,
          dumpedBy: (req.user as any)?.username || 'unknown'
        },
        systemLogs,
        securityLogs
      };
      
      // Convert to JSON string
      const dumpJson = JSON.stringify(dumpContent, null, 2);
      const dumpBuffer = Buffer.from(dumpJson, 'utf-8');
      
      // Generate storage key
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const environment = NODE_ENV === 'production' ? 'prod' : 'dev';
      const storageKey = `${environment}-logs/dump-${dumpMinutes}min-${timestamp}.json`;
      
      // Upload to object storage
      const { ReplitStorageService } = await import('../replit-storage-service');
      const client = (ReplitStorageService as any).getClient();
      
      const result = await client.uploadFromBytes(storageKey, dumpBuffer);
      
      if (!result.ok) {
        throw new Error(`Upload failed: ${result.error?.message || 'Unknown error'}`);
      }
      
      console.log(`[LOG-DUMP] ✅ Dumped ${systemLogs.length} system logs and ${securityLogs.length} security logs to ${storageKey}`);
      
      res.json({
        success: true,
        message: `Successfully dumped logs from last ${dumpMinutes} minutes`,
        storageKey,
        systemLogCount: systemLogs.length,
        securityLogCount: securityLogs.length,
        totalSize: dumpBuffer.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error("[LOG-DUMP] Error dumping logs:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to dump logs"
      });
    }
  });

  // List previously dumped log files
  app.get("/api/system/dump-logs/list", isAuthenticated, async (req, res) => {
    try {
      const environment = NODE_ENV === 'production' ? 'prod' : 'dev';
      const prefix = `${environment}-logs/`;
      
      const { ReplitStorageService } = await import('../replit-storage-service');
      const client = (ReplitStorageService as any).getClient();
      
      const result = await client.list({ prefix });
      
      if (!result.ok) {
        throw new Error(`List failed: ${result.error?.message || 'Unknown error'}`);
      }
      
      const files = (result.value || []).map((item: any) => ({
        key: item.key || item.name || item,
        size: item.size,
        lastModified: item.lastModified
      })).sort((a: any, b: any) => {
        // Sort by key descending (newest first based on timestamp in filename)
        return b.key.localeCompare(a.key);
      });
      
      res.json({
        success: true,
        count: files.length,
        files
      });
      
    } catch (error) {
      console.error("[LOG-DUMP] Error listing log dumps:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to list log dumps"
      });
    }
  });
}
