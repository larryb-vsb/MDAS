import { db } from "../db";
import { getTableName } from "../table-config";
import { eq, sql, and, gte, lte, desc, count } from "drizzle-orm";
import { 
  uploadedFiles as uploadedFilesTable,
  systemLogs as systemLogsTable,
  InsertSystemLog
} from "@shared/schema";

interface ProcessingMetrics {
  totalFiles: number;
  queuedFiles: number;
  processingFiles: number;
  stuckFiles: number;
  errorFiles: number;
  avgProcessingTime: number;
  slowFiles: number;
  recentThroughput: number;
  tddfBacklog: number;
  tddfBacklogProgress: number;
}

interface WatcherAlert {
  level: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  details: any;
  timestamp: Date;
}

export class ScanlyWatcher {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private alertHistory: WatcherAlert[] = [];
  private lastMetrics: ProcessingMetrics | null = null;
  
  // Configurable thresholds
  private readonly THRESHOLDS = {
    STUCK_FILE_MINUTES: 30,          // Files processing for >30 minutes are "stuck"
    SLOW_PROCESSING_MINUTES: 10,     // Files taking >10 minutes are "slow"
    QUEUE_BACKLOG_WARNING: 50,       // Warn if >50 files queued
    QUEUE_BACKLOG_CRITICAL: 100,     // Critical if >100 files queued
    ERROR_RATE_WARNING: 0.1,         // Warn if >10% error rate
    ERROR_RATE_CRITICAL: 0.2,        // Critical if >20% error rate
    THROUGHPUT_DROP_THRESHOLD: 0.5,  // Alert if throughput drops >50%
    TDDF_BACKLOG_STALLED_MINUTES: 2, // Alert if TDDF backlog hasn't moved for >2 minutes
    BACKLOG_CHECK_INTERVAL: 30000    // Check backlog every 30 seconds
  };

  private tddfBacklogHistory: Array<{ count: number; timestamp: Date }> = [];
  private orphanCleanupInterval: NodeJS.Timeout | null = null;

  start(): void {
    if (this.isRunning) {
      console.log('[SCANLY-WATCHER] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[SCANLY-WATCHER] Starting monitoring...');
    
    // Start TDDF backlog monitoring (every 30 seconds)
    this.startTddfBacklogMonitoring();
    
    // Start orphaned file cleanup (every 2 minutes)
    this.startOrphanedFileCleanup();
    
    // Run initial check
    this.performHealthCheck();
    
    // Schedule regular checks every 2 minutes
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, 2 * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.orphanCleanupInterval) {
      clearInterval(this.orphanCleanupInterval);
      this.orphanCleanupInterval = null;
    }
    this.isRunning = false;
    this.tddfBacklogHistory = []; // Clear backlog history
    console.log('[SCANLY-WATCHER] Stopped monitoring');
  }

  private startTddfBacklogMonitoring(): void {
    console.log('[SCANLY-WATCHER] Starting TDDF backlog monitoring (every 30 seconds)');
    
    // Check backlog immediately
    this.checkTddfBacklog();
    
    // Set up 30-second monitoring for both TDDF backlog and orphan cleanup
    const combinedInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(combinedInterval);
        return;
      }
      await this.checkTddfBacklog();
      await this.cleanupOrphanedFiles();
    }, this.THRESHOLDS.BACKLOG_CHECK_INTERVAL);
  }

  private startOrphanedFileCleanup(): void {
    console.log('[SCANLY-WATCHER] Orphaned file cleanup integrated with 30-second monitoring');
    
    // Run cleanup immediately
    this.cleanupOrphanedFiles();
    
    // Note: Cleanup now runs every 30 seconds as part of TDDF backlog monitoring
  }

  private async checkTddfBacklog(): Promise<void> {
    try {
      const tddfRawImportTable = getTableName('tddf_raw_import');

      
      // Get total backlog count
      const backlogResult = await db.execute(sql`
        SELECT COUNT(*) as backlog_count
        FROM ${sql.identifier(tddfRawImportTable)}
        WHERE processing_status = 'pending'
      `);
      
      // Fix: Access the result from the correct structure (backlogResult.rows[0])
      const currentBacklog = parseInt(String((backlogResult as any).rows[0]?.backlog_count)) || 0;
      const now = new Date();
      
      // Add to history
      this.tddfBacklogHistory.push({ count: currentBacklog, timestamp: now });
      
      // Keep only last 10 minutes of history (20 entries at 30-second intervals)
      if (this.tddfBacklogHistory.length > 20) {
        this.tddfBacklogHistory = this.tddfBacklogHistory.slice(-20);
      }
      
      console.log(`[SCANLY-WATCHER] TDDF Backlog Check: ${currentBacklog} pending records`);
      
      // Check if backlog is stalled (not moving for 2+ minutes)
      if (this.tddfBacklogHistory.length >= 4) { // At least 4 entries (2 minutes of history)
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
        const recentEntries = this.tddfBacklogHistory.filter(entry => entry.timestamp >= twoMinutesAgo);
        
        if (recentEntries.length >= 4) {
          const allSameCount = recentEntries.every(entry => entry.count === currentBacklog);
          
          if (allSameCount && currentBacklog > 0) {
            await this.logAlert({
              level: 'warning',
              type: 'tddf_backlog_stalled',
              message: `TDDF backlog stalled at ${currentBacklog} records for 2+ minutes`,
              details: { 
                currentBacklog,
                stalledSince: recentEntries[0].timestamp,
                checkHistory: recentEntries 
              },
              timestamp: now
            });
          } else if (currentBacklog === 0) {
            console.log('[SCANLY-WATCHER] ✅ TDDF backlog reached zero - processing complete!');
          } else {
            console.log(`[SCANLY-WATCHER] ✅ TDDF backlog progressing: ${currentBacklog} records remaining`);
          }
        }
      }
      
    } catch (error) {
      console.error('[SCANLY-WATCHER] Error checking TDDF backlog:', error);
      await this.logAlert({
        level: 'error',
        type: 'tddf_backlog_check_error',
        message: 'Failed to check TDDF backlog',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      });
    }
  }

  private async cleanupOrphanedFiles(): Promise<void> {
    try {
      const { getCachedServerId } = await import("../utils/server-id");
      const currentServerId = getCachedServerId();
      const uploadsTable = getTableName('uploaded_files');
      
      console.log('[SCANLY-WATCHER] Running orphaned file cleanup...');
      
      // Find files locked by different server instances inactive for 5+ minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const orphanedResult = await db.execute(sql`
        SELECT 
          id,
          original_filename,
          processing_server_id,
          uploaded_at,
          EXTRACT(MINUTE FROM (NOW() - uploaded_at)) as minutes_since_upload
        FROM ${sql.identifier(uploadsTable)}
        WHERE processing_server_id IS NOT NULL
          AND processing_server_id != ${currentServerId}
          AND uploaded_at < ${fiveMinutesAgo.toISOString()}
        LIMIT 10
      `);
      
      const orphanedFiles = orphanedResult.rows;
      
      if (orphanedFiles.length > 0) {
        console.log(`[SCANLY-WATCHER] Found ${orphanedFiles.length} orphaned file locks from inactive servers`);
        
        // Clear the orphaned locks
        const cleanupResult = await db.execute(sql`
          UPDATE ${sql.identifier(uploadsTable)}
          SET processing_server_id = NULL
          WHERE processing_server_id IS NOT NULL
            AND processing_server_id != ${currentServerId}
            AND uploaded_at < ${fiveMinutesAgo.toISOString()}
        `);
        
        console.log(`[SCANLY-WATCHER] ✅ Cleared ${orphanedFiles.length} orphaned server locks`);
        
        // Log cleanup activity
        await this.logAlert({
          level: 'info',
          type: 'orphaned_files_cleanup',
          message: `Cleaned up ${orphanedFiles.length} orphaned file locks`,
          details: { 
            currentServerId,
            cleanedFiles: orphanedFiles.map((f: any) => ({
              filename: f.original_filename,
              oldServerId: f.processing_server_id,
              minutesSinceUpload: f.minutes_since_upload
            }))
          },
          timestamp: new Date()
        });
      } else {
        console.log('[SCANLY-WATCHER] ✅ No orphaned file locks found');
      }
      
    } catch (error) {
      console.error('[SCANLY-WATCHER] Error during orphaned file cleanup:', error);
      await this.logAlert({
        level: 'error',
        type: 'orphan_cleanup_error',
        message: 'Failed to cleanup orphaned files',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      });
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      console.log('[SCANLY-WATCHER] Performing health check...');
      
      const metrics = await this.collectMetrics();
      const alerts = await this.analyzeMetrics(metrics);
      
      // Check for processing issues and run cleanup if needed
      await this.checkStatusAndCleanup(metrics);
      
      // Log alerts
      for (const alert of alerts) {
        await this.logAlert(alert);
      }
      
      // Store current metrics for trend analysis
      this.lastMetrics = metrics;
      
      console.log(`[PROCESSING WATCHER] Health check complete - ${alerts.length} alerts generated`);
      
    } catch (error) {
      console.error('[PROCESSING WATCHER] Error during health check:', error);
      await this.logAlert({
        level: 'error',
        type: 'watcher_error',
        message: 'Processing watcher encountered an error',
        details: { error: error instanceof Error ? error.message : String(error) },
        timestamp: new Date()
      });
    }
  }

  private async checkStatusAndCleanup(metrics: ProcessingMetrics): Promise<void> {
    try {
      const issues: string[] = [];
      let cleanupPerformed = false;

      // Check for stalled TDDF processing (backlog > 0 for 3+ minutes)
      if (metrics.tddfBacklog > 0) {
        const stalledMinutes = this.getTddfBacklogStalledMinutes();
        if (stalledMinutes >= 3) {
          issues.push(`TDDF backlog stalled for ${stalledMinutes} minutes`);
          
          // Run emergency TDDF processing cleanup
          await this.runTddfEmergencyCleanup();
          cleanupPerformed = true;
        }
      }

      // Check for stuck files (processing > 30 minutes)
      if (metrics.stuckFiles > 0) {
        issues.push(`${metrics.stuckFiles} files stuck in processing`);
        
        // Run stuck file cleanup
        await this.runStuckFileCleanup();
        cleanupPerformed = true;
      }

      // Check for orphaned locks (additional check beyond regular 30-second cleanup)
      const orphanCount = await this.checkOrphanedLocks();
      if (orphanCount > 0) {
        issues.push(`${orphanCount} orphaned server locks detected`);
        
        // Force orphan cleanup
        await this.cleanupOrphanedFiles();
        cleanupPerformed = true;
      }

      if (issues.length > 0) {
        console.log(`[SCANLY-WATCHER] 🚨 Processing issues detected: ${issues.join(', ')}`);
        
        if (cleanupPerformed) {
          console.log('[SCANLY-WATCHER] ✅ Emergency cleanup procedures completed');
          
          await this.logAlert({
            level: 'warning',
            type: 'emergency_cleanup_performed',
            message: 'Emergency cleanup procedures executed',
            details: { 
              issues,
              cleanupActions: ['TDDF processing', 'stuck files', 'orphaned locks'].filter((_, i) => 
                [metrics.tddfBacklog > 0, metrics.stuckFiles > 0, orphanCount > 0][i]
              ),
              timestamp: new Date()
            },
            timestamp: new Date()
          });
        }
      }

    } catch (error) {
      console.error('[SCANLY-WATCHER] Error during status check and cleanup:', error);
    }
  }

  private getTddfBacklogStalledMinutes(): number {
    if (this.tddfBacklogHistory.length < 2) return 0;
    
    const oldest = this.tddfBacklogHistory[0];
    const latest = this.tddfBacklogHistory[this.tddfBacklogHistory.length - 1];
    
    // Check if backlog count has remained the same
    if (oldest.count === latest.count && latest.count > 0) {
      const minutesDiff = (latest.timestamp.getTime() - oldest.timestamp.getTime()) / (1000 * 60);
      return Math.floor(minutesDiff);
    }
    
    return 0;
  }

  private async checkOrphanedLocks(): Promise<number> {
    try {
      const { getCachedServerId } = await import("../utils/server-id");
      const currentServerId = getCachedServerId();
      const uploadsTable = getTableName('uploaded_files');
      
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const orphanedResult = await db.execute(sql`
        SELECT COUNT(*) as orphan_count
        FROM ${sql.identifier(uploadsTable)}
        WHERE processing_server_id IS NOT NULL
          AND processing_server_id != ${currentServerId}
          AND uploaded_at < ${fiveMinutesAgo.toISOString()}
      `);
      
      return Number(orphanedResult.rows[0]?.orphan_count || 0);
    } catch (error) {
      console.error('[SCANLY-WATCHER] Error checking orphaned locks:', error);
      return 0;
    }
  }

  private async runTddfEmergencyCleanup(): Promise<void> {
    try {
      console.log('[SCANLY-WATCHER] 🚨 Running emergency TDDF cleanup...');
      
      // Call manual TDDF processing API to clear backlog
      
      const response = await fetch('http://localhost:5000/api/tddf/process-switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'true' // Bypass auth for internal requests
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[SCANLY-WATCHER] ✅ Emergency TDDF cleanup completed: ${result.totalProcessed || 0} records processed`);
      } else {
        console.log('[SCANLY-WATCHER] ⚠️ Emergency TDDF cleanup failed:', response.statusText);
      }
      
    } catch (error) {
      console.error('[SCANLY-WATCHER] Error during emergency TDDF cleanup:', error);
    }
  }

  private async runStuckFileCleanup(): Promise<void> {
    try {
      console.log('[SCANLY-WATCHER] 🚨 Running stuck file cleanup...');
      
      const { getCachedServerId } = await import("../utils/server-id");
      const currentServerId = getCachedServerId();
      const uploadsTable = getTableName('uploaded_files');
      
      // Reset files stuck in processing for >30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const result = await db.execute(sql`
        UPDATE ${sql.identifier(uploadsTable)}
        SET processing_status = 'queued',
            processing_server_id = NULL,
            processing_started_at = NULL
        WHERE processing_status = 'processing'
          AND processing_started_at < ${thirtyMinutesAgo.toISOString()}
      `);
      
      console.log(`[SCANLY-WATCHER] ✅ Stuck file cleanup completed: ${result.rowCount || 0} files reset to queued`);
      
    } catch (error) {
      console.error('[SCANLY-WATCHER] Error during stuck file cleanup:', error);
    }
  }

  private async collectMetrics(): Promise<ProcessingMetrics> {
    const tableName = getTableName('uploaded_files');
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Get file counts by status
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) as total_files FROM ${sql.identifier(tableName)}
    `);
    
    const queuedResult = await db.execute(sql`
      SELECT COUNT(*) as queued_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'queued'
    `);
    
    const processingResult = await db.execute(sql`
      SELECT COUNT(*) as processing_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'processing'
    `);
    
    const errorResult = await db.execute(sql`
      SELECT COUNT(*) as error_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'failed'
    `);

    // Find stuck files (processing for >30 minutes)
    const stuckResult = await db.execute(sql`
      SELECT COUNT(*) as stuck_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'processing' 
      AND processing_started_at < ${thirtyMinutesAgo.toISOString()}
    `);

    // Find slow files (completed but took >10 minutes)
    const slowResult = await db.execute(sql`
      SELECT COUNT(*) as slow_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'completed' 
      AND processing_time_ms > ${10 * 60 * 1000}
      AND processing_completed_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}
    `);

    // Calculate average processing time for completed files in last 24 hours
    const avgTimeResult = await db.execute(sql`
      SELECT AVG(processing_time_ms) as avg_processing_time FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'completed' 
      AND processing_completed_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}
      AND processing_time_ms IS NOT NULL
    `);

    // Calculate recent throughput (files completed in last 10 minutes)
    const throughputResult = await db.execute(sql`
      SELECT COUNT(*) as recent_completed FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'completed' 
      AND processing_completed_at > ${tenMinutesAgo.toISOString()}
    `);

    // Get TDDF backlog information
    const tddfRawImportTable = getTableName('tddf_raw_import');

    
    const tddfBacklogResult = await db.execute(sql`
      SELECT COUNT(*) as backlog_count FROM ${sql.identifier(tddfRawImportTable)}
      WHERE processing_status = 'pending'
    `);

    // Calculate backlog progress (if we have history)
    let backlogProgress = 0;
    if (this.tddfBacklogHistory.length > 1) {
      const current = parseInt(String((tddfBacklogResult as any).rows[0]?.backlog_count)) || 0;
      const previous = this.tddfBacklogHistory[this.tddfBacklogHistory.length - 1]?.count || current;
      backlogProgress = previous - current; // Positive = progress, negative = increase
    }

    return {
      totalFiles: parseInt((totalResult as any)[0]?.total_files as string) || 0,
      queuedFiles: parseInt((queuedResult as any)[0]?.queued_files as string) || 0,
      processingFiles: parseInt((processingResult as any)[0]?.processing_files as string) || 0,
      errorFiles: parseInt((errorResult as any)[0]?.error_files as string) || 0,
      stuckFiles: parseInt((stuckResult as any)[0]?.stuck_files as string) || 0,
      slowFiles: parseInt((slowResult as any)[0]?.slow_files as string) || 0,
      avgProcessingTime: parseFloat((avgTimeResult as any)[0]?.avg_processing_time as string) || 0,
      recentThroughput: parseInt((throughputResult as any)[0]?.recent_completed as string) || 0,
      tddfBacklog: parseInt(String((tddfBacklogResult as any).rows[0]?.backlog_count)) || 0,
      tddfBacklogProgress: backlogProgress
    };
  }

  private async analyzeMetrics(metrics: ProcessingMetrics): Promise<WatcherAlert[]> {
    const alerts: WatcherAlert[] = [];
    const now = new Date();

    // Check for stuck files
    if (metrics.stuckFiles > 0) {
      alerts.push({
        level: 'critical',
        type: 'stuck_files',
        message: `${metrics.stuckFiles} files have been processing for over ${this.THRESHOLDS.STUCK_FILE_MINUTES} minutes`,
        details: { stuckFiles: metrics.stuckFiles, thresholdMinutes: this.THRESHOLDS.STUCK_FILE_MINUTES },
        timestamp: now
      });
    }

    // Check queue backlog
    if (metrics.queuedFiles >= this.THRESHOLDS.QUEUE_BACKLOG_CRITICAL) {
      alerts.push({
        level: 'critical',
        type: 'queue_backlog',
        message: `Critical queue backlog: ${metrics.queuedFiles} files queued`,
        details: { queuedFiles: metrics.queuedFiles, threshold: this.THRESHOLDS.QUEUE_BACKLOG_CRITICAL },
        timestamp: now
      });
    } else if (metrics.queuedFiles >= this.THRESHOLDS.QUEUE_BACKLOG_WARNING) {
      alerts.push({
        level: 'warning',
        type: 'queue_backlog',
        message: `Queue backlog warning: ${metrics.queuedFiles} files queued`,
        details: { queuedFiles: metrics.queuedFiles, threshold: this.THRESHOLDS.QUEUE_BACKLOG_WARNING },
        timestamp: now
      });
    }

    // Check error rate
    if (metrics.totalFiles > 0) {
      const errorRate = metrics.errorFiles / metrics.totalFiles;
      if (errorRate >= this.THRESHOLDS.ERROR_RATE_CRITICAL) {
        alerts.push({
          level: 'critical',
          type: 'high_error_rate',
          message: `Critical error rate: ${(errorRate * 100).toFixed(1)}% of files failed`,
          details: { errorRate, errorFiles: metrics.errorFiles, totalFiles: metrics.totalFiles },
          timestamp: now
        });
      } else if (errorRate >= this.THRESHOLDS.ERROR_RATE_WARNING) {
        alerts.push({
          level: 'warning',
          type: 'high_error_rate',
          message: `High error rate warning: ${(errorRate * 100).toFixed(1)}% of files failed`,
          details: { errorRate, errorFiles: metrics.errorFiles, totalFiles: metrics.totalFiles },
          timestamp: now
        });
      }
    }

    // Check for slow processing
    if (metrics.slowFiles > 0) {
      alerts.push({
        level: 'warning',
        type: 'slow_processing',
        message: `${metrics.slowFiles} files took over ${this.THRESHOLDS.SLOW_PROCESSING_MINUTES} minutes to process`,
        details: { slowFiles: metrics.slowFiles, thresholdMinutes: this.THRESHOLDS.SLOW_PROCESSING_MINUTES },
        timestamp: now
      });
    }

    // Check throughput trends
    if (this.lastMetrics) {
      const currentThroughput = metrics.recentThroughput;
      const previousThroughput = this.lastMetrics.recentThroughput;
      
      if (previousThroughput > 0) {
        const throughputChange = (currentThroughput - previousThroughput) / previousThroughput;
        
        if (throughputChange < -this.THRESHOLDS.THROUGHPUT_DROP_THRESHOLD) {
          alerts.push({
            level: 'warning',
            type: 'throughput_drop',
            message: `Throughput dropped by ${(Math.abs(throughputChange) * 100).toFixed(1)}%`,
            details: { 
              currentThroughput, 
              previousThroughput, 
              changePercent: throughputChange * 100 
            },
            timestamp: now
          });
        }
      }
    }

    // Check average processing time trends
    if (metrics.avgProcessingTime > 5 * 60 * 1000) { // >5 minutes average
      alerts.push({
        level: 'info',
        type: 'slow_average_processing',
        message: `Average processing time is ${Math.round(metrics.avgProcessingTime / (60 * 1000))} minutes`,
        details: { avgProcessingTimeMs: metrics.avgProcessingTime },
        timestamp: now
      });
    }

    // Positive health indicators
    if (metrics.queuedFiles === 0 && metrics.stuckFiles === 0 && alerts.length === 0) {
      alerts.push({
        level: 'info',
        type: 'healthy_system',
        message: `System healthy: ${metrics.totalFiles} total files, no queue backlog, no stuck files`,
        details: metrics,
        timestamp: now
      });
    }

    return alerts;
  }

  private async logAlert(alert: WatcherAlert): Promise<void> {
    try {
      // Add to in-memory history (keep last 100 alerts)
      this.alertHistory.unshift(alert);
      if (this.alertHistory.length > 100) {
        this.alertHistory = this.alertHistory.slice(0, 100);
      }

      // Log to console
      const logLevel = alert.level === 'critical' ? 'error' : 
                      alert.level === 'error' ? 'error' :
                      alert.level === 'warning' ? 'warn' : 'info';
      
      console[logLevel](`[PROCESSING WATCHER] ${alert.level.toUpperCase()}: ${alert.message}`, alert.details);

      // Log to database
      const logEntry: InsertSystemLog = {
        level: alert.level === 'critical' ? 'critical' : 
               alert.level === 'error' ? 'error' :
               alert.level === 'warning' ? 'warning' : 'info',
        source: 'ProcessingWatcher',
        message: `${alert.type}: ${alert.message}`,
        details: JSON.stringify(alert.details),
        timestamp: alert.timestamp || new Date()
      };

      const systemLogsTableName = getTableName('system_logs');
      await db.execute(sql`
        INSERT INTO ${sql.identifier(systemLogsTableName)} 
        (level, source, message, details, timestamp)
        VALUES (${logEntry.level}, ${logEntry.source}, ${logEntry.message}, ${logEntry.details}, ${logEntry.timestamp.toISOString()})
      `);

    } catch (error) {
      console.error('[PROCESSING WATCHER] Failed to log alert:', error);
    }
  }

  // Public methods for API access
  getStatus(): { isRunning: boolean; alertCount: number; lastCheck: Date | null } {
    return {
      isRunning: this.isRunning,
      alertCount: this.alertHistory.length,
      lastCheck: this.lastMetrics ? new Date() : null
    };
  }

  getRecentAlerts(limit: number = 20): WatcherAlert[] {
    return this.alertHistory.slice(0, limit);
  }

  getCurrentMetrics(): ProcessingMetrics | null {
    return this.lastMetrics;
  }

  // Force a health check (useful for testing)
  async forceHealthCheck(): Promise<WatcherAlert[]> {
    const metrics = await this.collectMetrics();
    const alerts = await this.analyzeMetrics(metrics);
    
    for (const alert of alerts) {
      await this.logAlert(alert);
    }
    
    this.lastMetrics = metrics;
    return alerts;
  }
}

// Export singleton instance of Scanly-Watcher
export const scanlyWatcher = new ScanlyWatcher();