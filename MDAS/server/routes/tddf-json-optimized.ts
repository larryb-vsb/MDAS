// Optimized TDDF JSON API routes for large dataset performance
import { Pool } from '@neondatabase/serverless';
import { getTableName } from '../env-config';

// Cache configuration for different endpoint types
const CACHE_CONFIG = {
  stats: { ttl: 5 * 60 * 1000, key: 'tddf-json-stats' }, // 5 minutes
  activity: { ttl: 10 * 60 * 1000, key: 'tddf-json-activity' }, // 10 minutes
  records: { ttl: 2 * 60 * 1000, key: 'tddf-json-records' }, // 2 minutes
  heatmap: { ttl: 15 * 60 * 1000, key: 'tddf-json-heatmap' } // 15 minutes
};

// In-memory cache with TTL
const cache = new Map<string, { data: any; timestamp: number; hits: number }>();

function getCachedData(key: string, ttl: number): any | null {
  const cached = cache.get(key);
  if (cached && (Date.now() - cached.timestamp) < ttl) {
    cached.hits++;
    console.log(`[CACHE-HIT] ${key} (${cached.hits} hits)`);
    return cached.data;
  }
  if (cached) {
    cache.delete(key);
    console.log(`[CACHE-EXPIRE] ${key} expired after ${cached.hits} hits`);
  }
  return null;
}

function setCachedData(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now(), hits: 0 });
  console.log(`[CACHE-SET] ${key} cached`);
}

// Database connection pool optimization
const optimizedPool = (pool: Pool) => {
  // Add connection pooling optimizations here if needed
  return pool;
};

// Optimized queries for large datasets
export const OptimizedTddfJsonQueries = {
  
  // High-performance stats query with pre-aggregated results
  async getStats(pool: Pool): Promise<any> {
    const cacheKey = CACHE_CONFIG.stats.key;
    const cached = getCachedData(cacheKey, CACHE_CONFIG.stats.ttl);
    if (cached) return cached;
    
    console.log('[TDDF-JSON-STATS-OPT] Cache miss, executing optimized query...');
    const startTime = Date.now();
    
    const environment = process.env.NODE_ENV || 'development';
    const tableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
    
    // Single optimized query for all stats using CTEs
    const statsResult = await pool.query(`
      WITH record_stats AS (
        SELECT 
          record_type,
          COUNT(*) as type_count,
          SUM(CASE 
            WHEN record_type = 'DT' AND extracted_fields->>'transactionAmount' ~ '^[0-9.]+$' 
            THEN (extracted_fields->>'transactionAmount')::numeric 
            ELSE 0 
          END) as total_amount
        FROM ${tableName}
        GROUP BY record_type
      ),
      file_stats AS (
        SELECT COUNT(DISTINCT filename) as unique_files
        FROM ${tableName}
      )
      SELECT 
        rs.record_type,
        rs.type_count,
        rs.total_amount,
        fs.unique_files,
        (SELECT SUM(type_count) FROM record_stats) as total_records
      FROM record_stats rs
      CROSS JOIN file_stats fs
      ORDER BY rs.type_count DESC
    `);
    
    // Process results
    const recordTypeBreakdown: { [key: string]: number } = {};
    let totalAmount = 0;
    let uniqueFiles = 0;
    let totalRecords = 0;
    
    statsResult.rows.forEach(row => {
      recordTypeBreakdown[row.record_type] = parseInt(row.type_count);
      if (row.record_type === 'DT') {
        totalAmount = parseFloat(row.total_amount) || 0;
      }
      uniqueFiles = parseInt(row.unique_files);
      totalRecords = parseInt(row.total_records);
    });
    
    const result = {
      totalRecords,
      recordTypeBreakdown,
      uniqueFiles,
      totalAmount,
      queryTime: Date.now() - startTime
    };
    
    setCachedData(cacheKey, result);
    console.log(`[TDDF-JSON-STATS-OPT] Query completed in ${result.queryTime}ms`);
    return result;
  },
  
  // High-performance activity query with smart aggregation
  async getActivity(pool: Pool, options: { year?: number; aggregation?: 'day' | 'week' | 'month' } = {}): Promise<any> {
    const { year = new Date().getFullYear(), aggregation = 'day' } = options;
    const cacheKey = `${CACHE_CONFIG.activity.key}-${year}-${aggregation}`;
    const cached = getCachedData(cacheKey, CACHE_CONFIG.activity.ttl);
    if (cached) return cached;
    
    console.log(`[TDDF-JSON-ACTIVITY-OPT] Cache miss, executing ${aggregation} aggregation for ${year}...`);
    const startTime = Date.now();
    
    const environment = process.env.NODE_ENV || 'development';
    const tableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
    
    let dateGroupBy: string;
    let dateSelect: string;
    
    switch (aggregation) {
      case 'week':
        dateGroupBy = "DATE_TRUNC('week', (extracted_fields->>'transactionDate')::date)";
        dateSelect = "DATE_TRUNC('week', (extracted_fields->>'transactionDate')::date) as transaction_date";
        break;
      case 'month':
        dateGroupBy = "DATE_TRUNC('month', (extracted_fields->>'transactionDate')::date)";
        dateSelect = "DATE_TRUNC('month', (extracted_fields->>'transactionDate')::date) as transaction_date";
        break;
      default: // day
        dateGroupBy = "DATE((extracted_fields->>'transactionDate')::date)";
        dateSelect = "DATE((extracted_fields->>'transactionDate')::date) as transaction_date";
    }
    
    // Optimized query with proper indexing hints
    const activityResult = await pool.query(`
      SELECT 
        ${dateSelect},
        COUNT(*) as transaction_count,
        SUM(CASE 
          WHEN extracted_fields->>'transactionAmount' ~ '^[0-9.]+$' 
          THEN (extracted_fields->>'transactionAmount')::numeric 
          ELSE 0 
        END) as total_amount
      FROM ${tableName}
      WHERE record_type = 'DT'
        AND extracted_fields->>'transactionDate' IS NOT NULL
        AND extracted_fields->>'transactionDate' != ''
        AND EXTRACT(YEAR FROM (extracted_fields->>'transactionDate')::date) = $1
      GROUP BY ${dateGroupBy}
      ORDER BY transaction_date DESC
      LIMIT 366
    `, [year]);
    
    const queryTime = Date.now() - startTime;
    const result = {
      records: activityResult.rows,
      queryTime,
      aggregation,
      year,
      totalDataPoints: activityResult.rows.length
    };
    
    setCachedData(cacheKey, result);
    console.log(`[TDDF-JSON-ACTIVITY-OPT] ${aggregation} query completed in ${queryTime}ms, ${result.totalDataPoints} data points`);
    return result;
  },
  
  // High-performance records query with smart pagination
  async getRecords(pool: Pool, options: {
    page?: number;
    limit?: number;
    recordType?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    dateFilter?: string;
  } = {}): Promise<any> {
    const {
      page = 1,
      limit = 50,
      recordType,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc',
      dateFilter
    } = options;
    
    // Smart caching based on query parameters
    const queryHash = JSON.stringify(options);
    const cacheKey = `${CACHE_CONFIG.records.key}-${Buffer.from(queryHash).toString('base64').slice(0, 16)}`;
    const cached = getCachedData(cacheKey, CACHE_CONFIG.records.ttl);
    if (cached) return cached;
    
    console.log(`[TDDF-JSON-RECORDS-OPT] Cache miss, executing paginated query...`);
    const startTime = Date.now();
    
    const environment = process.env.NODE_ENV || 'development';
    const tableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
    const offset = (page - 1) * limit;
    
    // Build WHERE clauses dynamically
    const whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;
    
    if (recordType && recordType !== 'all') {
      whereConditions.push(`record_type = $${paramIndex++}`);
      queryParams.push(recordType);
    }
    
    if (search) {
      whereConditions.push(`(
        filename ILIKE $${paramIndex} OR 
        raw_line ILIKE $${paramIndex} OR
        extracted_fields::text ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    if (dateFilter) {
      whereConditions.push(`DATE(extracted_fields->>'transactionDate') = $${paramIndex++}`);
      queryParams.push(dateFilter);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Validate sort column for security
    const allowedSortColumns = ['created_at', 'line_number', 'filename', 'record_type'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    // Execute count and records queries in parallel for performance
    const [countResult, recordsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`, queryParams),
      pool.query(`
        SELECT 
          id, upload_id, filename, record_type, line_number, 
          LEFT(raw_line, 200) as raw_line_preview,
          extracted_fields,
          created_at
        FROM ${tableName}
        ${whereClause}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...queryParams, limit, offset])
    ]);
    
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);
    const queryTime = Date.now() - startTime;
    
    const result = {
      records: recordsResult.rows,
      total,
      totalPages,
      currentPage: page,
      limit,
      queryTime
    };
    
    // Cache smaller result sets for longer
    const cacheTime = total < 1000 ? CACHE_CONFIG.records.ttl * 2 : CACHE_CONFIG.records.ttl;
    setCachedData(cacheKey, result);
    console.log(`[TDDF-JSON-RECORDS-OPT] Query completed in ${queryTime}ms, ${recordsResult.rows.length}/${total} records`);
    return result;
  },
  
  // Performance analytics and cache status
  getCacheStats(): any {
    const stats = {
      totalCachedItems: cache.size,
      cacheEntries: Array.from(cache.entries()).map(([key, value]) => ({
        key,
        age: Date.now() - value.timestamp,
        hits: value.hits,
        size: JSON.stringify(value.data).length
      }))
    };
    
    return stats;
  },
  
  // Clear cache for testing/debugging
  clearCache(pattern?: string): void {
    if (pattern) {
      const keysToDelete = Array.from(cache.keys()).filter(key => key.includes(pattern));
      keysToDelete.forEach(key => cache.delete(key));
      console.log(`[CACHE-CLEAR] Cleared ${keysToDelete.length} entries matching '${pattern}'`);
    } else {
      cache.clear();
      console.log('[CACHE-CLEAR] All cache entries cleared');
    }
  }
};