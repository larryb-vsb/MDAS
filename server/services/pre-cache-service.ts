/**
 * Pre-Cache Service
 * 
 * Central service for managing pre-calculated cache data across the MMS system.
 * Handles monthly merchant processing cache, dashboard cache, and other pre-computed data.
 */

import { pool } from "../db";
import { getTableName } from "../table-config";
import { v4 as uuidv4 } from 'uuid';

interface MonthlyCacheData {
  year: number;
  month: number;
  totals: {
    totalTransactionAmount: number;
    totalNetDeposits: number;
    totalFiles: number;
    totalRecords: number;
    bhRecords: number;
    dtRecords: number;
  };
  dailyBreakdown: Array<{
    date: string;
    files: number;
    records: number;
    transactionValue: number;
    netDeposits: number;
    bhRecords: number;
    dtRecords: number;
  }>;
  comparison?: {
    previousMonth: {
      month: string;
      totalTransactionAmount: number;
      totalNetDeposits: number;
    };
  };
}

interface CacheRebuildOptions {
  year: number;
  month: number;
  triggeredBy?: string;
  triggeredByUser?: string;
  triggerReason?: string;
}

export class PreCacheService {
  /**
   * Build monthly cache for a specific month
   */
  static async buildMonthlyCache(options: CacheRebuildOptions): Promise<{ success: boolean; jobId: string; buildTimeMs: number }> {
    const { year, month, triggeredBy = 'manual', triggeredByUser, triggerReason = 'user_request' } = options;
    const jobId = uuidv4();
    const startTime = Date.now();
    
    const client = await pool.connect();
    
    try {
      console.log(`[PRE-CACHE] Starting monthly cache build for ${year}-${month.toString().padStart(2, '0')} (Job ${jobId})`);
      
      // Create pre-cache run record
      const cacheRunsTable = getTableName('pre_cache_runs');
      await client.query(`
        INSERT INTO ${cacheRunsTable} (
          job_id, cache_name, cache_type, year, month,
          status, started_at, triggered_by, triggered_by_user, trigger_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
      `, [jobId, 'tddf1_monthly_cache', 'monthly', year, month, 'running', triggeredBy, triggeredByUser, triggerReason]);
      
      // Build the monthly data
      const monthlyData = await this.calculateMonthlyData(client, year, month);
      
      // Upsert into monthly cache table
      const monthlyCacheTable = getTableName('tddf1_monthly_cache');
      const cacheKey = `monthly_${year}_${month.toString().padStart(2, '0')}`;
      
      await client.query(`
        INSERT INTO ${monthlyCacheTable} (
          year, month, cache_key,
          totals_json, daily_breakdown_json, comparison_json,
          total_transaction_amount, total_net_deposits,
          total_files, total_records, bh_records, dt_records,
          build_time_ms, status, last_refresh_datetime,
          refresh_requested_by, triggered_by,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, NOW(), NOW()
        )
        ON CONFLICT (year, month) 
        DO UPDATE SET
          totals_json = EXCLUDED.totals_json,
          daily_breakdown_json = EXCLUDED.daily_breakdown_json,
          comparison_json = EXCLUDED.comparison_json,
          total_transaction_amount = EXCLUDED.total_transaction_amount,
          total_net_deposits = EXCLUDED.total_net_deposits,
          total_files = EXCLUDED.total_files,
          total_records = EXCLUDED.total_records,
          bh_records = EXCLUDED.bh_records,
          dt_records = EXCLUDED.dt_records,
          build_time_ms = EXCLUDED.build_time_ms,
          status = EXCLUDED.status,
          last_refresh_datetime = NOW(),
          refresh_requested_by = EXCLUDED.refresh_requested_by,
          triggered_by = EXCLUDED.triggered_by,
          updated_at = NOW()
      `, [
        year, month, cacheKey,
        JSON.stringify(monthlyData.totals),
        JSON.stringify(monthlyData.dailyBreakdown),
        JSON.stringify(monthlyData.comparison),
        monthlyData.totals.totalTransactionAmount,
        monthlyData.totals.totalNetDeposits,
        monthlyData.totals.totalFiles,
        monthlyData.totals.totalRecords,
        monthlyData.totals.bhRecords,
        monthlyData.totals.dtRecords,
        0, // Will update after completion
        'active',
        triggeredByUser,
        triggeredBy
      ]);
      
      const buildTimeMs = Date.now() - startTime;
      
      // Update build time
      await client.query(`
        UPDATE ${monthlyCacheTable}
        SET build_time_ms = $1, updated_at = NOW()
        WHERE year = $2 AND month = $3
      `, [buildTimeMs, year, month]);
      
      // Update pre-cache run record
      await client.query(`
        UPDATE ${cacheRunsTable}
        SET status = $1, completed_at = NOW(), duration_ms = $2,
            records_processed = $3, records_cached = $4
        WHERE job_id = $5
      `, ['completed', buildTimeMs, monthlyData.totals.totalRecords, monthlyData.dailyBreakdown.length, jobId]);
      
      console.log(`[PRE-CACHE] ✅ Monthly cache built for ${year}-${month.toString().padStart(2, '0')} in ${buildTimeMs}ms`);
      
      return { success: true, jobId, buildTimeMs };
      
    } catch (error: any) {
      const buildTimeMs = Date.now() - startTime;
      console.error(`[PRE-CACHE] ❌ Failed to build monthly cache for ${year}-${month}:`, error);
      
      // Update pre-cache run record as failed
      const cacheRunsTable = getTableName('pre_cache_runs');
      await client.query(`
        UPDATE ${cacheRunsTable}
        SET status = $1, completed_at = NOW(), duration_ms = $2,
            error_message = $3, error_details = $4
        WHERE job_id = $5
      `, ['failed', buildTimeMs, error.message, JSON.stringify({ stack: error.stack }), jobId]);
      
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Calculate monthly data from master TDDF table
   */
  private static async calculateMonthlyData(client: any, year: number, month: number): Promise<MonthlyCacheData> {
    const masterTableName = getTableName('tddf_jsonb');
    const monthStr = month.toString().padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${monthStr}-${lastDay.toString().padStart(2, '0')}`;
    
    console.log(`[PRE-CACHE] Calculating data for ${startDate} to ${endDate}`);
    
    // Set query timeout
    await client.query(`SET LOCAL statement_timeout = '120s'`);
    
    // Get monthly totals with separate parameters for DATE and JSONB text fields
    const totalsResult = await client.query(`
      SELECT 
        COUNT(DISTINCT upload_id) as total_files,
        COUNT(*) as total_records,
        SUM(CASE WHEN record_type = 'BH' THEN 1 ELSE 0 END) as bh_records,
        SUM(CASE WHEN record_type = 'DT' THEN 1 ELSE 0 END) as dt_records,
        COALESCE(SUM(CASE 
          WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal 
          ELSE 0 
        END), 0) as total_transaction_amount,
        COALESCE(SUM(CASE 
          WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal 
          ELSE 0 
        END), 0) as total_net_deposits
      FROM ${masterTableName}
      WHERE (
        (tddf_processing_date >= $1 AND tddf_processing_date <= $2 
         AND record_type = 'BH' AND extracted_fields->>'batchDate' >= $3 AND extracted_fields->>'batchDate' <= $4)
        OR
        (tddf_processing_date >= $1 AND tddf_processing_date <= $2 
         AND record_type = 'DT' AND extracted_fields->>'transactionDate' >= $3 AND extracted_fields->>'transactionDate' <= $4)
      )
    `, [startDate, endDate, startDate, endDate]);
    
    const totals = {
      totalTransactionAmount: parseFloat(totalsResult.rows[0]?.total_transaction_amount || '0'),
      totalNetDeposits: parseFloat(totalsResult.rows[0]?.total_net_deposits || '0'),
      totalFiles: parseInt(totalsResult.rows[0]?.total_files || '0'),
      totalRecords: parseInt(totalsResult.rows[0]?.total_records || '0'),
      bhRecords: parseInt(totalsResult.rows[0]?.bh_records || '0'),
      dtRecords: parseInt(totalsResult.rows[0]?.dt_records || '0')
    };
    
    // Get daily breakdown with separate parameters
    const dailyResult = await client.query(`
      SELECT 
        COALESCE(
          CASE WHEN record_type = 'BH' THEN extracted_fields->>'batchDate'
               WHEN record_type = 'DT' THEN extracted_fields->>'transactionDate'
          END
        ) as date,
        COUNT(DISTINCT upload_id) as files,
        COUNT(*) as records,
        COALESCE(SUM(CASE WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal END), 0) as transaction_value,
        COALESCE(SUM(CASE WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal END), 0) as net_deposits,
        SUM(CASE WHEN record_type = 'BH' THEN 1 ELSE 0 END) as bh_records,
        SUM(CASE WHEN record_type = 'DT' THEN 1 ELSE 0 END) as dt_records
      FROM ${masterTableName}
      WHERE (
        (tddf_processing_date >= $1 AND tddf_processing_date <= $2 
         AND record_type = 'BH' AND extracted_fields->>'batchDate' >= $3 AND extracted_fields->>'batchDate' <= $4)
        OR
        (tddf_processing_date >= $1 AND tddf_processing_date <= $2 
         AND record_type = 'DT' AND extracted_fields->>'transactionDate' >= $3 AND extracted_fields->>'transactionDate' <= $4)
      )
      GROUP BY COALESCE(
        CASE WHEN record_type = 'BH' THEN extracted_fields->>'batchDate'
             WHEN record_type = 'DT' THEN extracted_fields->>'transactionDate'
        END
      )
      HAVING COALESCE(
        CASE WHEN record_type = 'BH' THEN extracted_fields->>'batchDate'
             WHEN record_type = 'DT' THEN extracted_fields->>'transactionDate'
        END
      ) IS NOT NULL
      ORDER BY date
    `, [startDate, endDate, startDate, endDate]);
    
    const dailyBreakdown = dailyResult.rows.map((row: any) => ({
      date: row.date,
      files: parseInt(row.files),
      records: parseInt(row.records),
      transactionValue: parseFloat(row.transaction_value || '0'),
      netDeposits: parseFloat(row.net_deposits || '0'),
      bhRecords: parseInt(row.bh_records || '0'),
      dtRecords: parseInt(row.dt_records || '0')
    }));
    
    // Calculate previous month for comparison
    const prevDate = new Date(year, month - 2, 1); // month - 2 because month is 1-indexed
    const prevMonth = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}`;
    
    return {
      year,
      month,
      totals,
      dailyBreakdown,
      comparison: {
        previousMonth: {
          month: prevMonth,
          totalTransactionAmount: 0, // TODO: Calculate from previous month cache
          totalNetDeposits: 0
        }
      }
    };
  }
  
  /**
   * Get cached monthly data
   */
  static async getMonthlyCache(year: number, month: number): Promise<MonthlyCacheData | null> {
    const monthlyCacheTable = getTableName('tddf1_monthly_cache');
    
    const result = await pool.query(`
      SELECT 
        year, month,
        totals_json, daily_breakdown_json, comparison_json,
        total_transaction_amount, total_net_deposits,
        total_files, total_records, bh_records, dt_records,
        build_time_ms, status, last_refresh_datetime
      FROM ${monthlyCacheTable}
      WHERE year = $1 AND month = $2 AND status = 'active'
    `, [year, month]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      year: row.year,
      month: row.month,
      totals: row.totals_json || {
        totalTransactionAmount: parseFloat(row.total_transaction_amount || '0'),
        totalNetDeposits: parseFloat(row.total_net_deposits || '0'),
        totalFiles: row.total_files || 0,
        totalRecords: row.total_records || 0,
        bhRecords: row.bh_records || 0,
        dtRecords: row.dt_records || 0
      },
      dailyBreakdown: row.daily_breakdown_json || [],
      comparison: row.comparison_json
    };
  }
  
  /**
   * Invalidate cache for specific months (called after Step 6 processing)
   */
  static async invalidateMonthlyCache(businessDates: Date[]): Promise<void> {
    if (businessDates.length === 0) return;
    
    const monthlyCacheTable = getTableName('tddf1_monthly_cache');
    
    // Group dates by year-month
    const monthsToInvalidate = new Set<string>();
    for (const date of businessDates) {
      const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      monthsToInvalidate.add(yearMonth);
    }
    
    console.log(`[PRE-CACHE] Invalidating ${monthsToInvalidate.size} months: ${Array.from(monthsToInvalidate).join(', ')}`);
    
    // Mark affected months as expired
    for (const yearMonth of monthsToInvalidate) {
      const [year, month] = yearMonth.split('-').map(Number);
      await pool.query(`
        UPDATE ${monthlyCacheTable}
        SET status = 'expired', updated_at = NOW()
        WHERE year = $1 AND month = $2
      `, [year, month]);
    }
    
    // TODO: Trigger background rebuild for expired months
  }
  
  /**
   * Get all cache tables with their status
   */
  static async getAllCacheTables(): Promise<any[]> {
    const tables = [
      { name: 'tddf1_monthly_cache', type: 'monthly' },
      { name: 'dashboard_cache', type: 'dashboard' },
      { name: 'charts_pre_cache', type: 'charts' },
      { name: 'tddf_json_record_type_counts_pre_cache', type: 'records' }
    ];
    
    const results = [];
    
    for (const table of tables) {
      const tableName = getTableName(table.name);
      
      try {
        const result = await pool.query(`
          SELECT 
            COUNT(*) as record_count,
            MAX(updated_at) as last_refresh,
            CASE 
              WHEN status = 'active' THEN 'active'
              WHEN status = 'expired' THEN 'expired'
              WHEN status = 'building' THEN 'building'
              ELSE 'stale'
            END as status
          FROM ${tableName}
          WHERE status != 'error'
        `);
        
        const row = result.rows[0];
        const lastRefresh = row.last_refresh ? new Date(row.last_refresh) : null;
        const now = new Date();
        const ageMs = lastRefresh ? now.getTime() - lastRefresh.getTime() : 0;
        const ageMinutes = Math.floor(ageMs / 60000);
        
        let age = 'Unknown';
        if (ageMinutes < 60) {
          age = `${ageMinutes} min ago`;
        } else if (ageMinutes < 1440) {
          age = `${Math.floor(ageMinutes / 60)} hours ago`;
        } else {
          age = `${Math.floor(ageMinutes / 1440)} days ago`;
        }
        
        results.push({
          name: table.name,
          status: row.status || 'unknown',
          recordCount: parseInt(row.record_count || '0'),
          lastRefresh: lastRefresh ? lastRefresh.toISOString() : null,
          age,
          size: null,
          expirationDuration: 'Never Expires'
        });
      } catch (error: any) {
        console.error(`[PRE-CACHE] Error querying ${tableName}:`, error.message);
        results.push({
          name: table.name,
          status: 'empty',
          recordCount: 0,
          lastRefresh: null,
          age: 'Never',
          size: null,
          expirationDuration: 'Never Expires'
        });
      }
    }
    
    return results;
  }
  
  /**
   * Rebuild all months with data
   */
  static async rebuildAllMonths(triggeredBy: string = 'manual', triggeredByUser?: string): Promise<{ rebuilt: number; failed: number }> {
    const masterTableName = getTableName('tddf_jsonb');
    
    // Find all unique year-months in the master table
    const result = await pool.query(`
      SELECT DISTINCT
        EXTRACT(YEAR FROM tddf_processing_date)::integer as year,
        EXTRACT(MONTH FROM tddf_processing_date)::integer as month
      FROM ${masterTableName}
      WHERE tddf_processing_date IS NOT NULL
      ORDER BY year, month
    `);
    
    console.log(`[PRE-CACHE] Found ${result.rows.length} months to rebuild`);
    
    let rebuilt = 0;
    let failed = 0;
    
    for (const row of result.rows) {
      try {
        await this.buildMonthlyCache({
          year: row.year,
          month: row.month,
          triggeredBy,
          triggeredByUser,
          triggerReason: 'rebuild_all'
        });
        rebuilt++;
      } catch (error) {
        console.error(`[PRE-CACHE] Failed to rebuild ${row.year}-${row.month}:`, error);
        failed++;
      }
    }
    
    return { rebuilt, failed };
  }
}
