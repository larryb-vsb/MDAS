import { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage, isFallbackStorage } from "../storage";
import { isAuthenticated, setProcessingPaused } from "./middleware";

export function registerSystemRoutes(app: Express) {
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
}
