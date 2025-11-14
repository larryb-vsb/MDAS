import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeSchemaVersions } from "./schema_version";
import { initializeBackupScheduler } from "./backup/backup_scheduler";
import { ensureAppDirectories } from "./utils/fs-utils";
import { config, NODE_ENV } from "./env-config";
import { pool, db } from "./db";
import { tddfApiProcessor } from "./services/tddf-api-processor";
import { migrateDatabase } from "./database-migrate";
import { systemLogger } from './system-logger';
import { initializePreCacheJob } from "./services/pre-cache-job";

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
        memoryUsageMB: memUsageMB,
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
  
  // Monitor filesystem events (file processing activities) - Use dynamic import for production compatibility
  try {
    import('fs').then((fs) => {
      const watcher = fs.watch('./tmp_uploads', { recursive: true }, (eventType, filename) => {
        if (filename && eventType === 'rename') {
          systemLogger.info('File System', 'File upload activity detected', {
            filename,
            eventType,
            timestamp: new Date().toISOString()
          }).catch(console.error);
        }
      });
    }).catch(() => {
      // Filesystem monitoring not available in this environment
      console.log('[MONITORING] Filesystem monitoring disabled in production environment');
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

// Increase body size limits to support large TDDF file uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));

// Disable HTTP caching to fix real-time data updates
app.set('etag', false);
app.use((req, res, next) => {
  // Disable caching for all API responses to ensure real-time data
  if (req.path.startsWith('/api')) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
  next();
});

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
      
      // Create and set the fallback storage - using any to fix type compatibility
      const fallbackStorage = new MemStorageFallback() as any;
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
      
      // Validate critical tables for connection logging and security features
      try {
        const { getTableName } = await import('../shared/schema');
        const { sql } = await import('drizzle-orm');
        
        const criticalTables = ['connection_log', 'ip_blocklist', 'host_approvals'];
        const missingTables = [];
        
        for (const tableName of criticalTables) {
          const fullTableName = getTableName(tableName);
          const exists = await db.execute(sql`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public'
                AND table_name = ${fullTableName}
            );
          `);
          
          const tableExists = exists.rows[0]?.exists || false;
          
          if (!tableExists) {
            missingTables.push(fullTableName);
          }
        }
        
        if (missingTables.length > 0) {
          console.log(`⚠️ [STARTUP] WARNING: ${missingTables.length} critical table(s) missing:`);
          missingTables.forEach(table => console.log(`   - ${table}`));
          console.log(`⚠️ [STARTUP] Features affected: Connection logging, IP blocking, Host approvals`);
          console.log(`⚠️ [STARTUP] Fix: Run 'npm run db:push' to create missing tables`);
          
          await systemLogger.warn('Application', 'Critical tables missing at startup', {
            missingTables,
            environment: NODE_ENV,
            fix: 'Run npm run db:push to create missing tables'
          });
        } else {
          console.log("✅ [STARTUP] All critical tables validated successfully");
        }
      } catch (error) {
        console.error("⚠️ [STARTUP] Error validating critical tables:", error);
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
      
      // Start the TDDF API processor service
      await tddfApiProcessor.initialize();
      
      // Start the pre-cache job service
      await initializePreCacheJob().catch(err => {
        console.log("Warning: Could not initialize pre-cache job:", err.message);
      });

      // Start processing watcher service - TEMPORARILY DISABLED FOR TDDF TESTING
      // The ScanlyWatcher is causing database connection errors due to missing column mappings
      // Disabling temporarily to allow stable TDDF processing testing
      console.log('[SCANLY-WATCHER] Service temporarily disabled for TDDF testing');
      /*
      try {
        console.log('Initializing Scanly-Watcher service...');
        const { scanlyWatcher } = await import('./services/processing-watcher');
        scanlyWatcher.start();
        console.log('[SCANLY-WATCHER] Service started successfully');
        
        await systemLogger.info('Application', 'Scanly-Watcher service initialized', {
          environment: NODE_ENV,
          serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
        });
      } catch (error) {
        console.error('[SCANLY-WATCHER] Failed to start service:', error);
        await systemLogger.error('Application', 'Failed to start Scanly-Watcher service', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      */

      // Start MMS Watcher service for automatic file processing (phases 4-7)
      try {
        console.log('Initializing MMS Watcher service...');
        const { createMmsWatcherInstance, setMmsWatcherInstance } = await import('./mms-watcher-instance');
        const mmsWatcher = createMmsWatcherInstance();
        setMmsWatcherInstance(mmsWatcher);
        
        // Register MMS Watcher instance with Express app for API routes access
        app.locals.mmsWatcher = mmsWatcher;
        console.log('[MMS-WATCHER] Instance registered with Express app.locals');
        
        mmsWatcher.start();
        console.log('[MMS-WATCHER] Service started successfully');
        
        await systemLogger.info('Application', 'MMS Watcher service initialized', {
          environment: NODE_ENV,
          serverId: process.env.HOSTNAME || `${require('os').hostname()}-${process.pid}`
        });
      } catch (error) {
        console.error('[MMS-WATCHER] Failed to start service:', error);
        await systemLogger.error('Application', 'Failed to start MMS Watcher service', {
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
    
    // Register routes FIRST, before any static file serving
    await registerRoutes(app);

    // Set up Vite in development, serve static in production
    if (NODE_ENV === "development") {
      await setupVite(app, httpServer);
    } else {
      // Serve static files AFTER API routes are registered
      // This ensures API routes are handled before static file serving
      serveStatic(app);
      
      // Add fallback for unmatched API routes (after static files)
      app.use('/api/*', (req, res, next) => {
        // If we reach here, it means the API route wasn't handled
        // Return 404 instead of serving HTML
        res.status(404).json({ error: 'API endpoint not found' });
      });
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
