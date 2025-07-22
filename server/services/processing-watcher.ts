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
}

interface WatcherAlert {
  level: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  details: any;
  timestamp: Date;
}

export class ProcessingWatcher {
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
    THROUGHPUT_DROP_THRESHOLD: 0.5   // Alert if throughput drops >50%
  };

  start(): void {
    if (this.isRunning) {
      console.log('[PROCESSING WATCHER] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[PROCESSING WATCHER] Starting monitoring...');
    
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
    this.isRunning = false;
    console.log('[PROCESSING WATCHER] Stopped monitoring');
  }

  private async performHealthCheck(): Promise<void> {
    try {
      console.log('[PROCESSING WATCHER] Performing health check...');
      
      const metrics = await this.collectMetrics();
      const alerts = await this.analyzeMetrics(metrics);
      
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

  private async collectMetrics(): Promise<ProcessingMetrics> {
    const tableName = getTableName('uploaded_files');
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Get file counts by status
    const [totalResult] = await db.execute(sql`
      SELECT COUNT(*) as total_files FROM ${sql.identifier(tableName)}
    `);
    
    const [queuedResult] = await db.execute(sql`
      SELECT COUNT(*) as queued_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'queued'
    `);
    
    const [processingResult] = await db.execute(sql`
      SELECT COUNT(*) as processing_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'processing'
    `);
    
    const [errorResult] = await db.execute(sql`
      SELECT COUNT(*) as error_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'failed'
    `);

    // Find stuck files (processing for >30 minutes)
    const [stuckResult] = await db.execute(sql`
      SELECT COUNT(*) as stuck_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'processing' 
      AND processing_started_at < ${thirtyMinutesAgo.toISOString()}
    `);

    // Find slow files (completed but took >10 minutes)
    const [slowResult] = await db.execute(sql`
      SELECT COUNT(*) as slow_files FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'completed' 
      AND processing_time_ms > ${10 * 60 * 1000}
      AND processing_completed_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}
    `);

    // Calculate average processing time for completed files in last 24 hours
    const [avgTimeResult] = await db.execute(sql`
      SELECT AVG(processing_time_ms) as avg_processing_time FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'completed' 
      AND processing_completed_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}
      AND processing_time_ms IS NOT NULL
    `);

    // Calculate recent throughput (files completed in last 10 minutes)
    const [throughputResult] = await db.execute(sql`
      SELECT COUNT(*) as recent_completed FROM ${sql.identifier(tableName)}
      WHERE processing_status = 'completed' 
      AND processing_completed_at > ${tenMinutesAgo.toISOString()}
    `);

    return {
      totalFiles: parseInt(totalResult.total_files as string) || 0,
      queuedFiles: parseInt(queuedResult.queued_files as string) || 0,
      processingFiles: parseInt(processingResult.processing_files as string) || 0,
      errorFiles: parseInt(errorResult.error_files as string) || 0,
      stuckFiles: parseInt(stuckResult.stuck_files as string) || 0,
      slowFiles: parseInt(slowResult.slow_files as string) || 0,
      avgProcessingTime: parseFloat(avgTimeResult.avg_processing_time as string) || 0,
      recentThroughput: parseInt(throughputResult.recent_completed as string) || 0
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
        timestamp: alert.timestamp
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

// Export singleton instance
export const processingWatcher = new ProcessingWatcher();