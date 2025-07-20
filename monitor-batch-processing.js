#!/usr/bin/env node

/**
 * Deep Monitoring System for File Processing Performance
 * Tracks processing speed, bottlenecks, and system health
 */

const fs = require('fs');
const path = require('path');

class ProcessingMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      samples: [],
      processingStats: [],
      performanceMetrics: {
        avgProcessingTime: 0,
        transactionsPerSecond: 0,
        filesPerMinute: 0,
        bottleneckDetected: false,
        slowdownAlerts: []
      },
      systemHealth: {
        memoryUsage: [],
        dbPerformance: [],
        concurrencyIssues: []
      }
    };
    
    this.previousStats = {
      totalFiles: 0,
      processedFiles: 0,
      queuedFiles: 0
    };
    
    this.logFile = `processing-monitor-${Date.now()}.log`;
    this.startMonitoring();
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(`🔍 [MONITOR] ${message}`);
    fs.appendFileSync(this.logFile, logEntry);
  }

  async fetchStats() {
    try {
      const response = await fetch('http://localhost:5000/api/processing/real-time-stats');
      const stats = await response.json();
      return stats;
    } catch (error) {
      this.log(`Error fetching stats: ${error.message}`, 'ERROR');
      return null;
    }
  }

  async fetchProcessorStatus() {
    try {
      const response = await fetch('http://localhost:5000/api/file-processor/status');
      const status = await response.json();
      return status;
    } catch (error) {
      this.log(`Error fetching processor status: ${error.message}`, 'ERROR');
      return null;
    }
  }

  async fetchConcurrencyStats() {
    try {
      const response = await fetch('http://localhost:5000/api/processing/concurrency-stats');
      const stats = await response.json();
      return stats;
    } catch (error) {
      this.log(`Error fetching concurrency stats: ${error.message}`, 'ERROR');
      return null;
    }
  }

  calculatePerformanceMetrics() {
    const recentSamples = this.metrics.samples.slice(-10); // Last 10 samples
    
    if (recentSamples.length < 2) return;

    const timeWindow = recentSamples[recentSamples.length - 1].timestamp - recentSamples[0].timestamp;
    const filesProcessed = recentSamples[recentSamples.length - 1].processedFiles - recentSamples[0].processedFiles;
    
    // Files per minute calculation
    this.metrics.performanceMetrics.filesPerMinute = (filesProcessed / timeWindow) * 60000;
    
    // Detect slowdowns
    if (this.metrics.performanceMetrics.filesPerMinute < 0.5 && filesProcessed > 0) {
      this.metrics.performanceMetrics.slowdownAlerts.push({
        timestamp: Date.now(),
        issue: 'Processing speed below 0.5 files/minute',
        filesPerMinute: this.metrics.performanceMetrics.filesPerMinute
      });
    }

    // Transaction processing rate (estimated)
    const avgTransactionsPerFile = 100; // Estimate based on file contents
    this.metrics.performanceMetrics.transactionsPerSecond = 
      (this.metrics.performanceMetrics.filesPerMinute * avgTransactionsPerFile) / 60;
  }

  detectBottlenecks(stats, processorStatus, concurrencyStats) {
    const issues = [];

    // Queue building up
    if (stats.queuedFiles > this.previousStats.queuedFiles + 5) {
      issues.push('Queue is growing faster than processing');
    }

    // Processing stuck
    if (processorStatus.isRunning && processorStatus.currentlyProcessingFile) {
      const processingTime = Date.now() - new Date(processorStatus.processingStartedAt || 0).getTime();
      if (processingTime > 120000) { // 2 minutes
        issues.push(`File stuck processing for ${Math.round(processingTime/1000)}s: ${processorStatus.currentlyProcessingFile}`);
      }
    }

    // Concurrency issues
    if (Object.keys(concurrencyStats.processingByServer || {}).length > 1) {
      issues.push('Multiple servers detected - potential concurrency conflict');
    }

    // Stale files
    if (concurrencyStats.staleProcessingFiles > 0) {
      issues.push(`${concurrencyStats.staleProcessingFiles} stale processing files detected`);
    }

    this.metrics.performanceMetrics.bottleneckDetected = issues.length > 0;
    
    if (issues.length > 0) {
      this.log(`🚨 BOTTLENECKS DETECTED: ${issues.join(', ')}`, 'WARN');
    }

    return issues;
  }

  generateProcessingReport() {
    const runtime = (Date.now() - this.metrics.startTime) / 1000;
    const totalSamples = this.metrics.samples.length;
    
    if (totalSamples === 0) return;

    const firstSample = this.metrics.samples[0];
    const lastSample = this.metrics.samples[totalSamples - 1];
    
    const totalFilesProcessed = lastSample.processedFiles - firstSample.processedFiles;
    const overallRate = totalFilesProcessed / (runtime / 60); // files per minute

    const report = `
📊 PROCESSING PERFORMANCE REPORT
====================================
Runtime: ${Math.round(runtime)}s
Total Samples: ${totalSamples}
Files Processed: ${totalFilesProcessed}
Overall Rate: ${overallRate.toFixed(2)} files/minute
Current Queue: ${lastSample.queuedFiles} files
Estimated Transaction Rate: ${this.metrics.performanceMetrics.transactionsPerSecond.toFixed(1)} txns/sec
Bottlenecks Detected: ${this.metrics.performanceMetrics.bottleneckDetected ? 'YES' : 'NO'}
Slowdown Alerts: ${this.metrics.performanceMetrics.slowdownAlerts.length}

RECOMMENDATIONS:
${this.generateRecommendations()}
    `;

    this.log(report, 'REPORT');
    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.performanceMetrics.filesPerMinute < 1) {
      recommendations.push('- Consider increasing processing frequency from 1-minute intervals');
      recommendations.push('- Investigate database query performance optimization');
    }

    if (this.metrics.performanceMetrics.slowdownAlerts.length > 3) {
      recommendations.push('- Implement adaptive processing intervals based on queue size');
      recommendations.push('- Add parallel processing capability for large files');
    }

    if (this.metrics.systemHealth.concurrencyIssues.length > 0) {
      recommendations.push('- Review concurrency control for phantom server cleanup');
    }

    if (recommendations.length === 0) {
      recommendations.push('- System performance appears optimal');
      recommendations.push('- Consider monitoring memory usage during peak loads');
    }

    return recommendations.join('\n');
  }

  async startMonitoring() {
    this.log('🚀 Starting deep processing monitor...');
    this.log(`📝 Logging to: ${this.logFile}`);
    
    const monitorLoop = async () => {
      try {
        // Fetch all metrics simultaneously
        const [stats, processorStatus, concurrencyStats] = await Promise.all([
          this.fetchStats(),
          this.fetchProcessorStatus(),
          this.fetchConcurrencyStats()
        ]);

        if (stats) {
          // Record sample
          const sample = {
            timestamp: Date.now(),
            ...stats,
            processorRunning: processorStatus?.isRunning || false,
            currentFile: processorStatus?.currentlyProcessingFile || null,
            concurrencyServers: Object.keys(concurrencyStats?.processingByServer || {}).length
          };

          this.metrics.samples.push(sample);

          // Performance analysis
          this.calculatePerformanceMetrics();
          
          // Bottleneck detection
          const bottlenecks = this.detectBottlenecks(stats, processorStatus, concurrencyStats);

          // Progress tracking
          const progress = stats.queuedFiles > 0 ? 
            `⏳ ${stats.queuedFiles} queued, ${stats.processedFiles} completed` :
            `✅ All files processed! ${stats.processedFiles} total`;

          this.log(`${progress} | Rate: ${this.metrics.performanceMetrics.filesPerMinute.toFixed(2)} files/min | Running: ${processorStatus?.isRunning ? '✅' : '❌'}`);

          // Store for comparison
          this.previousStats = { ...stats };

          // Check completion
          if (stats.queuedFiles === 0 && !processorStatus?.isRunning) {
            this.log('🎉 All files completed! Generating final report...');
            this.generateProcessingReport();
            clearInterval(this.intervalId);
            return;
          }
        }

      } catch (error) {
        this.log(`Monitor error: ${error.message}`, 'ERROR');
      }
    };

    // Initial run
    await monitorLoop();
    
    // Set up interval monitoring
    this.intervalId = setInterval(monitorLoop, 5000); // Every 5 seconds

    // Generate intermediate reports every 30 seconds
    setInterval(() => {
      if (this.metrics.samples.length > 0) {
        this.generateProcessingReport();
      }
    }, 30000);
  }
}

// Start monitoring
const monitor = new ProcessingMonitor();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Monitoring stopped. Final report generated.');
  if (monitor.intervalId) clearInterval(monitor.intervalId);
  monitor.generateProcessingReport();
  process.exit(0);
});