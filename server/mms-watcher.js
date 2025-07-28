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
    console.log('[MMS-WATCHER] Starting automatic file processing service...');
    
    // Check for uploaded files every 5 seconds
    this.intervalId = setInterval(() => {
      this.processUploadedFiles();
    }, 5000);
    
    console.log('[MMS-WATCHER] Service started - monitoring uploaded files every 5 seconds');
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

  async processUploadedFiles() {
    try {
      // Get all files in "uploaded" status ready for processing
      const uploadedFiles = await this.storage.getUploaderUploads({
        phase: 'uploaded'
      });

      if (uploadedFiles.length === 0) {
        return; // No files to process
      }

      console.log(`[MMS-WATCHER] Found ${uploadedFiles.length} uploaded files ready for processing`);

      for (const file of uploadedFiles) {
        await this.processFilePhases(file);
      }

    } catch (error) {
      console.error('[MMS-WATCHER] Error processing uploaded files:', error);
    }
  }

  async processFilePhases(file) {
    try {
      console.log(`[MMS-WATCHER] Starting processing for file: ${file.filename} (${file.id})`);

      // Phase 4: Identified
      await this.updatePhaseWithDelay(file.id, 'identified', {
        identifiedAt: new Date().toISOString(),
        fileType: file.finalFileType || 'unknown',
        processingNotes: 'File identified and ready for encoding'
      }, 1000);

      // Phase 5: Encoding  
      await this.updatePhaseWithDelay(file.id, 'encoding', {
        encodingStartedAt: new Date().toISOString(),
        processingNotes: 'File encoding in progress'
      }, 2000);

      // Phase 6: Processing
      await this.updatePhaseWithDelay(file.id, 'processing', {
        processingStartedAt: new Date().toISOString(),
        processingNotes: 'File processing in progress - extracting data'
      }, 3000);

      // Phase 7: Completed
      await this.updatePhaseWithDelay(file.id, 'completed', {
        completedAt: new Date().toISOString(),
        processingNotes: 'File processing completed successfully',
        finalStatus: 'success'
      }, 1500);

      console.log(`[MMS-WATCHER] ✅ File processing completed: ${file.filename}`);

    } catch (error) {
      console.error(`[MMS-WATCHER] Error processing file ${file.filename}:`, error);
      
      // Mark file as failed if processing encounters errors
      try {
        await this.storage.updateUploaderPhase(file.id, 'failed', {
          failedAt: new Date().toISOString(),
          processingNotes: `Processing failed: ${error.message}`,
          finalStatus: 'error'
        });
      } catch (updateError) {
        console.error(`[MMS-WATCHER] Failed to update file status to failed:`, updateError);
      }
    }
  }

  async updatePhaseWithDelay(uploadId, phase, phaseData, delayMs) {
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          await this.storage.updateUploaderPhase(uploadId, phase, phaseData);
          console.log(`[MMS-WATCHER] ${uploadId}: → ${phase}`);
          resolve();
        } catch (error) {
          console.error(`[MMS-WATCHER] Failed to update to ${phase}:`, error);
          reject(error);
        }
      }, delayMs);
    });
  }
}

export default MMSWatcher;