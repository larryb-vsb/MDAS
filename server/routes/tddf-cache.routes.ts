import type { Express } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { getTableName } from "../table-config";
import { isAuthenticated } from "./middleware";
import { sql } from "drizzle-orm";
import { HeatMapCacheBuilder } from "../services/heat-map-cache-builder";
import { parseTddfFilename } from "../utils/tddfFilename";

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
      const terminalId = req.query.terminal_id as string;
      const yearParam = req.query.year as string;
      const monthParam = req.query.month as string;
      
      console.log('[TDDF ACTIVITY HEATMAP] Raw params:', { terminalId, yearParam, monthParam });
      
      // Validate and parse year
      const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
      console.log('[TDDF ACTIVITY HEATMAP] Parsed year:', year, 'isNaN:', isNaN(year));
      if (isNaN(year)) {
        console.error('[TDDF ACTIVITY HEATMAP] Invalid year - returning 400');
        return res.status(400).json({ error: 'Invalid year parameter' });
      }
      
      // Validate and parse month (JavaScript 0-indexed)
      const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth();
      console.log('[TDDF ACTIVITY HEATMAP] Parsed month:', month, 'isNaN:', isNaN(month));
      if (isNaN(month) || month < 0 || month > 11) {
        console.error('[TDDF ACTIVITY HEATMAP] Invalid month - returning 400');
        return res.status(400).json({ error: 'Invalid month parameter (must be 0-11)' });
      }
      
      const tddfJsonbTableName = getTableName('tddf_jsonb');
      
      // Calculate date range for the entire month
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0); // Last day of month
      
      console.log(`[TDDF ACTIVITY HEATMAP] Getting DT activity data from JSONB for ${year}-${month + 1}${terminalId ? `, terminal: ${terminalId}` : ''}`);
      console.log(`[TDDF ACTIVITY HEATMAP] Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      // Build query with month filter and optional terminal filter
      let query = `
        SELECT 
          DATE((extracted_fields->>'transactionDate')::date) as transaction_date,
          COUNT(*) as transaction_count
        FROM ${tddfJsonbTableName}
        WHERE record_type = 'DT'
          AND (extracted_fields->>'transactionDate')::date >= $1
          AND (extracted_fields->>'transactionDate')::date <= $2
          AND extracted_fields->>'transactionDate' IS NOT NULL`;
      
      const params: any[] = [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]];
      
      if (terminalId && terminalId !== 'undefined' && terminalId !== 'null') {
        // Generate both Terminal IDs (with "7" and "0" prefixes) for VAR number matching
        // VAR V5640198 → check both 75640198 AND 05640198
        let terminalIds = [terminalId];
        if (terminalId.startsWith('7')) {
          const baseNumber = terminalId.substring(1);
          const altTerminalId = '0' + baseNumber;
          terminalIds.push(altTerminalId);
        } else if (terminalId.startsWith('0')) {
          const baseNumber = terminalId.substring(1);
          const altTerminalId = '7' + baseNumber;
          terminalIds.push(altTerminalId);
        }
        
        console.log(`[TDDF ACTIVITY HEATMAP] Checking Terminal IDs: ${terminalIds.join(', ')}`);
        query += ` AND extracted_fields->>'terminalId' = ANY($3::text[])`;
        params.push(terminalIds);
      }
      
      query += `
        GROUP BY DATE((extracted_fields->>'transactionDate')::date)
        ORDER BY DATE((extracted_fields->>'transactionDate')::date)`;
      
      console.log('[TDDF ACTIVITY HEATMAP] Executing query with params:', params);
      const activityData = await pool.query(query, params);
      
      console.log(`[TDDF ACTIVITY HEATMAP] Found ${activityData.rows.length} days with DT activity for ${year}-${month + 1}${terminalId ? ` (terminal: ${terminalId})` : ''} from JSONB`);
      
      // Format response to match expected interface
      const formattedData = activityData.rows.map((row: any) => ({
        transaction_date: row.transaction_date,
        transaction_count: parseInt(row.transaction_count),
        aggregation_level: 'daily'
      }));
      
      res.json(formattedData);
    } catch (error) {
      console.error('[TDDF ACTIVITY HEATMAP] Error fetching data:', error);
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
      const result = await HeatMapCacheBuilder.getYearDataFromCache(year, recordType);
      
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
      const result = await HeatMapCacheBuilder.getYearDataFromCache(year, 'DT');
      
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
      
      // Get aggregated data from TDDF JSONB (uploader) table
      // BH records grouped by batchDate, DT records grouped by transactionDate
      // Filter for valid ISO dates only to prevent parsing errors and NULL dates
      const tddfjsonbDataResult = await pool.query(`
        SELECT 
          date_key as processing_date,
          SUM(total_records) as total_records,
          COUNT(DISTINCT upload_id) as total_files,
          SUM(dt_transaction_amounts) as dt_transaction_amounts,
          SUM(bh_net_deposits) as bh_net_deposits,
          SUM(bh_records) as bh_records,
          SUM(dt_records) as dt_records
        FROM (
          SELECT 
            extracted_fields->>'batchDate' as date_key,
            upload_id,
            COUNT(*) as total_records,
            COALESCE(SUM(CASE 
              WHEN extracted_fields->>'netDeposit' IS NOT NULL 
                AND extracted_fields->>'netDeposit' != '' 
              THEN (extracted_fields->>'netDeposit')::numeric 
              ELSE 0 
            END), 0) as bh_net_deposits,
            COUNT(*) as bh_records,
            0 as dt_records,
            0::numeric as dt_transaction_amounts
          FROM ${tddfjsonbTableName}
          WHERE record_type = 'BH'
            AND extracted_fields->>'batchDate' ~ '^\\d{4}-\\d{2}-\\d{2}'
            AND extracted_fields->>'batchDate' IS NOT NULL
            AND extracted_fields->>'batchDate' >= $1
            AND extracted_fields->>'batchDate' <= $2
          GROUP BY extracted_fields->>'batchDate', upload_id
          
          UNION ALL
          
          SELECT 
            extracted_fields->>'transactionDate' as date_key,
            upload_id,
            COUNT(*) as total_records,
            0::numeric as bh_net_deposits,
            0 as bh_records,
            COUNT(*) as dt_records,
            COALESCE(SUM(CASE 
              WHEN extracted_fields->>'transactionAmount' IS NOT NULL 
                AND extracted_fields->>'transactionAmount' != '' 
              THEN (extracted_fields->>'transactionAmount')::numeric 
              ELSE 0 
            END), 0) as dt_transaction_amounts
          FROM ${tddfjsonbTableName}
          WHERE record_type = 'DT'
            AND extracted_fields->>'transactionDate' ~ '^\\d{4}-\\d{2}-\\d{2}'
            AND extracted_fields->>'transactionDate' IS NOT NULL
            AND extracted_fields->>'transactionDate' >= $1
            AND extracted_fields->>'transactionDate' <= $2
          GROUP BY extracted_fields->>'transactionDate', upload_id
        ) combined
        WHERE date_key IS NOT NULL
        GROUP BY date_key
        ORDER BY date_key
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

  // TDDF1 Monthly Totals - Query master table directly
  app.get('/api/tddf1/monthly-totals', isAuthenticated, async (req, res) => {
    console.log('📅 Getting TDDF1 monthly totals');
    
    const client = await pool.connect();
    
    try {
      const { month } = req.query; // Expected format: 'YYYY-MM'
      
      if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
      }
      
      const masterTableName = getTableName('tddf_jsonb');
      const uploaderTableName = getTableName('uploader_uploads');
      
      console.log(`📅 [MONTHLY-TOTALS] Querying master table: ${masterTableName}`);
      
      const [year, monthNum] = month.split('-');
      const startDate = `${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      const endDate = `${year}-${monthNum.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
      
      console.log(`📅 [MONTHLY] Getting data for ${month}: ${startDate} to ${endDate}`);
      
      // Start transaction and set query timeout to 2 minutes
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '120s'`);
      
      // Get aggregated totals for the entire month from master table
      // PARTITION PRUNING: Each OR branch includes tddf_processing_date for optimal pruning
      const monthlyTotals = await client.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT upload_id) as total_files,
          COUNT(CASE WHEN record_type = 'BH' THEN 1 END) as bh_records,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) as dt_records,
          COUNT(CASE WHEN record_type = 'G2' THEN 1 END) as g2_records,
          COUNT(CASE WHEN record_type = 'E1' THEN 1 END) as e1_records,
          COUNT(CASE WHEN record_type = 'P1' THEN 1 END) as p1_records,
          COUNT(CASE WHEN record_type = 'P2' THEN 1 END) as p2_records,
          COUNT(CASE WHEN record_type = 'DR' THEN 1 END) as dr_records,
          COUNT(CASE WHEN record_type = 'AD' THEN 1 END) as ad_records,
          COALESCE(SUM(CASE WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal END), 0) as total_net_deposit_bh,
          COALESCE(SUM(CASE WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal END), 0) as total_transaction_value
        FROM ${masterTableName}
        WHERE (
            (tddf_processing_date >= $1::date AND tddf_processing_date <= $2::date 
             AND record_type = 'BH' AND extracted_fields->>'batchDate' >= $1 AND extracted_fields->>'batchDate' <= $2)
            OR
            (tddf_processing_date >= $1::date AND tddf_processing_date <= $2::date 
             AND record_type = 'DT' AND extracted_fields->>'transactionDate' >= $1 AND extracted_fields->>'transactionDate' <= $2)
            OR
            (tddf_processing_date >= $1::date AND tddf_processing_date <= $2::date 
             AND record_type IN ('G2', 'E1', 'P1', 'P2', 'DR', 'AD') AND upload_id IN (
              SELECT DISTINCT upload_id FROM ${masterTableName}
              WHERE tddf_processing_date >= $1::date 
                AND tddf_processing_date <= $2::date
                AND record_type = 'BH' 
                AND extracted_fields->>'batchDate' >= $1 
                AND extracted_fields->>'batchDate' <= $2
            ))
          )
      `, [startDate, endDate]);
      
      const summary = monthlyTotals.rows[0];
      const recordTypeBreakdown: Record<string, number> = {
        'BH': parseInt(summary.bh_records) || 0,
        'DT': parseInt(summary.dt_records) || 0,
        'G2': parseInt(summary.g2_records) || 0,
        'E1': parseInt(summary.e1_records) || 0,
        'P1': parseInt(summary.p1_records) || 0,
        'P2': parseInt(summary.p2_records) || 0,
        'DR': parseInt(summary.dr_records) || 0,
        'AD': parseInt(summary.ad_records) || 0
      };
      
      // Get daily breakdown - aggregate by date
      // Count files by filename date (matching daily Data Files tab logic)
      // PARTITION PRUNING: Each OR branch includes tddf_processing_date for optimal pruning
      const dailyBreakdown = await client.query(`
        SELECT 
          COALESCE(
            CASE WHEN record_type = 'BH' THEN extracted_fields->>'batchDate'
                 WHEN record_type = 'DT' THEN extracted_fields->>'transactionDate'
            END
          ) as date,
          COUNT(*) as records,
          COALESCE(SUM(CASE WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal END), 0) as transaction_value,
          COALESCE(SUM(CASE WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal END), 0) as net_deposit_bh
        FROM ${masterTableName}
        WHERE (
            (tddf_processing_date >= $1::date AND tddf_processing_date <= $2::date 
             AND record_type = 'BH' AND extracted_fields->>'batchDate' >= $1 AND extracted_fields->>'batchDate' <= $2)
            OR
            (tddf_processing_date >= $1::date AND tddf_processing_date <= $2::date 
             AND record_type = 'DT' AND extracted_fields->>'transactionDate' >= $1 AND extracted_fields->>'transactionDate' <= $2)
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
      `, [startDate, endDate]);
      
      // Count files by filename date for each day (matching Data Files tab logic)
      const fileCountsByDate = await client.query(`
        SELECT 
          to_char(
            to_date(split_part(filename, '_', 4), 'MMDDYYYY'),
            'YYYY-MM-DD'
          ) as date,
          COUNT(*) as files
        FROM ${uploaderTableName}
        WHERE split_part(filename, '_', 4) ~ '^\\d{8}$'
          AND to_char(
            to_date(split_part(filename, '_', 4), 'MMDDYYYY'),
            'YYYY-MM-DD'
          ) >= $1
          AND to_char(
            to_date(split_part(filename, '_', 4), 'MMDDYYYY'),
            'YYYY-MM-DD'
          ) <= $2
        GROUP BY to_char(
          to_date(split_part(filename, '_', 4), 'MMDDYYYY'),
          'YYYY-MM-DD'
        )
        ORDER BY date
      `, [startDate, endDate]);
      
      // Create a map of file counts by date
      const fileCountMap = new Map<string, number>();
      fileCountsByDate.rows.forEach(row => {
        fileCountMap.set(row.date, parseInt(row.files) || 0);
      });
      
      const result = {
        month,
        totalFiles: parseInt(summary.total_files) || 0,
        totalRecords: parseInt(summary.total_records) || 0,
        totalTransactionValue: parseFloat(summary.total_transaction_value) || 0,
        totalNetDepositBh: parseFloat(summary.total_net_deposit_bh) || 0,
        recordTypeBreakdown,
        dailyBreakdown: dailyBreakdown.rows.map((entry) => ({
          date: entry.date,
          files: fileCountMap.get(entry.date) || 0,  // Use filename date count
          records: parseInt(entry.records),
          transactionValue: parseFloat(entry.transaction_value || '0'),
          netDepositBh: parseFloat(entry.net_deposit_bh || '0')
        }))
      };
      
      console.log(`📅 [MONTHLY] Aggregated data for ${month}: ${result.totalFiles} files, ${result.totalRecords} records, $${result.totalTransactionValue.toLocaleString()} transaction value, $${result.totalNetDepositBh.toLocaleString()} net deposit`);
      
      // Commit transaction
      await client.query('COMMIT');
      
      res.json(result);
    } catch (error: any) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('❌ Error fetching TDDF1 monthly totals:', error);
      res.status(500).json({ error: error.message });
    } finally {
      // Always release the client back to the pool
      client.release();
    }
  });

  // TDDF1 Monthly Comparison - Current and Previous Month - Query master table directly
  app.get('/api/tddf1/monthly-comparison', isAuthenticated, async (req, res) => {
    console.log('📅 Getting TDDF1 monthly comparison');
    
    const client = await pool.connect();
    
    try {
      const { month } = req.query; // Expected format: 'YYYY-MM'
      
      if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
      }
      
      const masterTableName = getTableName('tddf_jsonb');
      
      console.log(`📅 [MONTHLY-COMPARISON] Querying master table: ${masterTableName}`);
      
      const [year, monthNum] = month.split('-');
      
      // Calculate previous month
      const currentDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const previousMonth = `${previousDate.getFullYear()}-${(previousDate.getMonth() + 1).toString().padStart(2, '0')}`;
      
      // Start transaction and set query timeout to 2 minutes
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '120s'`);
      
      // Helper function to get month data from master table
      const getMonthData = async (targetMonth: string) => {
        const [yr, mth] = targetMonth.split('-');
        const startDate = `${targetMonth}-01`;
        const lastDay = new Date(parseInt(yr), parseInt(mth), 0).getDate();
        const endDate = `${yr}-${mth.padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
        
        // Get daily breakdown for the month from master table
        // PARTITION PRUNING: Each OR branch includes tddf_processing_date for optimal pruning
        const dailyBreakdown = await client.query(`
          SELECT 
            COALESCE(
              CASE WHEN record_type = 'BH' THEN extracted_fields->>'batchDate'
                   WHEN record_type = 'DT' THEN extracted_fields->>'transactionDate'
              END
            ) as date,
            COUNT(DISTINCT upload_id) as files,
            COUNT(*) as records,
            COALESCE(SUM(CASE WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal END), 0) as transaction_value,
            COALESCE(SUM(CASE WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal END), 0) as net_deposit_bh
          FROM ${masterTableName}
          WHERE (
              (tddf_processing_date::text >= $1 AND tddf_processing_date::text <= $2 
               AND record_type = 'BH' AND extracted_fields->>'batchDate' >= $1 AND extracted_fields->>'batchDate' <= $2)
              OR
              (tddf_processing_date::text >= $1 AND tddf_processing_date::text <= $2 
               AND record_type = 'DT' AND extracted_fields->>'transactionDate' >= $1 AND extracted_fields->>'transactionDate' <= $2)
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
        `, [startDate, endDate]);
        
        return dailyBreakdown.rows.map((entry) => ({
          date: entry.date,
          files: parseInt(entry.files),
          records: parseInt(entry.records),
          transactionValue: parseFloat(entry.transaction_value || '0'),
          netDepositBh: parseFloat(entry.net_deposit_bh || '0'),
          dayOfMonth: parseInt(entry.date.split('-')[2])
        }));
      };
      
      // Get data for both months
      const [currentMonthData, previousMonthData] = await Promise.all([
        getMonthData(month),
        getMonthData(previousMonth)
      ]);
      
      console.log(`📅 [COMPARISON] Current month (${month}): ${currentMonthData.length} days, Previous month (${previousMonth}): ${previousMonthData.length} days`);
      
      // Commit transaction
      await client.query('COMMIT');
      
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
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('❌ Error fetching TDDF1 monthly comparison:', error);
      res.status(500).json({ error: error.message });
    } finally {
      // Always release the client back to the pool
      client.release();
    }
  });

  // TDDF1 Daily Breakdown - Using CACHE (dev_tddf1_totals) with MASTER table fallback
  app.get("/api/tddf1/day-breakdown", isAuthenticated, async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split('T')[0];
      console.log(`📅 Getting TDDF1 daily breakdown for date: ${date} from CACHE with master fallback`);
      
      const totalsTableName = getTableName('tddf1_totals');
      const masterTableName = getTableName('tddf_jsonb');
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Try reading from cache first (fast path)
      const cacheResult = await pool.query(`
        SELECT 
          total_files,
          total_records,
          total_transaction_amounts,
          total_net_deposits,
          bh_records,
          dt_records
        FROM ${totalsTableName}
        WHERE file_date = $1
      `, [date]);
      
      if (cacheResult.rows.length > 0) {
        // Cache hit - get file list from master table for completeness
        const cacheData = cacheResult.rows[0];
        
        // Convert YYYY-MM-DD to MMDDYYYY for filename matching
        const [year, month, day] = date.split('-');
        const filenameDateStr = `${month}${day}${year}`;
        
        const filesResult = await pool.query(`
          SELECT 
            u.filename,
            u.id as upload_id,
            COUNT(*) as record_count
          FROM ${masterTableName} r
          JOIN ${uploaderTableName} u ON r.upload_id = u.id
          WHERE split_part(u.filename, '_', 4) = $1
            AND u.deleted_at IS NULL
          GROUP BY u.filename, u.id
          ORDER BY u.created_at DESC
        `, [filenameDateStr]);
        
        const filesProcessed = filesResult.rows.map(f => ({
          fileName: f.filename,
          tableName: totalsTableName,
          recordCount: parseInt(f.record_count)
        }));
        
        const totalRecords = parseInt(cacheData.total_records) || 0;
        const fileCount = filesResult.rows.length; // Count actual data files with records on this date
        const netDepositsTotal = parseFloat(cacheData.total_net_deposits) || 0;
        const transactionAmountsTotal = parseFloat(cacheData.total_transaction_amounts) || 0;
        
        const recordTypes: Record<string, number> = {
          'BH': parseInt(cacheData.bh_records) || 0,
          'DT': parseInt(cacheData.dt_records) || 0,
          'P1': 0, // Not tracked in cache
          'P2': 0  // Not tracked in cache
        };
        
        console.log(`📅 ✅ CACHE HIT for ${date}: ${fileCount} files, ${totalRecords} records`);
        console.log(`📅 BH records: ${recordTypes['BH']}, Net Deposits: $${netDepositsTotal.toFixed(2)}`);
        console.log(`📅 DT records: ${recordTypes['DT']}, Transaction Amounts: $${transactionAmountsTotal.toFixed(2)}`);
        
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
        res.set('ETag', `"${date}-${Date.now()}"`);
        
        return res.json({
          totalRecords,
          fileCount,
          totalTransactionValue: transactionAmountsTotal,
          netDeposits: netDepositsTotal,
          recordTypeBreakdown: recordTypes,
          date: date,
          files: filesProcessed,
          tables: [totalsTableName],
          filesProcessed: filesProcessed,
          cached: true,
          dataSource: 'pre_cache',
          timestamp: Date.now()
        });
      }
      
      // Cache miss - fall back to master table
      console.log(`📅 Cache miss for ${date}, falling back to MASTER table: ${masterTableName}`);
      
      // Convert YYYY-MM-DD to MMDDYYYY for filename matching
      const [year, month, day] = date.split('-');
      const filenameDateStr = `${month}${day}${year}`;
      
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT upload_id) as file_count,
          COUNT(CASE WHEN record_type = 'BH' THEN 1 END) as bh_records,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) as dt_records,
          COUNT(CASE WHEN record_type = 'P1' THEN 1 END) as p1_records,
          COUNT(CASE WHEN record_type = 'P2' THEN 1 END) as p2_records,
          COALESCE(SUM(CASE WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal END), 0) as net_deposits,
          COALESCE(SUM(CASE WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal END), 0) as transaction_amounts
        FROM ${masterTableName} r
        JOIN ${uploaderTableName} u ON r.upload_id = u.id
        WHERE split_part(u.filename, '_', 4) = $1
          AND u.deleted_at IS NULL
      `, [filenameDateStr]);
      
      const filesResult = await pool.query(`
        SELECT 
          u.filename,
          u.id as upload_id,
          COUNT(*) as record_count
        FROM ${masterTableName} r
        JOIN ${uploaderTableName} u ON r.upload_id = u.id
        WHERE split_part(u.filename, '_', 4) = $1
          AND u.deleted_at IS NULL
        GROUP BY u.filename, u.id
        ORDER BY u.created_at DESC
      `, [filenameDateStr]);
      
      const summary = statsResult.rows[0];
      const totalRecords = parseInt(summary.total_records) || 0;
      const fileCount = parseInt(summary.file_count) || 0;
      const netDepositsTotal = parseFloat(summary.net_deposits) || 0;
      const transactionAmountsTotal = parseFloat(summary.transaction_amounts) || 0;
      
      const recordTypes: Record<string, number> = {
        'BH': parseInt(summary.bh_records) || 0,
        'DT': parseInt(summary.dt_records) || 0,
        'P1': parseInt(summary.p1_records) || 0,
        'P2': parseInt(summary.p2_records) || 0
      };
      
      const filesProcessed = filesResult.rows.map(f => ({
        fileName: f.filename,
        tableName: masterTableName,
        recordCount: parseInt(f.record_count)
      }));
      
      console.log(`📅 MASTER fallback for ${date}: BH=${recordTypes['BH']}, DT=${recordTypes['DT']}, Net Deposits=$${netDepositsTotal.toFixed(2)}`);
      
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
      res.set('ETag', `"${date}-${Date.now()}"`);
      
      res.json({
        totalRecords,
        fileCount,
        totalTransactionValue: transactionAmountsTotal,
        netDeposits: netDepositsTotal,
        recordTypeBreakdown: recordTypes,
        date: date,
        files: filesProcessed,
        tables: [masterTableName],
        filesProcessed: filesProcessed,
        cached: false,
        dataSource: 'master_table',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Error getting TDDF1 day breakdown:", error);
      res.status(500).json({ error: "Failed to get day breakdown" });
    }
  });

  // TDDF1 Multi-Day Breakdown - Returns data for multiple days from CACHE with MASTER fallback
  app.get("/api/tddf1/multi-day-breakdown", isAuthenticated, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30; // Default to last 30 days
      const endDate = req.query.endDate as string || new Date().toISOString().split('T')[0];
      
      console.log(`📅 Getting TDDF1 multi-day breakdown for last ${days} days ending ${endDate}`);
      
      const totalsTableName = getTableName('tddf1_totals');
      const masterTableName = getTableName('tddf_jsonb');
      
      // Calculate start date
      const end = new Date(endDate);
      const start = new Date(end);
      start.setDate(start.getDate() - days + 1);
      const startDate = start.toISOString().split('T')[0];
      
      // Try cache first
      const cacheResult = await pool.query(`
        SELECT 
          file_date,
          total_files,
          total_records,
          total_transaction_amounts,
          total_net_deposits,
          bh_records,
          dt_records
        FROM ${totalsTableName}
        WHERE file_date >= $1 AND file_date <= $2
        ORDER BY file_date DESC
      `, [startDate, endDate]);
      
      if (cacheResult.rows.length > 0) {
        // Cache hit - format the data
        const dailyData = cacheResult.rows.map((row: any) => ({
          date: row.file_date,
          totalRecords: parseInt(row.total_records) || 0,
          fileCount: parseInt(row.total_files) || 0,
          totalTransactionValue: parseFloat(row.total_transaction_amounts) || 0,
          netDeposits: parseFloat(row.total_net_deposits) || 0,
          recordTypes: {
            'BH': parseInt(row.bh_records) || 0,
            'DT': parseInt(row.dt_records) || 0,
            'G2': 0,
            'E1': 0,
            'P1': 0,
            'P2': 0,
            'DR': 0,
            'AD': 0
          }
        }));
        
        console.log(`📅 ✅ CACHE HIT: Retrieved ${dailyData.length} days of data from cache`);
        
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
        
        return res.json({
          dailyData,
          startDate,
          endDate,
          dataSource: 'pre_cache',
          timestamp: Date.now()
        });
      }
      
      // Cache miss - fall back to master table (slower but complete)
      console.log(`📅 Cache miss, falling back to MASTER table for date range ${startDate} to ${endDate}`);
      
      const masterResult = await pool.query(`
        WITH daily_stats AS (
          SELECT 
            CASE 
              WHEN record_type = 'BH' THEN extracted_fields->>'batchDate'
              WHEN record_type = 'DT' THEN extracted_fields->>'transactionDate'
            END as date,
            record_type,
            COUNT(*) as count,
            COUNT(DISTINCT upload_id) as file_count,
            COALESCE(SUM(CASE 
              WHEN record_type = 'BH' AND extracted_fields->>'netDeposit' ~ '^-?[0-9]+(\\.[0-9]+)?$' 
              THEN (extracted_fields->>'netDeposit')::decimal 
              ELSE 0 
            END), 0) as net_deposits,
            COALESCE(SUM(CASE 
              WHEN record_type = 'DT' AND extracted_fields->>'transactionAmount' ~ '^-?[0-9]+(\\.[0-9]+)?$' 
              THEN (extracted_fields->>'transactionAmount')::decimal 
              ELSE 0 
            END), 0) as transaction_amounts
          FROM ${masterTableName}
          WHERE (
            (record_type = 'BH' AND extracted_fields->>'batchDate' ~ '^\\d{4}-\\d{2}-\\d{2}' 
             AND extracted_fields->>'batchDate' >= $1 AND extracted_fields->>'batchDate' <= $2)
            OR
            (record_type = 'DT' AND extracted_fields->>'transactionDate' ~ '^\\d{4}-\\d{2}-\\d{2}' 
             AND extracted_fields->>'transactionDate' >= $1 AND extracted_fields->>'transactionDate' <= $2)
            OR
            (record_type IN ('G2', 'E1', 'P1', 'P2', 'DR', 'AD'))
          )
          GROUP BY date, record_type
        )
        SELECT 
          date,
          SUM(count) as total_records,
          MAX(file_count) as file_count,
          SUM(CASE WHEN record_type = 'BH' THEN count ELSE 0 END) as bh_records,
          SUM(CASE WHEN record_type = 'DT' THEN count ELSE 0 END) as dt_records,
          SUM(CASE WHEN record_type = 'G2' THEN count ELSE 0 END) as g2_records,
          SUM(CASE WHEN record_type = 'E1' THEN count ELSE 0 END) as e1_records,
          SUM(CASE WHEN record_type = 'P1' THEN count ELSE 0 END) as p1_records,
          SUM(CASE WHEN record_type = 'P2' THEN count ELSE 0 END) as p2_records,
          SUM(CASE WHEN record_type = 'DR' THEN count ELSE 0 END) as dr_records,
          SUM(CASE WHEN record_type = 'AD' THEN count ELSE 0 END) as ad_records,
          SUM(net_deposits) as net_deposits,
          SUM(transaction_amounts) as transaction_amounts
        FROM daily_stats
        WHERE date IS NOT NULL
        GROUP BY date
        ORDER BY date DESC
      `, [startDate, endDate]);
      
      const dailyData = masterResult.rows.map((row: any) => ({
        date: row.date,
        totalRecords: parseInt(row.total_records) || 0,
        fileCount: parseInt(row.file_count) || 0,
        totalTransactionValue: parseFloat(row.transaction_amounts) || 0,
        netDeposits: parseFloat(row.net_deposits) || 0,
        recordTypes: {
          'BH': parseInt(row.bh_records) || 0,
          'DT': parseInt(row.dt_records) || 0,
          'G2': parseInt(row.g2_records) || 0,
          'E1': parseInt(row.e1_records) || 0,
          'P1': parseInt(row.p1_records) || 0,
          'P2': parseInt(row.p2_records) || 0,
          'DR': parseInt(row.dr_records) || 0,
          'AD': parseInt(row.ad_records) || 0
        }
      }));
      
      console.log(`📅 MASTER fallback: Retrieved ${dailyData.length} days of data`);
      
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
      
      res.json({
        dailyData,
        startDate,
        endDate,
        dataSource: 'master_table',
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Error getting TDDF1 multi-day breakdown:", error);
      res.status(500).json({ error: "Failed to get multi-day breakdown" });
    }
  });

  // TDDF1 Files by Date - Returns detailed file information for a specific date
  app.get("/api/tddf1/files-by-date", isAuthenticated, async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split('T')[0];
      console.log(`📁 Getting file details for date: ${date}`);
      
      const masterTableName = getTableName('tddf_jsonb');
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Query for file details including upload metadata
      // Filter by PRIMARY batch date (from BH records) to show files where the main business day <= selected date
      // This prevents future-dated files from appearing just because they contain late transactions
      // Also get date ranges for each file to show in UI
      const filesResult = await pool.query(`
        WITH file_batch_dates AS (
          SELECT DISTINCT
            upload_id,
            MIN(extracted_fields->>'batchDate') as primary_batch_date,
            MAX(extracted_fields->>'batchDate') as max_batch_date
          FROM ${masterTableName}
          WHERE record_type = 'BH'
            AND extracted_fields->>'batchDate' ~ '^\\d{4}-\\d{2}-\\d{2}'
          GROUP BY upload_id
        ),
        file_transaction_dates AS (
          SELECT DISTINCT
            upload_id,
            MIN(extracted_fields->>'transactionDate') as min_transaction_date,
            MAX(extracted_fields->>'transactionDate') as max_transaction_date
          FROM ${masterTableName}
          WHERE record_type = 'DT'
            AND extracted_fields->>'transactionDate' ~ '^\\d{4}-\\d{2}-\\d{2}'
          GROUP BY upload_id
        )
        SELECT 
          u.id as upload_id,
          u.filename,
          u.start_time,
          u.uploaded_at,
          u.encoding_complete,
          u.file_size,
          u.business_day,
          fbd.primary_batch_date,
          fbd.max_batch_date,
          ftd.min_transaction_date,
          ftd.max_transaction_date,
          COUNT(*) as record_count,
          COUNT(CASE WHEN r.record_type = 'BH' THEN 1 END) as bh_count,
          COUNT(CASE WHEN r.record_type = 'DT' THEN 1 END) as dt_count,
          COUNT(CASE WHEN r.record_type = 'G2' THEN 1 END) as g2_count,
          COUNT(CASE WHEN r.record_type = 'E1' THEN 1 END) as e1_count,
          COUNT(CASE WHEN r.record_type = 'P1' THEN 1 END) as p1_count,
          COUNT(CASE WHEN r.record_type = 'P2' THEN 1 END) as p2_count,
          COUNT(CASE WHEN r.record_type = 'DR' THEN 1 END) as dr_count,
          COUNT(CASE WHEN r.record_type = 'AD' THEN 1 END) as ad_count,
          SUM(CASE 
            WHEN r.record_type = 'BH' AND r.extracted_fields->>'netDeposit' IS NOT NULL AND r.extracted_fields->>'netDeposit' != ''
            THEN (r.extracted_fields->>'netDeposit')::numeric 
            ELSE 0 
          END) as net_deposits,
          SUM(CASE 
            WHEN r.record_type = 'DT' AND r.extracted_fields->>'transactionAmount' IS NOT NULL AND r.extracted_fields->>'transactionAmount' != ''
            THEN (r.extracted_fields->>'transactionAmount')::numeric 
            ELSE 0 
          END) as transaction_amounts
        FROM ${masterTableName} r
        JOIN ${uploaderTableName} u ON r.upload_id = u.id
        JOIN file_batch_dates fbd ON r.upload_id = fbd.upload_id
        LEFT JOIN file_transaction_dates ftd ON r.upload_id = ftd.upload_id
        WHERE split_part(u.filename, '_', 4) ~ '^\\d{8}$'
          AND to_char(
            to_date(split_part(u.filename, '_', 4), 'MMDDYYYY'),
            'YYYY-MM-DD'
          ) = $1
          AND u.deleted_at IS NULL
        GROUP BY u.id, u.filename, u.start_time, u.uploaded_at, u.encoding_complete, u.file_size, u.business_day,
                 fbd.primary_batch_date, fbd.max_batch_date, ftd.min_transaction_date, ftd.max_transaction_date
        ORDER BY u.start_time DESC
      `, [date]);
      
      const files = filesResult.rows.map(f => {
        // Parse filename to extract scheduled slot and filename date
        const parsed = parseTddfFilename(f.filename);
        
        return {
          uploadId: f.upload_id,
          filename: f.filename,
          uploadTime: f.start_time,
          uploadComplete: f.uploaded_at,
          encodingComplete: f.encoding_complete,
          fileSize: f.file_size,
          businessDay: f.business_day,
          // Date information from records
          primaryBatchDate: f.primary_batch_date,
          maxBatchDate: f.max_batch_date,
          minTransactionDate: f.min_transaction_date,
          maxTransactionDate: f.max_transaction_date,
          // Parsed filename information
          scheduledSlot: parsed.scheduledSlotLabel,
          scheduledSlotRaw: parsed.scheduledSlotRaw,
          filenameDate: parsed.scheduledDateTime ? parsed.scheduledDateTime.toISOString().split('T')[0] : null,
          actualProcessTime: parsed.actualDateTime ? parsed.actualDateTime.toISOString() : null,
          processingDelaySeconds: parsed.processingDelaySeconds,
          totalRecords: parseInt(f.record_count) || 0,
          recordTypeCounts: {
            BH: parseInt(f.bh_count) || 0,
            DT: parseInt(f.dt_count) || 0,
            G2: parseInt(f.g2_count) || 0,
            E1: parseInt(f.e1_count) || 0,
            P1: parseInt(f.p1_count) || 0,
            P2: parseInt(f.p2_count) || 0,
            DR: parseInt(f.dr_count) || 0,
            AD: parseInt(f.ad_count) || 0
          },
          netDeposits: parseFloat(f.net_deposits) || 0,
          transactionAmounts: parseFloat(f.transaction_amounts) || 0
        };
      });
      
      console.log(`📁 Found ${files.length} files for ${date}`);
      
      res.json({
        date,
        fileCount: files.length,
        files,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("Error getting files by date:", error);
      res.status(500).json({ error: "Failed to get files by date" });
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

  // TDDF1 Dashboard Stats - Using CACHE (dev_tddf1_totals) with MASTER table fallback
  app.get("/api/tddf1/stats", isAuthenticated, async (req, res) => {
    try {
      console.log("📊 Getting TDDF1 stats from CACHE with master fallback");
      
      const totalsTableName = getTableName('tddf1_totals');
      const masterTableName = getTableName('tddf_jsonb');
      
      // Try reading from cache first (fast path)
      const cacheResult = await pool.query(`
        SELECT 
          COUNT(DISTINCT file_date) as active_dates,
          SUM(total_files) as total_files,
          SUM(total_records) as total_records,
          SUM(total_transaction_amounts) as total_transaction_amounts,
          SUM(total_net_deposits) as total_net_deposits,
          SUM(bh_records) as bh_records,
          SUM(dt_records) as dt_records,
          MAX(updated_at) as last_processed
        FROM ${totalsTableName}
      `);
      
      const cacheData = cacheResult.rows[0];
      const hasCacheData = parseInt(cacheData.total_records || '0') > 0;
      
      if (hasCacheData) {
        // Cache hit - return aggregated cache data
        const totalRecords = parseInt(cacheData.total_records) || 0;
        const totalFiles = parseInt(cacheData.total_files) || 0;
        const totalTransactionValue = parseFloat(cacheData.total_transaction_amounts) || 0;
        const activeDates = parseInt(cacheData.active_dates) || 0;
        
        const recordTypeBreakdown: Record<string, number> = {
          'BH': parseInt(cacheData.bh_records) || 0,
          'DT': parseInt(cacheData.dt_records) || 0,
          'P1': 0, // Not tracked in cache
          'P2': 0  // Not tracked in cache
        };
        
        console.log(`📊 ✅ CACHE HIT: ${totalFiles} files, ${totalRecords} records, $${totalTransactionValue.toLocaleString()}, ${activeDates} active dates`);
        
        return res.json({
          totalFiles: totalFiles,
          totalRecords: totalRecords,
          totalTransactionValue: totalTransactionValue,
          recordTypeBreakdown: recordTypeBreakdown,
          activeTables: activeDates,
          lastProcessedDate: cacheData.last_processed,
          cached: true,
          dataSource: 'pre_cache',
          tableName: totalsTableName,
          cacheDate: new Date().toISOString()
        });
      }
      
      // Cache miss - fall back to master table
      console.log(`📊 Cache empty, falling back to MASTER table: ${masterTableName}`);
      
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT upload_id) as total_files,
          COUNT(DISTINCT CASE 
            WHEN extracted_fields->>'batchDate' ~ '^\\d{4}-\\d{2}-\\d{2}' 
            THEN extracted_fields->>'batchDate' 
          END) as active_dates,
          COUNT(CASE WHEN record_type = 'BH' THEN 1 END) as bh_records,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) as dt_records,
          COUNT(CASE WHEN record_type = 'P1' THEN 1 END) as p1_records,
          COUNT(CASE WHEN record_type = 'P2' THEN 1 END) as p2_records,
          COALESCE(SUM(CASE WHEN record_type = 'BH' THEN (extracted_fields->>'netDeposit')::decimal END), 0) as total_net_deposits,
          COALESCE(SUM(CASE WHEN record_type = 'DT' THEN (extracted_fields->>'transactionAmount')::decimal END), 0) as total_transaction_amounts,
          MAX(created_at) as last_processed
        FROM ${masterTableName}
      `);
      
      const summary = statsResult.rows[0];
      const totalRecords = parseInt(summary.total_records) || 0;
      const totalFiles = parseInt(summary.total_files) || 0;
      const totalTransactionValue = parseFloat(summary.total_transaction_amounts) || 0;
      const activeDates = parseInt(summary.active_dates) || 0;
      
      const recordTypeBreakdown: Record<string, number> = {
        'BH': parseInt(summary.bh_records) || 0,
        'DT': parseInt(summary.dt_records) || 0,
        'P1': parseInt(summary.p1_records) || 0,
        'P2': parseInt(summary.p2_records) || 0
      };
      
      console.log(`📊 MASTER fallback: ${totalFiles} files, ${totalRecords} records, $${totalTransactionValue.toLocaleString()}, ${activeDates} active dates`);
      
      return res.json({
        totalFiles: totalFiles,
        totalRecords: totalRecords,
        totalTransactionValue: totalTransactionValue,
        recordTypeBreakdown: recordTypeBreakdown,
        activeTables: activeDates,
        lastProcessedDate: summary.last_processed,
        cached: false,
        dataSource: 'master_table',
        tableName: masterTableName,
        cacheDate: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting TDDF1 stats:", error);
      res.status(500).json({ error: "Failed to get TDDF1 stats" });
    }
  });

  // TDDF1 Recent Activity - Using MASTER table (dev_tddf_jsonb) for recent files
  app.get("/api/tddf1/recent-activity", isAuthenticated, async (req, res) => {
    try {
      console.log("📋 Getting TDDF1 recent activity from MASTER table");
      
      // Use MASTER table for clean, deduplicated data
      const masterTableName = getTableName('tddf_jsonb');
      const uploaderTableName = getTableName('uploader_uploads');
      
      console.log(`📋 Querying MASTER table: ${masterTableName}`);
      
      // Get recent files with record counts from master table
      const recentActivityResult = await pool.query(`
        SELECT 
          u.id,
          u.filename as file_name,
          u.created_at as processed_at,
          u.current_phase as status,
          COUNT(*) as record_count
        FROM ${masterTableName} r
        JOIN ${uploaderTableName} u ON r.upload_id = u.id
        WHERE u.final_file_type = 'tddf' 
          OR u.detected_file_type = 'tddf' 
          OR u.filename LIKE '%.TSYSO'
        GROUP BY u.id, u.filename, u.created_at, u.current_phase
        ORDER BY u.created_at DESC
        LIMIT 10
      `);
      
      const recentActivity = recentActivityResult.rows.map(row => ({
        id: row.id.toString(),
        fileName: row.file_name,
        recordCount: parseInt(row.record_count),
        processedAt: row.processed_at,
        status: row.status || 'encoded',
        tableName: masterTableName
      }));
      
      console.log(`📋 Found ${recentActivity.length} recent files in MASTER table`);
      
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

  // Queue Monitoring - Enhanced processing metrics for uploader system
  app.get("/api/uploader/queue-status", isAuthenticated, async (req, res) => {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      const timingTableName = getTableName('uploader_processing_timing');
      
      // Get counts by phase for ALL file types
      const phaseCounts = await pool.query(`
        SELECT 
          current_phase,
          final_file_type,
          COUNT(*) as count,
          MAX(updated_at) as most_recent
        FROM ${uploaderTableName}
        WHERE current_phase IN ('uploaded', 'identified', 'encoding', 'encoded', 'processing', 'completed', 'failed')
        GROUP BY current_phase, final_file_type
        ORDER BY current_phase
      `);
      
      // Get processing rate from last 10 completed files (gracefully handle missing timing table)
      let processingRate: any;
      try {
        processingRate = await pool.query(`
          SELECT 
            AVG(total_duration_seconds) as avg_processing_time,
            AVG(total_records_processed) as avg_records_per_file,
            AVG(records_per_second) as avg_records_per_second,
            COUNT(*) as sample_size
          FROM ${timingTableName}
          WHERE completed_at >= NOW() - INTERVAL '1 hour'
            AND total_records_processed > 0
          ORDER BY completed_at DESC
          LIMIT 10
        `);
      } catch (timingError: any) {
        // Table doesn't exist - return empty metrics
        if (timingError.code === '42P01') {
          processingRate = { rows: [{ avg_processing_time: null, avg_records_per_file: null, avg_records_per_second: null, sample_size: 0 }] };
        } else {
          throw timingError;
        }
      }
      
      // Get currently processing files with elapsed time (gracefully handle missing timing table)
      let currentlyProcessing: any;
      try {
        currentlyProcessing = await pool.query(`
          SELECT 
            u.id,
            u.filename,
            u.current_phase,
            u.final_file_type,
            u.updated_at,
            EXTRACT(EPOCH FROM (NOW() - u.updated_at)) as seconds_in_phase,
            t.total_records_processed,
            t.records_per_second
          FROM ${uploaderTableName} u
          LEFT JOIN ${timingTableName} t ON u.id = t.upload_id
          WHERE u.current_phase IN ('encoding', 'processing')
          ORDER BY u.updated_at ASC
        `);
      } catch (timingError: any) {
        // Table doesn't exist - query without JOIN
        if (timingError.code === '42P01') {
          currentlyProcessing = await pool.query(`
            SELECT 
              id,
              filename,
              current_phase as current_phase,
              final_file_type,
              updated_at,
              EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_in_phase,
              NULL as total_records_processed,
              NULL as records_per_second
            FROM ${uploaderTableName}
            WHERE current_phase IN ('encoding', 'processing')
            ORDER BY updated_at ASC
          `);
        } else {
          throw timingError;
        }
      }
      
      // Get files stuck in phases (> 5 minutes)
      const stuckFiles = await pool.query(`
        SELECT 
          id,
          filename,
          current_phase,
          final_file_type,
          updated_at,
          EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_stuck
        FROM ${uploaderTableName}
        WHERE current_phase IN ('uploaded', 'identified', 'encoded')
          AND updated_at < NOW() - INTERVAL '5 minutes'
        ORDER BY updated_at ASC
        LIMIT 10
      `);
      
      // Calculate phase breakdown
      const phaseBreakdown = phaseCounts.rows.reduce((acc: any, row: any) => {
        const phase = row.current_phase;
        if (!acc[phase]) {
          acc[phase] = { total: 0, byType: {}, mostRecent: row.most_recent };
        }
        acc[phase].total += parseInt(row.count);
        acc[phase].byType[row.final_file_type || 'unknown'] = parseInt(row.count);
        if (new Date(row.most_recent) > new Date(acc[phase].mostRecent)) {
          acc[phase].mostRecent = row.most_recent;
        }
        return acc;
      }, {});
      
      // Calculate estimated completion time for encoded files
      const encodedCount = phaseBreakdown.encoded?.total || 0;
      const avgProcessingTime = parseFloat(processingRate.rows[0]?.avg_processing_time || '120');
      const estimatedCompletionSeconds = encodedCount * avgProcessingTime;
      
      const response = {
        phases: phaseBreakdown,
        totals: {
          uploaded: phaseBreakdown.uploaded?.total || 0,
          identified: phaseBreakdown.identified?.total || 0,
          encoding: phaseBreakdown.encoding?.total || 0,
          encoded: phaseBreakdown.encoded?.total || 0,
          processing: phaseBreakdown.processing?.total || 0,
          completed: phaseBreakdown.completed?.total || 0,
          failed: phaseBreakdown.failed?.total || 0
        },
        processingMetrics: {
          avgProcessingTimeSeconds: parseFloat(processingRate.rows[0]?.avg_processing_time || '0'),
          avgRecordsPerFile: parseFloat(processingRate.rows[0]?.avg_records_per_file || '0'),
          avgRecordsPerSecond: parseFloat(processingRate.rows[0]?.avg_records_per_second || '0'),
          sampleSize: parseInt(processingRate.rows[0]?.sample_size || '0')
        },
        currentlyProcessing: currentlyProcessing.rows.map((row: any) => ({
          id: row.id,
          filename: row.filename,
          phase: row.current_phase,
          fileType: row.final_file_type,
          secondsInPhase: parseFloat(row.seconds_in_phase),
          recordsProcessed: parseInt(row.total_records_processed || '0'),
          recordsPerSecond: parseFloat(row.records_per_second || '0')
        })),
        stuckFiles: stuckFiles.rows.map((row: any) => ({
          id: row.id,
          filename: row.filename,
          phase: row.current_phase,
          fileType: row.final_file_type,
          secondsStuck: parseFloat(row.seconds_stuck),
          updatedAt: row.updated_at
        })),
        estimates: {
          encodedQueueCount: encodedCount,
          estimatedCompletionSeconds: estimatedCompletionSeconds,
          estimatedCompletionMinutes: Math.ceil(estimatedCompletionSeconds / 60)
        },
        lastUpdated: new Date().toISOString()
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error getting queue status:', error);
      res.status(500).json({ 
        error: 'Failed to get queue status',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
