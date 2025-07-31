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
  private static readonly CACHE_TABLE = getTableName('tddf_json_activity_pre_cache');

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
            job.recordType, 
            tddfJsonbTableName
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
    recordType: string, 
    tableName: string
  ): Promise<{ recordCount: number; dailyData: any[] }> {
    
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
      FROM ${tableName}
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
    
    // Insert or update cache entry
    await pool.query(`
      INSERT INTO ${this.CACHE_TABLE} (
        cache_key, 
        year, 
        month, 
        record_type, 
        cache_data, 
        record_count, 
        build_time_ms, 
        expires_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (cache_key) 
      DO UPDATE SET 
        cache_data = EXCLUDED.cache_data,
        record_count = EXCLUDED.record_count,
        build_time_ms = EXCLUDED.build_time_ms,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `, [
      cacheKey,
      year,
      month, 
      recordType,
      JSON.stringify(cacheData),
      recordCount,
      0, // Will be updated by caller
      new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hour expiry
      new Date()
    ]);
    
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
    
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.status === 'completed' || job.status === 'error') {
        if (job.startTime.getTime() < oneHourAgo) {
          console.log(`[HEATMAP-CACHE-BUILDER] Cleaning up old job: ${jobId}`);
          this.activeJobs.delete(jobId);
        }
      }
    }
  }

  /**
   * Get aggregated year data from monthly cache
   */
  static async getYearDataFromCache(year: number, recordType: string = 'DT'): Promise<any> {
    try {
      // Get all monthly cache entries for the year
      const result = await pool.query(`
        SELECT cache_data, record_count
        FROM ${this.CACHE_TABLE}
        WHERE year = $1 AND record_type = $2
        ORDER BY month ASC
      `, [year, recordType]);
      
      if (result.rows.length === 0) {
        return null; // No cache data available
      }
      
      // Aggregate daily data from all months
      const allDailyData: any[] = [];
      let totalRecords = 0;
      
      for (const row of result.rows) {
        const monthData = JSON.parse(row.cache_data);
        allDailyData.push(...monthData.dailyData);
        totalRecords += row.record_count;
      }
      
      return {
        records: allDailyData,
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