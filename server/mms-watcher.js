// MMS Uploader Watcher Service
// Automatically processes files through phases 4-7: Identified → Encoding → Processing → Completed
// This service monitors files that reach "uploaded" status and progresses them through the remaining phases

class MMSWatcher {
  constructor(storage) {
    this.storage = storage;
    this.isRunning = false;
    this.intervalId = null;
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
    
    console.log('[MMS-WATCHER] Session cleanup service started - orphaned session detection active (runs every hour)');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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
}

export default MMSWatcher;