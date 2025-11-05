import { Router } from 'express';
import type { Request, Response } from 'express';
import { db, pool } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Database health check endpoint - comprehensive validation
router.get('/api/database/health', async (req: Request, res: Response) => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const tablePrefix = environment === 'production' ? '' : 'dev_';
    
    const healthChecks = {
      timestamp: new Date().toISOString(),
      environment,
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      checks: {
        connection: { status: 'unknown', message: '' },
        tables: { status: 'unknown', message: '', missing: [] as string[] },
        indexes: { status: 'unknown', message: '', missing: [] as string[] },
        orphanedRecords: { status: 'unknown', message: '', count: 0 },
        stuckFiles: { status: 'unknown', message: '', count: 0 },
        cacheIntegrity: { status: 'unknown', message: '', issues: [] as string[] }
      },
      stats: {
        totalUploads: 0,
        activeUploads: 0,
        tddfFiles: 0,
        terminalFiles: 0,
        merchantFiles: 0,
        archivedFiles: 0
      }
    };

    // 1. Check database connection
    try {
      await db.execute(sql`SELECT 1`);
      healthChecks.checks.connection.status = 'pass';
      healthChecks.checks.connection.message = 'Database connection successful';
    } catch (error: any) {
      healthChecks.checks.connection.status = 'fail';
      healthChecks.checks.connection.message = `Connection failed: ${error.message}`;
      healthChecks.status = 'unhealthy';
    }

    // 2. Check required tables exist
    const requiredTables = [
      `${tablePrefix}uploader_uploads`,
      `${tablePrefix}tddf1_totals`,
      `${tablePrefix}tddf_api_queue`,
      `${tablePrefix}tddf_master`,
      `${tablePrefix}merchants`,
      `${tablePrefix}terminals`,
      `${tablePrefix}tddf_archive`,
      `${tablePrefix}uploader_processing_timing`,
      `${tablePrefix}connection_log`,
      `${tablePrefix}ip_blocklist`,
      `${tablePrefix}host_approvals`,
      `${tablePrefix}api_keys`
    ];

    try {
      const tableCheckResults = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = ANY(${requiredTables})
      `);
      
      const existingTables = tableCheckResults.rows.map((r: any) => r.table_name);
      const missingTables = requiredTables.filter(t => !existingTables.includes(t));
      
      if (missingTables.length === 0) {
        healthChecks.checks.tables.status = 'pass';
        healthChecks.checks.tables.message = `All ${requiredTables.length} required tables exist`;
      } else {
        healthChecks.checks.tables.status = 'fail';
        healthChecks.checks.tables.message = `Missing ${missingTables.length} tables`;
        healthChecks.checks.tables.missing = missingTables;
        healthChecks.status = 'unhealthy';
      }
    } catch (error: any) {
      healthChecks.checks.tables.status = 'fail';
      healthChecks.checks.tables.message = `Table check failed: ${error.message}`;
      healthChecks.status = 'unhealthy';
    }

    // 3. Check critical indexes exist
    const criticalIndexes = [
      { table: `${tablePrefix}tddf_master`, column: 'upload_id' },
      { table: `${tablePrefix}tddf_master`, column: 'business_date' },
      { table: `${tablePrefix}tddf_api_queue`, column: 'upload_id' },
      { table: `${tablePrefix}uploader_uploads`, column: 'current_phase' },
      { table: `${tablePrefix}uploader_uploads`, column: 'deleted_at' }
    ];

    try {
      const indexResults = await db.execute(sql`
        SELECT 
          t.tablename as table_name,
          i.indexname as index_name,
          array_agg(a.attname) as columns
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.indexname
        JOIN pg_attribute a ON a.attrelid = c.oid
        JOIN pg_tables t ON t.tablename = i.tablename
        WHERE t.schemaname = 'public'
          AND i.tablename = ANY(${requiredTables})
        GROUP BY t.tablename, i.indexname
      `);

      const missingIndexes: string[] = [];
      for (const idx of criticalIndexes) {
        const indexExists = indexResults.rows.some((r: any) => 
          r.table_name === idx.table && 
          (r.columns || []).includes(idx.column)
        );
        
        if (!indexExists) {
          missingIndexes.push(`${idx.table}.${idx.column}`);
        }
      }

      if (missingIndexes.length === 0) {
        healthChecks.checks.indexes.status = 'pass';
        healthChecks.checks.indexes.message = 'All critical indexes exist';
      } else {
        healthChecks.checks.indexes.status = 'warn';
        healthChecks.checks.indexes.message = `Missing ${missingIndexes.length} recommended indexes`;
        healthChecks.checks.indexes.missing = missingIndexes;
        if (healthChecks.status === 'healthy') {
          healthChecks.status = 'degraded';
        }
      }
    } catch (error: any) {
      healthChecks.checks.indexes.status = 'warn';
      healthChecks.checks.indexes.message = `Index check skipped: ${error.message}`;
    }

    // 4. Check for orphaned records (records in master table without upload record)
    try {
      const orphanedResult = await pool.query(`
        SELECT COUNT(DISTINCT upload_id) as count
        FROM ${tablePrefix}tddf_master
        WHERE upload_id NOT IN (
          SELECT id FROM ${tablePrefix}uploader_uploads
        )
      `);
      
      const orphanedCount = parseInt(orphanedResult.rows[0]?.count || '0');
      
      if (orphanedCount === 0) {
        healthChecks.checks.orphanedRecords.status = 'pass';
        healthChecks.checks.orphanedRecords.message = 'No orphaned records found';
      } else {
        healthChecks.checks.orphanedRecords.status = 'warn';
        healthChecks.checks.orphanedRecords.message = `Found ${orphanedCount} orphaned upload_ids`;
        healthChecks.checks.orphanedRecords.count = orphanedCount;
        if (healthChecks.status === 'healthy') {
          healthChecks.status = 'degraded';
        }
      }
    } catch (error: any) {
      healthChecks.checks.orphanedRecords.status = 'warn';
      healthChecks.checks.orphanedRecords.message = `Orphan check skipped: ${error.message}`;
    }

    // 5. Check for stuck files in processing phases
    try {
      const stuckResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM ${tablePrefix}uploader_uploads
        WHERE current_phase IN ('processing', 'encoding', 'validating')
          AND last_updated < NOW() - INTERVAL '30 minutes'
          AND deleted_at IS NULL
          AND is_archived = false
      `);
      
      const stuckCount = parseInt(stuckResult.rows[0]?.count || '0');
      
      if (stuckCount === 0) {
        healthChecks.checks.stuckFiles.status = 'pass';
        healthChecks.checks.stuckFiles.message = 'No stuck files detected';
      } else {
        healthChecks.checks.stuckFiles.status = 'warn';
        healthChecks.checks.stuckFiles.message = `Found ${stuckCount} potentially stuck files`;
        healthChecks.checks.stuckFiles.count = stuckCount;
        if (healthChecks.status === 'healthy') {
          healthChecks.status = 'degraded';
        }
      }
    } catch (error: any) {
      healthChecks.checks.stuckFiles.status = 'warn';
      healthChecks.checks.stuckFiles.message = `Stuck files check skipped: ${error.message}`;
    }

    // 6. Check cache integrity (TDDF files should have cache entries)
    try {
      const cacheResult = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE u.final_file_type = 'tddf' AND u.current_phase = 'encoded') as encoded_tddf,
          COUNT(*) FILTER (WHERE c.upload_id IS NOT NULL) as cached_files
        FROM ${tablePrefix}uploader_uploads u
        LEFT JOIN ${tablePrefix}tddf1_totals c ON u.id = c.upload_id
        WHERE u.final_file_type = 'tddf' 
          AND u.current_phase = 'encoded'
          AND u.deleted_at IS NULL
          AND u.is_archived = false
      `);
      
      const encodedTddf = parseInt(cacheResult.rows[0]?.encoded_tddf || '0');
      const cachedFiles = parseInt(cacheResult.rows[0]?.cached_files || '0');
      const issues: string[] = [];
      
      if (encodedTddf > cachedFiles) {
        issues.push(`${encodedTddf - cachedFiles} encoded TDDF files missing cache entries`);
      }
      
      if (issues.length === 0) {
        healthChecks.checks.cacheIntegrity.status = 'pass';
        healthChecks.checks.cacheIntegrity.message = 'Cache integrity verified';
      } else {
        healthChecks.checks.cacheIntegrity.status = 'warn';
        healthChecks.checks.cacheIntegrity.message = 'Cache integrity issues detected';
        healthChecks.checks.cacheIntegrity.issues = issues;
        if (healthChecks.status === 'healthy') {
          healthChecks.status = 'degraded';
        }
      }
    } catch (error: any) {
      healthChecks.checks.cacheIntegrity.status = 'warn';
      healthChecks.checks.cacheIntegrity.message = `Cache check skipped: ${error.message}`;
    }

    // 7. Gather statistics
    try {
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_uploads,
          COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_archived = false) as active_uploads,
          COUNT(*) FILTER (WHERE final_file_type = 'tddf' AND deleted_at IS NULL) as tddf_files,
          COUNT(*) FILTER (WHERE final_file_type = 'terminal' AND deleted_at IS NULL) as terminal_files,
          COUNT(*) FILTER (WHERE final_file_type = 'merchant_detail' AND deleted_at IS NULL) as merchant_files,
          COUNT(*) FILTER (WHERE is_archived = true) as archived_files
        FROM ${tablePrefix}uploader_uploads
      `);
      
      if (statsResult.rows[0]) {
        healthChecks.stats.totalUploads = parseInt(statsResult.rows[0].total_uploads || '0');
        healthChecks.stats.activeUploads = parseInt(statsResult.rows[0].active_uploads || '0');
        healthChecks.stats.tddfFiles = parseInt(statsResult.rows[0].tddf_files || '0');
        healthChecks.stats.terminalFiles = parseInt(statsResult.rows[0].terminal_files || '0');
        healthChecks.stats.merchantFiles = parseInt(statsResult.rows[0].merchant_files || '0');
        healthChecks.stats.archivedFiles = parseInt(statsResult.rows[0].archived_files || '0');
      }
    } catch (error: any) {
      console.error('[DATABASE-HEALTH] Stats gathering failed:', error);
    }

    res.json(healthChecks);
  } catch (error: any) {
    console.error('[DATABASE-HEALTH] Health check failed:', error);
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Quick ping endpoint for monitoring
router.get('/api/database/ping', async (req: Request, res: Response) => {
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    
    res.json({
      status: 'ok',
      latency_ms: latency,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Schema validation endpoint - validates database schema completeness
router.get('/api/database/schema-validation', async (req: Request, res: Response) => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const tablePrefix = environment === 'production' ? '' : 'dev_';
    
    const validation = {
      timestamp: new Date().toISOString(),
      environment,
      status: 'valid' as 'valid' | 'incomplete' | 'error',
      tables: {
        required: [] as string[],
        existing: [] as string[],
        missing: [] as string[]
      },
      columns: {
        issues: [] as { table: string, column: string, issue: string }[]
      },
      indexes: {
        recommended: [] as string[],
        existing: [] as string[],
        missing: [] as string[]
      }
    };

    // Define required tables and their critical columns
    const requiredSchema = [
      {
        table: `${tablePrefix}uploader_uploads`,
        criticalColumns: ['id', 'filename', 'current_phase', 'final_file_type', 'deleted_at', 'is_archived']
      },
      {
        table: `${tablePrefix}tddf1_totals`,
        criticalColumns: ['id', 'upload_id', 'filename', 'total_records']
      },
      {
        table: `${tablePrefix}tddf_master`,
        criticalColumns: ['id', 'upload_id', 'business_date', 'record_type']
      },
      {
        table: `${tablePrefix}tddf_api_queue`,
        criticalColumns: ['id', 'upload_id', 'record_type']
      },
      {
        table: `${tablePrefix}merchants`,
        criticalColumns: ['id', 'dba_name', 'merchant_number']
      },
      {
        table: `${tablePrefix}terminals`,
        criticalColumns: ['id', 'v_number', 'terminal_id']
      },
      {
        table: `${tablePrefix}tddf_archive`,
        criticalColumns: ['id', 'original_upload_id', 'filename']
      },
      {
        table: `${tablePrefix}uploader_processing_timing`,
        criticalColumns: ['id', 'upload_id', 'records_processed']
      },
      {
        table: `${tablePrefix}api_keys`,
        criticalColumns: ['id', 'username', 'key_name', 'is_active']
      },
      {
        table: `${tablePrefix}connection_log`,
        criticalColumns: ['id', 'timestamp', 'client_ip', 'endpoint']
      },
      {
        table: `${tablePrefix}host_approvals`,
        criticalColumns: ['id', 'hostname', 'api_key_prefix', 'approval_status']
      },
      {
        table: `${tablePrefix}ip_blocklist`,
        criticalColumns: ['id', 'ip_address', 'is_active']
      }
    ];

    validation.tables.required = requiredSchema.map(s => s.table);

    // Check which tables exist
    const existingTablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `, [validation.tables.required]);

    validation.tables.existing = existingTablesResult.rows.map((r: any) => r.table_name);
    validation.tables.missing = validation.tables.required.filter(
      t => !validation.tables.existing.includes(t)
    );

    // For existing tables, check if critical columns exist
    for (const schema of requiredSchema) {
      if (!validation.tables.existing.includes(schema.table)) {
        continue; // Skip if table doesn't exist
      }

      const columnsResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = $1
      `, [schema.table]);

      const existingColumns = columnsResult.rows.map((r: any) => r.column_name);
      
      for (const column of schema.criticalColumns) {
        if (!existingColumns.includes(column)) {
          validation.columns.issues.push({
            table: schema.table,
            column,
            issue: 'missing'
          });
        }
      }
    }

    // Check recommended indexes
    const recommendedIndexes = [
      `${tablePrefix}uploader_uploads (current_phase)`,
      `${tablePrefix}uploader_uploads (deleted_at, is_archived)`,
      `${tablePrefix}tddf_master (upload_id)`,
      `${tablePrefix}tddf_master (business_date)`,
      `${tablePrefix}tddf_api_queue (upload_id)`,
      `${tablePrefix}connection_log (timestamp)`,
      `${tablePrefix}api_keys (is_active)`
    ];

    validation.indexes.recommended = recommendedIndexes;

    // Note: Full index checking is complex, so we'll just note what's recommended
    // The health endpoint does more thorough index checking

    // Determine overall status
    if (validation.tables.missing.length > 0 || validation.columns.issues.length > 0) {
      validation.status = 'incomplete';
    }

    res.json(validation);
  } catch (error: any) {
    console.error('[DATABASE-HEALTH] Schema validation failed:', error);
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      error: error.message
    });
  }
});

export default router;
