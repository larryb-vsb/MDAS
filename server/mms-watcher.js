// MMS Uploader Watcher Service
// Automatically processes files through phases 4-7: Identified → Encoding → Processing → Completed
// This service monitors files that reach "uploaded" status and progresses them through the remaining phases

import { JsonbDuplicateCleanup } from './jsonb-duplicate-cleanup.js';

class MMSWatcher {
  constructor(storage) {
    this.storage = storage;
    this.isRunning = false;
    this.intervalId = null;
    this.identificationIntervalId = null;
    this.encodingIntervalId = null;
    this.duplicateCleanupIntervalId = null;
    this.duplicateCleanup = new JsonbDuplicateCleanup();
    this.auto45Enabled = false; // Auto 4-5 processing disabled by default - controlled via API
    this.manual45Queue = new Set(); // Manual processing queue for single-step progression
    console.log('[MMS-WATCHER] Watcher service initialized');
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
        const hasAutoFiles = await this.hasFilesInPhase('identified');
        if (hasAutoFiles) {
          console.log('[MMS-WATCHER] [AUTO-45] Processing identified files for encoding');
          await this.processIdentifiedFiles();
        }
      }
      
      // Manual encoding will be handled separately via manual queue
    }, 20000); // Check every 20 seconds for auto encoding
    
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
            processingNotes: 'Session cleanup: upload stalled for >10 minutes',
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
            processingNotes: 'Session cleanup: broken session data detected',
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
              processingNotes: `Session cleanup: file validation failed - ${validationError.message}`,
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
      // Check for recently encoded TDDF files that need cache updates
      const recentlyEncoded = await this.storage.pool.query(`
        SELECT id, filename, encoded_at, processing_notes
        FROM ${this.storage.getTableName('uploader_uploads')}
        WHERE current_phase = 'encoded' 
          AND final_file_type = 'tddf'
          AND encoded_at > NOW() - INTERVAL '10 minutes'
          AND (processing_notes NOT LIKE '%cache_updated%' OR processing_notes IS NULL)
        ORDER BY encoded_at DESC
        LIMIT 5
      `);

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
          // Manual identify: uploaded → identified
          // Parse existing processing notes safely
          let existingNotes = {};
          try {
            existingNotes = JSON.parse(upload.processingNotes || '{}');
          } catch (e) {
            // If existing notes aren't valid JSON, preserve as legacy_notes
            existingNotes = { legacy_notes: upload.processingNotes };
          }
          
          await this.storage.updateUploaderUpload(uploadId, {
            currentPhase: 'identified',
            identifiedAt: new Date().toISOString(),
            processingNotes: JSON.stringify({
              ...existingNotes,
              manualIdentificationAt: new Date().toISOString(),
              identificationMethod: 'manual_watcher_triggered'
            })
          });
          console.log(`[MMS-WATCHER] [MANUAL-45] ${upload.filename}: uploaded → identified`);
          this.manual45Queue.delete(uploadId);
          
        } else if (upload.currentPhase === 'identified') {
          // Manual encode: identified → encoding → encoded
          await this.processIdentifiedFileManual(upload);
          this.manual45Queue.delete(uploadId);
          
        } else {
          // File in unexpected phase, remove from queue
          console.log(`[MMS-WATCHER] [MANUAL-45] File ${upload.filename} in unexpected phase ${upload.currentPhase}, removing from queue`);
          this.manual45Queue.delete(uploadId);
        }

      } catch (error) {
        console.error(`[MMS-WATCHER] [MANUAL-45] Error processing ${uploadId}:`, error);
        this.manual45Queue.delete(uploadId); // Remove failed files from queue
      }
    }
  }

  // Manual encoding process for single files
  async processIdentifiedFileManual(upload) {
    try {
      console.log(`[MMS-WATCHER] [MANUAL-45] Starting encoding for ${upload.filename}`);
      
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
      const fileContent = await ReplitStorageService.getFileContent(upload.storageKey);
      
      if (!fileContent) {
        throw new Error('File content not accessible');
      }

      // Encode TDDF to TDDF1 file-based tables
      const { encodeTddfToTddf1FileBased } = await import('./tddf-json-encoder.js');
      const encodingResult = await encodeTddfToTddf1FileBased(fileContent, upload);

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

      console.log(`[MMS-WATCHER] [MANUAL-45] ${upload.filename}: identified → encoding → encoded (${encodingResult.totalRecords || 0} records)`);

    } catch (error) {
      console.error(`[MMS-WATCHER] [MANUAL-45] Encoding failed for ${upload.filename}:`, error);
      
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
    console.log(`[MMS-WATCHER] Identifying file: ${upload.filename} (${upload.id})`);
    
    // Get file content from Replit Object Storage
    const { ReplitStorageService } = await import('./replit-storage-service.js');
    const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
    
    // Analyze file structure and content, considering user's original file type selection
    const identification = await this.analyzeFileContent(fileContent, upload.filename, upload.fileType);
    
    // Update upload record with identification results
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'identified',
      identifiedAt: new Date(),
      detectedFileType: identification.detectedType,
      finalFileType: identification.finalType,
      lineCount: identification.lineCount,
      hasHeaders: identification.hasHeaders,
      fileFormat: identification.format,
      validationErrors: identification.validationErrors,
      processingNotes: `File identified: ${identification.detectedType} format, ${identification.lineCount} lines, headers: ${identification.hasHeaders}`
    });

    console.log(`[MMS-WATCHER] ✅ File identified: ${upload.filename} -> ${identification.detectedType} (${identification.lineCount} lines)`);
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
      // SubMerchantTerminals file detection - check filename patterns first
      if (this.detectSubMerchantTerminalsFile(filename)) {
        detectedType = 'sub_merchant_terminals';
        format = filename.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
        hasHeaders = true; // Terminal files typically have headers
        console.log('[MMS-WATCHER] Detected SubMerchantTerminals format');
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
        
        // Check if user selected a specific merchant file type
        if (userSelectedFileType === 'ach_merchant' || userSelectedFileType === 'merchant') {
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

  async markIdentificationFailed(upload, errorMessage) {
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'failed',
      processingNotes: `Identification failed: ${errorMessage}`,
      validationErrors: [errorMessage]
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

      if (identifiedFiles.length === 0) {
        return; // No files to process
      }

      // Filter for files that need encoding (TDDF files and merchant CSV files)
      const encodableFiles = identifiedFiles.filter(upload => 
        upload.finalFileType === 'tddf' || upload.detectedFileType === 'tddf' ||
        upload.finalFileType === 'merchant_csv' || upload.detectedFileType === 'merchant_csv'
      );

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
        processingNotes: `Auto-encoding started by MMS Watcher at ${new Date().toISOString()}`
      });

      // Get file content from Replit Object Storage
      const { ReplitStorageService } = await import('./replit-storage-service.js');
      const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
      
      // Determine file type and process accordingly
      const fileType = upload.finalFileType || upload.detectedFileType;
      let encodingResults;
      
      if (fileType === 'tddf') {
        // Import and use the TDDF1 file-based encoder
        const { encodeTddfToTddf1FileBased } = await import('./tddf-json-encoder.ts');
        encodingResults = await encodeTddfToTddf1FileBased(fileContent, upload);
        
        // Update to encoded phase with TDDF results
        await this.storage.updateUploaderPhase(upload.id, 'encoded', {
          encodingCompletedAt: new Date(),
          encodingStatus: 'completed',
          encodingNotes: `Successfully encoded ${encodingResults.totalRecords} TDDF records to TDDF1 file-based table`,
          jsonRecordsCreated: encodingResults.totalRecords,
          recordTypeBreakdown: encodingResults.recordCounts.byType,
          processingNotes: `Auto-encoded by MMS Watcher: ${encodingResults.totalRecords} records processed in ${encodingResults.totalProcessingTime}ms`
        });

        // Update TDDF1 totals cache for newly encoded file
        await this.updateTddf1TotalsCache(upload.filename, encodingResults);

        console.log(`[MMS-WATCHER] ✅ File encoded: ${upload.filename} -> ${encodingResults.totalRecords} records (${encodingResults.totalProcessingTime}ms)`);
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
            processingNotes: `Auto-processed by MMS Watcher: ${processingResults.rowsProcessed || 0} rows processed, ${processingResults.merchantsCreated || 0} merchants created`
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
      else if (fileType === 'sub_merchant_terminals') {
        // SubMerchantTerminals file processing
        console.log(`[MMS-WATCHER] Processing SubMerchantTerminals file: ${upload.filename}`);
        
        // For Excel files, we'll mark as processed but note they need manual handling
        if (upload.filename.toLowerCase().endsWith('.xlsx') || upload.filename.toLowerCase().endsWith('.xls')) {
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `SubMerchantTerminals Excel file identified and ready for manual processing`,
            processingNotes: `SubMerchantTerminals Excel file detected - requires manual import via MerchantDetail page SubMerchantTerminals component`,
            fileTypeIdentified: 'sub_merchant_terminals',
            requiresManualImport: true
          });
          
          console.log(`[MMS-WATCHER] ✅ SubMerchantTerminals Excel file identified: ${upload.filename} - ready for manual import`);
        } else {
          // For CSV files, we could potentially auto-process them
          await this.storage.updateUploaderPhase(upload.id, 'encoded', {
            encodingCompletedAt: new Date(),
            encodingStatus: 'completed',
            encodingNotes: `SubMerchantTerminals CSV file identified and ready for processing`,
            processingNotes: `SubMerchantTerminals CSV file detected - can be imported via MerchantDetail page`,
            fileTypeIdentified: 'sub_merchant_terminals',
            requiresManualImport: true
          });
          
          console.log(`[MMS-WATCHER] ✅ SubMerchantTerminals CSV file identified: ${upload.filename} - ready for import`);
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
      
      // Insert into totals table using the correct simplified structure
      const query = `
        INSERT INTO ${totalsTableName} (
          processing_date, total_files, total_records, total_transactions, 
          total_authorizations, net_deposit, record_breakdown, created_at, last_updated
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT (processing_date) DO UPDATE SET
          total_files = ${totalsTableName}.total_files + EXCLUDED.total_files,
          total_records = ${totalsTableName}.total_records + EXCLUDED.total_records,
          total_transactions = ${totalsTableName}.total_transactions + EXCLUDED.total_transactions,
          total_authorizations = ${totalsTableName}.total_authorizations + EXCLUDED.total_authorizations,
          net_deposit = ${totalsTableName}.net_deposit + EXCLUDED.net_deposit,
          record_breakdown = EXCLUDED.record_breakdown,
          last_updated = EXCLUDED.last_updated
      `;
      
      // Calculate transaction totals from encoding results
      const transactionTotal = encodingResults.recordCounts?.byType?.DT || 0;
      const authorizationTotal = encodingResults.totalTransactionAmount || 0;
      
      const values = [
        fileDate, // processing_date
        1, // total_files (always 1 per file)
        encodingResults.totalRecords || 0, // total_records
        transactionTotal, // total_transactions (DT records)
        authorizationTotal, // total_authorizations
        authorizationTotal, // net_deposit (same as authorizations for now)
        JSON.stringify(encodingResults.recordCounts?.byType || {}), // record_breakdown
        new Date(), // created_at
        new Date() // last_updated
      ];
      
      await this.storage.pool.query(query, values);
      
      console.log(`[MMS-WATCHER] [TDDF1-CACHE] ✅ Successfully updated ${totalsTableName} for ${filename}: ${encodingResults.totalRecords} records, $${authorizationTotal}`);
      
    } catch (error) {
      console.error(`[MMS-WATCHER] [TDDF1-CACHE] ❌ Failed to update totals cache for ${filename}:`, error);
      // Don't throw error - cache update failure shouldn't stop file processing
    }
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