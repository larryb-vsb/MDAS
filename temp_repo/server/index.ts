import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeSchemaVersions } from "./schema_version";
import { initializeBackupScheduler } from "./backup/backup_scheduler";
import { ensureAppDirectories } from "./utils/fs-utils";
import { config, NODE_ENV } from "./env-config";
import { pool, db } from "./db";
import { fileProcessorService } from "./services/file-processor";
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
    // Try to run database migrations to create tables if they don't exist
    let migrationSuccess = await migrateDatabase();
    let useFallbackStorage = false;
    
    // If migration fails, try to restore from the most recent backup
    if (!migrationSuccess) {
      console.log("Database migration failed. Attempting to restore from backup...");
      
      try {
        // Import the restore functionality
        const { restoreMostRecentBackup } = await import('./restore-env-backup');
        
        // Try to restore from backup
        const restoreSuccess = await restoreMostRecentBackup();
        
        if (restoreSuccess) {
          console.log("Successfully restored database from backup");
          migrationSuccess = true; // Consider migration successful if restore was successful
        } else {
          console.log("Both migration and restore failed. Switching to in-memory fallback storage.");
          useFallbackStorage = true;
        }
      } catch (restoreError) {
        console.error("Error during restore attempt:", restoreError);
        console.log("Switching to in-memory fallback storage.");
        useFallbackStorage = true;
      }
    }
    
    // If we need to use fallback storage, initialize it now
    if (useFallbackStorage) {
      console.log("Initializing in-memory fallback storage for development purposes...");
      const { MemStorageFallback } = await import('./mem-storage-fallback');
      const { setStorageImplementation } = await import('./storage');
      
      // Create and set the fallback storage
      const fallbackStorage = new MemStorageFallback();
      setStorageImplementation(fallbackStorage);
      
      console.log("In-memory fallback storage initialized. Data will not persist between restarts.");
    }
    
    // Fix database schema issues and ensure admin user exists
    if (migrationSuccess) {
      // Import and run database helpers
      const { fixSchemaVersionsTable, fixBackupSchedulesTable, ensureAdminUser } = await import('./database-helpers');
      
      try {
        await fixSchemaVersionsTable();
        console.log("Schema versions table structure checked/fixed");
      } catch (error) {
        console.error("Error fixing schema versions table:", error);
      }
      
      try {
        await fixBackupSchedulesTable();
        console.log("Backup schedules table structure checked/fixed");
      } catch (error) {
        console.error("Error fixing backup schedules table:", error);
      }
      
      try {
        await ensureAdminUser();
        console.log("Admin user checked/created");
      } catch (error) {
        console.error("Error ensuring admin user exists:", error);
      }
      
      // Initialize schema version tracking
      await initializeSchemaVersions().catch(err => {
        console.log("Warning: Could not initialize schema versions:", err.message);
      });
      
      // Add default backup schedule if needed
      const { addDefaultBackupSchedule } = await import('./add_default_backup_schedule');
      await addDefaultBackupSchedule().catch(err => {
        console.log("Warning: Could not add default backup schedule:", err.message);
      });
      
      // Start the backup scheduler
      await initializeBackupScheduler().catch(err => {
        console.log("Warning: Could not initialize backup scheduler:", err.message);
      });
      
      // Start the file processor service to process uploaded files
      fileProcessorService.initialize();
      
      // Initialize sample logs for demonstration
      const { initSampleLogs } = await import('./init-sample-logs');
      await initSampleLogs().catch(err => {
        console.log("Warning: Could not initialize sample logs:", err.message);
      });
    } else if (useFallbackStorage) {
      // Skip schema version tracking and backup scheduler when using fallback storage
      console.log("In-memory storage mode: Skipping schema version tracking and backup scheduler");
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
    
    // Setup graceful shutdown
    const shutdownHandler = () => {
      console.log('Server shutting down...');
      
      // Stop the file processor service
      fileProcessorService.stop();
      
      // Close database connection
      pool.end(() => {
        console.log('Database connection closed.');
        process.exit(0);
      });
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
  } catch (error) {
    console.error("Failed to initialize application:", error);
    process.exit(1);
  }
})();
