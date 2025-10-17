import type { Express } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { getTableName } from "../table-config";
import { isAuthenticated } from "./middleware";
import { sql } from "drizzle-orm";
import { HeatMapCacheBuilder } from "../services/heat-map-cache-builder";

// Cache naming utility following target_source_cache_yyyy format
function getCacheTableName(target: string, source: string, year?: number): string {
  const cacheYear = year || new Date().getFullYear();
  return getTableName(`${target}_${source}_cache_${cacheYear}`);
}

// Enhanced cache system for dynamic aggregation (5-15 minute TTL based on dataset size)
let activityCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
const BASE_ACTIVITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes base TTL
const MAX_ACTIVITY_CACHE_TTL = 15 * 60 * 1000; // 15 minutes max TTL for large datasets

export function registerTddfCacheRoutes(app: Express) {
  // ==================== HEATMAP ROUTES (6 routes) ====================
  
  // Get TDDF activity data for heat map (DT records only) - JSONB version
  app.get("/api/tddf/activity-heatmap", isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const terminalId = req.query.terminal_id as string;
      const tddfJsonbTableName = getTableName('tddf_jsonb');
      
      console.log(`[TDDF ACTIVITY HEATMAP] Getting DT activity data from JSONB for year: ${year}${terminalId ? `, terminal: ${terminalId}` : ''}`);
      
      // Build query with optional terminal filter
      let query = `
        SELECT 
          DATE((extracted_fields->>'transactionDate')::date) as transaction_date,
          COUNT(*) as transaction_count
        FROM ${tddfJsonbTableName}
        WHERE record_type = 'DT'
          AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = $1
          AND extracted_fields->>'transactionDate' IS NOT NULL`;
      
      const params = [year];
      
      if (terminalId) {
        query += ` AND extracted_fields->>'terminalId' = $2`;
        params.push(terminalId);
      }
      
      query += `
        GROUP BY DATE((extracted_fields->>'transactionDate')::date)
        ORDER BY DATE((extracted_fields->>'transactionDate')::date)`;
      
      const activityData = await pool.query(query, params);
      
      console.log(`[TDDF ACTIVITY HEATMAP] Found ${activityData.rows.length} days with DT activity for year ${year}${terminalId ? ` (terminal: ${terminalId})` : ''} from JSONB`);
      
      // Format response to match expected interface
      const formattedData = activityData.rows.map((row: any) => ({
        transaction_date: row.transaction_date,
        transaction_count: parseInt(row.transaction_count),
        aggregation_level: 'daily'
      }));
      
      res.json(formattedData);
    } catch (error) {
      console.error('Error fetching TDDF activity heatmap data:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch TDDF activity data" 
      });
    }
  });

  // Get merchant-specific activity data for heat map - JSONB version
  app.get("/api/tddf/merchant-activity-heatmap/:merchantAccountNumber", isAuthenticated, async (req, res) => {
    try {
      const { merchantAccountNumber } = req.params;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const tddfJsonbTableName = getTableName('tddf_jsonb');
      
      console.log(`[MERCHANT ACTIVITY HEATMAP] Getting activity data from JSONB for merchant: ${merchantAccountNumber}, year: ${year}`);
      
      // Query JSONB table for merchant-specific DT transaction activity
      const activityData = await pool.query(`
        SELECT 
          DATE((extracted_fields->>'transactionDate')::date) as date,
          COUNT(*) as "transactionCount"
        FROM ${tddfJsonbTableName}
        WHERE record_type = 'DT'
          AND extracted_fields->>'merchantAccountNumber' = $1
          AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = $2
          AND extracted_fields->>'transactionDate' IS NOT NULL
        GROUP BY DATE((extracted_fields->>'transactionDate')::date)
        ORDER BY DATE((extracted_fields->>'transactionDate')::date)
      `, [merchantAccountNumber, year]);
      
      console.log(`[MERCHANT ACTIVITY HEATMAP] Found ${activityData.rows.length} days with activity for merchant ${merchantAccountNumber} in year ${year} from JSONB`);
      res.json(activityData.rows);
    } catch (error) {
      console.error('Error fetching merchant activity heatmap data:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch merchant activity data" 
      });
    }
  });

  // Simple heat map API for daily DT records only - using regular TDDF records table
  app.get("/api/tddf-json/heatmap-simple", isAuthenticated, async (req, res) => {
    try {
      const tddfRecordsTableName = getTableName('tddf_records');
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      console.log(`[SIMPLE-HEATMAP] Fetching daily DT records for year ${year} from ${tddfRecordsTableName}`);
      const startTime = Date.now();
      
      // Simple daily aggregation for DT records only using regular TDDF records table
      const result = await pool.query(`
        SELECT 
          transaction_date::date as transaction_date,
          COUNT(*) as transaction_count
        FROM ${tddfRecordsTableName}
        WHERE record_identifier = 'DT'
          AND transaction_date IS NOT NULL
          AND EXTRACT(YEAR FROM transaction_date::date) = $1
        GROUP BY transaction_date::date
        ORDER BY transaction_date
      `, [year]);
      
      const queryTime = Date.now() - startTime;
      
      console.log(`[SIMPLE-HEATMAP] Found ${result.rows.length} days with DT transactions in ${queryTime}ms`);
      
      // Transform data for heat map component
      const records = result.rows.map(row => ({
        transaction_date: row.transaction_date.toISOString().split('T')[0], // Format as YYYY-MM-DD
        transaction_count: parseInt(row.transaction_count)
      }));
      
      res.json({
        records,
        queryTime,
        fromCache: false,
        metadata: {
          year,
          recordType: 'DT',
          totalRecords: records.reduce((sum, r) => sum + r.transaction_count, 0),
          aggregationLevel: 'daily',
          recordCount: result.rows.length
        }
      });
    } catch (error) {
      console.error('Error fetching simple heat map data:', error);
      res.status(500).json({ error: 'Failed to fetch simple heat map data' });
    }
  });

  // Cached heat map API for testing page - uses pre-cached data with timing information
  app.get("/api/tddf-json/heatmap-cached", isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const cacheTableName = `heat_map_cache_${year}`;
      
      console.log(`[CACHED-HEATMAP] Fetching cached data for year ${year} from ${cacheTableName}`);
      const startTime = Date.now();
      
      // Check if cache table exists
      const tableExistsResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [cacheTableName]);
      
      if (!tableExistsResult.rows[0].exists) {
        return res.json({
          records: [],
          queryTime: Date.now() - startTime,
          fromCache: true,
          error: `Cache table ${cacheTableName} does not exist`,
          metadata: {
            year,
            recordType: 'DT',
            totalRecords: 0,
            aggregationLevel: 'daily',
            recordCount: 0,
            cacheStatus: 'missing'
          }
        });
      }
      
      // Get cache metadata (last update time)
      const metadataResult = await pool.query(`
        SELECT 
          COUNT(*) as record_count,
          SUM(dt_count) as total_transactions,
          MIN(date) as earliest_date,
          MAX(date) as latest_date
        FROM ${cacheTableName}
      `);
      
      // Get actual cached data
      const result = await pool.query(`
        SELECT 
          date as transaction_date,
          dt_count as transaction_count
        FROM ${cacheTableName}
        ORDER BY date
      `);
      
      const queryTime = Date.now() - startTime;
      
      console.log(`[CACHED-HEATMAP] Retrieved ${result.rows.length} cached days in ${queryTime}ms`);
      
      // Transform data for heat map component
      const records = result.rows.map(row => ({
        transaction_date: row.transaction_date.toISOString().split('T')[0], // Format as YYYY-MM-DD
        transaction_count: parseInt(row.transaction_count)
      }));
      
      const metadata = metadataResult.rows[0];
      
      res.json({
        records,
        queryTime,
        fromCache: true,
        cacheInfo: {
          tableName: cacheTableName,
          recordCount: parseInt(metadata.record_count),
          totalTransactions: parseInt(metadata.total_transactions || 0),
          dateRange: {
            earliest: metadata.earliest_date,
            latest: metadata.latest_date
          }
        },
        metadata: {
          year,
          recordType: 'DT',
          totalRecords: parseInt(metadata.total_transactions || 0),
          aggregationLevel: 'daily',
          recordCount: result.rows.length,
          cacheStatus: 'available'
        }
      });
    } catch (error) {
      console.error('Error fetching cached heat map data:', error);
      res.status(500).json({ error: 'Failed to fetch cached heat map data' });
    }
  });

  // Optimized activity heatmap with caching
  app.get("/api/tddf-json/activity-heatmap-optimized", isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const recordType = (req.query.recordType as string) || 'DT';
      
      console.log(`[OPTIMIZED-HEATMAP] Request for year ${year}, record type: ${recordType}`);
      
      // Try to use HeatMapCacheBuilder for optimized performance
      const cacheBuilder = new HeatMapCacheBuilder(pool, getTableName);
      const result = await cacheBuilder.getOrBuildCache(year, recordType);
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching optimized activity heatmap:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to fetch optimized heatmap' 
      });
    }
  });

  // Optimized heatmap endpoint
  app.get("/api/tddf-json/heatmap-optimized", isAuthenticated, async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      console.log(`[HEATMAP-OPTIMIZED] Fetching optimized heatmap for year ${year}`);
      
      // Use HeatMapCacheBuilder for optimized caching
      const cacheBuilder = new HeatMapCacheBuilder(pool, getTableName);
      const result = await cacheBuilder.getOrBuildCache(year, 'DT');
      
      res.json(result);
    } catch (error) {
      console.error('Error fetching optimized heatmap:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to fetch optimized heatmap' 
      });
    }
  });

  // ==================== PRE-CACHE MANAGEMENT ROUTES (5 routes) ====================

  // Get pre-cached TDDF records for specific tab and year
  app.get("/api/tddf-records/pre-cache/:tabName/:year", isAuthenticated, async (req, res) => {
    try {
      const { tabName, year } = req.params;
      const requestedYear = parseInt(year);
      
      if (isNaN(requestedYear) || requestedYear < 2020 || requestedYear > 2030) {
        return res.status(400).json({ error: "Invalid year parameter" });
      }

      console.log(`[TDDF-RECORDS-CACHE] Fetching pre-cached data for ${tabName} tab, year ${requestedYear}`);
      
      // Map tab names to cache table names
      const tabTableMapping: Record<string, string> = {
        'all': 'tddf_records_all_pre_cache',
        'dt': 'tddf_records_dt_pre_cache', 
        'dt-transactions': 'tddf_records_dt_pre_cache',
        'bh': 'tddf_records_bh_pre_cache',
        'bh-batch-headers': 'tddf_records_bh_pre_cache',
        'batch-relationships': 'tddf_batch_relationships_pre_cache',
        'p1': 'tddf_records_p1_pre_cache',
        'p1-purchasing': 'tddf_records_p1_pre_cache',
        'p2': 'tddf_records_p2_pre_cache',
        'p2-purchasing-2': 'tddf_records_p2_pre_cache',
        'other': 'tddf_records_other_pre_cache',
        'other-types': 'tddf_records_other_pre_cache'
      };

      const tableName = tabTableMapping[tabName.toLowerCase()];
      if (!tableName) {
        return res.status(400).json({ 
          error: "Invalid tab name", 
          validTabs: Object.keys(tabTableMapping) 
        });
      }

      const fullTableName = getTableName(tableName);
      const cacheKey = `${tabName}_records_${requestedYear}`;

      // Query the appropriate pre-cache table
      const cacheResult = await pool.query(`
        SELECT 
          id,
          year,
          cache_key,
          cached_data,
          record_count,
          total_pages,
          processing_time_ms,
          last_refresh_datetime,
          never_expires,
          refresh_requested_by,
          created_at,
          updated_at
        FROM ${fullTableName}
        WHERE year = $1 AND cache_key = $2
        ORDER BY last_refresh_datetime DESC
        LIMIT 1
      `, [requestedYear, cacheKey]);

      if (cacheResult.rows.length === 0) {
        console.log(`[TDDF-RECORDS-CACHE] No pre-cache found for ${tabName} ${requestedYear} - cache needs to be built`);
        return res.json({
          success: false,
          error: "Cache not available",
          message: `Pre-cache for ${tabName} records in ${requestedYear} has not been built yet`,
          requiresCacheBuild: true,
          tabName,
          year: requestedYear,
          cacheKey
        });
      }

      const cache = cacheResult.rows[0];
      const queryTime = Date.now();
      
      console.log(`[TDDF-RECORDS-CACHE] Serving pre-cached ${tabName} data for ${requestedYear}: ${cache.record_count} records`);

      res.json({
        success: true,
        data: cache.cached_data,
        metadata: {
          tabName,
          year: requestedYear,
          cacheKey: cache.cache_key,
          recordCount: cache.record_count,
          totalPages: cache.total_pages,
          lastRefreshed: cache.last_refresh_datetime,
          neverExpires: cache.never_expires,
          refreshRequestedBy: cache.refresh_requested_by,
          buildTime: cache.processing_time_ms,
          createdAt: cache.created_at,
          updatedAt: cache.updated_at
        },
        queryTime: Date.now() - queryTime,
        fromPreCache: true
      });

    } catch (error) {
      console.error(`[TDDF-RECORDS-CACHE] Error fetching pre-cached data:`, error);
      res.status(500).json({ 
        error: "Failed to fetch pre-cached TDDF records",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get pre-cache status for all TDDF record tabs
  app.get("/api/tddf-records/pre-cache/status", isAuthenticated, async (req, res) => {
    try {
      const currentYear = new Date().getFullYear();
      const year = parseInt(req.query.year as string) || currentYear;

      console.log(`[TDDF-RECORDS-CACHE-STATUS] Checking pre-cache status for year ${year}`);

      const tabConfigs = [
        { name: 'all', table: 'tddf_records_all_pre_cache', displayName: 'All Records' },
        { name: 'dt', table: 'tddf_records_dt_pre_cache', displayName: 'DT - Transactions' },
        { name: 'bh', table: 'tddf_records_bh_pre_cache', displayName: 'BH - Batch Headers' },
        { name: 'batch-relationships', table: 'tddf_batch_relationships_pre_cache', displayName: 'Batch Relationships' },
        { name: 'p1', table: 'tddf_records_p1_pre_cache', displayName: 'P1 - Purchasing' },
        { name: 'p2', table: 'tddf_records_p2_pre_cache', displayName: 'P2 - Purchasing 2' },
        { name: 'other', table: 'tddf_records_other_pre_cache', displayName: 'Other Types' }
      ];

      const statusResults = await Promise.all(
        tabConfigs.map(async (tab) => {
          try {
            const tableName = getTableName(tab.table);
            const cacheKey = `${tab.name}_records_${year}`;

            const result = await pool.query(`
              SELECT 
                year,
                cache_key,
                record_count,
                total_pages,
                processing_time_ms,
                last_refresh_datetime,
                never_expires,
                refresh_requested_by,
                created_at
              FROM ${tableName}
              WHERE year = $1 AND cache_key = $2
              ORDER BY last_refresh_datetime DESC
              LIMIT 1
            `, [year, cacheKey]);

            if (result.rows.length > 0) {
              const cache = result.rows[0];
              return {
                tabName: tab.name,
                displayName: tab.displayName,
                status: 'available',
                recordCount: cache.record_count,
                totalPages: cache.total_pages,
                lastRefreshed: cache.last_refresh_datetime,
                buildTime: cache.processing_time_ms,
                neverExpires: cache.never_expires,
                refreshRequestedBy: cache.refresh_requested_by,
                createdAt: cache.created_at
              };
            } else {
              return {
                tabName: tab.name,
                displayName: tab.displayName,
                status: 'not_available',
                requiresBuild: true
              };
            }
          } catch (error) {
            return {
              tabName: tab.name,
              displayName: tab.displayName,
              status: 'error',
              error: (error as Error).message
            };
          }
        })
      );

      // Get processing status
      const processingTable = getTableName('tddf_records_tab_processing_status');
      const processingStatus = await pool.query(`
        SELECT tab_name, year, is_processing, processing_started_at, status
        FROM ${processingTable}
        WHERE year = $1 AND is_processing = true
      `, [year]);

      const processing = processingStatus.rows.reduce((acc: Record<string, any>, row: any) => {
        acc[row.tab_name] = {
          isProcessing: row.is_processing,
          startedAt: row.processing_started_at,
          status: row.status
        };
        return acc;
      }, {});

      res.json({
        success: true,
        year,
        totalTabs: tabConfigs.length,
        availableTabs: statusResults.filter(tab => tab.status === 'available').length,
        tabs: statusResults,
        processing: processing,
        globalStats: {
          totalRecords: statusResults.reduce((sum, tab) => sum + ((tab as any).recordCount || 0), 0),
          totalPages: statusResults.reduce((sum, tab) => sum + ((tab as any).totalPages || 0), 0)
        }
      });

    } catch (error) {
      console.error(`[TDDF-RECORDS-CACHE-STATUS] Error checking status:`, error);
      res.status(500).json({ 
        error: "Failed to check pre-cache status",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Build/refresh pre-cache for specific TDDF record tab and year
  app.post("/api/tddf-records/pre-cache/:tabName/:year/refresh", isAuthenticated, async (req, res) => {
    try {
      const { tabName, year } = req.params;
      const requestedYear = parseInt(year);
      const username = (req.user as any)?.username || 'unknown';

      if (isNaN(requestedYear)) {
        return res.status(400).json({ error: "Invalid year parameter" });
      }

      console.log(`[TDDF-RECORDS-CACHE-REFRESH] Starting cache refresh for ${tabName} tab, year ${requestedYear}, requested by ${username}`);

      // Validate tab name
      const validTabs = ['all', 'dt', 'bh', 'batch-relationships', 'p1', 'p2', 'other'];
      if (!validTabs.includes(tabName.toLowerCase())) {
        return res.status(400).json({ 
          error: "Invalid tab name", 
          validTabs 
        });
      }

      // Check if already processing
      const processingTable = getTableName('tddf_records_tab_processing_status');
      const cacheKey = `${tabName}_records_${requestedYear}`;
      const processingKey = `processing_status_${tabName}_${requestedYear}`;

      const existingProcess = await pool.query(`
        SELECT is_processing, processing_started_at
        FROM ${processingTable}
        WHERE cache_key = $1 AND is_processing = true
      `, [processingKey]);

      if (existingProcess.rows.length > 0) {
        const startTime = new Date(existingProcess.rows[0].processing_started_at);
        const elapsedMinutes = Math.round((Date.now() - startTime.getTime()) / (1000 * 60));
        
        return res.status(409).json({
          error: "Cache refresh already in progress",
          message: `Cache refresh for ${tabName} ${requestedYear} started ${elapsedMinutes} minutes ago`,
          startedAt: existingProcess.rows[0].processing_started_at
        });
      }

      // Start processing status tracking
      const jobId = `tddf_cache_${tabName}_${requestedYear}_${Date.now()}`;
      const startTime = new Date();

      await pool.query(`
        INSERT INTO ${processingTable} (
          tab_name, year, cache_key, is_processing, processing_started_at, 
          job_id, triggered_by, triggered_by_user, status
        ) VALUES ($1, $2, $3, true, $4, $5, 'manual', $6, 'processing')
        ON CONFLICT (cache_key) DO UPDATE SET
          is_processing = true,
          processing_started_at = $4,
          job_id = $5,
          triggered_by_user = $6,
          status = 'processing',
          updated_at = NOW()
      `, [tabName, requestedYear, processingKey, startTime, jobId, username]);

      // Return immediate response - actual processing would happen asynchronously
      res.json({
        success: true,
        message: `Started cache refresh for ${tabName} records in ${requestedYear}`,
        jobId,
        tabName,
        year: requestedYear,
        startedAt: startTime,
        requestedBy: username,
        note: "Cache refresh is running in the background. Check status using the status endpoint."
      });

    } catch (error) {
      console.error(`[TDDF-RECORDS-CACHE-REFRESH] Error starting refresh:`, error);
      res.status(500).json({ 
        error: "Failed to start cache refresh",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Get processing status for specific TDDF record tab cache build
  app.get("/api/tddf-records/pre-cache/:tabName/:year/processing-status", isAuthenticated, async (req, res) => {
    try {
      const { tabName, year } = req.params;
      const requestedYear = parseInt(year);

      if (isNaN(requestedYear)) {
        return res.status(400).json({ error: "Invalid year parameter" });
      }

      const processingTable = getTableName('tddf_records_tab_processing_status');
      const processingKey = `processing_status_${tabName}_${requestedYear}`;

      const result = await pool.query(`
        SELECT 
          tab_name,
          year,
          is_processing,
          processing_started_at,
          processing_completed_at,
          processing_time_ms,
          total_records_to_process,
          records_processed,
          progress_percentage,
          status,
          status_message,
          error_details,
          job_id,
          triggered_by,
          triggered_by_user,
          created_at,
          updated_at
        FROM ${processingTable}
        WHERE cache_key = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [processingKey]);

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          found: false,
          message: "No processing status found for this tab and year"
        });
      }

      const processing = result.rows[0];
      const elapsedTime = processing.is_processing && processing.processing_started_at 
        ? Date.now() - new Date(processing.processing_started_at).getTime()
        : null;

      res.json({
        success: true,
        found: true,
        tabName: processing.tab_name,
        year: processing.year,
        status: processing.status,
        isProcessing: processing.is_processing,
        message: processing.status_message,
        progress: {
          totalRecords: processing.total_records_to_process,
          processedRecords: processing.records_processed,
          percentage: processing.progress_percentage,
          elapsedMs: elapsedTime,
          processingTimeMs: processing.processing_time_ms
        },
        job: {
          jobId: processing.job_id,
          triggeredBy: processing.triggered_by,
          triggeredByUser: processing.triggered_by_user
        },
        error: processing.error_details,
        timestamps: {
          createdAt: processing.created_at,
          updatedAt: processing.updated_at
        }
      });

    } catch (error) {
      console.error(`[TDDF-RECORDS-PROCESSING-STATUS] Error:`, error);
      res.status(500).json({ 
        error: "Failed to get processing status",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Clear all pre-cache data for TDDF records (admin endpoint)
  app.delete("/api/tddf-records/pre-cache/clear", isAuthenticated, async (req, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : null;
      const tabName = req.query.tab as string;
      const username = (req.user as any)?.username || 'unknown';

      console.log(`[TDDF-RECORDS-CACHE-CLEAR] Clear request by ${username} - Year: ${year || 'all'}, Tab: ${tabName || 'all'}`);

      const tablesToClear = [
        'tddf_records_all_pre_cache',
        'tddf_records_dt_pre_cache',
        'tddf_records_bh_pre_cache', 
        'tddf_batch_relationships_pre_cache',
        'tddf_records_p1_pre_cache',
        'tddf_records_p2_pre_cache',
        'tddf_records_other_pre_cache'
      ];

      const results = [];

      for (const table of tablesToClear) {
        try {
          const fullTableName = getTableName(table);
          let whereClause = '';
          const params: any[] = [];

          if (year && tabName) {
            whereClause = ' WHERE year = $1 AND cache_key LIKE $2';
            params.push(year, `${tabName}%`);
          } else if (year) {
            whereClause = ' WHERE year = $1';
            params.push(year);
          } else if (tabName) {
            whereClause = ' WHERE cache_key LIKE $1';
            params.push(`${tabName}%`);
          }

          const countResult = await pool.query(
            `SELECT COUNT(*) as count FROM ${fullTableName}${whereClause}`,
            params
          );
          const recordsToDelete = parseInt(countResult.rows[0].count);

          if (recordsToDelete > 0) {
            await pool.query(
              `DELETE FROM ${fullTableName}${whereClause}`,
              params
            );
            results.push({
              table: table,
              recordsDeleted: recordsToDelete,
              status: 'success'
            });
          } else {
            results.push({
              table: table,
              recordsDeleted: 0,
              status: 'no_records'
            });
          }
        } catch (tableError) {
          results.push({
            table: table,
            status: 'error',
            error: (tableError as Error).message
          });
        }
      }

      const totalDeleted = results.reduce((sum, r) => sum + (r.recordsDeleted || 0), 0);

      console.log(`[TDDF-RECORDS-CACHE-CLEAR] Completed: ${totalDeleted} total records deleted`);

      res.json({
        success: true,
        message: `Cleared ${totalDeleted} pre-cache records`,
        filters: {
          year: year || 'all',
          tabName: tabName || 'all'
        },
        results,
        totalRecordsDeleted: totalDeleted,
        clearedBy: username,
        clearedAt: new Date()
      });

    } catch (error) {
      console.error(`[TDDF-RECORDS-CACHE-CLEAR] Error:`, error);
      res.status(500).json({ 
        error: "Failed to clear pre-cache data",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ==================== CACHE OPERATIONS ROUTES (7 routes) ====================

  // TDDF Merchants Cache Management Routes
  app.post('/api/tddf-merchants/refresh-cache', isAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF CACHE] Starting cache refresh...');
      
      const result = await storage.refreshTddfMerchantsCache();
      
      console.log(`[TDDF CACHE] ✅ Cache refresh completed: ${result.rebuilt} merchants`);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('[TDDF CACHE] Error refreshing cache:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/tddf-merchants/cache-stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await storage.getTddfMerchantsCacheStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error: any) {
      console.error('[TDDF CACHE] Error getting cache stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // TDDF1 Rebuild Totals Cache - Manually trigger totals cache rebuild for specific month
  app.post("/api/tddf1/rebuild-totals-cache", isAuthenticated, async (req, res) => {
    try {
      const { month } = req.query;
      console.log(`🔄 Rebuilding TDDF1 totals cache for month: ${month}`);
      
      if (!month || typeof month !== 'string') {
        return res.status(400).json({ error: 'Month parameter is required (format: YYYY-MM)' });
      }
      
      // Detect environment and use appropriate naming
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      
      // Environment-aware table naming
      const envPrefix = isDevelopment ? 'dev_' : '';
      const totalsTableName = `${envPrefix}tddf1_totals`;
      const tddfjsonbTableName = `${envPrefix}tddf_jsonb`; // Use uploader table, not API table
      
      console.log(`🔄 Environment: ${environment}, Using totals table: ${totalsTableName}, TDDF JSONB table: ${tddfjsonbTableName}`);
      
      // Parse month to get date range
      const [year, monthNum] = month.split('-');
      const startDate = `${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      const endDate = `${year}-${monthNum.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      
      console.log(`🔄 Clearing month data: ${startDate} to ${endDate}`);
      
      // Clear existing entries for this specific month
      await pool.query(`
        DELETE FROM ${totalsTableName} 
        WHERE file_date >= $1 AND file_date <= $2
          AND EXTRACT(YEAR FROM file_date) = $3
          AND EXTRACT(MONTH FROM file_date) = $4
      `, [startDate, endDate, parseInt(year), parseInt(monthNum)]);
      
      console.log(`🔄 Cleared existing entries for ${month}`);
      
      // Get aggregated data from TDDF JSONB (uploader) table, grouped by processing date
      const tddfjsonbDataResult = await pool.query(`
        SELECT 
          DATE(tddf_processing_date) as processing_date,
          COUNT(*) as total_records,
          COUNT(DISTINCT upload_id) as total_files,
          COALESCE(SUM(CASE 
            WHEN record_type = 'DT' 
              AND extracted_fields->>'transactionAmount' IS NOT NULL
              AND extracted_fields->>'transactionAmount' != ''
            THEN (extracted_fields->>'transactionAmount')::numeric
            ELSE 0 
          END), 0) as dt_transaction_amounts,
          COALESCE(SUM(CASE 
            WHEN record_type = 'BH' 
              AND extracted_fields->>'netDeposit' IS NOT NULL
              AND extracted_fields->>'netDeposit' != ''
            THEN (extracted_fields->>'netDeposit')::numeric
            ELSE 0 
          END), 0) as bh_net_deposits,
          COUNT(CASE WHEN record_type = 'BH' THEN 1 END) as bh_records,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) as dt_records
        FROM ${tddfjsonbTableName}
        WHERE DATE(tddf_processing_date) >= $1::date 
          AND DATE(tddf_processing_date) <= $2::date
        GROUP BY DATE(tddf_processing_date)
        ORDER BY DATE(tddf_processing_date)
      `, [startDate, endDate]);
      
      let rebuiltEntries = 0;
      
      console.log(`🔄 Found ${tddfjsonbDataResult.rows.length} days with TDDF uploader data in ${month}`);
      
      for (const dayData of tddfjsonbDataResult.rows) {
        const bhRecords = parseInt(dayData.bh_records || '0');
        const dtRecords = parseInt(dayData.dt_records || '0');
        
        // Insert rebuilt entry for this day with correct schema matching dev_tddf1_totals
        await pool.query(`
          INSERT INTO ${totalsTableName} (
            file_date, 
            total_files, 
            total_records, 
            total_transaction_amounts, 
            total_net_deposits,
            bh_records,
            dt_records,
            updated_at,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `, [
          dayData.processing_date,
          parseInt(dayData.total_files || '0'),
          parseInt(dayData.total_records || '0'),
          parseFloat(dayData.dt_transaction_amounts || '0'),
          parseFloat(dayData.bh_net_deposits || '0'),
          bhRecords,
          dtRecords
        ]);
        
        rebuiltEntries++;
        
        console.log(`✅ Rebuilt ${dayData.processing_date}: ${dayData.total_files} files, ${dayData.total_records} records, BH: ${bhRecords}, DT: ${dtRecords}, DT Amounts: $${parseFloat(dayData.dt_transaction_amounts || '0').toFixed(2)}, BH Deposits: $${parseFloat(dayData.bh_net_deposits || '0').toFixed(2)}`);
      }
      
      console.log(`✅ TDDF1 totals cache rebuilt for ${month}: ${rebuiltEntries} entries recreated from TDDF uploader data`);
      
      res.json({
        success: true,
        message: `TDDF1 totals cache rebuilt successfully for ${month} from TDDF uploader data`,
        stats: {
          month,
          rebuiltEntries,
          dateRange: `${startDate} to ${endDate}`,
          dataSource: 'TDDF uploader (dev_tddf_jsonb)'
        }
      });
      
    } catch (error: any) {
      console.error("Error rebuilding TDDF1 totals cache:", error);
      res.status(500).json({ 
        error: "Failed to rebuild TDDF1 totals cache",
        details: error.message 
      });
    }
  });

  // TDDF1 Monthly Totals
  app.get('/api/tddf1/monthly-totals', isAuthenticated, async (req, res) => {
    console.log('📅 Getting TDDF1 monthly totals');
    
    try {
      const { month } = req.query; // Expected format: 'YYYY-MM'
      
      if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
      }
      
      // Environment-aware table naming
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      const totalsTableName = `${envPrefix}tddf1_totals`;
      
      console.log(`📅 [MONTHLY-TOTALS] Environment: ${environment}, Using table: ${totalsTableName}`);
      
      const [year, monthNum] = month.split('-');
      const startDate = `${month}-01`;
      // Get last day of the month correctly - month index is 0-based, so we use parseInt(monthNum) directly
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      const endDate = `${year}-${monthNum.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      
      console.log(`📅 [MONTHLY] Getting data for ${month}: ${startDate} to ${endDate} (strict date filtering)`);
      
      // Get aggregated data for the entire month from new monthly cache or individual file totals  
      const monthlyTotals = await pool.query(`
        SELECT 
          $1 as month,
          COUNT(*) as total_files,
          SUM(total_records) as total_records,
          SUM(total_transaction_amounts) as total_transaction_value,
          SUM(total_net_deposits) as total_net_deposit_bh
        FROM ${totalsTableName} 
        WHERE file_date >= $2 AND file_date <= $3
          AND EXTRACT(YEAR FROM file_date) = $4
          AND EXTRACT(MONTH FROM file_date) = $5
      `, [month, startDate, endDate, parseInt(year), parseInt(monthNum)]);
      
      // Get record type breakdown for the month using environment-aware table name
      const recordTypeData = await pool.query(`
        SELECT 
          total_records, 
          JSONB_BUILD_OBJECT('BH', 1, 'DT', total_records - 1) as breakdown
        FROM ${totalsTableName} 
        WHERE file_date >= $1 AND file_date <= $2
          AND EXTRACT(YEAR FROM file_date) = $3
          AND EXTRACT(MONTH FROM file_date) = $4
      `, [startDate, endDate, parseInt(year), parseInt(monthNum)]);
      
      // Aggregate all record type breakdowns
      const aggregatedBreakdown: Record<string, number> = {};
      recordTypeData.rows.forEach(row => {
        const breakdown = row.breakdown || {};
        Object.entries(breakdown).forEach(([type, count]) => {
          aggregatedBreakdown[type] = (aggregatedBreakdown[type] || 0) + (count as number);
        });
      });
      
      // Get daily breakdown for the month using environment-aware table name
      const dailyBreakdown = await pool.query(`
        SELECT 
          processing_date as date,
          1 as files,
          total_records as records,
          dt_transaction_amounts as transaction_value,
          bh_net_deposits as net_deposit_bh,
          id,
          created_at
        FROM ${totalsTableName} 
        WHERE file_date >= $1 AND file_date <= $2
          AND EXTRACT(YEAR FROM file_date) = $3
          AND EXTRACT(MONTH FROM file_date) = $4
        ORDER BY processing_date, created_at
      `, [startDate, endDate, parseInt(year), parseInt(monthNum)]);
      
      const result = {
        month,
        totalFiles: parseInt(monthlyTotals.rows[0]?.total_files || '0'),
        totalRecords: parseInt(monthlyTotals.rows[0]?.total_records || '0'),
        totalTransactionValue: parseFloat(monthlyTotals.rows[0]?.total_transaction_value || '0'),
        totalNetDepositBh: parseFloat(monthlyTotals.rows[0]?.total_net_deposit_bh || '0'),
        recordTypeBreakdown: aggregatedBreakdown,
        dailyBreakdown: dailyBreakdown.rows.map((entry, index) => ({
          date: entry.date,
          files: parseInt(entry.files),
          records: parseInt(entry.records),
          transactionValue: parseFloat(entry.transaction_value || '0'),
          netDepositBh: parseFloat(entry.net_deposit_bh || '0'),
          entryId: entry.id,
          fileIndex: index + 1 // Show which file this is for the day
        }))
      };
      
      console.log(`📅 [MONTHLY] Aggregated data for ${month}: ${result.totalFiles} files, ${result.totalRecords} records, $${result.totalTransactionValue.toLocaleString()} transaction value, $${result.totalNetDepositBh.toLocaleString()} net deposit`);
      
      res.json(result);
    } catch (error: any) {
      console.error('❌ Error fetching TDDF1 monthly totals:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // TDDF1 Monthly Comparison - Current and Previous Month
  app.get('/api/tddf1/monthly-comparison', isAuthenticated, async (req, res) => {
    console.log('📅 Getting TDDF1 monthly comparison');
    
    try {
      const { month } = req.query; // Expected format: 'YYYY-MM'
      
      if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
      }
      
      // Environment-aware table naming
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      const totalsTableName = `${envPrefix}tddf1_totals`;
      
      console.log(`📅 [MONTHLY-COMPARISON] Environment: ${environment}, Using table: ${totalsTableName}`);
      
      const [year, monthNum] = month.split('-');
      
      // Calculate previous month
      const currentDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const previousMonth = `${previousDate.getFullYear()}-${(previousDate.getMonth() + 1).toString().padStart(2, '0')}`;
      
      // Helper function to get month data
      const getMonthData = async (targetMonth: string) => {
        const [yr, mth] = targetMonth.split('-');
        const startDate = `${targetMonth}-01`;
        const lastDay = new Date(parseInt(yr), parseInt(mth), 0).getDate();
        const endDate = `${yr}-${mth.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
        
        // Get daily breakdown for the month using environment-aware table name
        const dailyBreakdown = await pool.query(`
          SELECT 
            processing_date as date,
            1 as files,
            total_records as records,
            dt_transaction_amounts as transaction_value,
            bh_net_deposits as net_deposit_bh,
            id,
            created_at
          FROM ${totalsTableName} 
          WHERE file_date >= $1 AND file_date <= $2
            AND EXTRACT(YEAR FROM file_date) = $3
            AND EXTRACT(MONTH FROM file_date) = $4
          ORDER BY processing_date, created_at
        `, [startDate, endDate, parseInt(yr), parseInt(mth)]);
        
        return dailyBreakdown.rows.map((entry, index) => ({
          date: entry.date,
          files: parseInt(entry.files),
          records: parseInt(entry.records),
          transactionValue: parseFloat(entry.transaction_value || '0'),
          netDepositBh: parseFloat(entry.net_deposit_bh || '0'),
          entryId: entry.id,
          fileIndex: index + 1 // Show which file this is chronologically
        }));
      };
      
      // Get data for both months
      const [currentMonthData, previousMonthData] = await Promise.all([
        getMonthData(month),
        getMonthData(previousMonth)
      ]);
      
      console.log(`📅 [COMPARISON] Current month (${month}): ${currentMonthData.length} days, Previous month (${previousMonth}): ${previousMonthData.length} days`);
      
      res.json({
        currentMonth: {
          month,
          dailyBreakdown: currentMonthData
        },
        previousMonth: {
          month: previousMonth,
          dailyBreakdown: previousMonthData
        }
      });
    } catch (error: any) {
      console.error('❌ Error fetching TDDF1 monthly comparison:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // TDDF1 Daily Breakdown - Enhanced daily statistics using pre-cache totals
  app.get("/api/tddf1/day-breakdown", isAuthenticated, async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split('T')[0];
      console.log(`📅 Getting TDDF1 daily breakdown for date: ${date}`);
      
      // Detect environment and use appropriate naming
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      
      // Environment-aware table naming
      const envPrefix = isDevelopment ? 'dev_' : '';
      const totalsTableName = `${envPrefix}tddf1_totals`;
      
      console.log(`📅 Environment: ${environment}, Using TDDF1 totals table: ${totalsTableName}`);
      
      // Check if totals table exists first
      const tableExistsResult = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = $1
        )
      `, [totalsTableName]);
      
      if (!tableExistsResult.rows[0].exists) {
        console.log("📅 No tddf1_totals table found, returning empty day breakdown");
        return res.json({
          totalRecords: 0,
          fileCount: 0,
          totalTransactionValue: 0,
          recordTypeBreakdown: {},
          files: [],
          date: date
        });
      }
      
      // Query the pre-cache totals table for the specific date
      const totalsResult = await pool.query(`
        SELECT 
          file_date,
          total_records,
          total_net_deposits as bh_net_deposits,
          total_transaction_amounts as dt_transaction_amounts,
          total_files,
          bh_records,
          dt_records,
          created_at,
          id
        FROM ${totalsTableName}
        WHERE file_date = $1
        ORDER BY created_at DESC
      `, [date]);
      
      let totalRecords = 0;
      let netDepositsTotal = 0;
      let transactionAmountsTotal = 0;
      const recordTypes: Record<string, number> = {};
      const filesProcessed: Array<{
        fileName: string;
        tableName: string;
        recordCount: number;
      }> = [];
      
      // Process cached totals data - show each file entry separately
      for (const row of totalsResult.rows) {
        const records = parseInt(row.total_records) || 0;
        const netDeposits = parseFloat(row.bh_net_deposits) || 0;
        const transactionAmounts = parseFloat(row.dt_transaction_amounts) || 0;
        const breakdown = typeof row.record_breakdown === 'string' 
          ? JSON.parse(row.record_breakdown) 
          : row.record_breakdown;
        
        totalRecords += records;
        netDepositsTotal += netDeposits;
        transactionAmountsTotal += transactionAmounts;
        
        // Get actual BH and DT record counts from the TDDF1 table
        if (breakdown && breakdown.rebuiltFrom) {
          try {
            const recordCountsResult = await pool.query(`
              SELECT 
                record_type,
                COUNT(*) as count
              FROM ${breakdown.rebuiltFrom}
              WHERE record_type IN ('BH', 'DT')
              GROUP BY record_type
            `);
            
            // Add to record types breakdown
            for (const countRow of recordCountsResult.rows) {
              recordTypes[countRow.record_type] = (recordTypes[countRow.record_type] || 0) + parseInt(countRow.count);
            }
          } catch (recordCountError) {
            console.log(`⚠️ Could not get record counts for table ${breakdown.rebuiltFrom}:`, (recordCountError as Error).message);
          }
        }
        
        // Extract actual TSYSO filename from rebuiltFrom table reference
        let actualFilename = `File #${row.id || filesProcessed.length + 1}`;
        if (breakdown && breakdown.rebuiltFrom) {
          // Extract filename from table name like "dev_tddf1_file_vermntsb_6759_tddf_2400_08012025_011442"
          const tableMatch = breakdown.rebuiltFrom.match(/dev_tddf1_file_(.+)$/);
          if (tableMatch) {
            // Convert table suffix back to TSYSO filename format
            const tableSuffix = tableMatch[1];
            // Split by underscore and reconstruct with dots, keeping the structure intact
            const parts = tableSuffix.split('_');
            if (parts.length >= 6) {
              // Format: vermntsb_6759_tddf_2400_08012025_011442 -> VERMNTSB.6759_TDDF_2400_08012025_011442.TSYSO
              actualFilename = `${parts[0].toUpperCase()}.${parts[1]}_${parts[2].toUpperCase()}_${parts[3]}_${parts[4]}_${parts[5]}.TSYSO`;
            }
          }
        }
        
        filesProcessed.push({
          fileName: actualFilename,
          tableName: breakdown?.rebuiltFrom || '',
          recordCount: records
        });
      }
      
      const responseData = {
        totalRecords,
        fileCount: filesProcessed.length,
        totalTransactionValue: transactionAmountsTotal,
        netDeposits: netDepositsTotal,
        recordTypeBreakdown: recordTypes,
        date: date,
        files: filesProcessed,
        tables: filesProcessed.map(f => f.tableName),
        filesProcessed: filesProcessed,
        cached: true,
        cacheSource: 'pre-cache totals table',
        timestamp: Date.now() // Force unique responses
      };
      
      // Debug logging for BH/DT breakdown
      console.log(`📅 [DAILY-BREAKDOWN] BH (Batch) records: ${recordTypes['BH'] || 0}, Net Deposits: $${netDepositsTotal.toFixed(2)}`);
      console.log(`📅 [DAILY-BREAKDOWN] DT (Authorization) records: ${recordTypes['DT'] || 0}, Transaction Amounts: $${transactionAmountsTotal.toFixed(2)}`);
      
      // Force no caching
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
      res.set('ETag', `"${date}-${Date.now()}"`);
      
      res.json(responseData);
    } catch (error) {
      console.error("Error getting TDDF1 day breakdown:", error);
      res.status(500).json({ error: "Failed to get day breakdown" });
    }
  });

  // Settings endpoint for TDDF JSON record counts
  app.get("/api/settings/tddf-json-record-counts", isAuthenticated, async (req, res) => {
    try {
      const environment = process.env.NODE_ENV || 'development';
      const tableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
      
      // Get record counts by type
      const result = await pool.query(`
        SELECT 
          record_type,
          COUNT(*) as count
        FROM ${tableName}
        GROUP BY record_type
        ORDER BY record_type
      `);
      
      const counts = result.rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.record_type] = parseInt(row.count);
        return acc;
      }, {});
      
      res.json({
        success: true,
        counts,
        tableName,
        environment,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting TDDF JSON record counts:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get record counts' 
      });
    }
  });

  // ==================== STATISTICS & MONITORING ROUTES (10 routes) ====================

  // TDDF1 Dashboard Stats - File-based TDDF statistics
  app.get("/api/tddf1/stats", isAuthenticated, async (req, res) => {
    try {
      console.log("📊 Getting TDDF1 stats");
      
      // Detect environment and use appropriate naming
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      
      // Environment-aware table naming
      const envPrefix = isDevelopment ? 'dev_' : '';
      const tablePrefix = `${envPrefix}tddf1_`;
      
      console.log(`📊 Environment: ${environment}, Using TDDF1 tables with prefix: ${tablePrefix}`);
      
      // Check if pre-cache totals table exists
      const totalsTableName = `${tablePrefix}totals`;
      const totalsTableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name = $1
        )
      `, [totalsTableName]);
      
      if (totalsTableExists.rows[0].exists) {
        console.log("📊 Found tddf1_totals table, getting cached stats");
      } else {
        console.log("📊 No tddf1_totals table found, returning empty stats");
        
        return res.json({
          totalFiles: 0,
          totalRecords: 0,
          totalTransactionValue: 0,
          recordTypeBreakdown: {},
          activeTables: [],
          lastProcessedDate: null,
          cached: true,
          cacheSource: 'empty state - table not found',
          cacheDate: new Date().toISOString()
        });
      }
      
      if (totalsTableExists.rows[0].exists) {
        // Get aggregated stats from the pre-cache totals table  
        const totalsResult = await pool.query(`
          SELECT 
            COUNT(*) as total_files,
            SUM(total_records) as total_records,
            SUM(COALESCE(total_transaction_amounts, 0)) as total_authorizations,
            SUM(COALESCE(total_net_deposits, 0)) as total_net_deposits,
            COUNT(DISTINCT file_date) as active_tables,
            MAX(updated_at) as last_updated
          FROM ${totalsTableName}
        `);
        
        if (totalsResult.rows.length > 0) {
          const summary = totalsResult.rows[0];
          const totalFiles = parseInt(summary.total_files) || 0;
          const totalRecords = parseInt(summary.total_records) || 0;
          const totalTransactionValue = parseFloat(summary.total_authorizations) || 0;
          const activeTables = parseInt(summary.active_tables) || 0;
          
          // Create simple record type breakdown based on our data structure
          const recordTypeBreakdown: Record<string, number> = {
            'BH': totalFiles, // One BH record per file
            'DT': Math.max(0, totalRecords - totalFiles) // Remaining records are DT
          };
          
          console.log(`📊 Serving cached stats: ${totalFiles} files, ${totalRecords} records, $${totalTransactionValue.toLocaleString()}, ${activeTables} active tables`);
          
          return res.json({
            totalFiles: totalFiles,
            totalRecords: totalRecords,
            totalTransactionValue: totalTransactionValue,
            recordTypeBreakdown: recordTypeBreakdown,
            activeTables: activeTables,
            lastProcessedDate: summary.last_updated,
            cached: true,
            cacheSource: 'pre-cache totals aggregation',
            cacheDate: new Date().toISOString()
          });
        }
      }
      
      // Return empty stats if nothing found
      return res.json({
        totalFiles: 0,
        totalRecords: 0,
        totalTransactionValue: 0,
        recordTypeBreakdown: {},
        activeTables: [],
        lastProcessedDate: null,
        cached: false,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting TDDF1 stats:", error);
      res.status(500).json({ error: "Failed to get TDDF1 stats" });
    }
  });

  // TDDF1 Recent Activity - Latest processed files (first occurrence)
  app.get("/api/tddf1/recent-activity", isAuthenticated, async (req, res) => {
    try {
      console.log("📋 Getting TDDF1 recent activity");
      
      // Standard production naming: no prefix (like merchants, transactions, uploaded_files)
      const tablePrefix = 'tddf1_';
      
      console.log(`📋 Using standard TDDF1 tables with prefix: ${tablePrefix}`);
      
      // Get recent file tables - check both standard naming and legacy prod_ naming
      const recentTablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND (table_name LIKE $1 OR table_name LIKE $2)
        ORDER BY table_name DESC
        LIMIT 10
      `, [`${tablePrefix}file_%`, `prod_${tablePrefix}file_%`]);
      
      const recentActivity: any[] = [];
      
      for (const tableRow of recentTablesResult.rows) {
        try {
          const tableName = tableRow.table_name;
          const activityResult = await pool.query(`
            SELECT 
              source_filename,
              COUNT(*) as record_count,
              MIN(parsed_datetime) as processed_at
            FROM ${tableName}
            WHERE source_filename IS NOT NULL
            GROUP BY source_filename
            LIMIT 1
          `);
          
          if (activityResult.rows.length > 0) {
            const row = activityResult.rows[0];
            recentActivity.push({
              id: tableName,
              fileName: row.source_filename,
              recordCount: parseInt(row.record_count),
              processedAt: row.processed_at || new Date().toISOString(),
              status: 'encoded',
              tableName: tableName
            });
          }
        } catch (error) {
          console.warn(`Error querying recent activity for ${tableRow.table_name}:`, error);
        }
      }
      
      res.json(recentActivity);
    } catch (error) {
      console.error("Error getting TDDF1 recent activity:", error);
      res.status(500).json({ error: "Failed to get recent activity" });
    }
  });

  // TDDF1 Pipeline Status - Get uploader metrics for TDDF1 Dashboard
  app.get("/api/tddf1/pipeline-status", isAuthenticated, async (req, res) => {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Get counts by phase for TDDF files only
      const pipelineStatsResult = await pool.query(`
        SELECT 
          current_phase,
          COUNT(*) as count,
          final_file_type
        FROM ${uploaderTableName}
        WHERE final_file_type = 'tddf' OR detected_file_type = 'tddf' OR filename LIKE '%.TSYSO'
        GROUP BY current_phase, final_file_type
        ORDER BY current_phase
      `);
      
      // Get overall totals for TDDF files
      const totalStatsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_files,
          COUNT(CASE WHEN current_phase = 'uploaded' THEN 1 END) as uploaded_files,
          COUNT(CASE WHEN current_phase = 'identified' THEN 1 END) as identified_files, 
          COUNT(CASE WHEN current_phase = 'encoding' THEN 1 END) as encoding_files,
          COUNT(CASE WHEN current_phase = 'encoded' THEN 1 END) as encoded_files,
          COUNT(CASE WHEN current_phase = 'failed' THEN 1 END) as failed_files,
          MAX(updated_at) as last_activity
        FROM ${uploaderTableName}
        WHERE final_file_type = 'tddf' OR detected_file_type = 'tddf' OR filename LIKE '%.TSYSO'
      `);
      
      const totalStats = totalStatsResult.rows[0] || {
        total_files: 0,
        uploaded_files: 0,
        identified_files: 0,
        encoding_files: 0,
        encoded_files: 0,
        failed_files: 0,
        last_activity: null
      };
      
      // Convert to numbers
      const pipelineStatus = {
        totalFiles: parseInt(totalStats.total_files) || 0,
        uploadedFiles: parseInt(totalStats.uploaded_files) || 0,
        identifiedFiles: parseInt(totalStats.identified_files) || 0,
        encodingFiles: parseInt(totalStats.encoding_files) || 0,
        encodedFiles: parseInt(totalStats.encoded_files) || 0,
        failedFiles: parseInt(totalStats.failed_files) || 0,
        lastActivity: totalStats.last_activity,
        phaseBreakdown: pipelineStatsResult.rows.reduce((acc: Record<string, number>, row: any) => {
          acc[row.current_phase] = parseInt(row.count);
          return acc;
        }, {}),
        lastUpdated: new Date().toISOString()
      };
      
      res.json(pipelineStatus);
    } catch (error) {
      console.error('Error getting TDDF1 pipeline status:', error);
      res.status(500).json({ 
        error: 'Failed to get pipeline status',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // TDDF JSON statistics
  app.get("/api/tddf-json/stats", isAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF-JSON-STATS] Using pre-cache table for statistics...');
      const startTime = Date.now();
      
      // Use pre-cache table instead of direct queries
      const environment = process.env.NODE_ENV || 'development';
      const preCacheTableName = environment === 'development' ? 'dev_tddf_json_stats_pre_cache' : 'tddf_json_stats_pre_cache';
      
      // Query pre-cache table first
      const preCacheResult = await pool.query(`
        SELECT 
          total_records,
          unique_files,
          total_amount,
          record_type_breakdown,
          created_at,
          updated_at,
          expires_at,
          build_time_ms,
          last_refresh_datetime
        FROM ${preCacheTableName}
        WHERE cache_key = 'tddf_json_stats_global'
        AND expires_at > NOW()
        LIMIT 1
      `);
      
      const queryTime = Date.now() - startTime;
      
      if (preCacheResult.rows.length > 0) {
        const result = preCacheResult.rows[0];
        
        console.log(`[TDDF-JSON-STATS] Serving from pre-cache table in ${queryTime}ms`);
        
        const responseData = {
          totalRecords: parseInt(result.total_records || '0'),
          recordTypeBreakdown: result.record_type_breakdown || {},
          uniqueFiles: parseInt(result.unique_files || '0'),
          totalAmount: parseFloat(result.total_amount || '0'),
          queryTime: queryTime,
          fromPreCache: true,
          lastUpdated: result.last_refresh_datetime,
          buildTime: result.build_time_ms
        };
        
        return res.json(responseData);
      }
      
      // Fallback to direct query if pre-cache is expired or missing
      console.log('[TDDF-JSON-STATS] Pre-cache expired, falling back to direct query...');
      const fallbackTableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
      
      const optimizedStatsResult = await pool.query(`
        WITH stats AS (
          SELECT 
            COUNT(*) as total_records,
            COUNT(DISTINCT upload_id) as unique_files,
            SUM(CASE 
              WHEN record_type = 'DT' 
                AND extracted_fields->>'transactionAmount' IS NOT NULL 
                AND extracted_fields->>'transactionAmount' != ''
              THEN CAST(extracted_fields->>'transactionAmount' AS NUMERIC)
              ELSE 0
            END) as total_amount
          FROM ${fallbackTableName}
        ),
        type_breakdown AS (
          SELECT record_type, COUNT(*) as count 
          FROM ${fallbackTableName}
          GROUP BY record_type
        )
        SELECT 
          s.total_records,
          s.unique_files,
          s.total_amount,
          json_object_agg(tb.record_type, tb.count) as record_type_breakdown
        FROM stats s
        CROSS JOIN type_breakdown tb
        GROUP BY s.total_records, s.unique_files, s.total_amount
      `);
      
      const fallbackQueryTime = Date.now() - startTime;
      console.log(`[TDDF-JSON-STATS] Fallback query completed in ${fallbackQueryTime}ms`);
      
      const result = optimizedStatsResult.rows[0];
      const responseData = {
        totalRecords: parseInt(result?.total_records || '0'),
        recordTypeBreakdown: result?.record_type_breakdown || {},
        uniqueFiles: parseInt(result?.unique_files || '0'),
        totalAmount: parseFloat(result?.total_amount || '0'),
        queryTime: fallbackQueryTime,
        fromPreCache: false,
        fallbackUsed: true
      };
      
      res.json(responseData);
    } catch (error) {
      console.error('Error fetching TDDF JSON stats:', error);
      res.status(500).json({ error: 'Failed to fetch statistics' });
    }
  });

  // TDDF JSON performance statistics
  app.get("/api/tddf-json/performance-stats", isAuthenticated, async (req, res) => {
    try {
      const environment = process.env.NODE_ENV || 'development';
      const tableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
      
      // Get basic table statistics
      const tableStats = await pool.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT record_type) as record_types,
          COUNT(DISTINCT filename) as unique_files,
          COUNT(DISTINCT DATE(extracted_fields->>'transactionDate')) as unique_days,
          MIN(extracted_fields->>'transactionDate') as earliest_date,
          MAX(extracted_fields->>'transactionDate') as latest_date
        FROM ${tableName}
        WHERE record_type = 'DT'
          AND extracted_fields->>'transactionDate' IS NOT NULL
      `);
      
      const stats = tableStats.rows[0];
      const totalRecords = parseInt(stats.total_records);
      
      // Performance recommendations based on data size
      let recommendations = [];
      if (totalRecords > 1000000) {
        recommendations = [
          "Very large dataset detected (1M+ records)",
          "Strongly recommend monthly aggregation for heat maps",
          "Consider implementing data archiving strategies",
          "Use indexed queries with LIMIT clauses"
        ];
      } else if (totalRecords > 100000) {
        recommendations = [
          "Large dataset detected (100k+ records)", 
          "Recommend weekly or monthly aggregation",
          "Daily views may be slow for full year ranges",
          "Consider pagination for record views"
        ];
      } else if (totalRecords > 25000) {
        recommendations = [
          "Medium dataset detected (25k+ records)",
          "Weekly aggregation provides good balance",
          "Daily views acceptable for shorter ranges",
          "Standard caching effective"
        ];
      } else {
        recommendations = [
          "Standard dataset size (< 25k records)",
          "Daily aggregation performs well",
          "All heat map views should be responsive",
          "Standard performance optimizations sufficient"
        ];
      }
      
      const responseData = {
        tableStats: {
          totalRecords,
          recordTypes: parseInt(stats.record_types),
          uniqueFiles: parseInt(stats.unique_files),
          uniqueDays: parseInt(stats.unique_days),
          dateRange: {
            earliest: stats.earliest_date,
            latest: stats.latest_date
          }
        },
        performanceProfile: {
          level: totalRecords > 1000000 ? 'enterprise' : 
                 totalRecords > 100000 ? 'large' :
                 totalRecords > 25000 ? 'medium' : 'standard',
          recommendedAggregation: totalRecords > 100000 ? 'month' :
                                  totalRecords > 25000 ? 'week' : 'day',
          cacheStrategy: totalRecords > 100000 ? 'aggressive' : 'standard'
        },
        recommendations,
        cacheStatus: {
          activityCache: activityCache ? {
            age: Date.now() - (activityCache as any).timestamp,
            hits: (activityCache as any).hits || 0,
            size: JSON.stringify((activityCache as any).data).length
          } : null
        }
      };
      
      res.json(responseData);
    } catch (error) {
      console.error('Error getting performance stats:', error);
      res.status(500).json({ error: 'Failed to get performance statistics' });
    }
  });

  // Get last TDDF processing datetime for dashboard display
  app.get("/api/tddf-json/last-processing-datetime", isAuthenticated, async (req, res) => {
    try {
      const tableName = getTableName('tddf_jsonb');
      
      const result = await pool.query(`
        SELECT 
          tddf_processing_datetime,
          tddf_processing_date,
          filename,
          record_type,
          created_at
        FROM ${tableName}
        WHERE tddf_processing_datetime IS NOT NULL
        ORDER BY tddf_processing_datetime DESC
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        return res.json({ 
          lastProcessingDatetime: null,
          message: "No TDDF records with processing datetime found" 
        });
      }
      
      const record = result.rows[0];
      const environment = process.env.NODE_ENV || 'development';
      
      res.json({
        lastProcessingDatetime: record.tddf_processing_datetime,
        lastProcessingDate: record.tddf_processing_date,
        filename: record.filename,
        recordType: record.record_type,
        createdAt: record.created_at,
        environment: environment
      });
      
    } catch (error: any) {
      console.error('Error fetching last TDDF processing datetime:', error);
      res.status(500).json({ error: error.message || "Failed to fetch last TDDF processing datetime" });
    }
  });

  // TDDF JSON Activity Heat Map using pre-cache table with timeout protection
  app.get("/api/tddf-json/activity", isAuthenticated, async (req, res) => {
    const requestStartTime = Date.now();
    const REQUEST_TIMEOUT = 45000; // 45 seconds max for large datasets like 2024
    
    // Set response timeout for large dataset protection
    req.setTimeout(REQUEST_TIMEOUT, () => {
      console.log(`[TDDF-JSON-ACTIVITY] Request timeout after ${REQUEST_TIMEOUT}ms - dataset too large`);
      if (!res.headersSent) {
        res.status(408).json({ 
          error: "Request timeout - dataset too large for real-time processing",
          suggestion: "Use pre-cache data or contact administrator to refresh cache",
          timeoutMs: REQUEST_TIMEOUT,
          fromPreCache: false
        });
      }
    });
    
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const recordType = (req.query.recordType as string) || 'DT';
      const cacheKey = `activity_${year}_${recordType}`;
      
      console.log(`[TDDF-JSON-ACTIVITY] Processing year ${year}, type: ${recordType} (timeout: ${REQUEST_TIMEOUT}ms)...`);
      const startTime = Date.now();
      
      // NEVER REFRESH POLICY: Use heat map cache tables first, never bypass for direct queries
      const environment = process.env.NODE_ENV || 'development';
      const heatMapCacheTable = `heat_map_cache_${year}`;
      
      console.log(`[TDDF-JSON-ACTIVITY] NEVER REFRESH POLICY: Checking heat map cache table ${heatMapCacheTable}...`);
      
      // First try to get data from heat map cache table - NEVER REFRESH means we use cached data
      try {
        const cacheQuery = `
          SELECT 
            date as transaction_date,
            dt_count as transaction_count
          FROM ${heatMapCacheTable}
          ORDER BY date
        `;
        
        const cacheResult = await pool.query(cacheQuery);
        
        if (cacheResult.rows.length > 0) {
          console.log(`[TDDF-JSON-ACTIVITY] ✅ Using cached data from ${heatMapCacheTable}: ${cacheResult.rows.length} entries (NEVER REFRESH POLICY)`);
          
          const responseData = {
            records: cacheResult.rows.map(row => ({
              date: row.transaction_date.toISOString().split('T')[0], // Convert to YYYY-MM-DD format
              transaction_count: parseInt(row.transaction_count)
            })),
            metadata: {
              fromPreCache: true,
              cacheTable: heatMapCacheTable,
              recordType: recordType,
              year: year,
              neverRefreshPolicy: true
            },
            queryTime: Date.now() - startTime,
            fromCache: true
          };
          
          return res.json(responseData);
        }
        
        console.log(`[TDDF-JSON-ACTIVITY] Cache table ${heatMapCacheTable} is empty - will populate with data ONCE ONLY (NEVER REFRESH)`);
        
        // Populate cache table ONCE ONLY - this follows "never refresh" policy by only populating empty caches
        const fallbackTableName = getTableName('tddf_jsonb');
        const populateQuery = `
          INSERT INTO ${heatMapCacheTable} (date, dt_count)
          SELECT 
            DATE((extracted_fields->>'transactionDate')::date) as date,
            COUNT(*) as dt_count
          FROM ${fallbackTableName}
          WHERE record_type = 'DT'
            AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = $1
            AND extracted_fields->>'transactionDate' IS NOT NULL
          GROUP BY DATE((extracted_fields->>'transactionDate')::date)
          ORDER BY date
          ON CONFLICT (date) DO NOTHING
        `;
        
        console.log(`[TDDF-JSON-ACTIVITY] Populating ${heatMapCacheTable} for year ${year} (ONCE ONLY)...`);
        const populateStartTime = Date.now();
        await pool.query(populateQuery, [year]);
        
        // Now get the populated data
        const populatedResult = await pool.query(cacheQuery);
        const populatedTime = Date.now() - populateStartTime;
        
        console.log(`[TDDF-JSON-ACTIVITY] ✅ Cache populated and retrieved in ${populatedTime}ms: ${populatedResult.rows.length} entries`);
        
        const responseData = {
          records: populatedResult.rows.map(row => ({
            date: row.transaction_date.toISOString().split('T')[0],
            transaction_count: parseInt(row.transaction_count)
          })),
          metadata: {
            fromPreCache: true,
            cacheTable: heatMapCacheTable,
            recordType: recordType,
            year: year,
            neverRefreshPolicy: true,
            justPopulated: true,
            populationTime: populatedTime
          },
          queryTime: Date.now() - startTime,
          fromCache: true
        };
        
        return res.json(responseData);
        
      } catch (cacheError) {
        console.log(`[TDDF-JSON-ACTIVITY] Cache table error:`, (cacheError as Error).message);
      }
      
      // If cache doesn't exist, return error suggesting cache build
      res.status(503).json({
        error: "Cache not available",
        message: `Heat map cache for ${year} needs to be built. Please contact administrator.`,
        suggestion: "Use the heatmap cache builder to create cache for this year",
        year,
        recordType
      });
      
    } catch (error) {
      console.error('[TDDF-JSON-ACTIVITY] Error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch activity data" 
      });
    }
  });

  // Enhanced API monitoring and request logs with processing metrics
  app.get('/api/tddf-api/monitoring', isAuthenticated, async (req, res) => {
    try {
      const { timeRange = '24h' } = req.query;
      
      let timeFilter = '';
      let truncUnit = 'hour';  // Valid DATE_TRUNC units: 'hour', 'day'
      
      if (timeRange === '24h') {
        timeFilter = "WHERE requested_at >= NOW() - INTERVAL '24 hours'";
        truncUnit = 'hour';
      } else if (timeRange === '7d') {
        timeFilter = "WHERE requested_at >= NOW() - INTERVAL '7 days'";
        truncUnit = 'hour';  // Use hour for 7d as well, but limit results
      } else if (timeRange === '30d') {
        timeFilter = "WHERE requested_at >= NOW() - INTERVAL '30 days'";
        truncUnit = 'day';
      }
      
      // Basic API request stats
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
          COUNT(DISTINCT api_key_id) as unique_api_keys,
          MAX(requested_at) as last_request,
          MIN(requested_at) as first_request
        FROM ${getTableName('tddf_api_request_logs')}
        ${timeFilter}
      `);
      
      // Queue status
      const queueStatus = await pool.query(`
        SELECT 
          COUNT(*) as total_queued,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_files,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          AVG(priority) as avg_priority
        FROM ${getTableName('tddf_api_queue')}
      `);
      
      // Processing metrics
      const processingStats = await pool.query(`
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_bytes_processed,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          AVG(CASE WHEN status = 'completed' THEN EXTRACT(EPOCH FROM (processing_completed - processing_started)) END) as avg_processing_time
        FROM ${getTableName('tddf_api_files')}
        WHERE uploaded_at >= NOW() - INTERVAL '${timeRange === '24h' ? '24 hours' : timeRange === '7d' ? '7 days' : '30 days'}'
      `);
      
      // Top endpoints
      const topEndpoints = await pool.query(`
        SELECT 
          endpoint,
          COUNT(*) as request_count,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
          MAX(requested_at) as last_request
        FROM ${getTableName('tddf_api_request_logs')}
        ${timeFilter}
        GROUP BY endpoint
        ORDER BY request_count DESC
        LIMIT 10
      `);
      
      // Time-based trends
      const trends = await pool.query(`
        SELECT 
          DATE_TRUNC('${truncUnit}', requested_at) as time_bucket,
          COUNT(*) as request_count,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
          COUNT(DISTINCT api_key_id) as unique_keys
        FROM ${getTableName('tddf_api_request_logs')}
        ${timeFilter}
        GROUP BY DATE_TRUNC('${truncUnit}', requested_at)
        ORDER BY time_bucket DESC
        LIMIT 48
      `);
      
      // API Key activity
      const apiKeyStats = await pool.query(`
        SELECT 
          ak.key_name,
          COUNT(rl.*) as request_count,
          AVG(rl.response_time) as avg_response_time,
          MAX(rl.requested_at) as last_used,
          COUNT(CASE WHEN rl.response_status >= 400 THEN 1 END) as error_count
        FROM ${getTableName('tddf_api_keys')} ak
        LEFT JOIN ${getTableName('tddf_api_request_logs')} rl ON ak.id = rl.api_key_id
        ${timeFilter.replace('WHERE', 'AND')}
        WHERE ak.is_active = true
        GROUP BY ak.id, ak.key_name
        ORDER BY request_count DESC
        LIMIT 5
      `);
      
      res.json({
        stats: {
          ...stats.rows[0],
          success_rate: stats.rows[0].total_requests > 0 ? 
            ((stats.rows[0].total_requests - stats.rows[0].error_count) / stats.rows[0].total_requests * 100).toFixed(1) : '100'
        },
        queue: queueStatus.rows[0],
        processing: {
          ...processingStats.rows[0],
          success_rate: processingStats.rows[0].total_files > 0 ?
            (processingStats.rows[0].completed_files / processingStats.rows[0].total_files * 100).toFixed(1) : '0'
        },
        trends: trends.rows.reverse(), // Show chronological order
        topEndpoints: topEndpoints.rows,
        apiKeyActivity: apiKeyStats.rows,
        metadata: {
          timeRange,
          interval: truncUnit,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching API monitoring data:', error);
      res.status(500).json({ error: 'Failed to fetch monitoring data' });
    }
  });
}
