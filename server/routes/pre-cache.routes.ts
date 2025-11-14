/**
 * Pre-Cache Management Routes
 * 
 * API endpoints for managing pre-calculated cache data across the MMS system.
 * Supports monthly merchant processing cache, dashboard cache, and other pre-computed data.
 */

import type { Express } from "express";
import { isAuthenticated } from "../routes";
import { PreCacheService } from "../services/pre-cache-service";
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
   * Rebuild cache for a specific month
   * POST /api/pre-cache/monthly-cache/:year/:month/rebuild
   */
  app.post('/api/pre-cache/monthly-cache/:year/:month/rebuild', isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month);
      const username = (req.user as any)?.username || 'system';
      
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid year or month parameters' });
      }
      
      console.log(`[PRE-CACHE] Rebuilding cache for ${year}-${month.toString().padStart(2, '0')} requested by ${username}`);
      
      const result = await PreCacheService.buildMonthlyCache(year, month, 'manual', username);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Successfully rebuilt cache for ${year}-${month.toString().padStart(2, '0')}`,
          data: result
        });
      } else {
        res.status(500).json({ 
          error: result.error || 'Failed to rebuild cache'
        });
      }
    } catch (error: any) {
      console.error('[PRE-CACHE] Error rebuilding monthly cache:', error);
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
          cache_status, health_status, update_policy, cache_update_policy,
          expiration_policy, auto_refresh_enabled,
          current_record_count, average_build_time_ms, last_build_time_ms,
          last_successful_update, priority_level, configuration_notes,
          error_count_24h, consecutive_failures, last_error_message,
          cache_hit_rate, total_cache_hits, total_cache_misses
        FROM ${cacheConfigTable}
        WHERE is_active = true
        ORDER BY priority_level DESC, cache_name ASC
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
      const cacheConfigTable = getTableName('cache_configuration');
      
      // Overall stats
      const overallResult = await pool.query(`
        SELECT 
          COUNT(*) as total_caches,
          SUM(CASE WHEN cache_status = 'active' THEN 1 ELSE 0 END) as active_caches,
          SUM(CASE WHEN cache_status = 'error' THEN 1 ELSE 0 END) as error_caches,
          SUM(CASE WHEN health_status = 'healthy' THEN 1 ELSE 0 END) as healthy_caches,
          SUM(CASE WHEN health_status = 'critical' THEN 1 ELSE 0 END) as critical_caches,
          AVG(average_build_time_ms)::integer as avg_build_time,
          SUM(current_record_count)::integer as total_records
        FROM ${cacheConfigTable}
        WHERE is_active = true
      `);
      
      // Performance by type
      const byTypeResult = await pool.query(`
        SELECT 
          cache_type,
          COUNT(*) as cache_count,
          AVG(average_build_time_ms)::integer as avg_build_time,
          SUM(current_record_count)::integer as total_records,
          SUM(CASE WHEN cache_status = 'active' THEN 1 ELSE 0 END) as active_count
        FROM ${cacheConfigTable}
        WHERE is_active = true
        GROUP BY cache_type
        ORDER BY cache_type
      `);
      
      // Recent errors
      const errorsResult = await pool.query(`
        SELECT 
          cache_name, page_name, last_error_message,
          last_error_timestamp, consecutive_failures
        FROM ${cacheConfigTable}
        WHERE is_active = true 
          AND last_error_message IS NOT NULL
        ORDER BY last_error_timestamp DESC NULLS LAST
        LIMIT 10
      `);
      
      // Slow caches
      const slowResult = await pool.query(`
        SELECT 
          cache_name, page_name, average_build_time_ms,
          last_build_time_ms, current_record_count
        FROM ${cacheConfigTable}
        WHERE is_active = true
        ORDER BY average_build_time_ms DESC NULLS LAST
        LIMIT 10
      `);
      
      const dashboard = {
        overallStats: overallResult.rows[0] || {},
        performanceByType: byTypeResult.rows || [],
        recentErrors: errorsResult.rows || [],
        slowCaches: slowResult.rows || [],
        lastUpdated: new Date().toISOString()
      };
      
      res.json({ success: true, dashboard });
    } catch (error: any) {
      console.error('[PRE-CACHE] Error fetching performance dashboard:', error);
      // Return empty dashboard if table doesn't exist
      res.json({
        success: true,
        dashboard: {
          overallStats: {},
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
          cache_status, health_status, update_policy, cache_update_policy,
          expiration_policy, auto_refresh_enabled,
          default_expiration_minutes, current_expiration_minutes,
          current_record_count, average_build_time_ms, last_build_time_ms,
          last_successful_update, priority_level, configuration_notes,
          error_count_24h, consecutive_failures, last_error_message,
          cache_hit_rate, total_cache_hits, total_cache_misses
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
          status: row.cache_status || 'unknown',
          healthStatus: row.health_status || 'unknown',
          expirationMinutes: row.current_expiration_minutes || row.default_expiration_minutes || -1,
          expirationPolicy: row.expiration_policy,
          autoRefreshEnabled: row.auto_refresh_enabled,
          cacheUpdatePolicy: row.cache_update_policy,
          recordCount: row.current_record_count || 0,
          avgBuildTime: row.average_build_time_ms || 0,
          lastBuildTime: row.last_build_time_ms || 0,
          lastRefresh: row.last_successful_update,
          errorCount24h: row.error_count_24h || 0,
          consecutiveFailures: row.consecutive_failures || 0,
          lastError: row.last_error_message,
          cacheHitRate: row.cache_hit_rate || 0,
          totalHits: row.total_cache_hits || 0,
          totalMisses: row.total_cache_misses || 0
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
