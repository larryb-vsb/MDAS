/**
 * Pre-Cache Management Routes
 * 
 * API endpoints for managing pre-calculated cache data across the MMS system.
 * Supports monthly merchant processing cache, dashboard cache, and other pre-computed data.
 */

import type { Express } from "express";
import { isAuthenticated } from "../routes";
import { PreCacheService } from "../services/pre-cache-service";
import { rebuildJobTracker } from "../services/rebuild-job-tracker";
import { pool } from "../db";
import { getTableName } from "../table-config";

export function registerPreCacheRoutes(app: Express) {
  console.log('[INFO] [PRE-CACHE] Routes registered');
  
  /**
   * Get all cache tables with status
   * GET /api/pre-cache/all-tables
   */
  app.get('/api/pre-cache/all-tables', isAuthenticated, async (req, res) => {
    try {
      const tables = await PreCacheService.getAllCacheTables();
      res.json({ success: true, tables });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching cache tables:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * List all monthly cache entries
   * GET /api/pre-cache/monthly-cache
   */
  app.get('/api/pre-cache/monthly-cache', isAuthenticated, async (req, res) => {
    try {
      const months = await PreCacheService.listMonthlyCaches();
      res.json({ success: true, months });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error listing monthly caches:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get rebuild status for all months
   * GET /api/pre-cache/rebuild-status
   */
  app.get('/api/pre-cache/rebuild-status', isAuthenticated, async (req, res) => {
    try {
      const jobsMap = rebuildJobTracker.getJobsMap();
      const activeCount = Object.values(jobsMap).filter(job => job.status === 'running').length;
      res.json({ success: true, jobs: jobsMap, activeCount });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching rebuild status:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get detailed cache data for a specific month
   * GET /api/pre-cache/monthly-cache/:year/:month
   */
  app.get('/api/pre-cache/monthly-cache/:year/:month', isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid year or month parameters' });
      }
      
      const cacheData = await PreCacheService.getMonthlyCacheDetail(year, month);
      
      if (!cacheData) {
        return res.status(404).json({ error: 'Cache data not found for specified month' });
      }
      
      res.json({ success: true, data: cacheData });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching monthly cache detail:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Rebuild cache for a specific month (asynchronous)
   * POST /api/pre-cache/monthly-cache/:year/:month/rebuild
   * 
   * Returns immediately while rebuild runs in background.
   * Poll /api/pre-cache/rebuild-status to track progress.
   */
  app.post('/api/pre-cache/monthly-cache/:year/:month/rebuild', isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const username = (req.user as any)?.username || 'system';
      
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid year or month parameters' });
      }
      
      // Check if already rebuilding (quick check to return 409 immediately)
      if (rebuildJobTracker.isRebuilding(year, month)) {
        return res.status(409).json({ 
          error: 'Rebuild already in progress for this month',
          status: 'rebuilding'
        });
      }
      
      console.log(`[PRE-CACHE] Starting async rebuild for ${year}-${month.toString().padStart(2, '0')} requested by ${username}`);
      
      // Return immediately to client
      res.json({ 
        success: true, 
        message: `Cache rebuild started for ${year}-${month.toString().padStart(2, '0')}`,
        status: 'running'
      });
      
      // Run rebuild in background (don't await)
      // buildMonthlyCache handles its own job tracking via rebuildJobTracker
      PreCacheService.buildMonthlyCache({
        year,
        month,
        triggeredBy: 'manual',
        triggeredByUser: username,
        triggerReason: 'user_request'
      })
        .then((result) => {
          console.log(`[PRE-CACHE] Background rebuild completed for ${year}-${month.toString().padStart(2, '0')} (Job: ${result.jobId}) in ${result.buildTimeMs}ms`);
        })
        .catch((error: any) => {
          console.error(`[PRE-CACHE] Background rebuild failed for ${year}-${month.toString().padStart(2, '0')}:`, error);
          // Error is already logged by buildMonthlyCache, which handles rebuildJobTracker.errorJob()
        });
      
    } catch (error: any) {
      console.error('[PRE-CACHE] Error starting rebuild:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Refresh specific cache table
   * POST /api/pre-cache/refresh-table/:tableName
   */
  app.post('/api/pre-cache/refresh-table/:tableName', isAuthenticated, async (req, res) => {
    try {
      const { tableName } = req.params;
      const username = (req.user as any)?.username || 'system';
      
      console.log(`[PRE-CACHE] Refresh requested for table: ${tableName} by ${username}`);
      
      // Security: Map logical cache names to specific handlers to prevent SQL injection
      // Each handler is explicitly defined with no string interpolation
      const cacheHandlers: Record<string, () => Promise<{ success: boolean; message: string; rebuilt?: number; failed?: number }>> = {
        'tddf1_monthly_cache': async () => {
          const result = await PreCacheService.rebuildAllMonths('manual', username);
          return {
            success: true,
            message: `Rebuilt ${result.rebuilt} months, ${result.failed} failed`,
            rebuilt: result.rebuilt,
            failed: result.failed
          };
        },
        'dashboard_cache': async () => {
          // Placeholder for dashboard cache refresh
          return { success: true, message: 'Dashboard cache refresh not yet implemented' };
        },
        'charts_pre_cache': async () => {
          // Placeholder for charts cache refresh
          return { success: true, message: 'Charts cache refresh not yet implemented' };
        },
        'tddf_json_record_type_counts_pre_cache': async () => {
          // Placeholder for record type counts refresh
          return { success: true, message: 'Record type counts refresh not yet implemented' };
        },
        'tddf_records_all_pre_cache': async () => {
          return { success: true, message: 'TDDF all records cache refresh not yet implemented' };
        },
        'tddf_records_dt_pre_cache': async () => {
          return { success: true, message: 'TDDF DT records cache refresh not yet implemented' };
        },
        'tddf_records_bh_pre_cache': async () => {
          return { success: true, message: 'TDDF BH records cache refresh not yet implemented' };
        },
        'tddf_records_p1_pre_cache': async () => {
          return { success: true, message: 'TDDF P1 records cache refresh not yet implemented' };
        },
        'tddf_records_p2_pre_cache': async () => {
          return { success: true, message: 'TDDF P2 records cache refresh not yet implemented' };
        },
        'tddf_records_other_pre_cache': async () => {
          return { success: true, message: 'TDDF other records cache refresh not yet implemented' };
        },
        'tddf_batch_relationships_pre_cache': async () => {
          return { success: true, message: 'TDDF batch relationships cache refresh not yet implemented' };
        }
      };
      
      // Validate table name exists in handlers map
      const handler = cacheHandlers[tableName];
      if (!handler) {
        return res.status(400).json({ 
          error: 'Invalid table name',
          message: `Table "${tableName}" is not a valid cache table`
        });
      }
      
      // Execute the specific handler for this cache
      const result = await handler();
      res.json(result);
      
    } catch (error: any) {
      console.error('[PRE-CACHE] Error refreshing table:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get cache settings status
   * GET /api/pre-cache/settings-status
   */
  app.get('/api/pre-cache/settings-status', isAuthenticated, async (req, res) => {
    try {
      const cacheConfigTable = getTableName('cache_configuration');
      
      const result = await pool.query(`
        SELECT 
          id, cache_name, cache_type, page_name, table_name,
          expiration_policy, auto_refresh_enabled,
          refresh_interval_minutes, current_expiration_minutes,
          description, notes, metadata, is_active,
          last_refresh_at, created_at, updated_at
        FROM ${cacheConfigTable}
        WHERE is_active = true
        ORDER BY cache_name ASC
      `);
      
      res.json({ success: true, data: result.rows });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching settings:', error);
      // Return empty array if table doesn't exist yet
      res.json({ success: true, data: [] });
    }
  });
  
  /**
   * Get performance dashboard
   * GET /api/pre-cache/performance-dashboard
   */
  app.get('/api/pre-cache/performance-dashboard', isAuthenticated, async (req, res) => {
    try {
      const monthlyCacheTable = getTableName('tddf1_monthly_cache');
      const cacheRunsTable = getTableName('pre_cache_runs');
      
      // Get overall stats from monthly cache
      const overallResult = await pool.query(`
        SELECT 
          COUNT(*) as total_caches,
          COUNT(*) as active_caches,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_caches,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as healthy_caches,
          0 as critical_caches,
          COALESCE(AVG(build_time_ms), 0)::bigint as avg_build_time,
          COALESCE(SUM(total_records), 0)::bigint as total_records
        FROM ${monthlyCacheTable}
      `);
      
      // Performance by type (monthly only for now)
      const byTypeResult = await pool.query(`
        SELECT 
          'monthly' as cache_type,
          COUNT(*) as cache_count,
          COALESCE(AVG(build_time_ms), 0)::bigint as avg_build_time,
          COALESCE(SUM(total_records), 0)::bigint as total_records,
          COUNT(*) as active_count
        FROM ${monthlyCacheTable}
        WHERE status = 'active'
      `);
      
      // Recent errors from cache runs
      const errorsResult = await pool.query(`
        SELECT 
          job_id as id,
          'Monthly Cache' as cache_name,
          error_message as error,
          completed_at as timestamp
        FROM ${cacheRunsTable}
        WHERE status = 'failed'
        ORDER BY completed_at DESC
        LIMIT 5
      `);
      
      // Slow caches (>30 seconds)
      const slowResult = await pool.query(`
        SELECT 
          year || '-' || LPAD(month::text, 2, '0') as cache_name,
          build_time_ms,
          total_records,
          last_refresh_datetime as last_refresh
        FROM ${monthlyCacheTable}
        WHERE build_time_ms > 30000
        ORDER BY build_time_ms DESC
        LIMIT 5
      `);
      
      const dashboard = {
        overallStats: overallResult.rows[0] || {
          total_caches: 0,
          active_caches: 0,
          error_caches: 0,
          healthy_caches: 0,
          critical_caches: 0,
          avg_build_time: 0,
          total_records: 0
        },
        performanceByType: byTypeResult.rows || [],
        recentErrors: errorsResult.rows || [],
        slowCaches: slowResult.rows || [],
        lastUpdated: new Date().toISOString()
      };
      
      res.json({ success: true, dashboard });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching performance dashboard:', error);
      // Return empty dashboard if tables don't exist
      res.json({
        success: true,
        dashboard: {
          overallStats: {
            total_caches: 0,
            active_caches: 0,
            error_caches: 0,
            healthy_caches: 0,
            critical_caches: 0,
            avg_build_time: 0,
            total_records: 0
          },
          performanceByType: [],
          recentErrors: [],
          slowCaches: [],
          lastUpdated: new Date().toISOString()
        }
      });
    }
  });
  
  /**
   * Initialize default cache configurations
   * POST /api/pre-cache/initialize-defaults
   */
  app.post('/api/pre-cache/initialize-defaults', isAuthenticated, async (req, res) => {
    try {
      const cacheConfigTable = getTableName('cache_configuration');
      
      const defaultConfigs = [
        {
          cache_name: 'tddf1_monthly_cache',
          cache_type: 'monthly',
          page_name: 'Monthly Merchant Processing',
          table_name: getTableName('tddf1_monthly_cache'),
          expiration_policy: 'never',
          auto_refresh_enabled: true,
          cache_update_policy: 'manual'
        },
        {
          cache_name: 'dashboard_cache',
          cache_type: 'dashboard',
          page_name: 'Main Dashboard',
          table_name: getTableName('dashboard_cache'),
          expiration_policy: 'fixed',
          auto_refresh_enabled: true,
          cache_update_policy: 'once_a_day'
        },
        {
          cache_name: 'charts_pre_cache',
          cache_type: 'charts',
          page_name: 'Analytics Charts',
          table_name: getTableName('charts_pre_cache'),
          expiration_policy: 'never',
          auto_refresh_enabled: false,
          cache_update_policy: 'manual'
        }
      ];
      
      const results = [];
      
      for (const config of defaultConfigs) {
        await pool.query(`
          INSERT INTO ${cacheConfigTable} (
            cache_name, cache_type, page_name, table_name,
            expiration_policy, auto_refresh_enabled, cache_update_policy,
            is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
          ON CONFLICT (cache_name) DO NOTHING
        `, [
          config.cache_name,
          config.cache_type,
          config.page_name,
          config.table_name,
          config.expiration_policy,
          config.auto_refresh_enabled,
          config.cache_update_policy
        ]);
        
        results.push({ cache_name: config.cache_name, status: 'initialized' });
      }
      
      res.json({ success: true, results });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error initializing defaults:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get cache details for a specific table
   * GET /api/pre-cache/cache-details/:tableName
   */
  app.get('/api/pre-cache/cache-details/:tableName', isAuthenticated, async (req, res) => {
    try {
      const { tableName } = req.params;
      const cacheConfigTable = getTableName('cache_configuration');
      
      const result = await pool.query(`
        SELECT 
          id, cache_name, cache_type, page_name, table_name,
          expiration_policy, auto_refresh_enabled,
          current_expiration_minutes, refresh_interval_minutes,
          description, notes, metadata, is_active,
          last_refresh_at, created_at, updated_at
        FROM ${cacheConfigTable}
        WHERE table_name = $1 OR cache_name = $2
        LIMIT 1
      `, [getTableName(tableName), tableName]);
      
      if (result.rows.length === 0) {
        return res.json({
          success: true,
          details: {
            name: tableName,
            status: 'unknown',
            expirationMinutes: -1,
            recordCount: 0,
            lastRefresh: null
          }
        });
      }
      
      const row = result.rows[0];
      
      res.json({
        success: true,
        details: {
          name: tableName,
          cacheName: row.cache_name,
          cacheType: row.cache_type,
          pageName: row.page_name,
          status: row.is_active ? 'active' : 'inactive',
          healthStatus: 'unknown',
          expirationMinutes: row.current_expiration_minutes || -1,
          expirationPolicy: row.expiration_policy,
          autoRefreshEnabled: row.auto_refresh_enabled,
          cacheUpdatePolicy: 'unknown',
          recordCount: 0,
          avgBuildTime: 0,
          lastBuildTime: 0,
          lastRefresh: row.last_refresh_at,
          errorCount24h: 0,
          consecutiveFailures: 0,
          lastError: null,
          cacheHitRate: 0,
          totalHits: 0,
          totalMisses: 0
        }
      });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching cache details:', error);
      res.json({
        success: true,
        details: {
          name: req.params.tableName,
          status: 'unknown',
          expirationMinutes: -1,
          recordCount: 0,
          lastRefresh: null
        }
      });
    }
  });
  
  /**
   * Rebuild monthly cache for specific month
   * POST /api/pre-cache/rebuild-month
   */
  app.post('/api/pre-cache/rebuild-month', isAuthenticated, async (req, res) => {
    try {
      const { year, month } = req.body;
      const username = (req.user as any)?.username || 'system';
      
      if (!year || !month) {
        return res.status(400).json({ error: 'Year and month are required' });
      }
      
      console.log(`[PRE-CACHE] Rebuilding monthly cache for ${year}-${month} by ${username}`);
      
      const result = await PreCacheService.buildMonthlyCache({
        year: parseInt(year),
        month: parseInt(month),
        triggeredBy: 'manual',
        triggeredByUser: username,
        triggerReason: 'user_request'
      });
      
      res.json({
        success: true,
        message: `Monthly cache rebuilt for ${year}-${month}`,
        jobId: result.jobId,
        buildTimeMs: result.buildTimeMs
      });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error rebuilding monthly cache:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Rebuild all monthly caches
   * POST /api/pre-cache/rebuild-all-months
   */
  app.post('/api/pre-cache/rebuild-all-months', isAuthenticated, async (req, res) => {
    try {
      const username = (req.user as any)?.username || 'system';
      
      console.log(`[PRE-CACHE] Rebuilding all monthly caches by ${username}`);
      
      const result = await PreCacheService.rebuildAllMonths('manual', username);
      
      res.json({
        success: true,
        message: `Rebuilt ${result.rebuilt} months, ${result.failed} failed`,
        rebuilt: result.rebuilt,
        failed: result.failed
      });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error rebuilding all months:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get monthly cache data
   * GET /api/pre-cache/month/:year/:month
   */
  app.get('/api/pre-cache/month/:year/:month', isAuthenticated, async (req, res) => {
    try {
      const { year, month } = req.params;
      
      const data = await PreCacheService.getMonthlyCache(parseInt(year), parseInt(month));
      
      if (!data) {
        return res.status(404).json({ error: 'Monthly cache not found' });
      }
      
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching monthly cache:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Get pre-cache job status
   * GET /api/pre-cache/job/status
   */
  app.get('/api/pre-cache/job/status', isAuthenticated, async (req, res) => {
    try {
      const cacheRunsTable = getTableName('pre_cache_runs');
      
      const result = await pool.query(`
        SELECT 
          job_id, cache_name, cache_type, year, month,
          status, started_at, completed_at, duration_ms,
          records_processed, records_cached, error_message,
          triggered_by, triggered_by_user, trigger_reason
        FROM ${cacheRunsTable}
        WHERE status = 'running'
        ORDER BY started_at DESC
        LIMIT 10
      `);
      
      res.json({
        success: true,
        runningJobs: result.rows,
        hasRunningJobs: result.rows.length > 0
      });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching job status:', error);
      res.json({ success: true, runningJobs: [], hasRunningJobs: false });
    }
  });
}
