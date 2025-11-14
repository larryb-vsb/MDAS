/**
 * Pre-Cache Background Job
 * 
 * Scheduled job that runs periodically to pre-calculate monthly cache data.
 * Uses node-schedule to run at configurable intervals.
 */

import * as schedule from 'node-schedule';
import { PreCacheService } from './pre-cache-service';
import { pool } from '../db';
import { getTableName } from '../table-config';

let job: schedule.Job | null = null;
let isRunning = false;
let lastRunTime: Date | null = null;
let lastRunStatus: 'success' | 'error' | null = null;
let lastRunMessage: string | null = null;

/**
 * Pre-cache job configuration
 */
interface PreCacheJobConfig {
  enabled: boolean;
  cronSchedule: string; // Default: '0 */2 * * *' (every 2 hours)
  rebuildAll: boolean; // If true, rebuild all months; if false, only rebuild expired/recent months
}

const defaultConfig: PreCacheJobConfig = {
  enabled: true,
  cronSchedule: '0 */2 * * *', // Every 2 hours
  rebuildAll: false
};

/**
 * Execute the pre-cache job
 */
async function executePreCacheJob() {
  if (isRunning) {
    console.log('[PRE-CACHE-JOB] Job already running, skipping this run');
    return;
  }
  
  isRunning = true;
  lastRunTime = new Date();
  
  console.log('[PRE-CACHE-JOB] ========== Starting Pre-Cache Job ==========');
  console.log('[PRE-CACHE-JOB] Run time:', lastRunTime.toISOString());
  
  try {
    const config = await getJobConfig();
    
    if (!config.enabled) {
      console.log('[PRE-CACHE-JOB] Job is disabled, skipping');
      lastRunStatus = 'success';
      lastRunMessage = 'Job disabled';
      return;
    }
    
    if (config.rebuildAll) {
      // Rebuild all months with data
      console.log('[PRE-CACHE-JOB] Rebuilding all months');
      const result = await PreCacheService.rebuildAllMonths('scheduled', 'pre-cache-job');
      
      console.log(`[PRE-CACHE-JOB] ✅ Rebuilt ${result.rebuilt} months, ${result.failed} failed`);
      lastRunStatus = 'success';
      lastRunMessage = `Rebuilt ${result.rebuilt} months, ${result.failed} failed`;
    } else {
      // Only rebuild expired and recent months
      console.log('[PRE-CACHE-JOB] Rebuilding expired and recent months');
      const monthsToRebuild = await findMonthsToRebuild();
      
      let rebuilt = 0;
      let failed = 0;
      
      for (const { year, month } of monthsToRebuild) {
        try {
          await PreCacheService.buildMonthlyCache({
            year,
            month,
            triggeredBy: 'scheduled',
            triggeredByUser: 'pre-cache-job',
            triggerReason: 'scheduled_rebuild'
          });
          rebuilt++;
          console.log(`[PRE-CACHE-JOB] ✅ Rebuilt ${year}-${month.toString().padStart(2, '0')}`);
        } catch (error: any) {
          failed++;
          console.error(`[PRE-CACHE-JOB] ❌ Failed to rebuild ${year}-${month}:`, error.message);
        }
      }
      
      console.log(`[PRE-CACHE-JOB] ✅ Rebuilt ${rebuilt} months, ${failed} failed`);
      lastRunStatus = 'success';
      lastRunMessage = `Rebuilt ${rebuilt} months, ${failed} failed`;
    }
  } catch (error: any) {
    console.error('[PRE-CACHE-JOB] ❌ Job failed:', error);
    lastRunStatus = 'error';
    lastRunMessage = error.message;
  } finally {
    isRunning = false;
    console.log('[PRE-CACHE-JOB] ========== Pre-Cache Job Complete ==========');
  }
}

/**
 * Find months that need to be rebuilt
 * Returns months that are:
 * 1. Marked as expired
 * 2. Within the last 3 months (to keep recent data fresh)
 */
async function findMonthsToRebuild(): Promise<Array<{ year: number; month: number }>> {
  const monthlyCacheTable = getTableName('tddf1_monthly_cache');
  const masterTableName = getTableName('tddf_jsonb');
  
  try {
    // Get expired months
    const expiredResult = await pool.query(`
      SELECT year, month
      FROM ${monthlyCacheTable}
      WHERE status = 'expired'
      ORDER BY year DESC, month DESC
    `);
    
    // Get last 3 months that have data
    const recentResult = await pool.query(`
      SELECT DISTINCT
        EXTRACT(YEAR FROM tddf_processing_date)::integer as year,
        EXTRACT(MONTH FROM tddf_processing_date)::integer as month
      FROM ${masterTableName}
      WHERE tddf_processing_date IS NOT NULL
        AND tddf_processing_date >= CURRENT_DATE - INTERVAL '3 months'
      ORDER BY year DESC, month DESC
    `);
    
    // Combine and deduplicate
    const months = new Map<string, { year: number; month: number }>();
    
    for (const row of expiredResult.rows) {
      const key = `${row.year}-${row.month}`;
      months.set(key, { year: row.year, month: row.month });
    }
    
    for (const row of recentResult.rows) {
      const key = `${row.year}-${row.month}`;
      months.set(key, { year: row.year, month: row.month });
    }
    
    return Array.from(months.values());
  } catch (error) {
    console.error('[PRE-CACHE-JOB] Error finding months to rebuild:', error);
    return [];
  }
}

/**
 * Get job configuration from database or use defaults
 */
async function getJobConfig(): Promise<PreCacheJobConfig> {
  try {
    const systemSettingsTable = getTableName('system_settings');
    
    const result = await pool.query(`
      SELECT setting_key, setting_value
      FROM ${systemSettingsTable}
      WHERE setting_key IN ('pre_cache_job_enabled', 'pre_cache_job_cron', 'pre_cache_job_rebuild_all')
    `);
    
    const config = { ...defaultConfig };
    
    for (const row of result.rows) {
      if (row.setting_key === 'pre_cache_job_enabled') {
        config.enabled = row.setting_value === 'true';
      } else if (row.setting_key === 'pre_cache_job_cron') {
        config.cronSchedule = row.setting_value;
      } else if (row.setting_key === 'pre_cache_job_rebuild_all') {
        config.rebuildAll = row.setting_value === 'true';
      }
    }
    
    return config;
  } catch (error) {
    console.error('[PRE-CACHE-JOB] Error loading config, using defaults:', error);
    return defaultConfig;
  }
}

/**
 * Initialize the pre-cache job
 */
export async function initializePreCacheJob() {
  console.log('[PRE-CACHE-JOB] Initializing pre-cache background job');
  
  const config = await getJobConfig();
  
  if (!config.enabled) {
    console.log('[PRE-CACHE-JOB] Job is disabled, not scheduling');
    return;
  }
  
  // Schedule the job
  job = schedule.scheduleJob(config.cronSchedule, executePreCacheJob);
  
  console.log(`[PRE-CACHE-JOB] ✅ Scheduled with cron: ${config.cronSchedule}`);
  console.log('[PRE-CACHE-JOB] Job will run every 2 hours to rebuild expired and recent monthly caches');
  
  // Run immediately on startup if needed
  const shouldRunOnStartup = process.env.PRE_CACHE_RUN_ON_STARTUP === 'true';
  if (shouldRunOnStartup) {
    console.log('[PRE-CACHE-JOB] Running initial pre-cache build on startup');
    setImmediate(() => executePreCacheJob());
  }
}

/**
 * Stop the pre-cache job
 */
export function stopPreCacheJob() {
  if (job) {
    job.cancel();
    job = null;
    console.log('[PRE-CACHE-JOB] Job stopped');
  }
}

/**
 * Manually trigger the pre-cache job
 */
export async function triggerPreCacheJob(): Promise<{ success: boolean; message: string }> {
  if (isRunning) {
    return {
      success: false,
      message: 'Job is already running'
    };
  }
  
  console.log('[PRE-CACHE-JOB] Manual trigger requested');
  
  // Run asynchronously
  setImmediate(() => executePreCacheJob());
  
  return {
    success: true,
    message: 'Pre-cache job started'
  };
}

/**
 * Get job status
 */
export function getPreCacheJobStatus() {
  return {
    isRunning,
    lastRunTime: lastRunTime ? lastRunTime.toISOString() : null,
    lastRunStatus,
    lastRunMessage,
    nextRunTime: job?.nextInvocation()?.toISOString() || null,
    isScheduled: job !== null
  };
}

/**
 * Update job configuration
 */
export async function updatePreCacheJobConfig(config: Partial<PreCacheJobConfig>) {
  try {
    const systemSettingsTable = getTableName('system_settings');
    
    if (config.enabled !== undefined) {
      await pool.query(`
        INSERT INTO ${systemSettingsTable} (setting_key, setting_value, setting_type, description)
        VALUES ('pre_cache_job_enabled', $1, 'boolean', 'Enable/disable pre-cache background job')
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1, updated_at = NOW()
      `, [config.enabled ? 'true' : 'false']);
    }
    
    if (config.cronSchedule) {
      await pool.query(`
        INSERT INTO ${systemSettingsTable} (setting_key, setting_value, setting_type, description)
        VALUES ('pre_cache_job_cron', $1, 'string', 'Cron schedule for pre-cache job')
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1, updated_at = NOW()
      `, [config.cronSchedule]);
    }
    
    if (config.rebuildAll !== undefined) {
      await pool.query(`
        INSERT INTO ${systemSettingsTable} (setting_key, setting_value, setting_type, description)
        VALUES ('pre_cache_job_rebuild_all', $1, 'boolean', 'Rebuild all months or only expired/recent')
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = $1, updated_at = NOW()
      `, [config.rebuildAll ? 'true' : 'false']);
    }
    
    // Restart the job with new configuration
    stopPreCacheJob();
    await initializePreCacheJob();
    
    return { success: true, message: 'Job configuration updated' };
  } catch (error: any) {
    console.error('[PRE-CACHE-JOB] Error updating config:', error);
    return { success: false, message: error.message };
  }
}
