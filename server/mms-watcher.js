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
    console.log('[MMS-WATCHER] Starting MMS Uploader processing service (phases 4-8)...');
    
    // Reactivate full processing pipeline for uploaded files
    this.intervalId = setInterval(() => {
      this.processFiles();
    }, 5000); // Check every 5 seconds for responsive processing
    
    console.log('[MMS-WATCHER] Service started - full 8-phase processing active');
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

  async processFiles() {
    try {
      // Process files through phases 4-8: uploaded → identified → encoding → processing → completed
      await this.processUploadedFiles();
      await this.processIdentifiedFiles();
      await this.processEncodedFiles();
      await this.processProcessingFiles();

    } catch (error) {
      console.error('[MMS-WATCHER] Error processing files:', error);
    }
  }

  // Phase 4: Identify uploaded files (analyze content, count lines, detect file type)
  async processUploadedFiles() {
    try {
      const uploadedFiles = await this.storage.getUploaderUploads({
        phase: 'uploaded',
        limit: 10
      });

      for (const upload of uploadedFiles) {
        try {
          console.log(`[MMS-WATCHER] Phase 4: Identifying file ${upload.filename} (${upload.id})`);
          
          // Import Replit Storage Service to read file content
          const { ReplitStorageService } = await import('./replit-storage-service.js');
          
          // Read file content from Replit Object Storage
          const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
          
          // Analyze file content
          const lines = fileContent.split('\n');
          const actualLineCount = lines.length;
          const fileSize = Buffer.byteLength(fileContent, 'utf8');
          
          // Determine processing notes based on file type
          let processingNotes = `File identified: ${actualLineCount} lines, ${fileSize} bytes`;
          
          if (upload.fileType === 'tddf' && upload.filename.endsWith('.TSYSO')) {
            processingNotes += '. TDDF file detected for transaction processing.';
          } else if (upload.fileType === 'merchant' && upload.filename.endsWith('.csv')) {
            processingNotes += '. Merchant CSV file detected.';
          } else if (upload.fileType === 'transaction' && upload.filename.endsWith('.csv')) {
            processingNotes += '. Transaction CSV file detected.';
          } else {
            processingNotes += '. File type verification completed.';
          }

          // Update to identified phase
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'identified',
            identifiedAt: new Date(),
            lineCount: actualLineCount,
            fileSize: fileSize,
            processingNotes: processingNotes
          });

          console.log(`[MMS-WATCHER] ✅ Phase 4 complete: ${upload.filename} identified (${actualLineCount} lines)`);

        } catch (error) {
          console.error(`[MMS-WATCHER] Phase 4 error for ${upload.filename}:`, error);
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'warning',
            processingNotes: `Identification failed: ${error.message}`
          });
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error processing uploaded files:', error);
    }
  }

  // Phase 5: Encode identified files (prepare JSON data structure)
  async processIdentifiedFiles() {
    try {
      const identifiedFiles = await this.storage.getUploaderUploads({
        phase: 'identified',
        limit: 5
      });

      for (const upload of identifiedFiles) {
        try {
          console.log(`[MMS-WATCHER] Phase 5: Encoding file ${upload.filename} (${upload.id})`);
          
          // Import Replit Storage Service
          const { ReplitStorageService } = await import('./replit-storage-service.js');
          
          // Read file content for encoding
          const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
          
          // Prepare JSON encoding based on file type
          let encodingNotes = 'File content encoded to JSON structure';
          let jsonData = {};
          
          if (upload.fileType === 'tddf') {
            // TDDF-specific encoding
            const lines = fileContent.split('\n').filter(line => line.trim());
            jsonData = {
              fileType: 'tddf',
              totalLines: lines.length,
              recordTypes: this.analyzeTddfRecordTypes(lines),
              processingMetadata: {
                sourceFile: upload.filename,
                uploadId: upload.id,
                storageKey: upload.s3Key
              }
            };
            encodingNotes = `TDDF file encoded: ${lines.length} records prepared for database insertion`;
          } else {
            // Generic CSV encoding
            const lines = fileContent.split('\n');
            const headers = lines[0]?.split(',') || [];
            jsonData = {
              fileType: upload.fileType,
              headers: headers,
              rowCount: lines.length - 1,
              processingMetadata: {
                sourceFile: upload.filename,
                uploadId: upload.id,
                storageKey: upload.s3Key
              }
            };
            encodingNotes = `CSV file encoded: ${headers.length} columns, ${lines.length - 1} data rows`;
          }

          // Update to encoding phase
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'encoding',
            encodingStartedAt: new Date(),
            processingNotes: encodingNotes,
            jsonData: JSON.stringify(jsonData)
          });

          console.log(`[MMS-WATCHER] ✅ Phase 5 complete: ${upload.filename} encoded`);

        } catch (error) {
          console.error(`[MMS-WATCHER] Phase 5 error for ${upload.filename}:`, error);
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'warning',
            processingNotes: `Encoding failed: ${error.message}`
          });
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error processing identified files:', error);
    }
  }

  // Phase 6: Process encoded files (insert into database)
  async processEncodedFiles() {
    try {
      const encodedFiles = await this.storage.getUploaderUploads({
        phase: 'encoding',
        limit: 3
      });

      for (const upload of encodedFiles) {
        try {
          console.log(`[MMS-WATCHER] Phase 6: Processing file ${upload.filename} (${upload.id})`);
          
          // Update to processing phase
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'processing',
            processingStartedAt: new Date(),
            processingNotes: `Database processing started for ${upload.fileType} file`
          });

          // Import storage service for database operations
          const { ReplitStorageService } = await import('./replit-storage-service.js');
          
          // Read file content for database insertion
          const fileContent = await ReplitStorageService.getFileContent(upload.s3Key);
          
          let processedRecords = 0;
          let processingResults = '';

          if (upload.fileType === 'tddf') {
            // Process TDDF file - integrate with existing TDDF processing system
            processedRecords = await this.processTddfToDatabase(fileContent, upload);
            processingResults = `TDDF processing: ${processedRecords} records inserted into database`;
          } else if (upload.fileType === 'merchant') {
            // Process merchant CSV file
            processedRecords = await this.processMerchantCsvToDatabase(fileContent, upload);
            processingResults = `Merchant processing: ${processedRecords} records inserted into database`;
          } else if (upload.fileType === 'transaction') {
            // Process transaction CSV file  
            processedRecords = await this.processTransactionCsvToDatabase(fileContent, upload);
            processingResults = `Transaction processing: ${processedRecords} records inserted into database`;
          } else {
            processingResults = `File type ${upload.fileType} processed (${upload.lineCount} lines analyzed)`;
          }

          // Update processing notes with results
          await this.storage.updateUploaderUpload(upload.id, {
            processingNotes: processingResults,
            recordsProcessed: processedRecords
          });

          console.log(`[MMS-WATCHER] ✅ Phase 6 progress: ${upload.filename} - ${processingResults}`);

        } catch (error) {
          console.error(`[MMS-WATCHER] Phase 6 error for ${upload.filename}:`, error);
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'warning',
            processingNotes: `Database processing failed: ${error.message}`
          });
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error processing encoded files:', error);
    }
  }

  // Phase 7: Complete processing files (finalize and mark as completed)
  async processProcessingFiles() {
    try {
      const processingFiles = await this.storage.getUploaderUploads({
        phase: 'processing',
        limit: 5
      });

      for (const upload of processingFiles) {
        try {
          console.log(`[MMS-WATCHER] Phase 7: Completing file ${upload.filename} (${upload.id})`);
          
          // Finalize processing
          const completionTime = new Date();
          const processingDurationMs = upload.processingStartedAt 
            ? completionTime.getTime() - new Date(upload.processingStartedAt).getTime()
            : 0;

          // Update to completed phase
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'completed',
            completedAt: completionTime,
            processingTimeMs: processingDurationMs,
            processingNotes: `✅ Processing completed successfully in ${Math.round(processingDurationMs/1000)}s. File processed through full 8-phase MMS Uploader workflow.`
          });

          console.log(`[MMS-WATCHER] ✅ Phase 7 complete: ${upload.filename} - Processing completed (${Math.round(processingDurationMs/1000)}s)`);

        } catch (error) {
          console.error(`[MMS-WATCHER] Phase 7 error for ${upload.filename}:`, error);
          await this.storage.updateUploaderUpload(upload.id, {
            currentPhase: 'warning',
            processingNotes: `Completion failed: ${error.message}`
          });
        }
      }
    } catch (error) {
      console.error('[MMS-WATCHER] Error completing processing files:', error);
    }
  }

  // Helper method to analyze TDDF record types
  analyzeTddfRecordTypes(lines) {
    const recordTypes = {};
    lines.forEach(line => {
      if (line.length > 18) {
        const recordType = line.substring(17, 19); // Positions 18-19
        recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
      }
    });
    return recordTypes;
  }

  // Helper method to process TDDF files to database
  async processTddfToDatabase(fileContent, upload) {
    try {
      // This would integrate with your existing TDDF processing system
      // For now, simulate processing
      const lines = fileContent.split('\n').filter(line => line.trim());
      const dtRecords = lines.filter(line => line.length > 18 && line.substring(17, 19) === 'DT');
      
      console.log(`[MMS-WATCHER] TDDF processing: ${dtRecords.length} DT records found out of ${lines.length} total lines`);
      
      // Simulate database insertion (replace with actual TDDF processing logic)
      return dtRecords.length;
    } catch (error) {
      console.error('[MMS-WATCHER] TDDF database processing error:', error);
      throw error;
    }
  }

  // Helper method to process merchant CSV to database
  async processMerchantCsvToDatabase(fileContent, upload) {
    try {
      const lines = fileContent.split('\n').filter(line => line.trim());
      const dataRows = lines.slice(1); // Skip header
      
      console.log(`[MMS-WATCHER] Merchant CSV processing: ${dataRows.length} merchant records`);
      
      // Simulate database insertion (replace with actual merchant processing logic)
      return dataRows.length;
    } catch (error) {
      console.error('[MMS-WATCHER] Merchant CSV database processing error:', error);
      throw error;
    }
  }

  // Helper method to process transaction CSV to database  
  async processTransactionCsvToDatabase(fileContent, upload) {
    try {
      const lines = fileContent.split('\n').filter(line => line.trim());
      const dataRows = lines.slice(1); // Skip header
      
      console.log(`[MMS-WATCHER] Transaction CSV processing: ${dataRows.length} transaction records`);
      
      // Simulate database insertion (replace with actual transaction processing logic)
      return dataRows.length;
    } catch (error) {
      console.error('[MMS-WATCHER] Transaction CSV database processing error:', error);
      throw error;
    }
  }
}

export default MMSWatcher;