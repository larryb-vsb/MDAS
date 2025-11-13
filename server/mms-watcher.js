// MMS Uploader Watcher Service
// Automatically processes files through phases 4-7: Identified → Encoding → Processing → Completed
// This service monitors files that reach "uploaded" status and progresses them through the remaining phases

import { JsonbDuplicateCleanup } from './jsonb-duplicate-cleanup.js';
import { FileTaggedLogger } from '../shared/file-tagged-logger.js';

// Step 6 Processing Timeout and Retry Configuration
const MAX_STEP6_RETRIES = 3; // Maximum number of retry attempts before marking file as failed
const STEP6_TIMEOUT_MS = 300000; // 5 minutes timeout for Step 6 processing

// Step 6 Concurrency Configuration
const MAX_STEP6_CONCURRENT_FILES = parseInt(process.env.MAX_STEP6_CONCURRENT_FILES) || 3; // Max files processing simultaneously
const STEP6_INTERVAL_MS = parseInt(process.env.STEP6_INTERVAL_MS) || 60000; // Check interval (60 seconds)

class MMSWatcher {
  constructor(storage) {
    this.storage = storage;
    this.isRunning = false;
    this.intervalId = null;
    this.identificationIntervalId = null;
    this.encodingIntervalId = null;
    this.duplicateCleanupIntervalId = null;
    this.duplicateCleanup = new JsonbDuplicateCleanup();
    this.auto45Enabled = false; // Auto 4-5 processing DISABLED by default - user must enable manually
    this.manual45Queue = new Set(); // Manual processing queue for single-step progression
    
    // Step 6 Concurrency Management
    this.isStep6SweepRunning = false; // Prevents overlapping Step 6 intervals
    this.step6ActiveSlots = new Set(); // Track active processing slots (upload IDs)
    this.step6QueuedFiles = []; // Files waiting for available slot
    this.step6ProcessingMetrics = {
      totalProcessed: 0,
      totalQueued: 0,
      totalSlotWaitTimeMs: 0,
      peakQueueSize: 0
    };
    // Track processing progress for active files: uploadId -> { filename, totalLines, processedRecords, startedAt }
    this.step6Progress = new Map();
    
    console.log('[MMS-WATCHER] Watcher service initialized');
    console.log('[MMS-WATCHER] 🔧 MERCHANT DETAIL DETECTION CODE IS LOADED - Ready to detect DACQ_MER_DTL files');
    console.log(`[MMS-WATCHER] Auto 4-5 initialized to: ${this.auto45Enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[MMS-WATCHER] Step 6 retry limits: MAX_RETRIES=${MAX_STEP6_RETRIES}, TIMEOUT=${STEP6_TIMEOUT_MS}ms`);
    console.log(`[MMS-WATCHER] Step 6 concurrency: MAX_CONCURRENT=${MAX_STEP6_CONCURRENT_FILES}, INTERVAL=${STEP6_INTERVAL_MS}ms`);
  }

  start() {
    if (this.isRunning) {
      console.log('[MMS-WATCHER] Service already running');
      return;
    }

    this.isRunning = true;
    console.log('[MMS-WATCHER] Starting session-based cleanup service...');
    
    // Only cleanup orphaned sessions - phases 1-3 are session-controlled
    this.intervalId = setInterval(() => {
      this.cleanupOrphanedSessions();
    }, 3600000); // Check every hour (3600000ms) for orphaned sessions
    
    // Dual processing system: Auto 4-5 and Manual 4-5 queues
    this.identificationIntervalId = setInterval(async () => {
      // Process Auto 4-5 queue (continuous automatic processing)
      if (this.auto45Enabled) {
        const hasAutoFiles = await this.hasFilesInPhase('uploaded');
        if (hasAutoFiles) {
          console.log('[MMS-WATCHER] [AUTO-45] Processing uploaded files automatically');
          await this.processUploadedFiles();
        }
      }
      
      // Process Manual 4-5 queue (single-step user-triggered processing)
      console.log(`[MMS-WATCHER] [MANUAL-45] Checking manual queue - size: ${this.manual45Queue.size}`);
      if (this.manual45Queue.size > 0) {
        console.log(`[MMS-WATCHER] [MANUAL-45] Processing ${this.manual45Queue.size} files in manual queue`);
        await this.processManualQueue();
      }
    }, 15000); // Check every 15 seconds for both queues
    
    // Encoding service for both Auto and Manual modes
    this.encodingIntervalId = setInterval(async () => {
      // Auto 4-5 encoding (continuous)
      if (this.auto45Enabled) {
        console.log('[MMS-WATCHER] [AUTO-45] Checking for identified files...');
        const hasAutoFiles = await this.hasFilesInPhase('identified');
        console.log(`[MMS-WATCHER] [AUTO-45] Found identified files: ${hasAutoFiles}`);
        if (hasAutoFiles) {
          console.log('[MMS-WATCHER] [AUTO-45] Processing identified files for encoding');
          await this.processIdentifiedFiles();
        } else {
          // Force debug check even when no identified files found - run every few cycles
          if (Math.random() < 0.3) { // 30% chance to run debug to avoid spam
            console.log('[MMS-WATCHER] [AUTO-45] No identified files found, running debug check...');
            await this.debugAllFiles();
          }
        }
      }
      
      // Manual encoding will be handled separately via manual queue
    }, 20000); // Check every 20 seconds for auto encoding
    
    // Step 6 Processing Service - Independent from Auto 4-5
    this.step6ProcessingIntervalId = setInterval(async () => {
      try {
        // Guard: Skip if previous sweep still running
        if (this.isStep6SweepRunning) {
          console.log('[MMS-WATCHER] [AUTO-STEP6] ⏭️  Skipping interval - previous sweep still running');
          console.log(`[MMS-WATCHER] [AUTO-STEP6] 📊 Active slots: ${this.step6ActiveSlots.size}/${MAX_STEP6_CONCURRENT_FILES}, Queued: ${this.step6QueuedFiles.length}`);
          return;
        }
        
        // Check if Auto Step 6 is enabled by querying system settings directly
        const { db } = await import('./db.js');
        const { sql } = await import('drizzle-orm');
        const { getTableName } = await import('./table-config.js');
        
        const result = await db.execute(sql`
          SELECT setting_value FROM ${sql.identifier(getTableName('system_settings'))}
          WHERE setting_key = 'auto_step6_enabled'
        `);
        
        const autoStep6Enabled = result.rows.length > 0 ? result.rows[0].setting_value === 'true' : false;
        
        if (!autoStep6Enabled) {
          console.log('[MMS-WATCHER] [AUTO-STEP6] Auto Step 6 is disabled, skipping encoded file processing');
          return;
        }
        
        // Auto Step 6 is enabled - check for encoded files
        console.log('[MMS-WATCHER] [AUTO-STEP6] Checking for encoded files...');
        const hasEncodedFiles = await this.hasFilesInPhase('encoded');
        console.log(`[MMS-WATCHER] [AUTO-STEP6] Found encoded files: ${hasEncodedFiles}`);
        
        if (hasEncodedFiles) {
          console.log('[MMS-WATCHER] [AUTO-STEP6] Processing encoded files for Step 6 completion');
          await this.processEncodedFiles();
        }
      } catch (error) {
        console.error('[MMS-WATCHER] [AUTO-STEP6] Error in Step 6 processing interval:', error);
      }
    }, STEP6_INTERVAL_MS); // Use configurable interval
    
    // Step 7 Auto Archive Service - Independent interval
    this.step7ArchiveIntervalId = setInterval(async () => {
      try {
        // Check if Auto Step 7 is enabled by querying system settings directly
        const { db } = await import('./db.js');
        const { sql } = await import('drizzle-orm');
        const { getTableName } = await import('./table-config.js');
        
        const result = await db.execute(sql`
          SELECT setting_value FROM ${sql.identifier(getTableName('system_settings'))}
          WHERE setting_key = 'auto_step7_enabled'
        `);
        
        const autoStep7Enabled = result.rows.length > 0 ? result.rows[0].setting_value === 'true' : false;
        
        if (!autoStep7Enabled) {
          console.log('[MMS-WATCHER] [AUTO-STEP7] Auto Step 7 is disabled, skipping completed file archiving');
          return;
        }
        
        // Auto Step 7 is enabled - check for completed files
        console.log('[MMS-WATCHER] [AUTO-STEP7] Checking for completed files...');
        const hasCompletedFiles = await this.hasFilesInPhase('completed');
        console.log(`[MMS-WATCHER] [AUTO-STEP7] Found completed files: ${hasCompletedFiles}`);
        
        if (hasCompletedFiles) {
          console.log('[MMS-WATCHER] [AUTO-STEP7] Archiving completed files');
          await this.processCompletedFiles();
        }
      } catch (error) {
        console.error('[MMS-WATCHER] [AUTO-STEP7] Error in Step 7 archiving interval:', error);
      }
    }, 60000); // Check every 60 seconds for Step 7 archiving
    
    // JSONB duplicate cleanup service - DISABLED AUTO-START
    // Note: Duplicate cleanup now requires manual triggering from Processing page
    // this.duplicateCleanupIntervalId = setInterval(() => {
    //   this.runDuplicateCleanup();
    // }, 900000); // Check every 15 minutes (900000ms) during legacy import
    
    // Pipeline recovery service - handles stuck files and updates pre-cache when complete
    this.pipelineRecoveryIntervalId = setInterval(async () => {
      await this.checkPipelineStatus();
    }, 60000); // Check every minute for pipeline recovery
    
    console.log('[MMS-WATCHER] Session cleanup service started - orphaned session detection active (runs every hour)');
    console.log('[MMS-WATCHER] File identification service started - processes uploaded files every 30 seconds (optimized)');
    console.log('[MMS-WATCHER] File encoding service started - processes identified files every 20 seconds (optimized)');
    console.log('[MMS-WATCHER] Step 6 processing service started - processes encoded files to master table every 60 seconds (when enabled)');
    console.log('[MMS-WATCHER] Step 7 auto archive service started - archives completed files every 60 seconds (when enabled)');
    console.log('[MMS-WATCHER] Pipeline recovery service started - handles stuck files and cache updates every minute');
    console.log('[MMS-WATCHER] JSONB duplicate cleanup auto-start DISABLED - manual triggering only');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.identificationIntervalId) {
      clearInterval(this.identificationIntervalId);
      this.identificationIntervalId = null;
    }
    if (this.encodingIntervalId) {
      clearInterval(this.encodingIntervalId);
      this.encodingIntervalId = null;
    }
    if (this.duplicateCleanupIntervalId) {
      clearInterval(this.duplicateCleanupIntervalId);
      this.duplicateCleanupIntervalId = null;
    }
    if (this.pipelineRecoveryIntervalId) {
      clearInterval(this.pipelineRecoveryIntervalId);
      this.pipelineRecoveryIntervalId = null;
    }
    if (this.step6ProcessingIntervalId) {
      clearInterval(this.step6ProcessingIntervalId);
      this.step6ProcessingIntervalId = null;
    }
    if (this.step7ArchiveIntervalId) {
      clearInterval(this.step7ArchiveIntervalId);
      this.step7ArchiveIntervalId = null;
    }
    console.log('[MMS-WATCHER] Service stopped');
  }

  async cleanupOrphanedSessions() {
    try {
      // Session-based cleanup for phases 1-3
      await this.cleanupStalledUploads();
      await this.cleanupBrokenSessions(); 
      await this.validateActiveUploads();

    } catch (error) {
      console.error('[MMS-WATCHER] Error during session cleanup:', error);
    }
  }

  // Cleanup uploads stuck in "uploading" phase for more than 10 minutes
  async cleanupStalledUploads() {
    try {
      const stalledThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const stalledUploads = await this.storage.getUploaderUploads({
        phase: 'uploading'
      });

      const stalledCount = stalledUploads.filter(upload => 
        new Date(upload.uploadStartedAt || upload.createdAt) < stalledThreshold
      );

      if (stalledCount.length > 0) {
        console.log(`[MMS-WATCHER] Found ${stalledCount.length} stalled uploads - cleaning up...`);
        
        for (const upload of stalledCount) {
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'failed',
            processingNotes: JSON.stringify({
              error: true,
              reason: 'Session cleanup: upload stalled for >10 minutes',
              failedAt: new Date().toISOString()
            }),
            failedAt: new Date()
          });
          console.log(`[MMS-WATCHER] ✅ Cleaned stalled upload: ${upload.filename} (${upload.id})`);
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error cleaning stalled uploads:', error);
    }
  }

  // Cleanup uploads with broken session data
  async cleanupBrokenSessions() {
    try {
      const allUploads = await this.storage.getUploaderUploads({});
      
      const brokenSessions = allUploads.filter(upload => 
        // Only check for truly broken session data - don't touch successfully uploaded files
        !upload.filename ||
        (upload.currentPhase === 'uploading' && !upload.uploadStartedAt) ||
        (upload.currentPhase === 'started' && !upload.sessionId)
      );

      if (brokenSessions.length > 0) {
        console.log(`[MMS-WATCHER] Found ${brokenSessions.length} broken sessions - cleaning up...`);
        
        for (const upload of brokenSessions) {
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'failed',
            processingNotes: JSON.stringify({
              error: true,
              reason: 'Session cleanup: broken session data detected',
              failedAt: new Date().toISOString()
            }),
            failedAt: new Date()
          });
          console.log(`[MMS-WATCHER] ✅ Cleaned broken session: ${upload.id}`);
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error cleaning broken sessions:', error);
    }
  }

  // Validate active upload sessions are still responsive
  async validateActiveUploads() {
    try {
      const activeUploads = await this.storage.getUploaderUploads({
        phase: 'uploading'
      });

      if (activeUploads.length > 0) {
        console.log(`[MMS-WATCHER] Validating ${activeUploads.length} active upload sessions...`);
        
        // Check if uploads have valid storage keys and can be accessed
        for (const upload of activeUploads) {
          try {
            if (upload.s3Key) {
              // Import Replit Storage Service to validate file exists
              const { ReplitStorageService } = await import('./replit-storage-service.js');
              
              // Quick validation - just check if file exists (don't read content)
              await ReplitStorageService.getFileContent(upload.s3Key);
              
              console.log(`[MMS-WATCHER] ✅ Validated active session: ${upload.filename}`);
            }
          } catch (validationError) {
            // File not found or corrupted - mark as failed
            await this.storage.updateUploaderUpload(upload.id, {
              currentPhase: 'failed',
              processingNotes: JSON.stringify({
                error: true,
                reason: 'Session cleanup: file validation failed',
                details: validationError.message,
                failedAt: new Date().toISOString()
              }),
              failedAt: new Date()
            });
            console.log(`[MMS-WATCHER] ❌ Failed validation for: ${upload.filename} - marked as failed`);
          }
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error validating active uploads:', error);
    }
  }

  // Efficient phase checking to prevent cycling when no files exist
  async hasFilesInPhase(phase) {
    try {
      const files = await this.storage.getUploaderUploads({ phase });
      return files.length > 0;
    } catch (error) {
      console.error(`[MMS-WATCHER] Error checking for files in phase ${phase}:`, error);
      return false;
    }
  }

  // Pipeline Recovery - Handle stuck files and update pre-cache when complete
  async checkPipelineStatus() {
    try {
      // Ensure pool exists
      if (!this.storage || !this.storage.pool) {
        console.log('[MMS-WATCHER] [PIPELINE-RECOVERY] Storage pool not available, skipping pipeline recovery');
        return;
      }
      
      // Check for recently encoded TDDF files that need cache updates  
      const pool = this.storage.pool;
      const recentlyEncoded = await pool.query(`
        SELECT id, filename, encoding_at, processing_notes
        FROM ${this.storage.getTableName('uploader_uploads')}
        WHERE current_phase = 'encoded' 
          AND final_file_type = 'tddf'
          AND encoding_at > NOW() - INTERVAL '10 minutes'
          AND (processing_notes NOT LIKE '%cache_updated%' OR processing_notes IS NULL)
        ORDER BY encoding_at DESC
        LIMIT 5
      `);

      console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] Found ${recentlyEncoded.rows.length} recently encoded files`);
      
      // Force update monthly cache if data exists
      const environment = process.env.NODE_ENV || 'development';
      await this.forceUpdateMonthlyCache(environment);
      
      // Fix: Check if we have multiple encoded files that didn't get individual cache entries
      await this.fixMissingCacheEntries(environment);
      
      for (const upload of recentlyEncoded.rows) {
        console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] Found recently encoded TDDF file: ${upload.filename}`);
        
        try {
          // Simulate encoding results for cache update (use actual stats from file table)
          const environment = process.env.NODE_ENV || 'development';
          const tablePrefix = environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
          
          // Get actual stats from the file table
          const fileTableName = `${tablePrefix}file_${upload.filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
          // Use storage pool for raw SQL queries
          const pool = this.storage.pool;
          const fileStatsResult = await pool.query(`
            SELECT 
              COUNT(*) as total_records,
              COUNT(*) FILTER (WHERE record_type = 'DT') as dt_count,
              COUNT(*) FILTER (WHERE record_type = 'BH') as bh_count,
              COUNT(*) FILTER (WHERE record_type = 'P1') as p1_count,
              SUM(CASE WHEN record_type = 'DT' AND amount IS NOT NULL THEN amount::numeric ELSE 0 END) as total_amount
            FROM ${fileTableName}
          `);
          
          if (fileStatsResult.rows.length > 0) {
            const stats = fileStatsResult.rows[0];
            const mockEncodingResults = {
              totalRecords: parseInt(stats.total_records) || 0,
              totalTransactionAmount: parseFloat(stats.total_amount) || 0,
              recordCounts: {
                byType: {
                  DT: parseInt(stats.dt_count) || 0,
                  BH: parseInt(stats.bh_count) || 0,
                  P1: parseInt(stats.p1_count) || 0
                }
              }
            };

            // Update TDDF1 totals cache
            await this.updateTddf1TotalsCache(upload.filename, mockEncodingResults);
            
            // Mark as cache updated
            const currentNotes = upload.processing_notes || '{}';
            let notes = {};
            try {
              notes = JSON.parse(currentNotes);
            } catch (e) {
              notes = { legacy_notes: currentNotes };
            }
            notes.cache_updated = new Date().toISOString();
            notes.pipeline_recovery = true;
            
            await this.storage.updateUploaderUpload(upload.id, {
              processingNotes: JSON.stringify(notes)
            });
            
            console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] ✅ Updated cache for ${upload.filename}: ${mockEncodingResults.totalRecords} records`);
          }
        } catch (cacheError) {
          console.error(`[MMS-WATCHER] [PIPELINE-RECOVERY] ❌ Failed to update cache for ${upload.filename}:`, cacheError);
        }
      }
      
      // Check for stuck files in encoding phase (over 5 minutes)
      const stuckInEncoding = await this.storage.pool.query(`
        SELECT id, filename, current_phase, updated_at
        FROM ${this.storage.getTableName('uploader_uploads')}
        WHERE current_phase = 'encoding' 
          AND updated_at < NOW() - INTERVAL '5 minutes'
          AND deleted_at IS NULL
          AND is_archived = false
        LIMIT 3
      `);
      
      if (stuckInEncoding.rows.length > 0) {
        console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] Found ${stuckInEncoding.rows.length} files stuck in encoding phase`);
        
        for (const upload of stuckInEncoding.rows) {
          // Check if file table exists (encoding may have completed but status not updated)
          const environment = process.env.NODE_ENV || 'development';
          const tablePrefix = environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
          const fileTableName = `${tablePrefix}file_${upload.filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
          
          const tableExists = await this.storage.pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = $1
            )
          `, [fileTableName]);
          
          if (tableExists.rows[0].exists) {
            // Table exists, mark as encoded
            console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] Recovering stuck file ${upload.filename} - table exists, marking as encoded`);
            
            await this.storage.updateUploaderUpload(upload.id, {
              currentPhase: 'encoded',
              encodedAt: new Date(),
              processingNotes: JSON.stringify({
                pipeline_recovery: true,
                recovered_from: 'stuck_in_encoding',
                recovered_at: new Date().toISOString()
              })
            });
          }
        }
      }
      
      // Check for stuck files in validating phase (over 5 minutes)
      const stuckInValidating = await this.storage.pool.query(`
        SELECT id, filename, current_phase, last_updated, retry_count, line_count
        FROM ${this.storage.getTableName('uploader_uploads')}
        WHERE current_phase = 'validating' 
          AND last_updated < NOW() - INTERVAL '5 minutes'
          AND deleted_at IS NULL
          AND is_archived = false
        LIMIT 10
      `);
      
      // Structured telemetry for recovery metrics
      const recoveryMetrics = {
        detected: 0,
        skipped_active_worker: 0,
        force_released_stale: 0,
        reset_to_encoded: 0,
        marked_failed: 0,
        sample_durations: []
      };
      
      if (stuckInValidating.rows.length > 0) {
        recoveryMetrics.detected = stuckInValidating.rows.length;
        console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] Found ${stuckInValidating.rows.length} files stuck in validating phase`);
        
        for (const upload of stuckInValidating.rows) {
          const retryCount = upload.retry_count || 0;
          const stuckDurationMs = Date.now() - new Date(upload.last_updated).getTime();
          const stuckMinutes = Math.floor(stuckDurationMs / 60000);
          recoveryMetrics.sample_durations.push(stuckMinutes);
          
          // Check if file is currently being processed by a Step 6 worker
          const isActiveWorker = this.step6ActiveSlots.has(upload.id);
          const workerStartTime = this.step6Progress.get(upload.id)?.startTime;
          const workerActiveMs = workerStartTime ? Date.now() - workerStartTime : 0;
          
          // Decision tree for concurrent processing guards
          if (isActiveWorker) {
            const STALE_WORKER_THRESHOLD = 10 * 60 * 1000; // 10 minutes = 2× standard timeout
            
            if (workerActiveMs < STALE_WORKER_THRESHOLD) {
              // Active worker still running within acceptable timeframe - skip recovery
              console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] ⚠️  Skipping ${upload.filename} - active worker processing (${Math.floor(workerActiveMs / 60000)} min)`);
              recoveryMetrics.skipped_active_worker++;
              continue;
            } else {
              // Worker stale (>10 min) - force release slot and proceed with recovery
              console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] 🔓 Force-releasing stale worker slot for ${upload.filename} (${Math.floor(workerActiveMs / 60000)} min active)`);
              this.step6ActiveSlots.delete(upload.id);
              this.step6Progress.delete(upload.id);
              recoveryMetrics.force_released_stale++;
            }
          }
          
          console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] File ${upload.filename} stuck in validating for ${stuckMinutes} minutes (retry ${retryCount}/3)`);
          
          if (retryCount >= 3) {
            // Max retries exceeded, mark as failed
            console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] ❌ Max retries exceeded for ${upload.filename}, marking as failed`);
            recoveryMetrics.marked_failed++;
            
            await this.storage.updateUploaderUpload(upload.id, {
              currentPhase: 'failed',
              failedAt: new Date(),
              processingNotes: JSON.stringify({
                pipeline_recovery: true,
                recovered_from: 'stuck_in_validating',
                reason: `Validation phase stuck for ${stuckMinutes} minutes after ${retryCount} retries`,
                recovered_at: new Date().toISOString(),
                was_active_worker: isActiveWorker,
                worker_active_duration_ms: workerActiveMs
              })
            });
          } else {
            // Revert to encoded for retry
            console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] ✅ Recovering ${upload.filename} from validating → encoded for retry (attempt ${retryCount + 1}/3)`);
            recoveryMetrics.reset_to_encoded++;
            
            await this.storage.updateUploaderUpload(upload.id, {
              currentPhase: 'encoded',
              statusMessage: `Validation recovery: retrying after ${stuckMinutes} min stuck (attempt ${retryCount + 1}/3)`,
              retryCount: retryCount + 1,
              lastRetryAt: new Date(),
              processingNotes: JSON.stringify({
                pipeline_recovery: true,
                recovered_from: 'stuck_in_validating',
                stuck_duration_minutes: stuckMinutes,
                recovered_at: new Date().toISOString(),
                was_active_worker: isActiveWorker,
                worker_active_duration_ms: workerActiveMs
              })
            });
          }
        }
        
        // Log recovery metrics summary
        console.log(`[MMS-WATCHER] [PIPELINE-RECOVERY] 📊 Validating recovery metrics:`, JSON.stringify(recoveryMetrics, null, 2));
      }
      
    } catch (error) {
      console.error('[MMS-WATCHER] [PIPELINE-RECOVERY] Error checking pipeline status:', error);
    }
  }

  // Process manual queue - single step progression only
  async processManualQueue() {
    const filesToProcess = Array.from(this.manual45Queue);
    
    for (const uploadId of filesToProcess) {
      try {
        // Get current file status
        const upload = await this.storage.getUploaderUploadById(uploadId);
        if (!upload) {
          console.log(`[MMS-WATCHER] [MANUAL-45] File ${uploadId} not found, removing from queue`);
          this.manual45Queue.delete(uploadId);
          continue;
        }

        console.log(`[MMS-WATCHER] [MANUAL-45] Processing ${upload.filename} (${upload.currentPhase})`);

        // Single-step progression based on current phase
        if (upload.currentPhase === 'uploaded') {
          // Manual identify: uploaded → identified (with proper file analysis)
          await this.identifyFile(upload);
          const context = FileTaggedLogger.createContext(upload, 4, 'COMPLETE');
          FileTaggedLogger.success(context, 'uploaded → identified (manual)');
          this.manual45Queue.delete(uploadId);
          
        } else if (upload.currentPhase === 'identified') {
          // Manual encode: identified → encoding → encoded
          await this.processIdentifiedFileManual(upload);
          this.manual45Queue.delete(uploadId);
          
        } else {
          // File in unexpected phase, remove from queue
          const context = FileTaggedLogger.createContext(upload, 4, 'ERROR');
          FileTaggedLogger.warn(context, `File in unexpected phase ${upload.currentPhase}, removing from queue`);
          this.manual45Queue.delete(uploadId);
        }

      } catch (error) {
        const errorContext = { uploadId, filename: 'unknown', step: 4, action: 'ERROR' };
        FileTaggedLogger.error(errorContext, `Manual processing failed for ${uploadId}`, error);
        this.manual45Queue.delete(uploadId); // Remove failed files from queue
      }
    }
  }

  // Manual encoding process for single files
  async processIdentifiedFileManual(upload) {
    try {
      const context = FileTaggedLogger.createContext(upload, 5, 'START');
      FileTaggedLogger.stepStart(context, 'Manual encoding initiated');
      
      // Parse existing processing notes safely
      let existingNotes = {};
      try {
        existingNotes = JSON.parse(upload.processingNotes || '{}');
      } catch (e) {
        // If existing notes aren't valid JSON, preserve as legacy_notes
        existingNotes = { legacy_notes: upload.processingNotes };
      }
      
      // Update to encoding phase
      await this.storage.updateUploaderUpload(upload.id, {
        currentPhase: 'encoding',
        processingNotes: JSON.stringify({
          ...existingNotes,
          manualEncodingStartedAt: new Date().toISOString(),
          encodingMethod: 'manual_watcher_triggered'
        })
      });

      // Perform TDDF encoding (same as auto process)
      const { ReplitStorageService } = await import('./replit-storage-service.js');
      const storagePath = upload.storagePath || upload.filename;
      console.log(`[MMS-WATCHER] [MANUAL-ENCODE] Reading file from storage path: ${storagePath}`);
      const fileContent = await ReplitStorageService.getFileContent(storagePath);
      
      if (!fileContent) {
        throw new Error('File content not accessible');
      }

      // Count lines for validation (Step 6 will handle actual TDDF processing via API table)
      console.log(`[MANUAL-ENCODING] File ${upload.id}: Counting lines...`);
      const lines = fileContent.trim().split('\n');
      const lineCount = lines.length;
      console.log(`[MANUAL-ENCODING] File ${upload.id}: Found ${lineCount} lines`);
      const encodingResult = {
        totalRecords: lineCount,
        strategy: 'line_count_for_step6',
        note: 'File validated and ready for Step 6 TDDF API processing'
      };
      console.log(`[MANUAL-ENCODING] File ${upload.id}: Encoding result prepared`);


      // Re-parse existing processing notes safely (they may have been updated during encoding)
      try {
        existingNotes = JSON.parse(upload.processingNotes || '{}');
      } catch (e) {
        // If existing notes aren't valid JSON, preserve as legacy_notes
        existingNotes = { legacy_notes: upload.processingNotes };
      }
      
      // Update to encoded phase
      await this.storage.updateUploaderUpload(upload.id, {
        currentPhase: 'encoded',
        processingNotes: JSON.stringify({
          ...existingNotes,
          manualEncodingCompletedAt: new Date().toISOString(),
          encodingResult: encodingResult,
          totalRecordsEncoded: encodingResult.totalRecords || 0
        })
      });

      const successContext = FileTaggedLogger.createContext(upload, 5, 'COMPLETE');
      FileTaggedLogger.success(successContext, `identified → encoding → encoded`, { totalRecords: encodingResult.totalRecords || 0 });

    } catch (error) {
      const failureContext = FileTaggedLogger.createContext(upload, 5, 'FAILED');
      FileTaggedLogger.failure(failureContext, 'Manual encoding failed', error);
      
      // Re-parse existing processing notes safely for error handling
      try {
        existingNotes = JSON.parse(upload.processingNotes || '{}');
      } catch (e) {
        // If existing notes aren't valid JSON, preserve as legacy_notes
        existingNotes = { legacy_notes: upload.processingNotes };
      }
      
      // Update to failed state
      await this.storage.updateUploaderUpload(upload.id, {
        currentPhase: 'failed',
        processingNotes: JSON.stringify({
          ...existingNotes,
          manualEncodingFailedAt: new Date().toISOString(),
          encodingError: error.message
        })
      });
    }
  }

  // Add files to manual processing queue
  addToManualQueue(uploadIds) {
    console.log(`[MMS-WATCHER] [MANUAL-45] addToManualQueue called with:`, uploadIds);
    if (Array.isArray(uploadIds)) {
      uploadIds.forEach(id => this.manual45Queue.add(id));
    } else {
      this.manual45Queue.add(uploadIds);
    }
    console.log(`[MMS-WATCHER] [MANUAL-45] Added ${Array.isArray(uploadIds) ? uploadIds.length : 1} files to manual queue. Queue size: ${this.manual45Queue.size}`);
    console.log(`[MMS-WATCHER] [MANUAL-45] Current queue contents:`, Array.from(this.manual45Queue));
  }

  // Get manual queue status
  getManualQueueStatus() {
    return {
      queueSize: this.manual45Queue.size,
      filesInQueue: Array.from(this.manual45Queue)
    };
  }

  // Session-based system: Phases 1-3 controlled by user sessions
  // Watcher only performs cleanup of orphaned/broken sessions
  
  // Stage 4: File Identification Service
  async processUploadedFiles() {
    try {
      // Find files in "uploaded" phase that need identification
      const uploadedFiles = await this.storage.getUploaderUploads({
        phase: 'uploaded'
      });

      if (uploadedFiles.length === 0) {
        return; // No files to process
      }

      console.log(`[MMS-WATCHER] Stage 4: Processing ${uploadedFiles.length} uploaded files for identification...`);

      for (const upload of uploadedFiles) {
        // Skip files in review mode unless specifically marked for processing
        if (upload.keepForReview && !upload.processingNotes?.includes('FORCE_IDENTIFICATION')) {
          console.log(`[MMS-WATCHER] Skipping file in review mode: ${upload.filename}`);
          continue;
        }

        try {
          await this.identifyFile(upload);
        } catch (error) {
          console.error(`[MMS-WATCHER] Error identifying file ${upload.filename}:`, error);
          await this.markIdentificationFailed(upload, error.message);
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error processing uploaded files:', error);
    }
  }

  async identifyFile(upload) {
    const context = FileTaggedLogger.createContext(upload, 4, 'START');
    FileTaggedLogger.stepStart(context, 'File identification initiated');
    
    // Get file content from Replit Object Storage
    const { ReplitStorageService } = await import('./replit-storage-service.js');
    const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
    
    // Analyze file structure and content, considering user's original file type selection
    const identification = await this.analyzeFileContent(fileContent, upload.filename, upload.fileType);
    
    // Extract business day from filename (MMDDYYYY pattern)
    let businessDay = null;
    const dateMatch = upload.filename.match(/(\d{8})/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      if (dateStr.length === 8) {
        const month = dateStr.substring(0, 2);
        const day = dateStr.substring(2, 4);
        const year = dateStr.substring(4, 8);
        try {
          const parsedDate = new Date(`${year}-${month}-${day}`);
          if (!isNaN(parsedDate.getTime())) {
            businessDay = parsedDate;
          }
        } catch (error) {
          console.log(`[MMS-WATCHER] Could not parse business day from filename: ${upload.filename}`);
        }
      }
    }
    
    // Extract TDDF metadata (sequence number and processing time) from filename
    const { parseTddfFilename } = await import('./filename-parser.js');
    const tddfMetadata = parseTddfFilename(upload.filename);
    
    // Update upload record with identification results
    const updateObject = {
      currentPhase: 'identified',
      identifiedAt: new Date(),
      detectedFileType: identification.detectedType,
      finalFileType: identification.finalType,
      lineCount: identification.lineCount,
      hasHeaders: identification.hasHeaders,
      fileFormat: identification.format,
      businessDay: businessDay, // Set the extracted business day
      fileSequenceNumber: tddfMetadata.file_sequence_number, // TDDF sequence (e.g., 830, 2400)
      fileProcessingTime: tddfMetadata.file_processing_time, // TDDF processing time (e.g., HHMMSS)
      validationErrors: identification.validationErrors && identification.validationErrors.length > 0 
        ? JSON.stringify(identification.validationErrors)
        : null,
      processingNotes: JSON.stringify({
        identified: true,
        detectedType: identification.detectedType,
        lineCount: identification.lineCount,
        hasHeaders: identification.hasHeaders,
        format: identification.format,
        validationErrors: identification.validationErrors && identification.validationErrors.length > 0 
          ? identification.validationErrors 
          : null,
        identifiedAt: new Date().toISOString()
      })
    };
    
    console.log('[MMS-WATCHER-DEBUG] Update object keys:', Object.keys(updateObject));
    console.log('[MMS-WATCHER-DEBUG] businessDay value:', updateObject.businessDay);
    
    await this.storage.updateUploaderUpload(upload.id, updateObject);

    const successContext = FileTaggedLogger.createContext(upload, 4, 'COMPLETE');
    FileTaggedLogger.success(successContext, `File identified: ${identification.detectedType}`, { lineCount: identification.lineCount, format: identification.format });
  }

  // Debug method to show all files
  async debugAllFiles() {
    try {
      console.log(`[MMS-WATCHER] [FORCE-DEBUG] Getting all files...`);
      const allFiles = await this.storage.getUploaderUploads({});
      console.log(`[MMS-WATCHER] [FORCE-DEBUG] Found ${allFiles.length} total files`);
      
      // Show ACH/transaction files specifically
      const achFiles = allFiles.filter(f => f.filename && (
        f.filename.toLowerCase().includes('ach') || 
        f.filename.toLowerCase().includes('801203_') ||
        f.finalFileType === 'transaction_csv' ||
        f.detectedFileType === 'transaction_csv'
      ));
      console.log(`[MMS-WATCHER] [FORCE-DEBUG] Found ${achFiles.length} ACH/transaction files:`);
      achFiles.forEach(file => {
        console.log(`[MMS-WATCHER] [FORCE-DEBUG]   ACH file: ${file.filename}, phase: ${file.currentPhase}, type: ${file.finalFileType || file.detectedFileType}, id: ${file.id}`);
      });
      
      // Show all phases
      const phaseCount = {};
      allFiles.forEach(f => {
        phaseCount[f.currentPhase] = (phaseCount[f.currentPhase] || 0) + 1;
      });
      console.log(`[MMS-WATCHER] [FORCE-DEBUG] Files by phase:`, phaseCount);
      
      // Show specific ACH files status
      const achSpecificFiles = allFiles.filter(f => 
        f.filename && f.filename.includes('801203_AH0314P1_2024090')  // Your 3 specific files
      );
      console.log(`[MMS-WATCHER] [FORCE-DEBUG] Your 3 specific ACH files (801203_AH0314P1_2024090*):`);
      achSpecificFiles.forEach(file => {
        console.log(`[MMS-WATCHER] [FORCE-DEBUG]     ${file.filename}: phase=${file.currentPhase}, type=${file.finalFileType || file.detectedFileType}, id=${file.id}`);
      });
      
    } catch (error) {
      console.log(`[MMS-WATCHER] [FORCE-DEBUG] Error getting files: ${error.message}`);
    }
  }

  async analyzeFileContent(fileContent, filename, userSelectedFileType) {
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
    const lineCount = lines.length;
    
    // Basic file format detection
    let format = 'text';
    let detectedType = 'unknown';
    let hasHeaders = false;
    let validationErrors = [];

    try {
      // Terminal file detection - check user selection first, then filename patterns, then CSV header content
      if (userSelectedFileType === 'terminals' || userSelectedFileType === 'terminal') {
        detectedType = 'terminal';
        format = filename.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
        hasHeaders = true;
        console.log('[MMS-WATCHER] Detected terminal format (user selected terminals)');
      }
      // Terminal filename patterns detection
      else if (this.detectSubMerchantTerminalsFile(filename)) {
        detectedType = 'terminal';  // Changed from 'sub_merchant_terminals' to 'terminal'
        format = filename.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
        hasHeaders = true; // Terminal files typically have headers
        console.log('[MMS-WATCHER] Detected terminal format from filename patterns');
      }
      // Merchant Detail file detection - MUST come before TDDF check (.tsyso files)
      else if (this.detectMerchantDetailFile(filename, lines)) {
        detectedType = 'merchant_detail';
        format = 'tab_delimited';
        hasHeaders = false; // Has HEADER record but not CSV-style headers
        console.log('[MMS-WATCHER] Detected merchant detail import format (DACQ_MER_DTL)');
      }
      // TDDF file detection (.tsyso extension or specific TDDF patterns)
      else if (filename.toLowerCase().endsWith('.tsyso') || this.detectTddfPattern(lines)) {
        detectedType = 'tddf';
        format = 'tddf';
        hasHeaders = false; // TDDF files don't have header rows
        console.log('[MMS-WATCHER] Detected TDDF format');
      }
      // CSV file detection - respect user's file type selection
      else if (this.detectCsvPattern(lines)) {
        format = 'csv';
        hasHeaders = this.detectCsvHeaders(lines);
        
        // Check if user selected a terminals file type or if headers match terminal patterns
        if (userSelectedFileType === 'terminals' || userSelectedFileType === 'terminal') {
          detectedType = 'terminal';
          console.log('[MMS-WATCHER] Detected terminals CSV format (user selected terminals) with headers:', hasHeaders);
        }
        // Check for terminal CSV patterns in content (V Number, POS Merchant #, etc.)
        else if (this.detectTerminalCsvPatterns(lines)) {
          detectedType = 'terminal';
          console.log('[MMS-WATCHER] Detected terminal CSV format based on headers with headers:', hasHeaders);
        }
        // Check if user selected a specific merchant file type
        else if (userSelectedFileType === 'ach_merchant' || userSelectedFileType === 'merchant') {
          detectedType = 'merchant_csv';
          console.log('[MMS-WATCHER] Detected merchant CSV format (user selected ach_merchant) with headers:', hasHeaders);
        }
        // Check for merchant demographic patterns in CSV content
        else if (this.detectMerchantDemographicPatterns(lines)) {
          detectedType = 'merchant_csv';
          console.log('[MMS-WATCHER] Detected merchant demographic CSV format with headers:', hasHeaders);
        }
        // Default to transaction CSV for other CSV files
        else {
          detectedType = 'transaction_csv';
          console.log('[MMS-WATCHER] Detected transaction CSV format with headers:', hasHeaders);
        }
      }
      // JSON file detection
      else if (this.detectJsonPattern(fileContent)) {
        detectedType = 'json';
        format = 'json';
        hasHeaders = false;
        console.log('[MMS-WATCHER] Detected JSON format');
      }
      // Fixed-width format detection
      else if (this.detectFixedWidthPattern(lines)) {
        detectedType = 'transaction_fixed';
        format = 'fixed-width';
        hasHeaders = false;
        console.log('[MMS-WATCHER] Detected fixed-width format');
      }
      // Default to transaction CSV if contains numeric/date patterns
      else if (this.detectTransactionPatterns(lines)) {
        detectedType = 'transaction_csv';
        format = 'csv';
        hasHeaders = this.detectCsvHeaders(lines);
        console.log('[MMS-WATCHER] Detected transaction data format');
      }
      else {
        validationErrors.push('Unable to identify file format automatically');
        console.log('[MMS-WATCHER] Unknown file format detected');
      }
    } catch (error) {
      validationErrors.push(`File analysis error: ${error.message}`);
      console.error('[MMS-WATCHER] Error during file analysis:', error);
    }

    return {
      detectedType,
      finalType: detectedType, // Use detected type as final type
      lineCount,
      hasHeaders,
      format,
      validationErrors: validationErrors.length > 0 ? validationErrors : null
    };
  }

  // File pattern detection methods
  detectTddfPattern(lines) {
    if (lines.length === 0) return false;
    
    // TDDF lines are typically fixed-width with specific patterns
    const sampleLine = lines[0];
    
    // Exclude CSV files - if line has commas, it's not TDDF
    const hasCommas = (sampleLine.match(/,/g) || []).length > 2;
    if (hasCommas) {
      return false;
    }
    
    return sampleLine.length > 100 && 
           /^\d{2}/.test(sampleLine) && // Starts with record type (2 digits)
           sampleLine.length >= 300; // Minimum TDDF line length
  }

  detectCsvPattern(lines) {
    if (lines.length === 0) return false;
    
    const sampleLine = lines[0];
    const commaCount = (sampleLine.match(/,/g) || []).length;
    const semicolonCount = (sampleLine.match(/;/g) || []).length;
    
    return commaCount >= 2 || semicolonCount >= 2; // At least 3 fields
  }

  detectJsonPattern(content) {
    try {
      const trimmed = content.trim();
      return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
             (trimmed.startsWith('[') && trimmed.endsWith(']'));
    } catch {
      return false;
    }
  }

  detectFixedWidthPattern(lines) {
    if (lines.length < 2) return false;
    
    // Check if multiple lines have the same length (fixed-width indicator)
    const lengths = lines.slice(0, 5).map(line => line.length);
    const uniqueLengths = [...new Set(lengths)];
    
    return uniqueLengths.length === 1 && lengths[0] > 50; // All same length and substantial
  }

  detectTransactionPatterns(lines) {
    if (lines.length === 0) return false;
    
    const sampleLine = lines[0].toLowerCase();
    
    // Look for transaction-related keywords
    const transactionKeywords = ['amount', 'date', 'merchant', 'transaction', 'account', 'id'];
    const keywordCount = transactionKeywords.filter(keyword => sampleLine.includes(keyword)).length;
    
    return keywordCount >= 2;
  }

  detectCsvHeaders(lines) {
    if (lines.length === 0) return false;
    
    const firstLine = lines[0].toLowerCase();
    const headerKeywords = ['name', 'id', 'date', 'amount', 'type', 'account', 'merchant'];
    
    return headerKeywords.some(keyword => firstLine.includes(keyword));
  }

  detectMerchantDemographicPatterns(lines) {
    if (lines.length === 0) return false;
    
    const firstLine = lines[0].toLowerCase();
    
    // Look for merchant demographic field patterns from field-mappings.ts
    const merchantKeywords = [
      'clientmid', 'client mid', 'clientnumber', 'client number',
      'clientlegalname', 'client legal name', 'merchanttype', 'merchant type',
      'mid2', 'parent mid', 'otherclientnumber2', 'association',
      'mcc', 'pos merchant', 'clientsince', 'asofdate', 'as of date',
      'clientpaddress', 'client address', 'mtype'
    ];
    
    // Count how many merchant-specific keywords are found
    const keywordCount = merchantKeywords.filter(keyword => firstLine.includes(keyword)).length;
    
    console.log(`[MMS-WATCHER] Merchant keyword analysis: found ${keywordCount} merchant keywords in header`);
    
    // If we find 3 or more merchant-specific keywords, it's likely merchant data
    return keywordCount >= 3;
  }

  detectTerminalCsvPatterns(lines) {
    // Check if CSV headers match terminal export patterns
    if (lines.length === 0) return false;
    
    const headerLine = lines[0].toLowerCase();
    const terminalHeaders = [
      'v number', 'v_number', 'vnumber', 'var number', 'var_number',
      'pos merchant', 'pos_merchant', 'pos merchant #', 'pos_merchant_number',
      'dba name', 'dba_name', 'dbaname', 'terminal', 'bin',
      'daily auth', 'daily_auth', 'encryption', 'mcc', 'ssl'
    ];
    
    // Check if at least 2 terminal-specific headers are present
    const matchedHeaders = terminalHeaders.filter(header => 
      headerLine.includes(header)
    );
    
    const isTerminalCsv = matchedHeaders.length >= 2;
    
    if (isTerminalCsv) {
      console.log(`[MMS-WATCHER] Detected terminal CSV headers: ${matchedHeaders.join(', ')}`);
    }
    
    return isTerminalCsv;
  }

  detectSubMerchantTerminalsFile(filename) {
    if (!filename) return false;
    
    const lowerFilename = filename.toLowerCase();
    
    // SubMerchantTerminals filename patterns
    const terminalPatterns = [
      'terminal',
      'terminals',
      'unused',
      'pos terminal',
      'merchant terminal',
      'terminal report'
    ];
    
    // Check if filename contains terminal-related keywords
    const hasTerminalKeyword = terminalPatterns.some(pattern => 
      lowerFilename.includes(pattern)
    );
    
    // Check for supported file extensions
    const supportedExtensions = ['.csv', '.xlsx', '.xls'];
    const hasValidExtension = supportedExtensions.some(ext => 
      lowerFilename.endsWith(ext)
    );
    
    // Return true if both conditions are met
    const isTerminalFile = hasTerminalKeyword && hasValidExtension;
    
    if (isTerminalFile) {
      console.log(`[MMS-WATCHER] SubMerchantTerminals file detected: ${filename}`);
    } else {
      console.log(`[MMS-WATCHER] SubMerchantTerminals check: hasTerminalKeyword=${hasTerminalKeyword}, hasValidExtension=${hasValidExtension} for ${filename}`);
    }
    
    return isTerminalFile;
  }

  detectMerchantDetailFile(filename, lines) {
    console.log(`[MMS-WATCHER] [MERCHANT-DETAIL-CHECK] Called with filename: ${filename}, lines count: ${lines ? lines.length : 'UNDEFINED'}`);
    if (!filename || lines.length === 0) {
      console.log(`[MMS-WATCHER] [MERCHANT-DETAIL-CHECK] Early return - filename: ${!!filename}, lines.length: ${lines ? lines.length : 'UNDEFINED'}`);
      return false;
    }
    
    // Check filename for DACQ_MER_DTL pattern
    const hasMerchantDetailPattern = filename.toUpperCase().includes('DACQ_MER_DTL');
    
    // Check first line for HEADER record with ACQ MERCHANT DETAIL
    const firstLine = lines[0] || '';
    const hasHeaderRecord = firstLine.toUpperCase().startsWith('HEADER') && 
                           firstLine.toUpperCase().includes('ACQ MERCHANT DETAIL');
    
    // Check last line for TRAILER record
    const lastLine = lines[lines.length - 1] || '';
    const hasTrailerRecord = lastLine.toUpperCase().startsWith('TRAILER');
    
    const isMerchantDetailFile = hasMerchantDetailPattern && hasHeaderRecord && hasTrailerRecord;
    
    // Debug logging
    console.log(`[MMS-WATCHER] Merchant detail check for ${filename}:`);
    console.log(`[MMS-WATCHER]   - Has DACQ_MER_DTL pattern: ${hasMerchantDetailPattern}`);
    console.log(`[MMS-WATCHER]   - First line starts with HEADER: ${firstLine.toUpperCase().startsWith('HEADER')}`);
    console.log(`[MMS-WATCHER]   - First line includes ACQ MERCHANT DETAIL: ${firstLine.toUpperCase().includes('ACQ MERCHANT DETAIL')}`);
    console.log(`[MMS-WATCHER]   - Last line starts with TRAILER: ${hasTrailerRecord}`);
    console.log(`[MMS-WATCHER]   - First line preview: "${firstLine.substring(0, 100)}..."`);
    console.log(`[MMS-WATCHER]   - Last line preview: "${lastLine.substring(0, 50)}"`);
    console.log(`[MMS-WATCHER]   - Is merchant detail file: ${isMerchantDetailFile}`);
    
    if (isMerchantDetailFile) {
      console.log(`[MMS-WATCHER] ✅ Merchant Detail file detected: ${filename} (${lines.length} lines, HEADER/TRAILER confirmed)`);
    }
    
    return isMerchantDetailFile;
  }

  // Helper method to parse dates from merchant detail files
  parseDate(dateString) {
    if (!dateString || dateString.trim() === '' || dateString === '99/99/9999' || dateString === '00/00/0000') {
      return null;
    }
    
    try {
      // Handle MM/DD/YYYY format
      if (dateString.includes('/')) {
        const [month, day, year] = dateString.split('/');
        return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      }
      
      // Handle YYYY-MM-DD format
      if (dateString.includes('-')) {
        return new Date(dateString);
      }
      
      return null;
    } catch (error) {
      console.error(`[MMS-WATCHER] Error parsing date: ${dateString}`, error);
      return null;
    }
  }

  async markIdentificationFailed(upload, errorMessage) {
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'failed',
      processingNotes: JSON.stringify({
        identified: false,
        error: errorMessage,
        failedAt: new Date().toISOString()
      }),
      validationErrors: JSON.stringify([errorMessage])
    });
    
    console.log(`[MMS-WATCHER] ❌ Failed to identify: ${upload.filename} - ${errorMessage}`);
  }

  // Stage 5: File Encoding Service - Autoprocess identified files to encoded state
  async processIdentifiedFiles() {
    try {
      // Find files in "identified" phase that need encoding
      const identifiedFiles = await this.storage.getUploaderUploads({
        phase: 'identified'
      });

      console.log(`[MMS-WATCHER] [DEBUG] Found ${identifiedFiles.length} files in 'identified' phase`);
      
      // Debug: Show ALL files and their phases first
      console.log(`[MMS-WATCHER] [DEBUG] Checking ALL file phases...`);
      try {
        const allFiles = await this.storage.getUploaderUploads({});
        
        // Show ACH/transaction files specifically
        const achFiles = allFiles.filter(f => f.filename && (
          f.filename.toLowerCase().includes('ach') || 
          f.filename.toLowerCase().includes('801203_') ||
          f.finalFileType === 'transaction_csv' ||
          f.detectedFileType === 'transaction_csv'
        ));
        console.log(`[MMS-WATCHER] [DEBUG] Found ${achFiles.length} ACH/transaction files total:`);
        achFiles.forEach(file => {
          console.log(`[MMS-WATCHER] [DEBUG]   ACH file: ${file.filename}, phase: ${file.currentPhase}, type: ${file.finalFileType || file.detectedFileType}, id: ${file.id}`);
        });
        
        const terminalFiles = allFiles.filter(f => f.filename && f.filename.toLowerCase().includes('terminal'));
        console.log(`[MMS-WATCHER] [DEBUG] Found ${terminalFiles.length} terminal files total:`);
        terminalFiles.forEach(file => {
          console.log(`[MMS-WATCHER] [DEBUG]   Terminal file: ${file.filename}, phase: ${file.currentPhase}, type: ${file.finalFileType || file.detectedFileType}, id: ${file.id}`);
        });
      } catch (error) {
        console.log(`[MMS-WATCHER] [DEBUG] Error getting all files: ${error.message}`);
      }
      
      if (identifiedFiles.length === 0) {
        return; // No files to process
      }
      
      // Debug: Show what files were found in identified phase
      identifiedFiles.forEach(file => {
        console.log(`[MMS-WATCHER] [DEBUG] Identified file: ${file.filename}, type: ${file.finalFileType || file.detectedFileType}, id: ${file.id}`);
      });

      // Filter for files that need encoding (support both camelCase and snake_case field names)
      const encodableFiles = identifiedFiles.filter(upload => {
        const finalType = upload.finalFileType || upload.final_file_type;
        const detectedType = upload.detectedFileType || upload.detected_file_type;
        const fileType = upload.fileType || upload.file_type;
        
        return (
          finalType === 'tddf' || detectedType === 'tddf' || fileType === 'tddf' ||
          finalType === 'merchant_csv' || detectedType === 'merchant_csv' || fileType === 'merchant_csv' ||
          finalType === 'merchant_detail' || detectedType === 'merchant_detail' || fileType === 'merchant_detail' ||
          finalType === 'transaction_csv' || detectedType === 'transaction_csv' || fileType === 'transaction_csv' ||
          finalType === 'terminal' || detectedType === 'terminal' || fileType === 'terminal' ||
          finalType === 'sub_merchant_terminals' || detectedType === 'sub_merchant_terminals' || fileType === 'sub_merchant_terminals'
        );
      });

      if (encodableFiles.length === 0) {
        return; // No files to encode
      }

      console.log(`[MMS-WATCHER] Stage 5: Processing ${encodableFiles.length} identified files for encoding...`);

      for (const upload of encodableFiles) {
        // Skip files in review mode unless specifically marked for processing
        if (upload.keepForReview && !upload.processingNotes?.includes('FORCE_ENCODING')) {
          console.log(`[MMS-WATCHER] Skipping file in review mode: ${upload.filename}`);
          continue;
        }

        try {
          await this.encodeFileWithRetry(upload);
        } catch (error) {
          console.error(`[MMS-WATCHER] Error encoding file ${upload.filename}:`, error);
          await this.markEncodingFailed(upload, error.message);
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error processing identified files:', error);
    }
  }

  async encodeFile(upload) {
    console.log(`[MMS-WATCHER] Encoding file: ${upload.filename} (${upload.id})`);
    
    try {
      // Update to encoding phase first
      await this.storage.updateUploaderPhase(upload.id, 'encoding', {
        encodingStartedAt: new Date(),
        processingNotes: JSON.stringify({
          autoEncoding: true,
          startedBy: 'MMS Watcher',
          startedAt: new Date().toISOString()
        })
      });

      // Get file content from Replit Object Storage (support both camelCase and snake_case)
      const { ReplitStorageService } = await import('./replit-storage-service.js');
      const storageKey = upload.storageKey || upload.storage_key || upload.s3Key || upload.s3_key;
      const fileContent = await ReplitStorageService.getFileContent(storageKey);
      
      // Determine file type and process accordingly (support both camelCase and snake_case)
      const fileType = upload.finalFileType || upload.final_file_type || upload.detectedFileType || upload.detected_file_type || upload.fileType || upload.file_type;
      let encodingResults;
      
      if (fileType === 'tddf') {
        // Count lines for validation (Step 6 will handle actual TDDF processing via API table)
        console.log(`[AUTO-ENCODING] File ${upload.id}: Counting lines...`);
        const lines = fileContent.trim().split('\n');
        const lineCount = lines.length;
        console.log(`[AUTO-ENCODING] File ${upload.id}: Found ${lineCount} lines`);
        
        const encodingResult = {
          totalRecords: lineCount,
          strategy: 'line_count_for_step6',
          note: 'File validated and ready for Step 6 TDDF API processing'
        };
        console.log(`[AUTO-ENCODING] File ${upload.id}: Encoding result prepared`);
        
        // Update to encoded phase (Step 6 will handle actual field extraction)
        await this.storage.updateUploaderPhase(upload.id, 'encoded', {
          encodingCompletedAt: new Date(),
          encodingStatus: 'completed',
          encodingNotes: `Auto-encoded: File validated with ${encodingResult.totalRecords} lines, ready for Step 6 processing`,
          jsonRecordsCreated: encodingResult.totalRecords,
          processingNotes: JSON.stringify({
            autoEncoded: true,
            encodedBy: 'MMS Watcher',
            linesValidated: encodingResult.totalRecords,
            step6Ready: true,
            encodedAt: new Date().toISOString()
          })
        });

        console.log(`[MMS-WATCHER] ✅ File encoded: ${upload.filename} -> ${encodingResult.totalRecords} lines validated (Step 6 will process)`);
      } 
      else if (fileType === 'merchant_csv') {
        // Save content to temporary file for CSV processing
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        
        const tempFilePath = path.join(os.tmpdir(), `temp_merchant_${upload.id}_${Date.now()}.csv`);
        fs.writeFileSync(tempFilePath, fileContent);
        
        try {
          // Process merchant CSV file using existing storage method
          const processingResults = await this.storage.processMerchantFile(tempFilePath);
          
          // Update to encoded phase with merchant results
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `Successfully processed ${processingResults.merchantsCreated || 0} merchant records from CSV`,
            merchantsProcessed: processingResults.merchantsCreated || 0,
            merchantsUpdated: processingResults.merchantsUpdated || 0,
            processingNotes: JSON.stringify({
              autoProcessed: true,
              processedBy: 'MMS Watcher',
              rowsProcessed: processingResults.rowsProcessed || 0,
              merchantsCreated: processingResults.merchantsCreated || 0,
              merchantsUpdated: processingResults.merchantsUpdated || 0,
              processedAt: new Date().toISOString()
            })
          });

          console.log(`[MMS-WATCHER] ✅ Merchant CSV processed: ${upload.filename} -> ${processingResults.merchantsCreated || 0} merchants created, ${processingResults.merchantsUpdated || 0} updated`);
        } finally {
          // Clean up temp file
          try {
            fs.unlinkSync(tempFilePath);
          } catch (err) {
            console.warn(`[MMS-WATCHER] Warning: Could not delete temp file ${tempFilePath}:`, err);
          }
        }
      }
      else if (fileType === 'transaction_csv') {
        // Save content to temporary file for transaction CSV processing
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');
        
        const tempFilePath = path.join(os.tmpdir(), `temp_transaction_${upload.id}_${Date.now()}.csv`);
        fs.writeFileSync(tempFilePath, fileContent);
        
        try {
          // Process transaction CSV file using existing storage method
          console.log(`[MMS-WATCHER] [TRANSACTION-CSV] Processing ${upload.filename} via processTransactionFile...`);
          console.log(`[MMS-WATCHER] [TRANSACTION-CSV] Temp file path: ${tempFilePath}`);
          console.log(`[MMS-WATCHER] [TRANSACTION-CSV] File size: ${fileContent.length} characters`);
          
          await this.storage.processTransactionFile(tempFilePath);
          console.log(`[MMS-WATCHER] [TRANSACTION-CSV] processTransactionFile completed for ${upload.filename}`);
          
          // Update to encoded phase with transaction results
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `Successfully processed ACH transaction CSV file`,
            processingNotes: `Auto-processed by MMS Watcher: ACH transaction CSV processed and added to database`
          });

          console.log(`[MMS-WATCHER] ✅ Transaction CSV processed: ${upload.filename} -> ACH transactions added to database`);
        } catch (transactionError) {
          console.error(`[MMS-WATCHER] ❌ Transaction CSV processing failed for ${upload.filename}:`, transactionError);
          
          // Mark as failed with error details
          await this.storage.updateUploaderPhase(upload.id, 'failed', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'failed',
            encodingNotes: `Transaction CSV processing failed: ${transactionError.message}`,
            processingNotes: `Failed during auto-processing: ${transactionError.message}`
          });
          
          throw transactionError; // Re-throw to be caught by outer try-catch
        } finally {
          // Clean up temp file
          try {
            fs.unlinkSync(tempFilePath);
          } catch (err) {
            console.warn(`[MMS-WATCHER] Warning: Could not delete temp file ${tempFilePath}:`, err);
          }
        }
      }
      else if (fileType === 'sub_merchant_terminals') {
        // SubMerchantTerminals file processing - treat as terminal CSV for auto-processing
        console.log(`[MMS-WATCHER] Processing SubMerchantTerminals as Terminal CSV file: ${upload.filename}`);
        
        try {
          // Process terminal CSV directly using storage method
          const processingResult = await this.storage.processTerminalFileFromContent(
            fileContent,
            upload.id,
            upload.filename
          );
          
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `Successfully processed terminal CSV file: ${processingResult.terminalsCreated} created, ${processingResult.terminalsUpdated} updated`,
            processingNotes: `Auto-processed by MMS Watcher: Terminal CSV processed and added to dev_api_terminals table`,
            fileTypeIdentified: 'terminal',
            recordsProcessed: processingResult.rowsProcessed,
            recordsCreated: processingResult.terminalsCreated,
            recordsUpdated: processingResult.terminalsUpdated,
            processingErrors: processingResult.errors
          });
          
          console.log(`[MMS-WATCHER] ✅ Terminal CSV processed: ${upload.filename} -> ${processingResult.terminalsCreated} terminals created, ${processingResult.terminalsUpdated} updated`);
        } catch (error) {
          console.error(`[MMS-WATCHER] Error processing terminal CSV ${upload.filename}:`, error);
          
          await this.storage.updateUploaderPhase(upload.id, 'failed', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'failed',
            encodingNotes: `Terminal CSV processing failed: ${error.message}`,
            processingNotes: `Terminal CSV processing failed: ${error.message}`,
            fileTypeIdentified: 'terminal'
          });
          
          throw error;
        }
      }
      else if (fileType === 'terminal') {
        // Terminal CSV file processing - auto-process to dev_api_terminals table
        console.log(`[MMS-WATCHER] Processing terminal CSV file: ${upload.filename}`);
        
        try {
          // Process terminal CSV directly using storage method
          const processingResult = await this.storage.processTerminalFileFromContent(
            fileContent,
            upload.id,
            upload.filename
          );
          
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `Successfully processed terminal CSV file: ${processingResult.terminalsCreated} created, ${processingResult.terminalsUpdated} updated`,
            processingNotes: `Auto-processed by MMS Watcher: Terminal CSV processed and added to dev_api_terminals table`,
            fileTypeIdentified: 'terminal',
            recordsProcessed: processingResult.rowsProcessed,
            recordsCreated: processingResult.terminalsCreated,
            recordsUpdated: processingResult.terminalsUpdated,
            processingErrors: processingResult.errors
          });
          
          console.log(`[MMS-WATCHER] ✅ Terminal CSV processed: ${upload.filename} -> ${processingResult.terminalsCreated} terminals created, ${processingResult.terminalsUpdated} updated`);
        } catch (error) {
          console.error(`[MMS-WATCHER] Error processing terminal CSV ${upload.filename}:`, error);
          
          await this.storage.updateUploaderPhase(upload.id, 'failed', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'failed',
            encodingNotes: `Terminal CSV processing failed: ${error.message}`,
            processingNotes: `Terminal CSV processing failed: ${error.message}`,
            fileTypeIdentified: 'terminal'
          });
          
          throw error;
        }
      }
      else if (fileType === 'merchant_detail') {
        // Merchant Detail file processing - DACQ_MER_DTL format using MCC Schema
        console.log(`[MMS-WATCHER] [MERCHANT-DETAIL-SCHEMA] Processing merchant detail file with MCC schema: ${upload.filename}`);
        
        try {
          // Get file content from Replit Object Storage (support both camelCase and snake_case)
          const { ReplitStorageService } = await import('./replit-storage-service.js');
          const storageKey = upload.storageKey || upload.storage_key || upload.s3Key || upload.s3_key;
          const fileContent = await ReplitStorageService.getFileContent(storageKey);
          
          if (!fileContent) {
            throw new Error('File content not accessible');
          }
          
          // Import MCC schema-based parser
          const { parseMerchantDetailLine, getMccSchemaFields, mapParsedToMerchantSchema } = await import('./merchant-detail-parser.ts');
          
          // Load MCC schema once for all records
          const schemaFields = await getMccSchemaFields();
          console.log(`[MMS-WATCHER] [MERCHANT-DETAIL-SCHEMA] Loaded ${schemaFields.length} MCC schema fields for parsing`);
          
          // Parse merchant detail records
          const lines = fileContent.split('\n').filter(line => line.trim());
          const dataRecords = lines.filter(line => line.startsWith('6759'));
          
          console.log(`[MMS-WATCHER] [MERCHANT-DETAIL-SCHEMA] Found ${dataRecords.length} merchant records to process`);
          
          let merchantsCreated = 0;
          let merchantsUpdated = 0;
          const errors = [];
          const warnings = [];
          
          // Process each merchant record using MCC schema parser
          for (let i = 0; i < dataRecords.length; i++) {
            const line = dataRecords[i];
            
            try {
              // Parse line using MCC schema (auto-detects tab-delimited vs fixed-width)
              const parsedData = await parseMerchantDetailLine(line, schemaFields);
              
              // Check for parsing errors
              if (parsedData._errors && parsedData._errors.length > 0) {
                warnings.push(`Line ${i + 1} parsing warnings: ${parsedData._errors.join('; ')}`);
              }
              
              // Map parsed data to merchant table schema
              const merchantData = mapParsedToMerchantSchema(parsedData, schemaFields);
              
              // Validate required fields
              if (!merchantData.id) {
                errors.push(`Missing merchant ID for record at line ${i + 1}`);
                continue;
              }
              
              // Check if merchant exists
              const existingMerchant = await this.storage.getMerchantById(merchantData.id);
              
              if (existingMerchant) {
                // Update existing merchant
                await this.storage.updateMerchant(merchantData.id, merchantData);
                merchantsUpdated++;
              } else {
                // Create new merchant
                await this.storage.createMerchant(merchantData);
                merchantsCreated++;
              }
              
            } catch (recordError) {
              errors.push(`Error processing record at line ${i + 1}: ${recordError.message}`);
              console.error(`[MMS-WATCHER] [MERCHANT-DETAIL-SCHEMA] Record error:`, recordError);
            }
          }
          
          // Update upload status
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `Successfully processed merchant detail file using MCC schema: ${merchantsCreated} created, ${merchantsUpdated} updated${warnings.length > 0 ? ` (${warnings.length} warnings)` : ''}`,
            processingNotes: `Auto-processed by MMS Watcher using MCC Schema Parser: ${dataRecords.length} merchant records processed, ${schemaFields.length} schema fields used`,
            fileTypeIdentified: 'merchant_detail',
            recordsProcessed: dataRecords.length,
            recordsCreated: merchantsCreated,
            recordsUpdated: merchantsUpdated,
            processingErrors: errors.length > 0 ? errors : null,
            processingWarnings: warnings.length > 0 ? warnings : null
          });
          
          console.log(`[MMS-WATCHER] ✅ Merchant detail file processed with MCC schema: ${upload.filename} -> ${merchantsCreated} created, ${merchantsUpdated} updated, ${warnings.length} warnings`);
        } catch (error) {
          console.error(`[MMS-WATCHER] Error processing merchant detail file ${upload.filename}:`, error);
          
          await this.storage.updateUploaderPhase(upload.id, 'failed', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'failed',
            encodingNotes: `Merchant detail processing failed: ${error.message}`,
            processingNotes: `Merchant detail processing with MCC schema failed: ${error.message}`,
            fileTypeIdentified: 'merchant_detail'
          });
          
          throw error;
        }
      }
      else {
        throw new Error(`Unsupported file type for encoding: ${fileType}`);
      }
      
    } catch (error) {
      console.error(`[MMS-WATCHER] Encoding failed for ${upload.filename}:`, error);
      throw error;
    }
  }

  // Enhanced encoding with retry logic and silent conflict handling
  async encodeFileWithRetry(upload, maxRetries = 3) {
    let retryCount = 0;
    let lastError = null;
    
    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`[MMS-WATCHER] [RETRY-${retryCount}] Retrying encoding for ${upload.filename}`);
          
          // Reset file to identified phase for retry
          await this.storage.updateUploaderPhase(upload.id, 'identified', {
            processingNotes: `Retry attempt ${retryCount}/${maxRetries} - Previous error: ${lastError?.message || 'Unknown error'}`,
            retryCount: retryCount,
            lastRetryAt: new Date()
          });
          
          // Brief delay before retry to avoid conflicts
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
        
        await this.encodeFile(upload);
        
        // Success - clear any retry metadata
        if (retryCount > 0) {
          await this.logConflictWarning(upload, `Successfully recovered after ${retryCount} retry attempts`, 'recovery_success');
        }
        
        return; // Success - exit retry loop
        
      } catch (error) {
        lastError = error;
        retryCount++;
        
        // Log conflict/error details to file metadata without stopping processing
        await this.logConflictWarning(upload, error.message, 'encoding_conflict', retryCount, maxRetries);
        
        // If this is a database conflict or constraint violation, try to reset and continue
        if (this.isRetryableError(error) && retryCount <= maxRetries) {
          console.log(`[MMS-WATCHER] [SILENT-CONFLICT] ${upload.filename}: ${error.message} (Retry ${retryCount}/${maxRetries})`);
          continue;
        }
        
        // Non-retryable error or max retries exceeded
        if (retryCount > maxRetries) {
          console.log(`[MMS-WATCHER] [MAX-RETRIES] ${upload.filename}: Exceeded ${maxRetries} retries, marking as failed`);
          throw new Error(`Failed after ${maxRetries} retry attempts. Last error: ${error.message}`);
        } else {
          throw error; // Re-throw non-retryable errors immediately
        }
      }
    }
  }

  // Check if error is retryable (database conflicts, timeouts, etc.)
  isRetryableError(error) {
    const retryablePatterns = [
      /duplicate key value violates unique constraint/i,
      /could not serialize access due to concurrent update/i,
      /deadlock detected/i,
      /connection timeout/i,
      /server closed the connection unexpectedly/i,
      /relation.*already exists/i,
      /constraint.*already exists/i,
      /conflicting.*operation/i,
      /resource temporarily unavailable/i
    ];
    
    const errorMsg = error.message || '';
    return retryablePatterns.some(pattern => pattern.test(errorMsg));
  }

  // Silent conflict logging to file metadata - doesn't slow processing
  async logConflictWarning(upload, errorMessage, conflictType, retryCount = 0, maxRetries = 0) {
    try {
      const timestamp = new Date().toISOString();
      const warningEntry = {
        timestamp,
        type: conflictType,
        message: errorMessage,
        retryCount,
        maxRetries,
        phase: 'auto_45_processing'
      };
      
      // Get existing warnings or create new array
      const currentUpload = await this.storage.getUploaderUpload(upload.id);
      let warnings = [];
      
      try {
        if (currentUpload.processingWarnings) {
          warnings = typeof currentUpload.processingWarnings === 'string' 
            ? JSON.parse(currentUpload.processingWarnings) 
            : currentUpload.processingWarnings;
        }
      } catch (e) {
        // If parsing fails, start fresh
        warnings = [];
      }
      
      warnings.push(warningEntry);
      
      // Keep only last 10 warnings to prevent metadata bloat
      if (warnings.length > 10) {
        warnings = warnings.slice(-10);
      }
      
      // Update metadata with warning log (silent update - no phase change)
      await this.storage.updateUploaderUpload(upload.id, {
        processingWarnings: JSON.stringify(warnings),
        lastWarningAt: timestamp,
        warningCount: warnings.length
      });
      
      // Log to console but continue processing
      console.log(`[MMS-WATCHER] [SILENT-LOG] ${upload.filename}: ${conflictType} - ${errorMessage}`);
      
    } catch (metaError) {
      // If we can't log metadata, at least log to console - don't fail processing
      console.warn(`[MMS-WATCHER] [META-WARNING] Could not log conflict metadata for ${upload.filename}:`, metaError.message);
    }
  }

  async markEncodingFailed(upload, errorMessage) {
    // Enhanced failure marking with retry information
    const retryInfo = await this.getRetryInfo(upload);
    
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'failed',
      processingNotes: `Encoding failed after ${retryInfo.totalRetries} retry attempts: ${errorMessage}`,
      encodingStatus: 'failed',
      encodingNotes: `Auto-encoding failed: ${errorMessage}`,
      failedAt: new Date(),
      canRetry: true, // Allow manual retry reset
      lastFailureReason: errorMessage
    });
    
    console.log(`[MMS-WATCHER] ❌ Failed to encode: ${upload.filename} - ${errorMessage} (${retryInfo.totalRetries} retries attempted)`);
  }

  async getRetryInfo(upload) {
    try {
      const currentUpload = await this.storage.getUploaderUpload(upload.id);
      return {
        totalRetries: currentUpload.retryCount || 0,
        lastRetryAt: currentUpload.lastRetryAt || null,
        warningCount: currentUpload.warningCount || 0
      };
    } catch (error) {
      return { totalRetries: 0, lastRetryAt: null, warningCount: 0 };
    }
  }

  // JSONB Duplicate Cleanup Service - runs during legacy import
  async runDuplicateCleanup() {
    try {
      console.log('[MMS-WATCHER] 🧹 Running JSONB duplicate cleanup scan...');
      
      const result = await this.duplicateCleanup.runCleanupScan();
      
      if (result.success) {
        const { duplicates, stats } = result;
        
        console.log(`[MMS-WATCHER] ✅ Duplicate scan completed:`);
        console.log(`  📊 JSONB Records: ${stats?.totalRecords || 0} total, ${stats?.dtRecords || 0} DT records`);
        console.log(`  🔍 Duplicate Patterns: ${duplicates?.totalPatterns || 0} found`);
        console.log(`  📝 Excess Records: ${duplicates?.totalDuplicateRecords || 0} duplicates logged`);
        console.log(`  🔄 Status: Legacy import ongoing - duplicates tracked for post-import cleanup`);
        
        // Store summary in processing notes for monitoring
        if (duplicates?.totalDuplicateRecords > 0) {
          console.log(`[MMS-WATCHER] 📋 Duplicate breakdown:`);
          console.log(`    Reference-based: ${duplicates.referenceBasedDuplicates} records`);
          console.log(`    Line-based: ${duplicates.lineBasedDuplicates} records`);
        }
      } else {
        console.error(`[MMS-WATCHER] ❌ Duplicate cleanup scan failed:`, result.error);
      }
      
    } catch (error) {
      console.error('[MMS-WATCHER] Error during duplicate cleanup:', error);
    }
  }

  // Get duplicate cleanup statistics for API endpoints
  async getDuplicateCleanupStats() {
    try {
      const stats = await this.duplicateCleanup.getDuplicateStats();
      const duplicates = await this.duplicateCleanup.findDuplicates();
      
      return {
        success: true,
        stats,
        duplicatePatterns: duplicates.length,
        totalDuplicateRecords: duplicates.reduce((sum, dup) => sum + (dup.duplicate_count - 1), 0),
        lastScanned: new Date().toISOString(),
        status: 'legacy_import_ongoing'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Auto 4-5 Control Methods
  setAuto45Enabled(enabled) {
    this.auto45Enabled = enabled;
    console.log(`[MMS-WATCHER] Auto 4-5 processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  getAuto45Status() {
    return {
      enabled: this.auto45Enabled,
      status: this.auto45Enabled ? 'enabled' : 'disabled'
    };
  }

  // TDDF1 Totals Cache Management
  async updateTddf1TotalsCache(filename, encodingResults) {
    try {
      console.log(`[MMS-WATCHER] [TDDF1-CACHE] Updating totals cache for ${filename}...`);
      
      // Extract date from filename (VERMNTSB.6759_TDDF_830_07282025_083340.TSYSO -> 2025-07-28)
      const fileDate = this.extractDateFromFilename(filename);
      
      // Determine environment and table prefix
      const environment = process.env.NODE_ENV || 'development';
      const tablePrefix = environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
      const totalsTableName = `${tablePrefix}totals`;
      
      // Prepare totals record
      const totalsRecord = {
        filename: filename,
        file_name: filename,
        file_date: fileDate,
        total_records: encodingResults.totalRecords,
        total_transactions: 0.00,
        total_transaction_value: 0.00,
        dt_records: encodingResults.recordCounts?.byType?.DT || 0,
        bh_records: encodingResults.recordCounts?.byType?.BH || 0,
        p1_records: encodingResults.recordCounts?.byType?.P1 || 0,
        e1_records: encodingResults.recordCounts?.byType?.E1 || 0,
        g2_records: encodingResults.recordCounts?.byType?.G2 || 0,
        ad_records: encodingResults.recordCounts?.byType?.AD || 0,
        dr_records: encodingResults.recordCounts?.byType?.DR || 0,
        p2_records: encodingResults.recordCounts?.byType?.P2 || 0,
        other_records: encodingResults.recordCounts?.byType?.OTHER || 0,
        total_files: 1,
        last_processed_date: fileDate,
        processing_date: new Date(),
        date_processed: new Date(),
        total_net_deposit_bh: 0.00,
        record_type_breakdown: JSON.stringify(encodingResults.recordCounts?.byType || {}),
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // Insert into totals table using the correct column names
      const query = `
        INSERT INTO ${totalsTableName} (
          file_date, total_files, total_records, total_transaction_amounts, 
          total_net_deposits, bh_records, dt_records
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (file_date) DO UPDATE SET
          total_files = ${totalsTableName}.total_files + EXCLUDED.total_files,
          total_records = ${totalsTableName}.total_records + EXCLUDED.total_records,
          total_transaction_amounts = ${totalsTableName}.total_transaction_amounts + EXCLUDED.total_transaction_amounts,
          total_net_deposits = ${totalsTableName}.total_net_deposits + EXCLUDED.total_net_deposits,
          bh_records = ${totalsTableName}.bh_records + EXCLUDED.bh_records,
          dt_records = ${totalsTableName}.dt_records + EXCLUDED.dt_records,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      // Calculate transaction totals from encoding results
      const dtRecords = encodingResults.recordCounts?.byType?.DT || 0;
      const bhRecords = encodingResults.recordCounts?.byType?.BH || 0;
      const authorizationTotal = encodingResults.totalTransactionAmount || 0;
      
      const values = [
        fileDate, // file_date
        1, // total_files (always 1 per file)
        encodingResults.totalRecords || 0, // total_records
        authorizationTotal, // total_transaction_amounts
        authorizationTotal, // total_net_deposits (same as authorizations for now)
        bhRecords, // bh_records
        dtRecords // dt_records
      ];
      
      const pool = this.storage.pool || this.storage;
      await pool.query(query, values);
      
      console.log(`[MMS-WATCHER] [TDDF1-CACHE] ✅ Successfully updated ${totalsTableName} for ${filename}: ${encodingResults.totalRecords} records, $${authorizationTotal}`);
      
    } catch (error) {
      console.error(`[MMS-WATCHER] [TDDF1-CACHE] ❌ Failed to update totals cache for ${filename}:`, error);
      // Don't throw error - cache update failure shouldn't stop file processing
    }
  }

  // Fix missing individual cache entries for files that were processed in batches
  async fixMissingCacheEntries(environment) {
    try {
      console.log(`[MMS-WATCHER] [CACHE-FIX] Checking for missing individual file cache entries`);
      
      const pool = this.storage.pool;
      
      // Get all encoded TDDF files that should have individual cache entries
      const allEncodedFiles = await pool.query(`
        SELECT id, filename, encoding_at, processing_notes
        FROM ${this.storage.getTableName('uploader_uploads')}
        WHERE current_phase = 'encoded' 
          AND final_file_type = 'tddf'
        ORDER BY encoding_at
      `);
      
      console.log(`[MMS-WATCHER] [CACHE-FIX] Found ${allEncodedFiles.rows.length} total encoded TDDF files`);
      
      // Check how many have individual cache entries
      const tablePrefix = environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
      const totalsTableName = `${tablePrefix}totals`;
      
      const cacheEntries = await pool.query(`
        SELECT COUNT(*) as count FROM ${totalsTableName}
      `);
      
      const cacheCount = parseInt(cacheEntries.rows[0]?.count || '0');
      
      if (allEncodedFiles.rows.length > cacheCount) {
        console.log(`[MMS-WATCHER] [CACHE-FIX] ⚠️ Mismatch: ${allEncodedFiles.rows.length} files vs ${cacheCount} cache entries`);
        console.log(`[MMS-WATCHER] [CACHE-FIX] 🔧 Creating individual cache entries for each file...`);
        
        // Create individual cache entries for each file
        for (const fileRow of allEncodedFiles.rows) {
          await this.createIndividualCacheEntry(fileRow, environment);
        }
        
      } else {
        console.log(`[MMS-WATCHER] [CACHE-FIX] ✅ Cache entries match file count: ${cacheCount}`);
      }
      
    } catch (error) {
      console.error(`[MMS-WATCHER] [CACHE-FIX] Error checking cache entries:`, error);
    }
  }

  // Create individual cache entry for a specific TDDF file
  async createIndividualCacheEntry(fileRow, environment) {
    try {
      const pool = this.storage.pool;
      const tablePrefix = environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
      const totalsTableName = `${tablePrefix}totals`;
      
      // Extract processing date from filename
      const filename = fileRow.filename;
      const dateMatch = filename.match(/(\d{8})/); // MMDDYYYY format
      
      if (!dateMatch) {
        console.log(`[MMS-WATCHER] [CACHE-FIX] Cannot extract date from filename: ${filename}`);
        return;
      }
      
      const dateStr = dateMatch[1];
      const month = dateStr.substring(0, 2);
      const day = dateStr.substring(2, 4);
      const year = dateStr.substring(4, 8);
      const processingDate = `${year}-${month}-${day}`;
      
      // Get the corresponding TDDF1 file table name
      const tableName = `${tablePrefix}file_` + filename.toLowerCase()
        .replace(/\.tsyso$/, '')
        .replace(/\./g, '_')
        .replace(/-/g, '_');
        
      // Check if this individual file already has a cache entry
      const existingEntry = await pool.query(`
        SELECT id FROM ${totalsTableName} 
        WHERE file_date = $1 
          AND (record_breakdown->>'source_file' = $2 OR 
               record_breakdown->>'table_name' = $3)
      `, [processingDate, filename, tableName]);
      
      if (existingEntry.rows.length > 0) {
        console.log(`[MMS-WATCHER] [CACHE-FIX] Individual cache entry already exists for ${filename}`);
        return;
      }
      
      // Get stats from the actual file table
      const fileStats = await pool.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN transaction_amount > 0 THEN 1 END) as total_transactions,
          COALESCE(SUM(CASE WHEN transaction_amount > 0 THEN transaction_amount ELSE 0 END), 0) as total_authorizations,
          jsonb_object_agg(record_type, type_count) as record_breakdown
        FROM (
          SELECT 
            record_type,
            COUNT(*) as type_count,
            transaction_amount
          FROM ${tableName}
          GROUP BY record_type, transaction_amount
        ) subquery
      `);
      
      if (fileStats.rows.length > 0) {
        const stats = fileStats.rows[0];
        
        // Insert individual cache entry
        await pool.query(`
          INSERT INTO ${totalsTableName} 
          (file_date, total_files, total_records, total_transaction_amounts, total_net_deposits, bh_records, dt_records)
          VALUES ($1, 1, $2, $3, $4, 0, 0)
        `, [
          processingDate,
          parseInt(stats.total_records),
          parseFloat(stats.total_authorizations),
          parseFloat(stats.total_authorizations)
        ]);
        
        console.log(`[MMS-WATCHER] [CACHE-FIX] ✅ Created individual cache entry for ${filename}: ${stats.total_records} records, $${stats.total_authorizations}`);
      }
      
    } catch (error) {
      console.error(`[MMS-WATCHER] [CACHE-FIX] Error creating individual cache entry for ${fileRow.filename}:`, error);
    }
  }

  // Force update monthly cache for all available data
  async forceUpdateMonthlyCache(environment) {
    try {
      const tablePrefix = environment === 'production' ? 'tddf1_' : 'dev_tddf1_';
      const totalsTableName = `${tablePrefix}totals`;
      
      console.log(`[MMS-WATCHER] [MONTHLY-CACHE] Checking if monthly cache update needed for ${totalsTableName}`);
      
      // Check if we have data in totals table
      const pool = this.storage.pool;
      const hasData = await pool.query(`
        SELECT COUNT(*) as count FROM ${totalsTableName}
      `);
      
      if (parseInt(hasData.rows[0]?.count || '0') > 0) {
        console.log(`[MMS-WATCHER] [MONTHLY-CACHE] ✅ Found ${hasData.rows[0]?.count} records in ${totalsTableName}, monthly APIs should work`);
      } else {
        console.log(`[MMS-WATCHER] [MONTHLY-CACHE] ⚠️ No data found in ${totalsTableName}`);
      }
      
    } catch (error) {
      console.error(`[MMS-WATCHER] [MONTHLY-CACHE] Error checking monthly cache:`, error);
    }
  }

  // Step 6 Slot Management Helpers
  canAcquireSlot() {
    return this.step6ActiveSlots.size < MAX_STEP6_CONCURRENT_FILES;
  }

  acquireSlot(uploadId) {
    if (!this.canAcquireSlot()) {
      return false;
    }
    this.step6ActiveSlots.add(uploadId);
    console.log(`[MMS-WATCHER] [STEP6-SLOT] 🔓 Acquired slot for ${uploadId} (${this.step6ActiveSlots.size}/${MAX_STEP6_CONCURRENT_FILES} active)`);
    return true;
  }

  releaseSlot(uploadId) {
    const wasActive = this.step6ActiveSlots.delete(uploadId);
    if (wasActive) {
      console.log(`[MMS-WATCHER] [STEP6-SLOT] 🔒 Released slot for ${uploadId} (${this.step6ActiveSlots.size}/${MAX_STEP6_CONCURRENT_FILES} active)`);
    }
    return wasActive;
  }

  enqueueFile(upload) {
    // Guard: Check if already in active slots
    if (this.step6ActiveSlots.has(upload.id)) {
      console.log(`[MMS-WATCHER] [STEP6-QUEUE] ⚠️  Skipping queue - ${upload.filename} already in active slot`);
      return false;
    }
    
    // Guard: Check if already queued
    const isAlreadyQueued = this.step6QueuedFiles.some(item => item.upload.id === upload.id);
    if (isAlreadyQueued) {
      console.log(`[MMS-WATCHER] [STEP6-QUEUE] ⚠️  Skipping queue - ${upload.filename} already queued`);
      return false;
    }
    
    this.step6QueuedFiles.push({
      upload,
      queuedAt: Date.now()
    });
    this.step6ProcessingMetrics.totalQueued++;
    this.step6ProcessingMetrics.peakQueueSize = Math.max(this.step6ProcessingMetrics.peakQueueSize, this.step6QueuedFiles.length);
    console.log(`[MMS-WATCHER] [STEP6-QUEUE] 📥 Queued ${upload.filename} (queue size: ${this.step6QueuedFiles.length})`);
    return true;
  }

  dequeueFile() {
    if (this.step6QueuedFiles.length === 0) {
      return null;
    }
    const queuedItem = this.step6QueuedFiles.shift();
    const waitTimeMs = Date.now() - queuedItem.queuedAt;
    this.step6ProcessingMetrics.totalSlotWaitTimeMs += waitTimeMs;
    console.log(`[MMS-WATCHER] [STEP6-QUEUE] 📤 Dequeued ${queuedItem.upload.filename} after ${waitTimeMs}ms wait (${this.step6QueuedFiles.length} remaining)`);
    return queuedItem.upload;
  }

  // Stage 6: Step 6 Processing Service - Process encoded files to completion with concurrency limiting
  async processEncodedFiles() {
    // Guard: Set sweep running flag
    this.isStep6SweepRunning = true;
    
    try {
      console.log(`[MMS-WATCHER] [AUTO-STEP6] 🔄 Starting Step 6 sweep (slots: ${this.step6ActiveSlots.size}/${MAX_STEP6_CONCURRENT_FILES}, queued: ${this.step6QueuedFiles.length})`);
      
      // Step 1: Process queued files first (fill available slots)
      await this.processQueuedFiles();
      
      // Step 2: Find new encoded files
      const encodedFiles = await this.storage.getUploaderUploads({
        phase: 'encoded'
      });

      if (encodedFiles.length === 0) {
        console.log(`[MMS-WATCHER] [AUTO-STEP6] No new encoded files found`);
        return;
      }

      // Filter for TDDF files only
      const tddfFiles = encodedFiles.filter(upload => 
        upload.finalFileType === 'tddf' || upload.detectedFileType === 'tddf' || upload.fileType === 'tddf'
      );

      if (tddfFiles.length === 0) {
        console.log(`[MMS-WATCHER] [AUTO-STEP6] No new TDDF files found (${encodedFiles.length} total encoded files)`);
        return;
      }

      console.log(`[MMS-WATCHER] [AUTO-STEP6] Found ${tddfFiles.length} new TDDF files to process`);

      // Step 3: Process or queue each new file based on slot availability
      for (const upload of tddfFiles) {
        // Check retry count - skip if max retries exceeded
        const currentRetries = upload.retryCount || 0;
        if (currentRetries >= MAX_STEP6_RETRIES) {
          console.warn(`[MMS-WATCHER] [AUTO-STEP6] ⚠️  Skipping ${upload.filename} - max retries exceeded (${currentRetries}/${MAX_STEP6_RETRIES})`);
          
          // Move to failed status with clear error message
          await this.storage.updateUploaderPhase(upload.id, 'failed', {
            failedAt: new Date(),
            processingErrors: `Step 6 processing failed after ${MAX_STEP6_RETRIES} retry attempts`,
            processingNotes: JSON.stringify({
              reason: 'max_retries_exceeded',
              retryCount: currentRetries,
              maxRetries: MAX_STEP6_RETRIES,
              failedAt: new Date().toISOString()
            })
          });
          continue; // Skip to next file
        }
        
        // Try to acquire slot - if available, process immediately; otherwise queue
        if (this.canAcquireSlot()) {
          // Slot available - start processing (fire and forget)
          this.processStep6File(upload).catch(err => {
            console.error(`[MMS-WATCHER] [AUTO-STEP6] Unhandled error in processStep6File for ${upload.filename}:`, err);
          });
        } else {
          // No slots available - queue for later
          this.enqueueFile(upload);
        }
      }
      
      console.log(`[MMS-WATCHER] [AUTO-STEP6] 📊 Sweep complete - Active: ${this.step6ActiveSlots.size}, Queued: ${this.step6QueuedFiles.length}`);
      
    } catch (error) {
      console.error('[MMS-WATCHER] [AUTO-STEP6] Error in Step 6 sweep:', error);
    } finally {
      // Always clear sweep running flag
      this.isStep6SweepRunning = false;
    }
  }

  // Process queued files when slots become available
  async processQueuedFiles() {
    while (this.step6QueuedFiles.length > 0 && this.canAcquireSlot()) {
      const upload = this.dequeueFile();
      if (upload) {
        // Start processing (fire and forget)
        this.processStep6File(upload).catch(err => {
          console.error(`[MMS-WATCHER] [AUTO-STEP6] Unhandled error in processStep6File for ${upload.filename}:`, err);
        });
      }
    }
  }

  // Process a single Step 6 file with slot management
  async processStep6File(upload) {
    // Acquire slot (should always succeed due to prior checks, but guard anyway)
    if (!this.acquireSlot(upload.id)) {
      console.error(`[MMS-WATCHER] [STEP6-SLOT] ❌ Failed to acquire slot for ${upload.filename} - re-queuing`);
      this.enqueueFile(upload);
      return;
    }

    try {
      const currentRetries = upload.retryCount || 0;
      console.log(`[MMS-WATCHER] [AUTO-STEP6] 🚀 Starting Step 6 processing for: ${upload.filename} (${upload.id}) [Retry ${currentRetries}/${MAX_STEP6_RETRIES}]`);
      
      // Initialize progress tracking
      this.step6Progress.set(upload.id, {
        filename: upload.filename,
        totalLines: upload.lineCount || 0,
        processedRecords: 0,
        startedAt: Date.now()
      });
      
      // Update to processing phase
      await this.storage.updateUploaderPhase(upload.id, 'processing', {
        processingStartedAt: new Date(),
        processingNotes: `Step 6 processing started by MMS Watcher at ${new Date().toISOString()} (Attempt ${currentRetries + 1}/${MAX_STEP6_RETRIES})`
      });

      // Get file content from storage
      const { ReplitStorageService } = await import('./replit-storage-service.js');
      const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
      
      // Process with timeout protection and progress callback
      const { processAllRecordsToMasterTable } = await import('./tddf-json-encoder.ts');
      
      // Create progress callback
      const onBatchProgress = (processedCount, batchSize) => {
        const progress = this.step6Progress.get(upload.id);
        if (progress) {
          progress.processedRecords = processedCount;
        }
      };
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Step 6 processing timeout')), STEP6_TIMEOUT_MS);
      });
      
      const processingPromise = processAllRecordsToMasterTable(fileContent, upload, { onBatchProgress });
      const step6Results = await Promise.race([processingPromise, timeoutPromise]);
      
      if (step6Results.success) {
        // Success - update to completed
        await this.storage.updateUploaderPhase(upload.id, 'completed', {
          processingCompletedAt: new Date(),
          processingStatus: 'completed',
          processingNotes: `Step 6 completed by MMS Watcher: ${step6Results.totalRecords} records processed to master table in ${step6Results.processingTimeMs}ms`,
          totalRecordsProcessed: step6Results.totalRecords,
          masterRecordsCreated: step6Results.masterRecords,
          apiRecordsCreated: step6Results.apiRecords,
          skippedLines: step6Results.skippedLines,
          step6ProcessingTimeMs: step6Results.processingTimeMs,
          completedAt: new Date(),
          retryCount: 0 // Reset retry count on success
        });

        console.log(`[MMS-WATCHER] [AUTO-STEP6] ✅ Step 6 completed for: ${upload.filename} -> ${step6Results.totalRecords} records in ${step6Results.processingTimeMs}ms`);
        this.step6ProcessingMetrics.totalProcessed++;
      } else {
        throw new Error(step6Results.error || 'Step 6 processing failed');
      }
    } catch (error) {
      console.error(`[MMS-WATCHER] [AUTO-STEP6] ❌ Error processing ${upload.filename}:`, error.message);
      
      const newRetryCount = (upload.retryCount || 0) + 1;
      const isTimeout = error.message === 'Step 6 processing timeout';
      
      if (newRetryCount >= MAX_STEP6_RETRIES) {
        // Max retries - mark as failed
        console.error(`[MMS-WATCHER] [AUTO-STEP6] ❌ Max retries reached for ${upload.filename}`);
        await this.storage.updateUploaderPhase(upload.id, 'failed', {
          failedAt: new Date(),
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          processingErrors: isTimeout 
            ? `Step 6 timeout after ${STEP6_TIMEOUT_MS / 1000}s (${MAX_STEP6_RETRIES} attempts)` 
            : `Step 6 failed: ${error.message} (${MAX_STEP6_RETRIES} attempts)`,
          processingNotes: JSON.stringify({
            reason: isTimeout ? 'processing_timeout' : 'processing_error',
            retryCount: newRetryCount,
            maxRetries: MAX_STEP6_RETRIES,
            errorMessage: error.message,
            failedAt: new Date().toISOString()
          })
        });
      } else {
        // Retry - move back to encoded
        console.warn(`[MMS-WATCHER] [AUTO-STEP6] ⚠️  Retry ${newRetryCount}/${MAX_STEP6_RETRIES} for ${upload.filename}`);
        await this.storage.updateUploaderPhase(upload.id, 'encoded', {
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          processingWarnings: isTimeout 
            ? `Step 6 timeout (${STEP6_TIMEOUT_MS / 1000}s) - will retry (${newRetryCount}/${MAX_STEP6_RETRIES})`
            : `Step 6 error: ${error.message} - will retry (${newRetryCount}/${MAX_STEP6_RETRIES})`,
          lastWarningAt: new Date(),
          warningCount: (upload.warningCount || 0) + 1
        });
      }
    } finally {
      // Always release slot and clean up progress tracking
      this.releaseSlot(upload.id);
      this.step6Progress.delete(upload.id);
      
      // Process queued files if any are waiting
      if (this.step6QueuedFiles.length > 0) {
        await this.processQueuedFiles();
      }
    }
  }

  // Admin method: Clear stuck files from active slots
  clearStuckFilesFromSlots(uploadIds) {
    if (!uploadIds || uploadIds.length === 0) {
      console.log('[MMS-WATCHER] [ADMIN] No upload IDs provided to clear from slots');
      return { cleared: 0 };
    }

    let clearedCount = 0;
    for (const uploadId of uploadIds) {
      if (this.step6ActiveSlots.has(uploadId)) {
        this.step6ActiveSlots.delete(uploadId);
        this.step6Progress.delete(uploadId); // Clean up progress tracking
        clearedCount++;
        console.log(`[MMS-WATCHER] [ADMIN] ✅ Cleared stuck file from slot: ${uploadId}`);
      }
    }

    console.log(`[MMS-WATCHER] [ADMIN] Cleared ${clearedCount} stuck file(s) from slots (${this.step6ActiveSlots.size} slots remaining)`);
    return { cleared: clearedCount, remainingSlots: this.step6ActiveSlots.size };
  }

  // Admin method: Clear Step 6 queue
  clearStep6Queue() {
    const clearedCount = this.step6QueuedFiles.length;
    this.step6QueuedFiles = [];
    console.log(`[MMS-WATCHER] [ADMIN] ✅ Cleared ${clearedCount} items from Step 6 queue`);
    return { cleared: clearedCount };
  }

  // Admin method: Get Step 6 status
  getStep6Status() {
    const activeSlotIds = Array.from(this.step6ActiveSlots);
    const queuedFileIds = this.step6QueuedFiles.map(item => ({
      uploadId: item.upload.id,
      filename: item.upload.filename,
      queuedAt: item.queuedAt,
      waitingMs: Date.now() - item.queuedAt
    }));

    // Build progress snapshot (immutable copy)
    const progressSnapshot = [];
    for (const [uploadId, progress] of this.step6Progress.entries()) {
      // Calculate percentage and clamp to [0, 100] range
      let percentComplete = 0;
      if (progress.totalLines > 0) {
        const rawPercent = Math.round((progress.processedRecords / progress.totalLines) * 100);
        percentComplete = Math.max(0, Math.min(100, rawPercent)); // Clamp to [0, 100]
      }
      
      progressSnapshot.push({
        uploadId,
        filename: progress.filename,
        totalLines: progress.totalLines,
        processedRecords: progress.processedRecords,
        percentComplete,
        elapsedMs: Date.now() - progress.startedAt
      });
    }

    return {
      activeSlots: {
        count: this.step6ActiveSlots.size,
        max: MAX_STEP6_CONCURRENT_FILES,
        uploadIds: activeSlotIds,
        progress: progressSnapshot
      },
      queue: {
        count: this.step6QueuedFiles.length,
        files: queuedFileIds.slice(0, 10) // Show first 10 for preview
      },
      metrics: this.step6ProcessingMetrics
    };
  }

  // Stage 7: Step 7 Auto Archive Service - Archive completed files
  async processCompletedFiles() {
    try {
      // Check if Auto Step 7 is enabled by querying system settings directly
      const { db } = await import('./db.js');
      const { sql } = await import('drizzle-orm');
      const { getTableName } = await import('./table-config.js');
      
      const result = await db.execute(sql`
        SELECT setting_value FROM ${sql.identifier(getTableName('system_settings'))}
        WHERE setting_key = 'auto_step7_enabled'
      `);
      
      const autoStep7Enabled = result.rows.length > 0 ? result.rows[0].setting_value === 'true' : false;
      
      if (!autoStep7Enabled) {
        console.log(`[MMS-WATCHER] [AUTO-STEP7] Auto Step 7 is disabled, skipping completed file archiving`);
        return; // Auto Step 7 is disabled, skip archiving
      }
      
      // Find files in "completed" phase that are NOT already archived
      const completedQuery = `
        SELECT * FROM ${getTableName('uploader_uploads')}
        WHERE current_phase = 'completed'
          AND (is_archived IS NULL OR is_archived = false)
        ORDER BY start_time DESC
      `;
      const completedResult = await this.storage.pool.query(completedQuery);
      const completedFiles = completedResult.rows;

      console.log(`[MMS-WATCHER] [AUTO-STEP7] Auto Step 7 enabled - Found ${completedFiles.length} non-archived completed files`);
      
      if (completedFiles.length === 0) {
        return; // No files to archive
      }

      // Filter for TDDF files only (matching Step 6 pattern)
      // Note: Database returns snake_case column names
      const tddfFiles = completedFiles.filter(upload => 
        upload.final_file_type === 'tddf' || upload.detected_file_type === 'tddf' || upload.file_type === 'tddf'
      );

      if (tddfFiles.length === 0) {
        console.log(`[MMS-WATCHER] [AUTO-STEP7] No TDDF files found to archive (${completedFiles.length} total completed files)`);
        return; // No TDDF files to archive
      }

      // Batch limit: Process only 5 files per run for safety
      const BATCH_LIMIT = 5;
      const filesToArchive = tddfFiles.slice(0, BATCH_LIMIT);
      
      console.log(`[MMS-WATCHER] [AUTO-STEP7] Found ${tddfFiles.length} completed TDDF files, archiving ${filesToArchive.length} (batch limit: ${BATCH_LIMIT})...`);

      // Archive files using database update
      const pool = this.storage.pool;
      const uploadIds = filesToArchive.map(f => f.id);
      
      const archiveQuery = `
        UPDATE ${getTableName('uploader_uploads')}
        SET 
          is_archived = true,
          archived_at = NOW(),
          archived_by = $1
        WHERE id = ANY($2::text[])
        RETURNING id, filename, is_archived, archived_at
      `;
      
      const archiveResult = await pool.query(archiveQuery, ['watcher', uploadIds]);
      
      console.log(`[MMS-WATCHER] [AUTO-STEP7] ✅ Successfully archived ${archiveResult.rows.length} file(s)`);
      
      // Log each archived file
      for (const archivedFile of archiveResult.rows) {
        console.log(`[MMS-WATCHER] [AUTO-STEP7]   → Archived: ${archivedFile.filename} (${archivedFile.id})`);
      }
      
    } catch (error) {
      console.error('[MMS-WATCHER] [AUTO-STEP7] Error archiving completed files:', error);
    }
  }

  async markStep6Failed(upload, errorMessage) {
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'failed',
      processingNotes: `Step 6 processing failed: ${errorMessage}`,
      lastFailureReason: errorMessage, // Also populate last_failure_reason for better error tracking
      processingStatus: 'failed',
      failedAt: new Date(),
      statusMessage: `Failed: ${errorMessage}` // Update status message to show error
    });
    
    console.log(`[MMS-WATCHER] [AUTO-STEP6] ❌ Failed Step 6 processing: ${upload.filename} - ${errorMessage}`);
  }
  
  extractDateFromFilename(filename) {
    try {
      // Extract date from VERMNTSB.6759_TDDF_830_07282025_083340.TSYSO format
      // Look for pattern: MMDDYYYY
      const dateMatch = filename.match(/(\d{2})(\d{2})(\d{4})/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        return `${year}-${month}-${day}`;
      }
      
      // Fallback to current date
      return new Date().toISOString().split('T')[0];
    } catch (error) {
      console.warn(`[MMS-WATCHER] Could not extract date from filename ${filename}, using current date`);
      return new Date().toISOString().split('T')[0];
    }
  }
}

export default MMSWatcher;