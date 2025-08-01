/**
 * Heat Map Cache Builder Service
 * 
 * Handles month-by-month pre-cache building for TDDF JSON Activity Heat Maps
 * with progress tracking and watcher service integration
 */

import { pool } from '../db';
import { db } from '../db';
import { getTableName } from '../table-config';
import { heatMapCacheProcessingStats } from '@shared/schema';
import { sql } from 'drizzle-orm';

interface MonthProgress {
  year: number;
  month: number;
  status: 'pending' | 'building' | 'completed' | 'error';
  recordCount: number;
  buildTimeMs: number;
  error?: string;
  startTime?: Date;
  completedTime?: Date;
  recordsPerSecond?: number;
}

interface HeatMapCacheBuildJob {
  id: string;
  year: number;
  recordType: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  totalMonths: number;
  completedMonths: number;
  currentMonth?: string; // Format: "YYYY-MM" for frontend display
  monthProgress: MonthProgress[];
  startTime: Date;
  completedTime?: Date;
  totalRecords: number;
  error?: string;
  processingStats?: {
    totalBuildTime: number;
    averageMonthTime: number;
    fastestMonth: { month: string; timeMs: number; recordCount: number };
    slowestMonth: { month: string; timeMs: number; recordCount: number };
  };
}

export class HeatMapCacheBuilder {
  private static activeJobs = new Map<string, HeatMapCacheBuildJob>();
  private static readonly MAX_CONCURRENT_JOBS = 1; // Only allow 1 cache build at a time
  
  private static getCacheTableName(year: number): string {
    return `heat_map_cache_${year}`;
  }

  /**
   * Start a month-by-month heat map cache rebuild job
   */
  static async startCacheRebuild(year: number, recordType: string = 'DT'): Promise<string> {
    // Check for existing running jobs
    const runningJobs = Array.from(this.activeJobs.values()).filter(job => job.status === 'running');
    if (runningJobs.length >= this.MAX_CONCURRENT_JOBS) {
      const activeJob = runningJobs[0];
      throw new Error(`Cache builder busy: Job ${activeJob.id} already running (${activeJob.year} ${activeJob.recordType}). Please wait for completion.`);
    }
    
    // Check if data exists for the requested year before starting cache build
    const tddfJsonbTableName = getTableName('tddf_jsonb');
    console.log(`[HEATMAP-CACHE-BUILDER] Checking data existence for ${year} ${recordType} before cache build...`);
    
    const dataCheckResult = await pool.query(`
      SELECT COUNT(*) as record_count
      FROM ${tddfJsonbTableName}
      WHERE EXTRACT(YEAR FROM transaction_date) = $1
      AND record_type = $2
      LIMIT 1
    `, [year, recordType]);
    
    const recordCount = parseInt(dataCheckResult.rows[0]?.record_count || '0');
    
    if (recordCount === 0) {
      console.log(`[HEATMAP-CACHE-BUILDER] ⚠️ No data found for ${year} ${recordType} - skipping cache build`);
      throw new Error(`No data available for year ${year} and record type ${recordType}. Cache build skipped to avoid creating empty cache.`);
    }
    
    console.log(`[HEATMAP-CACHE-BUILDER] ✅ Found ${recordCount} records for ${year} ${recordType} - proceeding with cache build`);
    
    const jobId = `heatmap_${year}_${recordType}_${Date.now()}`;
    
    console.log(`[HEATMAP-CACHE-BUILDER] Starting month-by-month rebuild for ${year} ${recordType} (Job: ${jobId})`);
    
    // Initialize job tracking
    const job: HeatMapCacheBuildJob = {
      id: jobId,
      year,
      recordType,
      status: 'pending',
      totalMonths: 12,
      completedMonths: 0,
      monthProgress: [],
      startTime: new Date(),
      totalRecords: 0
    };

    // Initialize month progress tracking
    for (let month = 1; month <= 12; month++) {
      job.monthProgress.push({
        year,
        month,
        status: 'pending',
        recordCount: 0,
        buildTimeMs: 0
      });
    }

    this.activeJobs.set(jobId, job);
    
    // Start background processing (don't await - run async)
    this.processJobAsync(jobId).catch(error => {
      console.error(`[HEATMAP-CACHE-BUILDER] Job ${jobId} failed:`, error);
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.status = 'error';
        job.error = error.message;
      }
    });

    return jobId;
  }

  /**
   * Process cache rebuild job month by month
   */
  private static async processJobAsync(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'running';
      console.log(`[HEATMAP-CACHE-BUILDER] Starting processing for job ${jobId}`);

      const tddfJsonbTableName = getTableName('tddf_jsonb');
      
      // Process each month sequentially
      for (let month = 1; month <= 12; month++) {
        const monthProgress = job.monthProgress[month - 1];
        monthProgress.status = 'building';
        monthProgress.startTime = new Date();
        
        // Update current month for frontend display
        job.currentMonth = `${job.year}-${month.toString().padStart(2, '0')}`;
        
        console.log(`[HEATMAP-CACHE-BUILDER] Processing ${job.currentMonth} (Job: ${jobId})`);
        
        // Insert initial processing stats record
        const statsStartTime = Date.now();
        await this.insertProcessingStats({
          job_id: jobId,
          year: job.year,
          month: month,
          record_type: job.recordType,
          started_at: monthProgress.startTime,
          status: 'building',
          job_started_at: job.startTime,
          total_months_in_job: job.totalMonths,
          job_status: 'running',
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
        });
        
        try {
          const monthStartTime = Date.now();
          
          // Build monthly cache data
          const monthData = await this.buildMonthCache(
            job.year, 
            month, 
            job.recordType
          );
          
          const buildTimeMs = Date.now() - monthStartTime;
          
          // Calculate processing rate
          const recordsPerSecond = monthData.recordCount > 0 && buildTimeMs > 0 
            ? Math.round((monthData.recordCount / buildTimeMs) * 1000) 
            : 0;
          
          // Update progress
          monthProgress.status = 'completed';
          monthProgress.recordCount = monthData.recordCount;
          monthProgress.buildTimeMs = buildTimeMs;
          monthProgress.completedTime = new Date();
          monthProgress.recordsPerSecond = recordsPerSecond;
          
          job.completedMonths++;
          job.totalRecords += monthData.recordCount;
          
          // Update processing stats record with completion data
          await this.updateProcessingStats({
            job_id: jobId,
            year: job.year,
            month: month,
            completed_at: monthProgress.completedTime,
            processing_time_ms: buildTimeMs,
            record_count: monthData.recordCount,
            records_per_second: recordsPerSecond,
            status: 'completed',
            cache_entries_created: monthData.dailyData?.length || 0
          });
          
          console.log(`[HEATMAP-CACHE-BUILDER] Completed ${job.currentMonth}: ${monthData.recordCount} records in ${buildTimeMs}ms (${recordsPerSecond} records/sec)`);
          
          // Small delay between months to prevent database overload
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`[HEATMAP-CACHE-BUILDER] Failed to build month ${month}:`, error);
          monthProgress.status = 'error';
          monthProgress.error = error instanceof Error ? error.message : 'Unknown error';
          
          // Update processing stats record with error
          await this.updateProcessingStats({
            job_id: jobId,
            year: job.year,
            month: month,
            status: 'error',
            error_message: monthProgress.error,
            completed_at: new Date()
          });
        }
      }
      
      // Calculate processing statistics
      this.calculateProcessingStats(job);
      
      // Complete job
      job.status = 'completed';
      job.completedTime = new Date();
      job.currentMonth = undefined; // Clear current month on completion
      
      console.log(`[HEATMAP-CACHE-BUILDER] Job ${jobId} completed: ${job.totalRecords} total records across ${job.completedMonths} months`);
      
      // Log processing statistics
      if (job.processingStats) {
        console.log(`[HEATMAP-CACHE-BUILDER] Processing stats: Total time ${job.processingStats.totalBuildTime}ms, Avg month ${job.processingStats.averageMonthTime}ms`);
        if (job.processingStats.fastestMonth) {
          console.log(`[HEATMAP-CACHE-BUILDER] Fastest month: ${job.processingStats.fastestMonth.month} (${job.processingStats.fastestMonth.timeMs}ms, ${job.processingStats.fastestMonth.recordCount} records)`);
        }
        if (job.processingStats.slowestMonth) {
          console.log(`[HEATMAP-CACHE-BUILDER] Slowest month: ${job.processingStats.slowestMonth.month} (${job.processingStats.slowestMonth.timeMs}ms, ${job.processingStats.slowestMonth.recordCount} records)`);
        }
      }
      
    } catch (error) {
      console.error(`[HEATMAP-CACHE-BUILDER] Job ${jobId} failed:`, error);
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  /**
   * Build cache data for a specific month
   */
  private static async buildMonthCache(
    year: number, 
    month: number, 
    recordType: string = 'DT'
  ): Promise<{ recordCount: number; dailyData: any[] }> {
    
    const tddfJsonbTableName = getTableName('tddf_jsonb');
    
    // Get daily aggregated data for the month
    const query = `
      SELECT 
        DATE((extracted_fields->>'transactionDate')::date) as date,
        COUNT(*) as transaction_count,
        SUM(CASE 
          WHEN extracted_fields->>'transactionAmount' ~ '^[0-9.]+$' 
          THEN (extracted_fields->>'transactionAmount')::numeric 
          ELSE 0 
        END) as total_amount,
        AVG(CASE 
          WHEN extracted_fields->>'transactionAmount' ~ '^[0-9.]+$' 
          THEN (extracted_fields->>'transactionAmount')::numeric 
          ELSE NULL 
        END) as avg_amount
      FROM ${tddfJsonbTableName}
      WHERE record_type = $1
        AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = $2
        AND EXTRACT(MONTH FROM (extracted_fields->>'transactionDate')::date) = $3
        AND extracted_fields->>'transactionDate' IS NOT NULL
        AND extracted_fields->>'transactionDate' != ''
      GROUP BY DATE((extracted_fields->>'transactionDate')::date)
      ORDER BY date ASC
    `;
    
    const result = await pool.query(query, [recordType, year, month]);
    const recordCount = result.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0);
    
    // Store in pre-cache table
    const cacheKey = `activity_${year}_${month.toString().padStart(2, '0')}_${recordType}`;
    const cacheData = {
      year,
      month,
      recordType,
      dailyData: result.rows,
      recordCount,
      buildTime: new Date().toISOString()
    };
    
    // Insert data into year-specific heat map cache table
    const cacheTableName = this.getCacheTableName(year);
    
    // Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${cacheTableName} (
        date DATE NOT NULL PRIMARY KEY,
        dt_count BIGINT NOT NULL DEFAULT 0
      )
    `);
    
    // Insert the daily data into the cache table
    for (const row of result.rows) {
      await pool.query(`
        INSERT INTO ${cacheTableName} (date, dt_count)
        VALUES ($1, $2)
        ON CONFLICT (date) 
        DO UPDATE SET dt_count = EXCLUDED.dt_count
      `, [row.date, row.transaction_count]);
    }
    
    return { recordCount, dailyData: result.rows };
  }

  /**
   * Get job status and progress
   */
  static getJobStatus(jobId: string): HeatMapCacheBuildJob | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get all active jobs
   */
  static getAllActiveJobs(): HeatMapCacheBuildJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get count of running jobs for concurrency control
   */
  static getRunningJobsCount(): number {
    return Array.from(this.activeJobs.values()).filter(job => job.status === 'running').length;
  }

  /**
   * Check if cache builder can accept new jobs
   */
  static canAcceptNewJob(): boolean {
    return this.getRunningJobsCount() < this.MAX_CONCURRENT_JOBS;
  }

  /**
   * Insert processing stats record for a month
   */
  private static async insertProcessingStats(statsData: any): Promise<void> {
    try {
      await db.insert(heatMapCacheProcessingStats).values(statsData);
    } catch (error) {
      console.error('[HEATMAP-CACHE-BUILDER] Failed to insert processing stats:', error);
    }
  }

  /**
   * Update processing stats record for a month
   */
  private static async updateProcessingStats(updateData: any): Promise<void> {
    try {
      await db.update(heatMapCacheProcessingStats)
        .set(updateData)
        .where(
          sql`job_id = ${updateData.job_id} AND year = ${updateData.year} AND month = ${updateData.month}`
        );
    } catch (error) {
      console.error('[HEATMAP-CACHE-BUILDER] Failed to update processing stats:', error);
    }
  }

  /**
   * Calculate processing statistics for completed job
   */
  private static calculateProcessingStats(job: HeatMapCacheBuildJob): void {
    const completedMonths = job.monthProgress.filter(m => m.status === 'completed');
    
    if (completedMonths.length === 0) return;
    
    const totalBuildTime = completedMonths.reduce((sum, m) => sum + m.buildTimeMs, 0);
    const averageMonthTime = Math.round(totalBuildTime / completedMonths.length);
    
    // Find fastest and slowest months
    let fastestMonth: any = null;
    let slowestMonth: any = null;
    
    for (const month of completedMonths) {
      const monthLabel = `${month.year}-${month.month.toString().padStart(2, '0')}`;
      const monthData = {
        month: monthLabel,
        timeMs: month.buildTimeMs,
        recordCount: month.recordCount
      };
      
      if (!fastestMonth || month.buildTimeMs < fastestMonth.timeMs) {
        fastestMonth = monthData;
      }
      
      if (!slowestMonth || month.buildTimeMs > slowestMonth.timeMs) {
        slowestMonth = monthData;
      }
    }
    
    job.processingStats = {
      totalBuildTime,
      averageMonthTime,
      fastestMonth,
      slowestMonth
    };
  }

  /**
   * Clean up completed jobs older than 1 hour
   */
  static cleanupOldJobs(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [jobId, job] of Array.from(this.activeJobs.entries())) {
      if (job.status === 'completed' || job.status === 'error') {
        if (job.startTime.getTime() < oneHourAgo) {
          console.log(`[HEATMAP-CACHE-BUILDER] Cleaning up old job: ${jobId}`);
          this.activeJobs.delete(jobId);
        }
      }
    }
  }

  /**
   * Get aggregated year data from heat map cache table
   */
  static async getYearDataFromCache(year: number, recordType: string = 'DT'): Promise<any> {
    try {
      const cacheTableName = this.getCacheTableName(year);
      
      // Get all data from year-specific cache table
      const result = await pool.query(`
        SELECT date, dt_count as transaction_count
        FROM ${cacheTableName}
        ORDER BY date ASC
      `);
      
      if (result.rows.length === 0) {
        return null; // No cache data available
      }
      
      const totalRecords = result.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0);
      
      return {
        records: result.rows.map(row => ({
          transaction_date: row.date,
          transaction_count: parseInt(row.transaction_count),
          aggregation_level: 'daily'
        })),
        totalRecords,
        aggregationLevel: 'daily',
        fromPreCache: true,
        year,
        recordType,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[HEATMAP-CACHE-BUILDER] Error getting year data from cache:', error);
      return null;
    }
  }
}