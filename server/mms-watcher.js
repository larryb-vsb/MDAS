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
    this.auto45Enabled = false; // Auto 4-5 processing disabled by default
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
    
    // Start Stage 4 identification service with reduced frequency
    this.identificationIntervalId = setInterval(async () => {
      if (!this.auto45Enabled) {
        console.log('[MMS-WATCHER] Auto 4-5 disabled - skipping identification processing');
        return;
      }
      const hasFiles = await this.hasFilesInPhase('uploaded');
      if (hasFiles) {
        this.processUploadedFiles();
      }
    }, 30000); // Check every 30 seconds (reduced from 10s) for uploaded files
    
    // Start Stage 5 encoding service with reduced frequency
    this.encodingIntervalId = setInterval(async () => {
      if (!this.auto45Enabled) {
        console.log('[MMS-WATCHER] Auto 4-5 disabled - skipping encoding processing');
        return;
      }
      const hasFiles = await this.hasFilesInPhase('identified');
      if (hasFiles) {
        this.processIdentifiedFiles();
      }
    }, 20000); // Check every 20 seconds (reduced from 5s) for identified files
    
    // Start JSONB duplicate cleanup service (during legacy import)
    this.duplicateCleanupIntervalId = setInterval(() => {
      this.runDuplicateCleanup();
    }, 900000); // Check every 15 minutes (900000ms) during legacy import
    
    console.log('[MMS-WATCHER] Session cleanup service started - orphaned session detection active (runs every hour)');
    console.log('[MMS-WATCHER] File identification service started - processes uploaded files every 30 seconds (optimized)');
    console.log('[MMS-WATCHER] File encoding service started - processes identified files every 20 seconds (optimized)');
    console.log('[MMS-WATCHER] JSONB duplicate cleanup service started - scans every 15 minutes during legacy import');
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
      // TDDF file detection (.tsyso extension or specific TDDF patterns)
      if (filename.toLowerCase().endsWith('.tsyso') || this.detectTddfPattern(lines)) {
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
          await this.encodeFile(upload);
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
        // Import and use the TDDF JSON encoder
        const { encodeTddfToJsonbDirect } = await import('./tddf-json-encoder.ts');
        encodingResults = await encodeTddfToJsonbDirect(fileContent, upload);
        
        // Update to encoded phase with TDDF results
        await this.storage.updateUploaderPhase(upload.id, 'encoded', {
          encodingCompletedAt: new Date(),
          encodingStatus: 'completed',
          encodingNotes: `Successfully encoded ${encodingResults.totalRecords} TDDF records to JSONB format`,
          jsonRecordsCreated: encodingResults.totalRecords,
          recordTypeBreakdown: encodingResults.recordCounts.byType,
          processingNotes: `Auto-encoded by MMS Watcher: ${encodingResults.totalRecords} records processed in ${encodingResults.totalProcessingTime}ms`
        });

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
      else {
        throw new Error(`Unsupported file type for encoding: ${fileType}`);
      }
      
    } catch (error) {
      console.error(`[MMS-WATCHER] Encoding failed for ${upload.filename}:`, error);
      throw error;
    }
  }

  async markEncodingFailed(upload, errorMessage) {
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'failed',
      processingNotes: `Encoding failed: ${errorMessage}`,
      encodingStatus: 'failed',
      encodingNotes: `Auto-encoding failed: ${errorMessage}`
    });
    
    console.log(`[MMS-WATCHER] ❌ Failed to encode: ${upload.filename} - ${errorMessage}`);
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
}

export default MMSWatcher;