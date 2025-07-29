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
    console.log('[MMS-WATCHER] Starting monitoring service (phases 1-3 only)...');
    
    // Only monitor - don't auto-process beyond uploaded phase
    this.intervalId = setInterval(() => {
      this.monitorFiles();
    }, 10000); // Check less frequently since we're just monitoring
    
    console.log('[MMS-WATCHER] Service started - monitoring files (no auto-processing beyond uploaded)');
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

  async monitorFiles() {
    try {
      // Just monitor uploaded files - don't auto-process them
      const uploadedFiles = await this.storage.getUploaderUploads({
        phase: 'uploaded'
      });

      if (uploadedFiles.length > 0) {
        console.log(`[MMS-WATCHER] Monitoring ${uploadedFiles.length} uploaded files (ready for manual processing)`);
      }

    } catch (error) {
      console.error('[MMS-WATCHER] Error monitoring files:', error);
    }
  }

  // Note: Automatic processing methods removed - system only handles phases 1-3
  // Files remain in "uploaded" status as raw-unprocessed data for manual processing
}

export default MMSWatcher;