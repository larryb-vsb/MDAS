import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeSchemaVersions } from "./schema_version";
import { initializeBackupScheduler } from "./backup/backup_scheduler";
import { ensureAppDirectories } from "./utils/fs-utils";
import { config, NODE_ENV } from "./env-config";
import { pool, db } from "./db";
import { migrateDatabase } from "./database-migrate";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure environment-specific directories exist
  ensureAppDirectories();
  
  // Set up error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  
  try {
    // Run database migrations to create tables if they don't exist
    const migrationSuccess = await migrateDatabase();
    if (!migrationSuccess) {
      console.error("Database migration failed. The application may not function correctly.");
    }
    
    // Initialize schema version tracking
    if (migrationSuccess) {
      await initializeSchemaVersions().catch(err => {
        console.log("Warning: Could not initialize schema versions:", err.message);
      });
      
      // Start the backup scheduler
      await initializeBackupScheduler().catch(err => {
        console.log("Warning: Could not initialize backup scheduler:", err.message);
      });
    }
    
    // Create http server
    const httpServer = createServer(app);
    
    // Register routes
    await registerRoutes(app);

    // Set up Vite in development
    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    // Start the server on port 5000
    const port = 5000;
    httpServer.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`Server running on port ${port} in ${NODE_ENV} mode`);
    });
  } catch (error) {
    console.error("Failed to initialize application:", error);
    process.exit(1);
  }
})();
