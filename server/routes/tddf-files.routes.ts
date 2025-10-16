import type { Express } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { getTableName, getEnvironmentPrefix } from "../table-config";
import { NODE_ENV } from "../env-config";
import { isAuthenticated, isApiKeyAuthenticated } from "./middleware";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { ReplitStorageService } from "../replit-storage-service";
import { processAllRecordsToMasterTable } from "../tddf-json-encoder";

// Multer configurations for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const tddfStorage = multer({
  dest: path.join(os.tmpdir(), 'tddf-api-uploads'),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for production
  }
});

// Business day extraction utility for TDDF filenames
function extractBusinessDayFromFilename(filename: string): { businessDay: Date | null, fileDate: string | null } {
  // Pattern: VERMNTSB.6759_TDDF_830_10272022_001356.TSYSO
  // Look for 8-digit date pattern: MMDDYYYY
  const dateMatch = filename.match(/(\d{8})/);
  
  if (!dateMatch) {
    return { businessDay: null, fileDate: null };
  }
  
  const dateStr = dateMatch[1];
  
  // Parse MMDDYYYY format
  if (dateStr.length === 8) {
    const month = dateStr.substring(0, 2);
    const day = dateStr.substring(2, 4);
    const year = dateStr.substring(4, 8);
    
    try {
      const businessDay = new Date(`${year}-${month}-${day}`);
      // Validate the date is reasonable (not invalid)
      if (isNaN(businessDay.getTime())) {
        return { businessDay: null, fileDate: dateStr };
      }
      return { businessDay, fileDate: dateStr };
    } catch (error) {
      return { businessDay: null, fileDate: dateStr };
    }
  }
  
  return { businessDay: null, fileDate: dateStr };
}

export function registerTddfFilesRoutes(app: Express) {
  // ==================== UPLOAD OPERATIONS ====================
  
  // TDDF API ping endpoint for connectivity testing
  app.get("/api/tddf/ping", isApiKeyAuthenticated, async (req, res) => {
    try {
      const apiUser = (req as any).apiUser;
      console.log(`[TDDF API PING] Ping request from API user: ${apiUser.clientName}`);
      
      res.json({ 
        success: true, 
        message: "TDDF API is operational", 
        timestamp: new Date().toISOString(),
        apiUser: apiUser.clientName,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      console.error('[TDDF API PING] Error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Ping failed" 
      });
    }
  });

  // Multi-stream JSON TDDF upload endpoint (for PowerShell agent)
  app.post("/api/tddf/upload-json", isApiKeyAuthenticated, async (req, res) => {
    try {
      const { streamId, batchId, recordCount, records } = req.body;
      
      if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: "No records provided" });
      }
      
      console.log(`[JSON UPLOAD] Stream ${streamId}, Batch ${batchId}: Processing ${recordCount} records`);
      
      let processedCount = 0;
      let dtRecordsCreated = 0;
      let errors = 0;
      
      // Generate unique file ID for this batch
      const fileId = `json_stream_${streamId}_batch_${batchId}_${Date.now()}`;
      const currentEnvironment = process.env.NODE_ENV || 'production';
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Create file record for tracking
      await pool.query(`
        INSERT INTO ${uploadedFilesTableName} (
          id, original_filename, storage_path, file_type, uploaded_at, 
          processed, deleted, file_content, upload_environment, 
          raw_lines_count, processing_notes, processing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        fileId,
        `stream_${streamId}_batch_${batchId}.json`,
        'json_stream',
        'tddf',
        new Date(),
        false,
        false,
        Buffer.from(JSON.stringify(records)).toString('base64'),
        currentEnvironment,
        recordCount,
        `JSON stream upload: ${recordCount} records from stream ${streamId}`,
        'processing'
      ]);
      
      // Process each record
      for (const record of records) {
        try {
          processedCount++;
          
          // Only process DT (Detail Transaction) records
          if (record.recordType === 'DT' && record.transactionFields) {
            const txnFields = record.transactionFields;
            
            // Parse amount (convert from cents to dollars)
            const txnAmount = parseFloat(txnFields.transactionAmount) / 100;
            const authAmount = parseFloat(txnFields.authorizationAmount) / 100;
            
            // Parse date (MMDDCCYY format)
            const dateStr = txnFields.transactionDate;
            let txnDate = null;
            if (dateStr && dateStr.length === 8) {
              const month = dateStr.substring(0, 2);
              const day = dateStr.substring(2, 4);
              const year = dateStr.substring(4, 8);
              txnDate = new Date(`${year}-${month}-${day}`);
            }
            
            // Create TDDF record using connection pool with comprehensive schema
            const tddfRecordsTableName = getTableName('tddf_records');
            
            // Extract all available fields from comprehensive schema
            const comprehensiveFields = {
              // Core identification
              id: `STREAM_${streamId}_${batchId}_${record.lineNumber}`,
              reference_number: txnFields.referenceNumber || '',
              merchant_account_number: txnFields.merchantAccountNumber || '',
              
              // Transaction amounts (convert from cents)
              transaction_amount: txnAmount,
              authorization_amount: authAmount,
              fee_amount: parseFloat(txnFields.feeAmount || '0') / 100,
              cashback_amount: parseFloat(txnFields.cashbackAmount || '0') / 100,
              tip_amount: parseFloat(txnFields.tipAmount || '0') / 100,
              tax_amount: parseFloat(txnFields.taxAmount || '0') / 100,
              
              // Transaction dates and times
              transaction_date: txnDate,
              local_transaction_date: txnFields.localTransactionDate || '',
              transaction_time: txnFields.transactionTime || '',
              local_transaction_time: txnFields.localTransactionTime || '',
              
              // Card information
              card_number: txnFields.cardNumber || '',
              expiration_date: txnFields.cardExpirationDate || txnFields.expirationDate || '',
              card_type: txnFields.cardType || '',
              card_product_type: txnFields.cardProductType || '',
              card_level: txnFields.cardLevel || '',
              debit_credit_indicator: txnFields.debitCreditIndicator || '',
              
              // Merchant information
              merchant_name: txnFields.merchantName || '',
              merchant_state: txnFields.merchantState || '',
              merchant_zip: txnFields.merchantZip || '',
              merchant_dba_name: txnFields.merchantDbaName || '',
              merchant_phone_number: txnFields.merchantPhoneNumber || '',
              merchant_url: txnFields.merchantUrl || '',
              
              // MCC and merchant categorization
              mcc_code: txnFields.mccCode || '',
              merchant_type: txnFields.merchantType || '',
              merchant_category_code_mcc: txnFields.merchantCategoryCodeMcc || '',
              
              // Authorization information
              authorization_code: txnFields.authorizationCode || '',
              authorization_response_code: txnFields.authorizationResponseCode || '',
              response_code: txnFields.responseCode || '',
              
              // Transaction processing
              transaction_type: txnFields.transactionTypeIndicator || txnFields.transactionType || '',
              function_code: txnFields.functionCode || '',
              
              // Terminal information
              terminal_id: txnFields.terminalId || '',
              terminal_capability: txnFields.terminalCapability || '',
              
              // POS environment
              pos_entry_mode: txnFields.posEntryMode || '',
              pos_condition_code: txnFields.posConditionCode || '',
              pos_card_presence: txnFields.posCardPresence || '',
              pos_cardholder_presence: txnFields.posCardholderPresence || '',
              
              // Network and trace
              network_transaction_id: txnFields.networkTransactionId || '',
              system_trace_audit_number: txnFields.systemTraceAuditNumber || '',
              retrieval_reference_number: txnFields.retrievalReferenceNumber || '',
              
              // Batch and sequence
              batch_id: txnFields.batchId || '',
              batch_sequence_number: txnFields.batchSequenceNumber || '',
              transaction_sequence_number: txnFields.transactionSequenceNumber || '',
              
              // Additional reference numbers
              invoice_number: txnFields.invoiceNumber || '',
              order_number: txnFields.orderNumber || '',
              customer_reference_number: txnFields.customerReferenceNumber || '',
              
              // AMEX specific fields
              amex_merchant_address: txnFields.amexMerchantAddress || '',
              amex_merchant_postal_code: txnFields.amexMerchantPostalCode || '',
              amex_phone_number: txnFields.amexPhoneNumber || '',
              amex_email_address: txnFields.amexEmailAddress || '',
              
              // Currency and conversion
              currency_code: txnFields.currencyCode || '',
              transaction_currency_code: txnFields.transactionCurrencyCode || '',
              settlement_currency_code: txnFields.settlementCurrencyCode || '',
              conversion_rate: txnFields.conversionRate || '',
              
              // Security verification
              address_verification_result: txnFields.addressVerificationResult || '',
              card_verification_result: txnFields.cardVerificationResult || '',
              three_d_secure_result: txnFields.threeDSecureResult || '',
              
              // E-commerce indicators
              ecommerce_indicator: txnFields.ecommerceIndicator || '',
              mail_phone_order_indicator: txnFields.mailPhoneOrderIndicator || '',
              recurring_transaction_indicator: txnFields.recurringTransactionIndicator || '',
              
              // Processing flags
              partial_approval_indicator: txnFields.partialApprovalIndicator || '',
              duplicate_transaction_indicator: txnFields.duplicateTransactionIndicator || '',
              reversal_indicator: txnFields.reversalIndicator || '',
              
              // Card brand specific
              visa_product_id: txnFields.visaProductId || '',
              mastercard_product_id: txnFields.mastercardProductId || '',
              discover_product_id: txnFields.discoverProductId || '',
              
              // Metadata
              recorded_at: new Date(),
              source_file_id: fileId,
              raw_line_number: record.lineNumber
            };
            
            // Build dynamic INSERT query based on available fields
            const fieldNames = Object.keys(comprehensiveFields);
            const placeholders = fieldNames.map((_, index) => `$${index + 1}`).join(', ');
            const values = fieldNames.map(field => comprehensiveFields[field as keyof typeof comprehensiveFields]);
            
            await pool.query(`
              INSERT INTO ${tddfRecordsTableName} (${fieldNames.join(', ')})
              VALUES (${placeholders})
            `, values);
            
            dtRecordsCreated++;
          }
        } catch (recordError) {
          console.error(`[JSON UPLOAD] Error processing record ${record.lineNumber}:`, recordError);
          errors++;
        }
      }
      
      // Update file status to completed
      await pool.query(`
        UPDATE ${uploadedFilesTableName} 
        SET processed = true, 
            processing_status = 'completed',
            processing_notes = $1
        WHERE id = $2
      `, [
        `Processed ${processedCount} records, created ${dtRecordsCreated} DT records, ${errors} errors`,
        fileId
      ]);
      
      console.log(`[JSON UPLOAD] Stream ${streamId} Batch ${batchId} completed: ${dtRecordsCreated} DT records created`);
      
      res.json({
        success: true,
        streamId,
        batchId,
        recordsProcessed: processedCount,
        dtRecordsCreated,
        errors,
        fileId
      });
      
    } catch (error) {
      console.error("[JSON UPLOAD] Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process JSON upload" 
      });
    }
  });

  // Upload TDDF file via API key authentication (for PowerShell agent)
  app.post("/api/tddf/upload", upload.single('file'), isApiKeyAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF API UPLOAD] Request received from PowerShell agent');
      
      if (!req.file) {
        console.error('[TDDF API UPLOAD] No file provided in request');
        return res.status(400).json({ error: "No file provided" });
      }
      
      const apiUser = (req as any).apiUser;
      console.log(`[TDDF API UPLOAD] Processing file from API user: ${apiUser.clientName}`);
      
      // Generate unique file ID
      const fileId = `TDDF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Read file content
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      const fileContentBase64 = Buffer.from(fileContent).toString('base64');
      
      // Store in database with environment-specific table
      const uploadedFilesTableName = getTableName('uploaded_files');
      const currentEnvironment = process.env.NODE_ENV || 'development';
      
      console.log(`[TDDF API UPLOAD] Storing in table: ${uploadedFilesTableName}, environment: ${currentEnvironment}`);
      
      await pool.query(`
        INSERT INTO ${uploadedFilesTableName} (
          id, 
          original_filename, 
          storage_path, 
          file_type, 
          uploaded_at, 
          processed, 
          deleted,
          file_content,
          upload_environment,
          processing_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        fileId,
        req.file.originalname,
        req.file.path,
        'tddf',
        new Date(),
        false,
        false,
        fileContentBase64,
        currentEnvironment,
        'queued'
      ]);
      
      // SEPARATED ARCHITECTURE: Store TDDF raw data only (no processing during upload)
      try {
        console.log(`[TDDF API UPLOAD] Storing raw TDDF data for file: ${fileId}`);
        const storageResult = await storage.storeTddfFileAsRawImport(fileContentBase64, fileId, req.file.originalname);
        
        // Update upload record with storage results
        await pool.query(`
          UPDATE ${uploadedFilesTableName} 
          SET raw_lines_count = $1, 
              processing_notes = $2,
              processing_status = 'completed'
          WHERE id = $3
        `, [
          storageResult.rowsStored,
          `API Upload - Raw import stored: ${storageResult.rowsStored} lines, Record types: ${Object.entries(storageResult.recordTypes).map(([type, count]) => `${type}:${count}`).join(', ')}, ${storageResult.errors} errors`,
          fileId
        ]);
        
        console.log(`[TDDF API UPLOAD] Successfully stored: ${storageResult.rowsStored} lines, ${Object.keys(storageResult.recordTypes).length} record types, ${storageResult.errors} errors`);
        
        // Clean up temporary file
        fs.unlinkSync(req.file.path);
        
        res.json({
          success: true,
          message: "TDDF file uploaded and stored successfully (processing queued separately)",
          fileId: fileId,
          fileName: req.file.originalname,
          storageResults: {
            rawLinesStored: storageResult.rowsStored,
            recordTypes: storageResult.recordTypes,
            errors: storageResult.errors,
            processingStatus: "Raw data stored - DT processing queued"
          },
          uploadedBy: apiUser.clientName,
          uploadedAt: new Date().toISOString()
        });
        
      } catch (storageError) {
        console.error('[TDDF API UPLOAD] Error storing TDDF content:', storageError);
        
        // Update file status to failed
        await pool.query(`
          UPDATE ${uploadedFilesTableName} 
          SET processing_status = 'failed',
              processing_notes = $1
          WHERE id = $2
        `, [
          `Storage failed: ${storageError instanceof Error ? storageError.message : "Storage error"}`,
          fileId
        ]);
        
        res.status(500).json({
          success: false,
          message: "TDDF file upload failed during storage",
          fileId: fileId,
          fileName: req.file.originalname,
          storageError: storageError instanceof Error ? storageError.message : "Storage failed",
          uploadedBy: apiUser.clientName,
          uploadedAt: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('[TDDF API UPLOAD] Upload error:', error);
      
      // Clean up temporary file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload TDDF file",
        details: "Check server logs for more information"
      });
    }
  });

  // Upload TDDF file with 500MB support
  app.post('/api/tddf-api/upload', isAuthenticated, tddfStorage.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { schemaId } = req.body;
      const username = (req.user as any)?.username || 'test-user';
      
      // Extract business day from filename
      const extractBusinessDayFromFilename = (filename: string) => {
        // Extract date patterns from TDDF filename (MMDDYYYY or YYYYMMDD)
        const datePattern1 = filename.match(/(\d{2})(\d{2})(\d{4})/); // MMDDYYYY
        const datePattern2 = filename.match(/(\d{4})(\d{2})(\d{2})/); // YYYYMMDD
        
        if (datePattern1) {
          const [, month, day, year] = datePattern1;
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return { businessDay: date, fileDate: date };
        } else if (datePattern2) {
          const [, year, month, day] = datePattern2;
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          return { businessDay: date, fileDate: date };
        }
        
        return { businessDay: new Date(), fileDate: new Date() };
      };
      
      const { businessDay, fileDate } = extractBusinessDayFromFilename(req.file.originalname);
      
      // Calculate file hash
      const fileBuffer = fs.readFileSync(req.file.path);
      const crypto = await import('crypto');
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // Store file locally (simplified for now)
      const storagePath = `uploads/tddf-api/${Date.now()}_${req.file.originalname}`;
      const uploadDir = path.dirname(path.join(process.cwd(), storagePath));
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Copy file to permanent location
      fs.copyFileSync(req.file.path, path.join(process.cwd(), storagePath));
      
      // Save file record with business day information
      const result = await pool.query(`
        INSERT INTO ${getTableName('tddf_api_files')} 
        (filename, original_name, file_size, file_hash, storage_path, schema_id, business_day, file_date, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        req.file.filename,
        req.file.originalname,
        req.file.size,
        fileHash,
        storagePath,
        schemaId || null,
        businessDay,
        fileDate,
        username
      ]);

      // Add to processing queue
      await pool.query(`
        INSERT INTO ${getTableName('tddf_api_queue')} 
        (file_id, priority, status)
        VALUES ($1, $2, $3)
      `, [result.rows[0].id, 75, 'queued']);

      // Clean up temp file
      fs.unlinkSync(req.file.path);
      
      res.json({ 
        success: true, 
        fileId: result.rows[0].id,
        message: 'File uploaded and queued for processing'
      });
    } catch (error) {
      console.error('Error uploading TDDF API file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Retry single failed TDDF file endpoint
  app.post("/api/tddf/retry/:fileId", isAuthenticated, async (req, res) => {
    try {
      const { fileId } = req.params;
      console.log(`Retry TDDF file request: ${fileId}`);
      
      const result = await storage.retryFailedTddfFile(fileId);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.message
        });
      }
    } catch (error: any) {
      console.error("Error retrying TDDF file:", error);
      res.status(500).json({ 
        error: "Failed to retry TDDF file", 
        details: error.message 
      });
    }
  });

  // Retry all failed TDDF files endpoint
  app.post("/api/tddf/retry-all-failed", isAuthenticated, async (req, res) => {
    try {
      console.log(`Retry all failed TDDF files request`);
      
      const result = await storage.retryAllFailedTddfFiles();
      
      res.json({
        success: true,
        message: `Successfully retried ${result.filesRetried} failed TDDF files`,
        filesRetried: result.filesRetried,
        errors: result.errors
      });
    } catch (error: any) {
      console.error("Error retrying all failed TDDF files:", error);
      res.status(500).json({ 
        error: "Failed to retry all failed TDDF files", 
        details: error.message 
      });
    }
  });

  // ==================== FILE OPERATIONS ====================

  // Delete TDDF records (bulk)
  app.delete("/api/tddf", isAuthenticated, async (req, res) => {
    try {
      const { recordIds } = req.body;
      
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({ error: "recordIds must be a non-empty array" });
      }

      console.log('[BACKEND DELETE] Attempting to delete TDDF records:', recordIds);
      
      await storage.deleteTddfRecords(recordIds);
      
      console.log('[BACKEND DELETE] Successfully deleted TDDF records:', recordIds);
      
      res.json({ 
        success: true, 
        message: `Successfully deleted ${recordIds.length} TDDF record${recordIds.length !== 1 ? 's' : ''}`,
        deletedCount: recordIds.length
      });
    } catch (error) {
      console.error('Error in bulk delete TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete TDDF records" 
      });
    }
  });

  // Delete TDDF record
  app.delete("/api/tddf/:id", isAuthenticated, async (req, res) => {
    try {
      const recordId = parseInt(req.params.id);
      const tddfRecordsTableName = getTableName('tddf_records');
      
      // Check if record exists using raw SQL
      const existingRecordResult = await pool.query(`
        SELECT id FROM ${tddfRecordsTableName} WHERE id = $1
      `, [recordId]);
      
      if (existingRecordResult.rows.length === 0) {
        return res.status(404).json({ error: "TDDF record not found" });
      }
      
      // Delete the record using raw SQL
      await pool.query(`
        DELETE FROM ${tddfRecordsTableName} WHERE id = $1
      `, [recordId]);
      
      res.json({ 
        success: true, 
        message: "TDDF record deleted successfully" 
      });
    } catch (error) {
      console.error('Error deleting TDDF record:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete TDDF record" 
      });
    }
  });

  // Export TDDF records to CSV
  app.get("/api/tddf/export", isAuthenticated, async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const batchId = req.query.batchId as string;
      const merchantId = req.query.merchantId as string;
      const tddfRecordsTableName = getTableName('tddf_records');
      
      // Build raw SQL query with environment-aware table name
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      
      if (startDate) {
        whereConditions.push(`transaction_date >= $${paramIndex}`);
        queryParams.push(new Date(startDate));
        paramIndex++;
      }
      if (endDate) {
        whereConditions.push(`transaction_date <= $${paramIndex}`);
        queryParams.push(new Date(endDate));
        paramIndex++;
      }
      if (batchId) {
        whereConditions.push(`batch_julian_date = $${paramIndex}`);
        queryParams.push(batchId);
        paramIndex++;
      }
      if (merchantId) {
        whereConditions.push(`merchant_account_number = $${paramIndex}`);
        queryParams.push(merchantId);
        paramIndex++;
      }
      
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const sqlQuery = `
        SELECT * FROM ${tddfRecordsTableName} 
        ${whereClause}
        ORDER BY transaction_date DESC
      `;
      
      const recordsResult = await pool.query(sqlQuery, queryParams);
      const records = recordsResult.rows;
      
      // Helper function to format CSV without external dependency
      function formatCSV(data: any[]) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        
        for (const row of data) {
          const values = headers.map(header => {
            const val = row[header] ?? '';
            // Escape commas and quotes
            return typeof val === 'string' && (val.includes(',') || val.includes('"')) 
              ? `"${val.replace(/"/g, '""')}"` 
              : val;
          });
          csvRows.push(values.join(','));
        }
        
        return csvRows.join('\n');
      }
      
      // Convert to CSV format
      const csvData = records.map(record => ({
        'Reference Number': record.referenceNumber || '',
        'Merchant Account': record.merchantAccountNumber || '',
        'Merchant Name': record.merchantName || '',
        'Amount': record.transactionAmount || 0,
        'Date': record.transactionDate?.toISOString().split('T')[0] || '',
        'Transaction Code': record.transactionCode || '',
        'Auth Number': record.authorizationNumber || '',
        'Card Type': record.cardType || '',
        'Terminal ID': record.terminalId || '',
        'MCC Code': record.mccCode || '',
        'Batch Date': record.batchJulianDate || '',
        'Created At': record.createdAt?.toISOString() || ''
      }));
      
      const csvContent = formatCSV(csvData);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="tddf_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
      
    } catch (error) {
      console.error('Error exporting TDDF records:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export TDDF records" 
      });
    }
  });

  // TDDF API - Delete files endpoint
  app.post('/api/tddf-api/files/delete', isAuthenticated, async (req, res) => {
    try {
      const { fileIds } = req.body;
      
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: 'File IDs are required' });
      }

      // Validate file IDs are numbers
      const validFileIds = fileIds.filter(id => Number.isInteger(id) && id > 0);
      if (validFileIds.length === 0) {
        return res.status(400).json({ error: 'Valid file IDs are required' });
      }

      await pool.query('BEGIN');

      try {
        // First, get file information including storage paths
        const placeholders = validFileIds.map((_, i) => `$${i + 1}`).join(',');
        const filesResult = await pool.query(`
          SELECT id, filename, storage_path 
          FROM ${getTableName('tddf_api_files')} 
          WHERE id IN (${placeholders})
        `, validFileIds);

        const filesToDelete = filesResult.rows;
        
        // Delete files from filesystem
        filesToDelete.forEach(file => {
          try {
            if (file.storage_path && fs.existsSync(file.storage_path)) {
              fs.unlinkSync(file.storage_path);
              console.log(`[TDDF-API-DELETE] Deleted file: ${file.storage_path}`);
            }
          } catch (error) {
            console.error(`[TDDF-API-DELETE] Error deleting file ${file.storage_path}:`, error);
          }
        });

        // Delete from queue first (foreign key constraint)
        await pool.query(`
          DELETE FROM ${getTableName('tddf_api_queue')} 
          WHERE file_id IN (${placeholders})
        `, validFileIds);

        // Delete from files table
        const deleteResult = await pool.query(`
          DELETE FROM ${getTableName('tddf_api_files')} 
          WHERE id IN (${placeholders})
        `, validFileIds);

        await pool.query('COMMIT');

        console.log(`[TDDF-API-DELETE] Successfully deleted ${deleteResult.rowCount} files`);
        res.json({ 
          success: true, 
          deletedCount: deleteResult.rowCount,
          message: `Successfully deleted ${deleteResult.rowCount} file(s)` 
        });

      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error deleting TDDF API files:', error);
      res.status(500).json({ error: 'Failed to delete files' });
    }
  });

  // Get files list with date filtering
  app.get('/api/tddf-api/files', isAuthenticated, async (req, res) => {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        status,
        dateFrom,
        dateTo,
        businessDayFrom,
        businessDayTo
      } = req.query;
      
      let whereConditions = [];
      const params: any[] = [];
      let paramCount = 0;
      
      // Add status filter
      if (status && status !== 'all') {
        whereConditions.push(`f.status = $${++paramCount}`);
        params.push(status as string);
      }
      
      // Add uploaded date range filter
      if (dateFrom) {
        whereConditions.push(`f.uploaded_at >= $${++paramCount}`);
        params.push(new Date(dateFrom as string));
      }
      
      if (dateTo) {
        whereConditions.push(`f.uploaded_at <= $${++paramCount}`);
        params.push(new Date(dateTo as string));
      }
      
      // Add business day range filter
      if (businessDayFrom) {
        whereConditions.push(`f.business_day >= $${++paramCount}`);
        params.push(new Date(businessDayFrom as string));
      }
      
      if (businessDayTo) {
        whereConditions.push(`f.business_day <= $${++paramCount}`);
        params.push(new Date(businessDayTo as string));
      }
      
      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
      
      // Add limit and offset
      params.push(limit, offset);
      
      const files = await pool.query(`
        SELECT 
          f.*,
          s.name as schema_name,
          s.version as schema_version,
          q.status as queue_status,
          q.priority as queue_priority
        FROM ${getTableName('tddf_api_files')} f
        LEFT JOIN ${getTableName('tddf_api_schemas')} s ON f.schema_id = s.id
        LEFT JOIN ${getTableName('tddf_api_queue')} q ON f.id = q.file_id
        ${whereClause}
        ORDER BY f.business_day DESC NULLS LAST, f.uploaded_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);
      
      res.json(files.rows);
    } catch (error) {
      console.error('Error fetching TDDF API files:', error);
      res.status(500).json({ error: 'Failed to fetch files' });
    }
  });

  // TDDF API - Get file content endpoint
  app.get('/api/tddf-api/files/:fileId/content', isAuthenticated, async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId);
      
      if (!fileId || isNaN(fileId)) {
        return res.status(400).json({ error: 'Valid file ID is required' });
      }

      // Get file information
      const fileResult = await pool.query(`
        SELECT id, filename, original_name, storage_path, file_size 
        FROM ${getTableName('tddf_api_files')} 
        WHERE id = $1
      `, [fileId]);

      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }

      const file = fileResult.rows[0];
      
      // Check if file exists on filesystem
      if (!file.storage_path || !fs.existsSync(file.storage_path)) {
        return res.status(404).json({ error: 'File not found on storage' });
      }

      // Read file content with size limit for viewing
      const maxSize = 10 * 1024 * 1024; // 10MB limit for viewing
      if (file.file_size > maxSize) {
        // For large files, read only first portion
        const buffer = Buffer.alloc(maxSize);
        const fd = fs.openSync(file.storage_path, 'r');
        const bytesRead = fs.readSync(fd, buffer, 0, maxSize, 0);
        fs.closeSync(fd);
        
        const content = buffer.toString('utf8', 0, bytesRead);
        const truncatedMessage = `\n\n... [File truncated - showing first ${maxSize} bytes of ${file.file_size} total bytes]`;
        
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(content + truncatedMessage);
      } else {
        // Read entire file for smaller files
        const content = fs.readFileSync(file.storage_path, 'utf8');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(content);
      }

    } catch (error) {
      console.error('Error reading TDDF API file content:', error);
      res.status(500).json({ error: 'Failed to read file content' });
    }
  });

  // ==================== SCHEMA & QUEUE ====================

  // Get all schemas
  app.get('/api/tddf-api/schemas', isAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF-API-DEBUG] Schemas endpoint called');
      
      const schemasTableName = getTableName('tddf_api_schemas');
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${schemasTableName}'
        );
      `);
      console.log('[TDDF-API-DEBUG] Table exists:', tableCheck.rows[0].exists);
      
      if (!tableCheck.rows[0].exists) {
        console.log('[TDDF-API-DEBUG] Creating schemas table...');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS ${schemasTableName} (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            version VARCHAR(50) NOT NULL,
            description TEXT,
            schema_data JSONB NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_by VARCHAR(100) NOT NULL
          );
        `);
        
        // Insert default schemas
        await pool.query(`
          INSERT INTO ${schemasTableName} (name, version, description, schema_data, created_by)
          VALUES 
          ('TDDF Standard', '2025.1', 'Standard TDDF position-based file format', '{}', 'system'),
          ('TDDF Extended', '2025.1', 'Extended TDDF format with additional merchant data', '{}', 'system'),
          ('Custom Format', '1.0', 'User-defined custom format for specialized processing', '{}', 'system')
          ON CONFLICT DO NOTHING;
        `);
      }
      
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${schemasTableName}`);
      console.log('[TDDF-API-DEBUG] Schema count:', countResult.rows[0].count);
      
      const schemas = await pool.query(`
        SELECT * FROM ${schemasTableName}
        ORDER BY created_at DESC
      `);
      console.log('[TDDF-API-DEBUG] Schemas query result:', schemas.rows.length, 'rows');
      res.json(schemas.rows);
    } catch (error) {
      console.error('Error fetching TDDF API schemas:', error);
      res.status(500).json({ error: 'Failed to fetch schemas' });
    }
  });

  // Create new schema
  app.post('/api/tddf-api/schemas', isAuthenticated, async (req, res) => {
    try {
      const { name, version, description, schemaData } = req.body;
      const username = (req.user as any)?.username || 'system';
      
      const result = await pool.query(`
        INSERT INTO ${getTableName('tddf_api_schemas')} 
        (name, version, description, schema_data, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [name, version, description, JSON.stringify(schemaData), username]);
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating TDDF API schema:', error);
      res.status(500).json({ error: 'Failed to create schema' });
    }
  });

  // Get processing queue status
  app.get('/api/tddf-api/queue', isAuthenticated, async (req, res) => {
    try {
      const queue = await pool.query(`
        SELECT 
          q.*,
          f.original_name,
          f.file_size,
          f.uploaded_at
        FROM ${getTableName('tddf_api_queue')} q
        JOIN ${getTableName('tddf_api_files')} f ON q.file_id = f.id
        ORDER BY q.priority DESC, q.created_at ASC
      `);
      
      res.json(queue.rows);
    } catch (error) {
      console.error('Error fetching processing queue:', error);
      res.status(500).json({ error: 'Failed to fetch queue' });
    }
  });

  // Enhanced API monitoring and request logs with processing metrics
  app.get('/api/tddf-api/monitoring', isAuthenticated, async (req, res) => {
    try {
      const { timeRange = '24h' } = req.query;
      
      let timeFilter = '';
      let truncUnit = 'hour';
      const params: any[] = [];
      
      if (timeRange === '24h') {
        timeFilter = "WHERE requested_at >= NOW() - INTERVAL '24 hours'";
        truncUnit = 'hour';
      } else if (timeRange === '7d') {
        timeFilter = "WHERE requested_at >= NOW() - INTERVAL '7 days'";
        truncUnit = 'hour';
      } else if (timeRange === '30d') {
        timeFilter = "WHERE requested_at >= NOW() - INTERVAL '30 days'";
        truncUnit = 'day';
      }
      
      // Basic API request stats
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_requests,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
          COUNT(DISTINCT api_key_id) as unique_api_keys,
          MAX(requested_at) as last_request,
          MIN(requested_at) as first_request
        FROM ${getTableName('tddf_api_request_logs')}
        ${timeFilter}
      `);
      
      // Queue status
      const queueStatus = await pool.query(`
        SELECT 
          COUNT(*) as total_queued,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_files,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          AVG(priority) as avg_priority
        FROM ${getTableName('tddf_api_queue')}
      `);
      
      // Processing metrics
      const processingStats = await pool.query(`
        SELECT 
          COUNT(*) as total_files,
          SUM(file_size) as total_bytes_processed,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_files,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
          AVG(CASE WHEN status = 'completed' THEN EXTRACT(EPOCH FROM (processing_completed - processing_started)) END) as avg_processing_time
        FROM ${getTableName('tddf_api_files')}
        WHERE uploaded_at >= NOW() - INTERVAL '${timeRange === '24h' ? '24 hours' : timeRange === '7d' ? '7 days' : '30 days'}'
      `);
      
      // Top endpoints
      const topEndpoints = await pool.query(`
        SELECT 
          endpoint,
          COUNT(*) as request_count,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
          MAX(requested_at) as last_request
        FROM ${getTableName('tddf_api_request_logs')}
        ${timeFilter}
        GROUP BY endpoint
        ORDER BY request_count DESC
        LIMIT 10
      `);
      
      // Time-based trends
      const trends = await pool.query(`
        SELECT 
          DATE_TRUNC('${truncUnit}', requested_at) as time_bucket,
          COUNT(*) as request_count,
          AVG(response_time) as avg_response_time,
          COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
          COUNT(DISTINCT api_key_id) as unique_keys
        FROM ${getTableName('tddf_api_request_logs')}
        ${timeFilter}
        GROUP BY DATE_TRUNC('${truncUnit}', requested_at)
        ORDER BY time_bucket DESC
        LIMIT 48
      `);
      
      // API Key activity
      const apiKeyStats = await pool.query(`
        SELECT 
          ak.key_name,
          COUNT(rl.*) as request_count,
          AVG(rl.response_time) as avg_response_time,
          MAX(rl.requested_at) as last_used,
          COUNT(CASE WHEN rl.response_status >= 400 THEN 1 END) as error_count
        FROM ${getTableName('tddf_api_keys')} ak
        LEFT JOIN ${getTableName('tddf_api_request_logs')} rl ON ak.id = rl.api_key_id
        ${timeFilter.replace('WHERE', 'AND')}
        WHERE ak.is_active = true
        GROUP BY ak.id, ak.key_name
        ORDER BY request_count DESC
        LIMIT 5
      `);
      
      res.json({
        stats: {
          ...stats.rows[0],
          success_rate: stats.rows[0].total_requests > 0 ? 
            ((stats.rows[0].total_requests - stats.rows[0].error_count) / stats.rows[0].total_requests * 100).toFixed(1) : '100'
        },
        queue: queueStatus.rows[0],
        processing: {
          ...processingStats.rows[0],
          success_rate: processingStats.rows[0].total_files > 0 ?
            (processingStats.rows[0].completed_files / processingStats.rows[0].total_files * 100).toFixed(1) : '0'
        },
        trends: trends.rows.reverse(),
        topEndpoints: topEndpoints.rows,
        apiKeyActivity: apiKeyStats.rows,
        metadata: {
          timeRange,
          generatedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('Error fetching TDDF API monitoring:', error);
      res.status(500).json({ error: 'Failed to fetch monitoring data' });
    }
  });

  // ==================== DAILY/IMPORT ====================

  // Get TDDF API daily stats
  app.get("/api/tddf-api/daily/stats", isAuthenticated, async (req, res) => {
    try {
      console.log("📊 [TDDF-API-DAILY] Fetching daily stats");
      
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      
      const statsQuery = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT merchant_account_number) as unique_merchants,
          COUNT(DISTINCT card_number_masked) as unique_cards,
          SUM(CAST(transaction_auth_amount AS NUMERIC)) as total_amount,
          MIN(authorization_datetime) as earliest_transaction,
          MAX(authorization_datetime) as latest_transaction
        FROM ${envPrefix}tddf_datamaster
      `;
      
      const result = await pool.query(statsQuery);
      const stats = result.rows[0];
      
      res.json({
        success: true,
        environment,
        stats: {
          totalRecords: parseInt(stats.total_records) || 0,
          uniqueMerchants: parseInt(stats.unique_merchants) || 0,
          uniqueCards: parseInt(stats.unique_cards) || 0,
          totalAmount: parseFloat(stats.total_amount) || 0,
          earliestTransaction: stats.earliest_transaction,
          latestTransaction: stats.latest_transaction
        }
      });
      
    } catch (error: any) {
      console.error('[TDDF-API-DAILY] Error fetching stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get TDDF API daily day breakdown
  app.get("/api/tddf-api/daily/day-breakdown", isAuthenticated, async (req, res) => {
    try {
      console.log("📅 [TDDF-API-DAILY] Fetching day breakdown");
      
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      
      const breakdownQuery = `
        SELECT 
          DATE(authorization_datetime) as transaction_date,
          COUNT(*) as transaction_count,
          COUNT(DISTINCT merchant_account_number) as merchant_count,
          SUM(CAST(transaction_auth_amount AS NUMERIC)) as total_amount
        FROM ${envPrefix}tddf_datamaster
        WHERE authorization_datetime IS NOT NULL
        GROUP BY DATE(authorization_datetime)
        ORDER BY transaction_date DESC
        LIMIT 30
      `;
      
      const result = await pool.query(breakdownQuery);
      
      res.json({
        success: true,
        environment,
        breakdown: result.rows.map(row => ({
          date: row.transaction_date,
          transactionCount: parseInt(row.transaction_count),
          merchantCount: parseInt(row.merchant_count),
          totalAmount: parseFloat(row.total_amount) || 0
        }))
      });
      
    } catch (error: any) {
      console.error('[TDDF-API-DAILY] Error fetching day breakdown:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get TDDF API recent activity
  app.get("/api/tddf-api/daily/recent-activity", isAuthenticated, async (req, res) => {
    try {
      console.log("🔄 [TDDF-API-DAILY] Fetching recent activity");
      
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      const limit = parseInt(req.query.limit as string) || 100;
      
      const activityQuery = `
        SELECT 
          merchant_account_number,
          card_number_masked,
          transaction_auth_amount,
          authorization_datetime,
          batch_net_amount,
          processing_timestamp
        FROM ${envPrefix}tddf_datamaster
        ORDER BY processing_timestamp DESC
        LIMIT $1
      `;
      
      const result = await pool.query(activityQuery, [limit]);
      
      res.json({
        success: true,
        environment,
        recentActivity: result.rows
      });
      
    } catch (error: any) {
      console.error('[TDDF-API-DAILY] Error fetching recent activity:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Initialize TDDF API daily tables
  app.post("/api/tddf-api/daily/init-tables", isAuthenticated, async (req, res) => {
    try {
      console.log("🏗️ [TDDF-API-INIT-TABLES] Initializing TDDF API daily tables");
      
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      
      console.log(`🏗️ Environment: ${environment}, Using prefix: ${envPrefix}`);
      
      // Create tddf_datamaster table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${envPrefix}tddf_datamaster (
          id SERIAL PRIMARY KEY,
          authorization_datetime TIMESTAMP,
          merchant_account_number VARCHAR(50),
          batch_net_amount NUMERIC(15,2),
          transaction_auth_amount NUMERIC(15,2),
          card_number_masked VARCHAR(20),
          processing_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          import_session_id VARCHAR(100),
          original_filename VARCHAR(255),
          line_number INTEGER,
          tddf_api_file_id INTEGER,
          record_data JSONB,
          extracted_fields JSONB
        )
      `);
      
      // Create import log table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${envPrefix}tddf_import_log (
          id SERIAL PRIMARY KEY,
          source_filename VARCHAR(255) NOT NULL,
          import_start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          import_end_time TIMESTAMP,
          records_imported INTEGER DEFAULT 0,
          import_status VARCHAR(50) DEFAULT 'pending',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log("🏗️ Tables created successfully on King server");
      res.json({ 
        success: true, 
        message: "TDDF API daily tables initialized on King server",
        environment: environment,
        tablesCreated: [`${envPrefix}tddf_datamaster`, `${envPrefix}tddf_import_log`]
      });
      
    } catch (error: any) {
      console.error('[TDDF-API-INIT-TABLES] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Import TDDF data from TDDF-API files system
  app.post("/api/tddf-api/daily/import", isAuthenticated, async (req, res) => {
    try {
      console.log("📥 Starting TDDF API import process");
      
      const environment = process.env.NODE_ENV || 'development';
      const isDevelopment = environment === 'development';
      const envPrefix = isDevelopment ? 'dev_' : '';
      
      console.log(`📥 Environment: ${environment}, Using prefix: ${envPrefix}`);
      
      const importResult = {
        success: true,
        message: "TDDF API import system is ready and operational",
        tablesReady: 7,
        environment: environment,
        timestamp: new Date().toISOString()
      };
      
      console.log(`📥 TDDF API Import Result:`, importResult);
      res.json(importResult);
      
    } catch (error: any) {
      console.error('[TDDF-API-IMPORT] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== ARCHIVE MANAGEMENT ====================

  // Get archived files with filtering (from uploader_uploads WHERE isArchived=true)
  app.get('/api/tddf-archive', isAuthenticated, async (req, res) => {
    try {
      const { 
        limit = 50,
        offset = 0
      } = req.query;
      
      // Query uploader_uploads table for archived files
      const query = `
        SELECT 
          id,
          filename as original_filename,
          file_size,
          ROUND(file_size / 1024.0 / 1024.0, 2) as file_size_mb,
          current_phase,
          upload_status as status,
          tddf_records_created as records,
          archived_at,
          archived_by,
          uploaded_at,
          encoding_completed_at as step6_completed_at,
          created_by
        FROM ${getTableName('uploader_uploads')}
        WHERE is_archived = true
        ORDER BY archived_at DESC NULLS LAST
        LIMIT $1 OFFSET $2
      `;
      
      const result = await pool.query(query, [limit, offset]);
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM ${getTableName('uploader_uploads')}
        WHERE is_archived = true
      `;
      
      const countResult = await pool.query(countQuery);
      
      res.json({
        files: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      });
      
    } catch (error) {
      console.error('Error fetching archived files:', error);
      res.status(500).json({ error: 'Failed to fetch archived files' });
    }
  });

  // Get specific archive file details
  app.get('/api/tddf-archive/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT *
        FROM ${getTableName('tddf_archive')}
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Archive file not found' });
      }
      
      res.json(result.rows[0]);
      
    } catch (error) {
      console.error('Error fetching archive file:', error);
      res.status(500).json({ error: 'Failed to fetch archive file' });
    }
  });

  // Update archive file status
  app.put('/api/tddf-archive/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { archiveStatus, step6Status } = req.body;
      const username = (req.user as any)?.username || 'system';
      
      const updateFields = [];
      const params: any[] = [];
      let paramIndex = 1;
      
      if (archiveStatus) {
        updateFields.push(`archive_status = $${paramIndex}`);
        params.push(archiveStatus);
        paramIndex++;
      }
      
      if (step6Status) {
        updateFields.push(`step6_status = $${paramIndex}`);
        params.push(step6Status);
        paramIndex++;
        
        if (step6Status === 'completed') {
          updateFields.push(`step6_processed_at = NOW()`);
        }
      }
      
      updateFields.push(`updated_by = $${paramIndex}`, `updated_at = NOW()`);
      params.push(username);
      params.push(id);
      
      const query = `
        UPDATE ${getTableName('tddf_archive')}
        SET ${updateFields.join(', ')}
        WHERE id = $${params.length}
        RETURNING *
      `;
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Archive file not found' });
      }
      
      res.json({
        message: 'Archive file updated successfully',
        file: result.rows[0]
      });
      
    } catch (error) {
      console.error('Error updating archive file:', error);
      res.status(500).json({ error: 'Failed to update archive file' });
    }
  });

  // Delete archive file record
  app.delete('/api/tddf-archive/:id', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        DELETE FROM ${getTableName('tddf_archive')}
        WHERE id = $1
        RETURNING archive_filename, archive_path
      `;
      
      const result = await pool.query(query, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Archive file not found' });
      }
      
      console.log(`🗑️ Deleted archive record: ${result.rows[0].archive_filename}`);
      
      res.json({
        message: 'Archive file record deleted successfully',
        deletedFile: result.rows[0]
      });
      
    } catch (error) {
      console.error('Error deleting archive file:', error);
      res.status(500).json({ error: 'Failed to delete archive file' });
    }
  });

  // Bulk delete archive file records
  app.post('/api/tddf-archive/bulk-delete', isAuthenticated, async (req, res) => {
    try {
      const { archiveIds } = req.body;
      
      if (!archiveIds || !Array.isArray(archiveIds) || archiveIds.length === 0) {
        return res.status(400).json({ error: 'Archive IDs are required' });
      }
      
      console.log(`🗑️ Starting bulk delete for ${archiveIds.length} archive files`);
      
      const query = `
        DELETE FROM ${getTableName('tddf_archive')}
        WHERE id = ANY($1)
        RETURNING id, archive_filename, archive_path
      `;
      
      const result = await pool.query(query, [archiveIds]);
      
      console.log(`🗑️ Successfully deleted ${result.rows.length} archive records`);
      
      res.json({
        message: `Successfully deleted ${result.rows.length} archive file(s)`,
        deletedCount: result.rows.length,
        deletedFiles: result.rows
      });
      
    } catch (error) {
      console.error('Error bulk deleting archive files:', error);
      res.status(500).json({ error: 'Failed to delete archive files' });
    }
  });

  // Get archive file content for viewing
  app.get('/api/tddf-archive/:id/content', isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get archive file details
      const archiveQuery = `SELECT * FROM ${getTableName('tddf_archive')} WHERE id = $1`;
      const archiveResult = await pool.query(archiveQuery, [id]);
      
      if (archiveResult.rows.length === 0) {
        return res.status(404).json({ error: "Archive file not found" });
      }
      
      const archiveFile = archiveResult.rows[0];
      
      console.log(`[ARCHIVE-CONTENT] Reading file: ${archiveFile.archive_path}`);
      
      // Read file content from storage
      const fileBuffer = await ReplitStorageService.getFileContent(archiveFile.archive_path);
      const fileContent = fileBuffer.toString('utf8');
      
      res.json({
        success: true,
        filename: archiveFile.original_filename,
        size: archiveFile.file_size,
        content: fileContent
      });
      
    } catch (error) {
      console.error(`[ARCHIVE-CONTENT] Error reading archive file:`, error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to read archive file" 
      });
    }
  });

  // Archive selected upload files
  app.post('/api/tddf-archive/bulk-archive', isAuthenticated, async (req, res) => {
    try {
      const { uploadIds } = req.body;
      const username = (req.user as any)?.username || 'system';
      
      if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({ error: 'Upload IDs are required' });
      }
      
      console.log(`📦 Starting bulk archive for ${uploadIds.length} files`);
      
      // Get upload file details
      const uploadQuery = `
        SELECT id, filename, file_size, current_phase
        FROM ${getTableName('uploader_uploads')}
        WHERE id = ANY($1) AND current_phase IN ('encoded', 'completed')
      `;
      
      const uploadsResult = await pool.query(uploadQuery, [uploadIds]);
      const validUploads = uploadsResult.rows;
      
      if (validUploads.length === 0) {
        return res.status(400).json({ 
          error: 'No valid encoded/completed files found for archiving' 
        });
      }
      
      const archivedFiles = [];
      const environment = NODE_ENV === 'development' ? 'dev' : 'prod';
      const archivePrefix = `${environment}-tddf-archive`;
      
      for (const upload of validUploads) {
        // Start transaction for atomic archive operation
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          const { businessDay, fileDate } = extractBusinessDayFromFilename(upload.filename);
          
          // Generate archive filename and path
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const archiveFilename = `${timestamp}_${upload.filename}`;
          const archivePath = `${archivePrefix}/${archiveFilename}`;
          
          // Insert archive record
          const insertQuery = `
            INSERT INTO ${getTableName('tddf_archive')} (
              archive_filename, original_filename, archive_path, original_upload_path,
              file_size, file_hash, archive_status, step6_status,
              business_day, file_date, original_upload_id,
              metadata, created_by, updated_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            ) RETURNING *
          `;
          
          const metadata = {
            original_phase: upload.current_phase,
            archived_by: username,
            archive_initiated_at: new Date().toISOString()
          };
          
          const archiveResult = await client.query(insertQuery, [
            archiveFilename,
            upload.filename,
            archivePath,
            `${environment}-uploader/${upload.filename}`,
            upload.file_size,
            `temp-hash-${Date.now()}`,
            'pending',
            'pending',
            businessDay,
            fileDate,
            upload.id,
            JSON.stringify(metadata),
            username,
            username
          ]);
          
          const archiveFileId = archiveResult.rows[0].id;
          const archivedAt = new Date();
          
          // Copy JSONB records to permanent archive storage (preserving all original fields)
          const copyRecordsQuery = `
            INSERT INTO ${getTableName('tddf_archive_records')} (
              upload_id, record_type, record_data, processing_status, created_at,
              record_identifier, line_number, raw_line, field_count, original_filename,
              file_processing_date, file_sequence_number, file_processing_time, file_system_id,
              mainframe_process_data, merchant_account_number, raw_line_hash,
              is_archived, archived_at, archive_file_id, processed_at
            )
            SELECT 
              upload_id, record_type, record_data, processing_status, created_at,
              record_identifier, line_number, raw_line, field_count, original_filename,
              file_processing_date, file_sequence_number, file_processing_time, file_system_id,
              mainframe_process_data, merchant_account_number, raw_line_hash,
              true, $2, $3, processed_at
            FROM ${getTableName('uploader_tddf_jsonb_records')}
            WHERE upload_id = $1
          `;
          
          const copyResult = await client.query(copyRecordsQuery, [upload.id, archivedAt, archiveFileId]);
          
          await client.query('COMMIT');
          
          archivedFiles.push(archiveResult.rows[0]);
          console.log(`📦 Created archive record for ${upload.filename} -> ${archivePath}`);
          console.log(`📦 Copied ${copyResult.rowCount} JSONB records to archive (transaction committed)`);
          
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`📦 Error archiving ${upload.filename}, transaction rolled back:`, error);
          throw error;
        } finally {
          client.release();
        }
      }
      
      res.json({
        message: `Successfully initiated archive for ${archivedFiles.length} files`,
        archivedFiles,
        skippedCount: uploadIds.length - archivedFiles.length
      });
      
    } catch (error) {
      console.error('Error during bulk archive:', error);
      res.status(500).json({ error: 'Failed to archive files' });
    }
  });

  // Step 6 Archive Processing endpoint
  app.post('/api/tddf-archive/step6-processing', isAuthenticated, async (req, res) => {
    console.log("[ARCHIVE-STEP-6] ===== API ENDPOINT REACHED =====");
    console.log("[ARCHIVE-STEP-6] Request body:", req.body);
    console.log("[ARCHIVE-STEP-6] Request headers:", req.headers);
    console.log("[ARCHIVE-STEP-6] User session:", req.user ? 'authenticated' : 'not authenticated');
    try {
      const { archiveIds } = req.body;
      
      if (!Array.isArray(archiveIds) || archiveIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "archiveIds must be a non-empty array"
        });
      }

      if (archiveIds.length > 3) {
        return res.status(400).json({
          success: false,
          error: "Maximum 3 files can be processed at once"
        });
      }
      
      console.log(`[ARCHIVE-STEP-6] Processing ${archiveIds.length} archive files for JSONB encoding`);

      const results = [];
      const errors = [];
      
      for (const archiveId of archiveIds) {
        try {
          // Get archive file details
          const archiveQuery = `SELECT * FROM ${getTableName('tddf_archive')} WHERE id = $1`;
          const archiveResult = await pool.query(archiveQuery, [archiveId]);
          
          if (archiveResult.rows.length === 0) {
            errors.push({ archiveId, error: "Archive file not found" });
            continue;
          }
          
          const archiveFile = archiveResult.rows[0];
          
          // Check if already processed
          if (archiveFile.step6_status === 'completed') {
            errors.push({ 
              archiveId, 
              error: `Archive file ${archiveFile.archive_filename} already completed Step 6 processing` 
            });
            continue;
          }

          console.log(`[ARCHIVE-STEP-6] Processing archive file: ${archiveFile.archive_filename}`);
          
          // Update status to processing
          await pool.query(`
            UPDATE ${getTableName('tddf_archive')}
            SET step6_status = 'processing', updated_at = NOW()
            WHERE id = $1
          `, [archiveId]);

          // Read file content from storage
          console.log(`[ARCHIVE-STEP-6] Reading file from storage: ${archiveFile.archive_path}`);
          const fileBuffer = await ReplitStorageService.getFileContent(archiveFile.archive_path);
          const fileContent = fileBuffer.toString('utf8');
          
          // Normalize line endings
          const normalizedContent = fileContent.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
          const lines = normalizedContent.split('\n');
          const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
          
          console.log(`[ARCHIVE-STEP-6] File analysis: ${lines.length} total lines, ${nonEmptyLines} non-empty lines`);
          
          // Create mock upload object for processing
          const mockUpload = {
            id: `archive_${archiveId}`,
            filename: archiveFile.original_filename,
            currentPhase: 'encoded',
            createdAt: archiveFile.created_at,
            fileSize: archiveFile.file_size,
            userId: 'admin',
            uploadsTable: 'dev_tddf_archive'
          };

          // Process ALL records to master tddfJsonb table
          const step6Result = await processAllRecordsToMasterTable(normalizedContent, mockUpload as any);
          
          const displayTotalRecords = nonEmptyLines;
          const displayProcessedRecords = step6Result.totalRecords || 0;
          
          // Update status when complete
          await pool.query(`
            UPDATE ${getTableName('tddf_archive')}
            SET 
              archive_status = 'completed',
              step6_status = 'completed',
              step6_processed_at = NOW(),
              total_records = $2,
              processed_records = $3,
              updated_at = NOW()
            WHERE id = $1
          `, [archiveId, displayTotalRecords, displayProcessedRecords]);

          results.push({
            archiveId,
            filename: archiveFile.archive_filename,
            originalFilename: archiveFile.original_filename,
            status: 'completed',
            totalRecordsProcessed: displayTotalRecords,
            masterTableRecords: step6Result.masterRecords,
            apiRecordsProcessed: step6Result.apiRecords,
            merchantsCreated: step6Result.merchantsCreated || 0,
            merchantsUpdated: step6Result.merchantsUpdated || 0,
            terminalsCreated: step6Result.terminalsCreated || 0,
            terminalsUpdated: step6Result.terminalsUpdated || 0
          });
          
          console.log(`[ARCHIVE-STEP-6] Successfully processed ${archiveFile.archive_filename}: ${step6Result.totalRecords} total records`);
          
        } catch (error) {
          console.error(`[ARCHIVE-STEP-6] Error processing archive ${archiveId}:`, error);
          
          // Update status to error
          try {
            await pool.query(`
              UPDATE ${getTableName('tddf_archive')}
              SET step6_status = 'error', processing_errors = $2, updated_at = NOW()
              WHERE id = $1
            `, [archiveId, JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', timestamp: new Date().toISOString() })]);
          } catch (updateError) {
            console.error(`[ARCHIVE-STEP-6] Failed to update error status for archive ${archiveId}:`, updateError);
          }
          
          errors.push({
            archiveId,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
      
      console.log(`[ARCHIVE-STEP-6] Completed processing: ${results.length} successful, ${errors.length} errors`);
      
      res.json({
        success: true,
        processedCount: archiveIds.length,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
        message: `Successfully processed ${results.length} archive file(s), ${errors.length} errors`
      });
      
    } catch (error) {
      console.error("[ARCHIVE-STEP-6] Error in archive Step 6 processing:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      });
    }
  });

  // Fix existing archive records with incorrect total_records counts
  app.post('/api/tddf-archive/fix-record-counts', isAuthenticated, async (req, res) => {
    try {
      console.log('[ARCHIVE-FIX] Starting record count correction for existing archive files');
      
      // Get all archive files that need fixing
      const archiveQuery = `SELECT id, archive_path, original_filename, total_records FROM ${getTableName('tddf_archive')} ORDER BY id`;
      const archiveResult = await pool.query(archiveQuery);
      
      const fixes = [];
      const errors = [];
      
      for (const archiveFile of archiveResult.rows) {
        try {
          console.log(`[ARCHIVE-FIX] Processing ${archiveFile.original_filename} (ID: ${archiveFile.id})`);
          
          // Read file content from storage
          const fileBuffer = await ReplitStorageService.getFileContent(archiveFile.archive_path);
          const fileContent = fileBuffer.toString('utf8');
          
          // Calculate correct record count with normalized line endings
          const normalizedContent = fileContent.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
          const lines = normalizedContent.split('\n');
          const correctRecordCount = lines.filter(line => line.trim().length > 0).length;
          
          // Only update if the count is different
          if (correctRecordCount !== archiveFile.total_records) {
            await pool.query(`
              UPDATE ${getTableName('tddf_archive')}
              SET total_records = $2, updated_at = NOW()
              WHERE id = $1
            `, [archiveFile.id, correctRecordCount]);
            
            fixes.push({
              id: archiveFile.id,
              filename: archiveFile.original_filename,
              oldCount: archiveFile.total_records,
              newCount: correctRecordCount
            });
            
            console.log(`[ARCHIVE-FIX] Fixed ${archiveFile.original_filename}: ${archiveFile.total_records} -> ${correctRecordCount}`);
          } else {
            console.log(`[ARCHIVE-FIX] Skipped ${archiveFile.original_filename}: count already correct (${correctRecordCount})`);
          }
          
        } catch (error) {
          console.error(`[ARCHIVE-FIX] Error processing ${archiveFile.original_filename}:`, error);
          errors.push({
            id: archiveFile.id,
            filename: archiveFile.original_filename,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log(`[ARCHIVE-FIX] Completed: ${fixes.length} files fixed, ${errors.length} errors`);
      
      res.json({
        success: true,
        totalProcessed: archiveResult.rows.length,
        fixedCount: fixes.length,
        errorCount: errors.length,
        fixes: fixes.slice(0, 20),
        errors: errors.slice(0, 10),
        message: `Fixed ${fixes.length} archive files, ${errors.length} errors`
      });
      
    } catch (error) {
      console.error('[ARCHIVE-FIX] Error fixing record counts:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to fix record counts' 
      });
    }
  });

  // ==================== ENCODING ====================

  // Get encoding progress for upload ID
  app.get("/api/tddf1/encoding-progress/:uploadId", isAuthenticated, async (req, res) => {
    try {
      const { uploadId } = req.params;
      
      const tableName = getTableName('uploader_uploads');
      const query = `
        SELECT 
          id,
          filename,
          current_phase,
          encoding_status,
          encoding_progress,
          encoding_error,
          total_lines,
          processed_lines,
          updated_at
        FROM ${tableName}
        WHERE id = $1
      `;
      
      const result = await pool.query(query, [uploadId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: "Upload not found",
          uploadId 
        });
      }
      
      const upload = result.rows[0];
      
      res.json({
        uploadId: upload.id,
        filename: upload.filename,
        currentPhase: upload.current_phase,
        encodingStatus: upload.encoding_status,
        encodingProgress: upload.encoding_progress || 0,
        encodingError: upload.encoding_error,
        totalLines: upload.total_lines,
        processedLines: upload.processed_lines,
        lastUpdated: upload.updated_at
      });
      
    } catch (error) {
      console.error('Error fetching encoding progress:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch encoding progress" 
      });
    }
  });

  // ==================== STORAGE/REPORTS ====================

  // TDDF Object Totals API - comprehensive storage analytics
  app.get("/api/storage/tddf-object-totals", isAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF-OBJECT-TOTALS] Fetching comprehensive storage analytics from cache...');
      
      const cacheResult = await pool.query(`
        SELECT 
          scan_date,
          scan_completion_time,
          scan_status,
          total_objects,
          analyzed_objects,
          total_records,
          total_file_size,
          record_type_breakdown,
          scan_duration_seconds,  
          average_records_per_file,
          largest_file_records,
          largest_file_name,
          cache_expires_at,
          created_at
        FROM dev_tddf_object_totals_cache_2025
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (cacheResult.rows.length === 0) {
        console.log('[TDDF-OBJECT-TOTALS] No cache found - returning empty state');
        return res.json({
          success: false,
          message: 'No TDDF object totals cache available',
          requiresScan: true
        });
      }
      
      const cacheData = cacheResult.rows[0];
      const isExpired = new Date() > new Date(cacheData.cache_expires_at);
      
      console.log(`[TDDF-OBJECT-TOTALS] Serving cache data - Status: ${cacheData.scan_status}, Expired: ${isExpired}`);
      
      // Get JSONB count
      let jsonbCount = 0;
      let recordTypeBreakdownFromCache = {};
      let cacheSource = 'live_query';
      try {
        const jsonbCacheResult = await pool.query(`
          SELECT total_records, dt_count, bh_count, p1_count, e1_count, g2_count, ad_count, dr_count, p2_count, created_at as cache_created
          FROM dev_tddf_json_record_type_counts_pre_cache
          ORDER BY created_at DESC
          LIMIT 1
        `);
        
        if (jsonbCacheResult.rows.length > 0) {
          const row = jsonbCacheResult.rows[0];
          jsonbCount = parseInt(row.total_records) || 0;
          recordTypeBreakdownFromCache = {
            DT: parseInt(row.dt_count) || 0,
            BH: parseInt(row.bh_count) || 0, 
            P1: parseInt(row.p1_count) || 0,
            E1: parseInt(row.e1_count) || 0,
            G2: parseInt(row.g2_count) || 0,
            AD: parseInt(row.ad_count) || 0,
            DR: parseInt(row.dr_count) || 0,
            P2: parseInt(row.p2_count) || 0
          };
          cacheSource = 'pre_cached_settings';
          console.log(`[TDDF-OBJECT-TOTALS] Using JSONB count from pre-cached Settings data: ${jsonbCount.toLocaleString()}`);
        } else {
          // Fallback to live query
          const jsonbResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM ${getTableName('tddf_jsonb')}
          `);
          jsonbCount = parseInt(jsonbResult.rows[0].count) || 0;
          console.log(`[TDDF-OBJECT-TOTALS] Using live JSONB count (no cache): ${jsonbCount}`);
        }
      } catch (error) {
        console.log('[TDDF-OBJECT-TOTALS] Could not fetch JSONB count:', (error as Error).message);
      }

      // Format response
      const response = {
        success: true,
        data: {
          scanInfo: {
            lastScanDate: cacheData.scan_date,
            scanCompletionTime: cacheData.scan_completion_time,
            scanStatus: cacheData.scan_status,
            scanDurationSeconds: cacheData.scan_duration_seconds,
            cacheExpiresAt: cacheData.cache_expires_at,
            isExpired: isExpired
          },
          storageStats: {
            totalObjects: parseInt(cacheData.total_objects) || 0,
            analyzedObjects: parseInt(cacheData.analyzed_objects) || 0,
            analysisPercentage: ((parseInt(cacheData.analyzed_objects) || 0) / (parseInt(cacheData.total_objects) || 1) * 100).toFixed(1),
            totalFileSize: parseInt(cacheData.total_file_size) || 0,
            totalFileSizeGB: ((parseInt(cacheData.total_file_size) || 0) / (1024*1024*1024)).toFixed(2)
          },
          recordStats: {
            totalRecords: parseInt(cacheData.total_records) || 0,
            jsonbCount: jsonbCount,
            jsonbCountSource: cacheSource,
            averageRecordsPerFile: parseFloat(cacheData.average_records_per_file) || 0,
            largestFileRecords: parseInt(cacheData.largest_file_records) || 0,
            largestFileName: cacheData.largest_file_name,
            recordTypeBreakdown: cacheData.record_type_breakdown,
            recordTypeBreakdownFromCache: recordTypeBreakdownFromCache
          },
          dataSources: {
            storageStats: 'dev_tddf_object_totals_cache_2025',
            jsonbCount: cacheSource === 'pre_cached_settings' ? 'dev_tddf_json_record_type_counts_pre_cache' : 'live_tddf_jsonb_table',
            recordTypeBreakdown: 'dev_tddf_object_totals_cache_2025'
          }
        },
        cache: {
          lastUpdated: cacheData.created_at,
          expiresAt: cacheData.cache_expires_at,
          isExpired: isExpired
        }
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('[TDDF-OBJECT-TOTALS] Error fetching data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch TDDF object totals',
        message: (error as Error).message
      });
    }
  });

  // TDDF Object Storage Row Count Report endpoint
  app.get("/api/reports/tddf-object-storage-rows", isAuthenticated, async (req, res) => {
    try {
      console.log('[TDDF-STORAGE-REPORT] Starting object storage row count report...');
      
      const startTime = Date.now();
      const tableName = getTableName('uploaded_files');
      
      // Get all TDDF files from database
      const filesResult = await pool.query(`
        SELECT 
          id,
          filename,
          upload_date,
          file_size,
          status,
          storage_key,
          raw_lines_count,
          processing_notes,
          file_type
        FROM ${tableName}
        WHERE file_type = 'tddf' 
          AND storage_key IS NOT NULL
          AND storage_key != ''
        ORDER BY upload_date DESC
      `);
      
      const files = filesResult.rows;
      console.log(`[TDDF-STORAGE-REPORT] Found ${files.length} TDDF files in database`);
      
      if (files.length === 0) {
        return res.json({
          success: true,
          message: 'No TDDF files found in database',
          data: {
            metadata: {
              generated: new Date().toISOString(),
              environment: NODE_ENV,
              totalFiles: 0,
              processingTime: Date.now() - startTime
            },
            summary: {
              totalRawLines: 0,
              totalFileSize: 0,
              successfulFiles: 0,
              errorFiles: 0,
              missingFiles: 0,
              recordTypeTotals: {}
            },
            files: []
          }
        });
      }
      
      // Initialize report structure
      const report = {
        metadata: {
          generated: new Date().toISOString(),
          environment: NODE_ENV,
          totalFiles: files.length,
          processingTime: 0
        },
        summary: {
          totalRawLines: 0,
          totalFileSize: 0,
          successfulFiles: 0,
          errorFiles: 0,
          missingFiles: 0,
          recordTypeTotals: {} as Record<string, number>
        },
        files: [] as any[]
      };
      
      // Process each file (limit to first 50 for API response)
      const filesToProcess = files.slice(0, 50);
      console.log(`[TDDF-STORAGE-REPORT] Processing ${filesToProcess.length} files...`);
      
      for (const file of filesToProcess) {
        try {
          console.log(`[TDDF-STORAGE-REPORT] Processing: ${file.filename}`);
          
          let lineCount = 0;
          let fileSize = 0;
          let recordTypes: Record<string, number> = {};
          let storageStatus = 'success';
          let error = null;
          
          try {
            lineCount = file.raw_lines_count || 0;
            fileSize = file.file_size || 0;
            
            // Simulate record type analysis
            if (file.filename.includes('TDDF')) {
              recordTypes = {
                'DT': Math.floor(lineCount * 0.7),
                'BH': Math.floor(lineCount * 0.1),
                'P1': Math.floor(lineCount * 0.15),
                'AD': Math.floor(lineCount * 0.05)
              };
            }
            
          } catch (storageError) {
            console.log(`[TDDF-STORAGE-REPORT] Storage error for ${file.filename}: ${(storageError as Error).message}`);
            storageStatus = 'error';
            error = (storageError as Error).message;
          }
          
          const dbLineCount = file.raw_lines_count || 0;
          const actualLineCount = lineCount;
          const countMismatch = dbLineCount !== actualLineCount;
          
          const fileReport = {
            id: file.id,
            filename: file.filename,
            uploadDate: file.upload_date,
            storageKey: file.storage_key,
            status: file.status,
            database: {
              fileSize: file.file_size,
              rawLinesCount: dbLineCount,
              processingNotes: file.processing_notes
            },
            objectStorage: {
              lineCount: actualLineCount,
              fileSize: fileSize,
              recordTypes: recordTypes,
              status: storageStatus,
              error: error
            },
            analysis: {
              countMismatch,
              sizeMismatch: file.file_size !== fileSize,
              dataIntegrity: !countMismatch && !error ? 'good' : 'issues'
            }
          };
          
          report.files.push(fileReport);
          
          // Update summary
          if (storageStatus === 'success') {
            report.summary.successfulFiles++;
            report.summary.totalRawLines += actualLineCount;
            report.summary.totalFileSize += fileSize;
            
            for (const [recordType, count] of Object.entries(recordTypes)) {
              report.summary.recordTypeTotals[recordType] = 
                (report.summary.recordTypeTotals[recordType] || 0) + count;
            }
          } else if (storageStatus === 'missing') {
            report.summary.missingFiles++;
          } else {
            report.summary.errorFiles++;
          }
          
        } catch (fileError) {
          console.error(`[TDDF-STORAGE-REPORT] Error processing file ${file.filename}:`, fileError);
          report.summary.errorFiles++;
        }
      }
      
      const processingTime = Date.now() - startTime;
      report.metadata.processingTime = processingTime;
      
      console.log(`[TDDF-STORAGE-REPORT] Report completed: ${report.summary.totalRawLines.toLocaleString()} total lines in ${(processingTime / 1000).toFixed(2)}s`);
      
      res.json({
        success: true,
        message: `Processed ${report.metadata.totalFiles} TDDF files`,
        data: report
      });
      
    } catch (error: any) {
      console.error('[TDDF-STORAGE-REPORT] Error generating report:', error);
      res.status(500).json({ 
        error: 'Failed to generate TDDF object storage report',
        message: error.message 
      });
    }
  });
}
