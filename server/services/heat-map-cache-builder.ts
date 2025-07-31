/**
 * Heat Map Cache Builder Service
 * 
 * Handles month-by-month pre-cache building for TDDF JSON Activity Heat Maps
 * with progress tracking and watcher service integration
 */

import { pool } from '../db';
import { getTableName } from '../table-config';

interface MonthProgress {
  year: number;
  month: number;
  status: 'pending' | 'building' | 'completed' | 'error';
  recordCount: number;
  buildTimeMs: number;
  error?: string;
  startTime?: Date;
  completedTime?: Date;
}

interface HeatMapCacheBuildJob {
  id: string;
  year: number;
  recordType: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  totalMonths: number;
  completedMonths: number;
  monthProgress: MonthProgress[];
  startTime: Date;
  completedTime?: Date;
  totalRecords: number;
  error?: string;
}

export class HeatMapCacheBuilder {
  private static activeJobs = new Map<string, HeatMapCacheBuildJob>();
  private static getCacheTableName(year: number): string {
    return `heat_map_cache_${year}`;
  }

  /**
   * Start a month-by-month heat map cache rebuild job
   */
  static async startCacheRebuild(year: number, recordType: string = 'DT'): Promise<string> {
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
        
        console.log(`[HEATMAP-CACHE-BUILDER] Processing ${job.year}-${month.toString().padStart(2, '0')} (Job: ${jobId})`);
        
        try {
          const monthStartTime = Date.now();
          
          // Build monthly cache data
          const monthData = await this.buildMonthCache(
            job.year, 
            month, 
            job.recordType
          );
          
          const buildTimeMs = Date.now() - monthStartTime;
          
          // Update progress
          monthProgress.status = 'completed';
          monthProgress.recordCount = monthData.recordCount;
          monthProgress.buildTimeMs = buildTimeMs;
          monthProgress.completedTime = new Date();
          
          job.completedMonths++;
          job.totalRecords += monthData.recordCount;
          
          console.log(`[HEATMAP-CACHE-BUILDER] Completed ${job.year}-${month.toString().padStart(2, '0')}: ${monthData.recordCount} records in ${buildTimeMs}ms`);
          
          // Small delay between months to prevent database overload
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`[HEATMAP-CACHE-BUILDER] Failed to build month ${month}:`, error);
          monthProgress.status = 'error';
          monthProgress.error = error instanceof Error ? error.message : 'Unknown error';
        }
      }
      
      // Complete job
      job.status = 'completed';
      job.completedTime = new Date();
      
      console.log(`[HEATMAP-CACHE-BUILDER] Job ${jobId} completed: ${job.totalRecords} total records across ${job.completedMonths} months`);
      
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
        date DATE PRIMARY KEY,
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