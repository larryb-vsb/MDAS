// MMS Uploader Watcher Service
// Automatically processes files through phases 4-7: Identified → Encoding → Processing → Completed
// This service monitors files that reach "uploaded" status and progresses them through the remaining phases

class MMSWatcher {
  constructor(storage) {
    this.storage = storage;
    this.isRunning = false;
    this.intervalId = null;
    this.identificationIntervalId = null;
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
    
    // Start Stage 4 identification service
    this.identificationIntervalId = setInterval(() => {
      this.processUploadedFiles();
    }, 10000); // Check every 10 seconds for uploaded files ready for identification
    
    console.log('[MMS-WATCHER] Session cleanup service started - orphaned session detection active (runs every hour)');
    console.log('[MMS-WATCHER] File identification service started - processes uploaded files every 10 seconds');
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
    
    // Analyze file structure and content
    const identification = await this.analyzeFileContent(fileContent, upload.filename);
    
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

  async analyzeFileContent(fileContent, filename) {
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
      // CSV file detection
      else if (this.detectCsvPattern(lines)) {
        detectedType = 'transaction_csv';
        format = 'csv';
        hasHeaders = this.detectCsvHeaders(lines);
        console.log('[MMS-WATCHER] Detected CSV format with headers:', hasHeaders);
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

  async markIdentificationFailed(upload, errorMessage) {
    await this.storage.updateUploaderUpload(upload.id, {
      currentPhase: 'failed',
      processingNotes: `Identification failed: ${errorMessage}`,
      validationErrors: [errorMessage]
    });
    
    console.log(`[MMS-WATCHER] ❌ Failed to identify: ${upload.filename} - ${errorMessage}`);
  }
}

export default MMSWatcher;