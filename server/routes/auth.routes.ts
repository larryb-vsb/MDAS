import { Express } from "express";
import { db, sql } from "../db";
import { storage } from "../storage";

export function registerAuthRoutes(app: Express) {
  // LOGIN VERIFICATION: Test actual login flow with detailed logging
  app.post("/api/auth/test-login", async (req, res) => {
    try {
      console.log("[LOGIN-TEST] Starting comprehensive login test...");
      const { username = "admin", password = "admin123" } = req.body;
      
      console.log(`[LOGIN-TEST] Testing credentials: ${username} / ${password.length}-char password`);
      
      // Test getUserByUsername directly
      console.log("[LOGIN-TEST] Testing getUserByUsername directly...");
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        console.log("[LOGIN-TEST] ❌ getUserByUsername returned null/undefined");
        return res.json({
          success: false,
          stage: "user_lookup_failed",
          message: "User not found in database"
        });
      }
      
      console.log(`[LOGIN-TEST] ✅ Found user: ${user.username}, role: ${user.role}`);
      console.log(`[LOGIN-TEST] Password hash: ${user.password.substring(0, 10)}...`);
      
      // Test password comparison
      const bcrypt = await import('bcrypt');
      const passwordMatch = await bcrypt.compare(password, user.password);
      console.log(`[LOGIN-TEST] Password match result: ${passwordMatch}`);
      
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        passwordMatch,
        stage: "complete"
      });
      
    } catch (error) {
      console.error("[LOGIN-TEST] Error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stage: "error"
      });
    }
  });

  // AUTHENTICATION DIAGNOSTICS: Comprehensive login debugging endpoint
  app.get("/api/auth/diagnostics", async (req, res) => {
    try {
      console.log("[AUTH-DIAGNOSTICS] Starting authentication diagnostic check...");
      
      // Get environment configuration
      const { getEnvironment } = await import('../env-config');
      const { NODE_ENV, isProd, isDev } = getEnvironment();
      
      // Get table configuration  
      const { getTableName } = await import('../table-config');
      const usersTable = getTableName('users');
      const sessionTable = getTableName('session');
      
      // Check database connection info (redact sensitive data) - use proper environment config
      const { getDatabaseUrl } = await import('../env-config');
      const dbUrl = getDatabaseUrl();
      const dbHost = dbUrl ? new URL(dbUrl).hostname : 'unknown';
      const dbName = dbUrl ? new URL(dbUrl).pathname.slice(1) : 'unknown';
      
      console.log(`[AUTH-DIAGNOSTICS] Environment: ${NODE_ENV}, isProd: ${isProd}, isDev: ${isDev}`);
      console.log(`[AUTH-DIAGNOSTICS] Database host: ${dbHost}, database: ${dbName}`);
      console.log(`[AUTH-DIAGNOSTICS] Target users table: ${usersTable}`);
      console.log(`[AUTH-DIAGNOSTICS] Target session table: ${sessionTable}`);
      
      // Check table existence
      const [usersExists, devUsersExists, sessionExists, devSessionExists] = await Promise.all([
        db.execute(sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')`)
          .then(r => r.rows[0]?.exists || false)
          .catch(() => false),
        db.execute(sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dev_users')`)
          .then(r => r.rows[0]?.exists || false)  
          .catch(() => false),
        db.execute(sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'session')`)
          .then(r => r.rows[0]?.exists || false)
          .catch(() => false),
        db.execute(sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dev_session')`)
          .then(r => r.rows[0]?.exists || false)
          .catch(() => false)
      ]);
      
      // Check admin user existence (no sensitive data)
      const [adminInUsers, adminInDevUsers] = await Promise.all([
        usersExists ? 
          db.execute(sql`SELECT COUNT(*) as count FROM users WHERE username = 'admin'`)
            .then(r => r.rows[0]?.count > 0)
            .catch(() => false) : false,
        devUsersExists ?
          db.execute(sql`SELECT COUNT(*) as count FROM dev_users WHERE username = 'admin'`) 
            .then(r => r.rows[0]?.count > 0)
            .catch(() => false) : false
      ]);
      
      const diagnostics = {
        environment: {
          NODE_ENV,
          isProd, 
          isDev,
          dbHost,
          dbName: dbName === 'neondb' ? 'neondb' : 'other'
        },
        tables: {
          targetUsersTable: usersTable,
          targetSessionTable: sessionTable,
          exists: {
            users: usersExists,
            dev_users: devUsersExists, 
            session: sessionExists,
            dev_session: devSessionExists
          }
        },
        admin: {
          existsInUsers: adminInUsers,
          existsInDevUsers: adminInDevUsers,
          targetTableHasAdmin: usersTable === 'users' ? adminInUsers : adminInDevUsers
        }
      };
      
      console.log(`[AUTH-DIAGNOSTICS] Results:`, JSON.stringify(diagnostics, null, 2));
      
      // Create session table if missing and needed
      if (!diagnostics.tables.exists.session && !diagnostics.tables.exists.dev_session) {
        try {
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS session (
              sid varchar PRIMARY KEY,
              sess json NOT NULL,
              expire timestamp(6) NOT NULL
            );
            CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);
          `);
          console.log("[AUTH-DIAGNOSTICS] ✅ Created missing session table");
          diagnostics.tables.exists.session = true;
        } catch (sessionError) {
          console.log("[AUTH-DIAGNOSTICS] ⚠️ Failed to create session table:", sessionError);
        }
      }
      
      res.json(diagnostics);
      
    } catch (error) {
      console.error("[AUTH-DIAGNOSTICS] Error:", error);
      res.status(500).json({
        error: "Diagnostics failed",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
