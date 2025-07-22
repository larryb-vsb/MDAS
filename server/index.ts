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
import { systemLogger } from './system-logger';

// Setup comprehensive process monitoring for Replit scaling events and infrastructure changes
function setupProcessMonitoring() {
  // Monitor memory usage changes (indicates scaling)
  const memoryCheckInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    // Log significant memory changes (indicating scaling events)
    if (memUsageMB.rss > 512 || memUsageMB.heapTotal > 256) {
      systemLogger.warn('Infrastructure', 'High memory usage detected - potential scaling event', {
        memoryUsageMB,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
      }).catch(console.error);
    }
  }, 30000); // Check every 30 seconds
  
  // Monitor process signals (Replit deployment/scaling signals)
  process.on('SIGUSR1', () => {
    systemLogger.info('Infrastructure', 'SIGUSR1 received - Replit deployment signal detected', {
      uptime: process.uptime(),
      serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
    }).catch(console.error);
  });
  
  process.on('SIGUSR2', () => {
    systemLogger.info('Infrastructure', 'SIGUSR2 received - Replit scaling signal detected', {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }).catch(console.error);
  });
  
  // Monitor uncaught exceptions and promise rejections (system errors)
  process.on('uncaughtException', (error) => {
    systemLogger.error('System Error', 'Uncaught exception detected', {
      error: error.message,
      stack: error.stack,
      serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
    }).catch(console.error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    systemLogger.error('System Error', 'Unhandled promise rejection detected', {
      reason: String(reason),
      promiseString: promise.toString()
    }).catch(console.error);
  });
  
  // Monitor filesystem events (file processing activities)
  const fs = require('fs');
  try {
    const watcher = fs.watch('./tmp_uploads', { recursive: true }, (eventType, filename) => {
      if (filename && eventType === 'rename') {
        systemLogger.info('File System', 'File upload activity detected', {
          filename,
          eventType,
          timestamp: new Date().toISOString()
        }).catch(console.error);
      }
    });
  } catch (error) {
    // Directory might not exist yet, ignore
  }
  
  // Log periodic system health status
  const healthCheckInterval = setInterval(() => {
    systemLogger.info('Application', 'Periodic health check', {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      environment: process.env.NODE_ENV,
      serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
    }).catch(console.error);
  }, 300000); // Every 5 minutes
  
  // Cleanup intervals on shutdown
  process.on('SIGTERM', () => {
    clearInterval(memoryCheckInterval);
    clearInterval(healthCheckInterval);
  });
}

const app = express();

// Enhanced proxy trust configuration for production IP detection
if (NODE_ENV === 'production') {
  app.set('trust proxy', true);
  console.log('[EXPRESS] Trust proxy enabled for production environment');
} else {
  app.set('trust proxy', 'loopback');  
  console.log('[EXPRESS] Trust proxy set to loopback for development');
}

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
      
      // Log API requests to system logs (async, don't block response)
      if (res.statusCode >= 400) {
        systemLogger.logApiRequest(req.method, path, res.statusCode, duration).catch(console.error);
      }
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
    // Log application startup
    await systemLogger.info('Application', 'MMS server startup initiated', {
      environment: NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
    });

    // Try to run database migrations to create tables if they don't exist
    let migrationSuccess = await migrateDatabase();
    let useFallbackStorage = false;
    
    // Log database migration result
    await systemLogger.info('Application', `Database migration ${migrationSuccess ? 'successful' : 'failed'}`, {
      environment: NODE_ENV,
      migrationSuccess
    });

    // If migration fails, try to restore from the most recent backup
    if (!migrationSuccess) {
      console.log("Database migration failed. Attempting to restore from backup...");
      await systemLogger.warn('Application', 'Migration failed - attempting backup restore');
      
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
      
      // Log file processor initialization
      await systemLogger.info('Application', 'File processor service initialized', {
        environment: NODE_ENV,
        serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
      });

      // Start processing watcher service
      try {
        console.log('Initializing processing watcher service...');
        const { processingWatcher } = await import('./services/processing-watcher');
        processingWatcher.start();
        console.log('[PROCESSING WATCHER] Service started successfully');
        
        await systemLogger.info('Application', 'Processing watcher service initialized', {
          environment: NODE_ENV,
          serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
        });
      } catch (error) {
        console.error('[PROCESSING WATCHER] Failed to start service:', error);
        await systemLogger.error('Application', 'Failed to start processing watcher service', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Skip sample logs initialization during development database setup
      // const { initSampleLogs } = await import('./init-sample-logs');
      // await initSampleLogs().catch(err => {
      //   console.log("Warning: Could not initialize sample logs:", err.message);
      // });
    } else if (useFallbackStorage) {
      // Skip schema version tracking and backup scheduler when using fallback storage
      console.log("In-memory storage mode: Skipping schema version tracking and backup scheduler");
    }
    
    // Create http server
    const httpServer = createServer(app);
    
    // Register routes
    await registerRoutes(app);

    // Set up Vite in development, serve static in production
    if (NODE_ENV === "development") {
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
      
      // Log server startup completion
      systemLogger.info('Application', 'HTTP server started successfully', {
        port: port,
        environment: NODE_ENV,
        uptime: process.uptime(),
        serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`,
        memoryUsage: process.memoryUsage(),
        version: process.version
      }).catch(console.error);
      
      // Set up process monitoring for Replit scaling events
      setupProcessMonitoring();
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
