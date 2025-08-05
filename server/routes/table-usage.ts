import { Request, Response } from 'express';
import { db } from "../db";
import { sql } from "drizzle-orm";

interface TableSizeInfo {
  tableName: string;
  sizeBytes: number;
  sizeMB: number;
  sizeGB: number;
  rowCount: number;
  lastScanTime: string;
}

interface TableUsageCache {
  lastScan: string;
  tables: TableSizeInfo[];
  totalSizeBytes: number;
  totalSizeMB: number;
  totalSizeGB: number;
  totalTables: number;
}

let cachedTableUsage: TableUsageCache | null = null;

/**
 * Format bytes to appropriate unit (MB/GB)
 */
function formatBytes(bytes: number): { mb: number; gb: number } {
  const mb = bytes / (1024 * 1024);
  const gb = bytes / (1024 * 1024 * 1024);
  return { mb: Math.round(mb * 100) / 100, gb: Math.round(gb * 100) / 100 };
}

/**
 * Scan all tables and get size information
 */
async function scanTableUsage(): Promise<TableUsageCache> {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const tablePrefix = environment === 'production' ? '' : 'dev_';
    
    console.log(`[TABLE-USAGE] Starting manual scan for ${environment} environment...`);
    
    // Get all tables with size information from PostgreSQL system catalogs
    const query = sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size_pretty,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes,
        (SELECT count(*) FROM information_schema.tables WHERE table_name = tablename AND table_schema = schemaname) as table_exists
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename LIKE ${`${tablePrefix}%`}
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `;
    
    const result = await db.execute(query);
    const tables: TableSizeInfo[] = [];
    let totalBytes = 0;
    
    for (const row of result.rows) {
      const tableName = row.tablename as string;
      const sizeBytes = parseInt(row.size_bytes as string) || 0;
      const { mb, gb } = formatBytes(sizeBytes);
      
      // Get row count for each table
      let rowCount = 0;
      try {
        const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM ${sql.identifier(tableName)}`);
        rowCount = parseInt(countResult.rows[0]?.count as string) || 0;
      } catch (error) {
        console.log(`[TABLE-USAGE] Could not get row count for ${tableName}:`, error);
      }
      
      tables.push({
        tableName,
        sizeBytes,
        sizeMB: mb,
        sizeGB: gb,
        rowCount,
        lastScanTime: new Date().toISOString()
      });
      
      totalBytes += sizeBytes;
    }
    
    const { mb: totalMB, gb: totalGB } = formatBytes(totalBytes);
    
    const usage: TableUsageCache = {
      lastScan: new Date().toISOString(),
      tables,
      totalSizeBytes: totalBytes,
      totalSizeMB: totalMB,
      totalSizeGB: totalGB,
      totalTables: tables.length
    };
    
    console.log(`[TABLE-USAGE] Scan complete: ${tables.length} tables, ${totalGB} GB total`);
    return usage;
    
  } catch (error) {
    console.error('[TABLE-USAGE] Error scanning table usage:', error);
    throw error;
  }
}

/**
 * Get cached table usage (last scan results)
 */
export async function getCachedTableUsage(req: Request, res: Response) {
  try {
    if (!cachedTableUsage) {
      return res.status(404).json({ 
        error: 'No scan results available. Please run a manual scan first.',
        hasData: false
      });
    }
    
    res.json({
      hasData: true,
      ...cachedTableUsage,
      scanAge: Math.round((Date.now() - new Date(cachedTableUsage.lastScan).getTime()) / 1000)
    });
    
  } catch (error) {
    console.error('[TABLE-USAGE] Error getting cached usage:', error);
    res.status(500).json({ 
      error: 'Failed to get cached table usage',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Perform manual table usage scan
 */
export async function performTableUsageScan(req: Request, res: Response) {
  try {
    console.log('[TABLE-USAGE] Manual scan requested');
    
    const usage = await scanTableUsage();
    cachedTableUsage = usage;
    
    res.json({
      success: true,
      message: `Scanned ${usage.totalTables} tables`,
      ...usage
    });
    
  } catch (error) {
    console.error('[TABLE-USAGE] Error performing scan:', error);
    res.status(500).json({ 
      error: 'Failed to perform table usage scan',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Get table usage refresh status
 */
export async function getTableUsageStatus(req: Request, res: Response) {
  try {
    const environment = process.env.NODE_ENV || 'development';
    
    res.json({
      environment,
      hasCache: !!cachedTableUsage,
      lastScan: cachedTableUsage?.lastScan || null,
      scanAge: cachedTableUsage ? Math.round((Date.now() - new Date(cachedTableUsage.lastScan).getTime()) / 1000) : null,
      totalTables: cachedTableUsage?.totalTables || 0,
      totalSizeGB: cachedTableUsage?.totalSizeGB || 0
    });
    
  } catch (error) {
    console.error('[TABLE-USAGE] Error getting status:', error);
    res.status(500).json({ 
      error: 'Failed to get table usage status'
    });
  }
}