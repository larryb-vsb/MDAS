/**
 * TDDF to JSON/JSONB Encoder
 * Uses TDDF Record type schema definitions for structured field extraction
 * Includes universal TDDF processing datetime extraction from filenames
 */

import { UploaderUpload } from '@shared/schema';
import { parseTddfFilename } from './filename-parser';
import { batchPool } from './db';
import crypto from 'crypto';
import { FileTaggedLogger } from '../shared/file-tagged-logger.js';

/**
 * Extract processing datetime from TDDF filename
 * Pattern: VERMNTSB.6759_TDDF_830_07142025_083332.TSYSO
 * Returns: { processingDate: '2025-07-14', processingTime: '08:33:32', processingDatetime: '2025-07-14T08:33:32' }
 */
function extractTddfProcessingDatetime(filename: string): {
  processingDate: string | null;
  processingTime: string | null;
  processingDatetime: string | null;
  isValidTddfFilename: boolean;
} {
  const result = {
    processingDate: null as string | null,
    processingTime: null as string | null,
    processingDatetime: null as string | null,
    isValidTddfFilename: false
  };

  try {
    // Match TDDF filename pattern: [PREFIX]_TDDF_[SYSTEM]_[MMDDYYYY]_[HHMMSS].TSYSO
    const tddfPattern = /.*_TDDF_\d+_(\d{8})_(\d{6})\.TSYSO$/i;
    const match = filename.match(tddfPattern);
    
    if (match) {
      const dateStr = match[1]; // MMDDYYYY format: 07142025
      const timeStr = match[2]; // HHMMSS format: 083332
      
      // Parse date: 07142025 -> 2025-07-14
      const month = dateStr.substring(0, 2);
      const day = dateStr.substring(2, 4);
      const year = dateStr.substring(4, 8);
      
      // Parse time: 083332 -> 08:33:32
      const hour = timeStr.substring(0, 2);
      const minute = timeStr.substring(2, 4);
      const second = timeStr.substring(4, 6);
      
      // Validate individual components before constructing datetime
      const monthNum = parseInt(month, 10);
      const dayNum = parseInt(day, 10);
      const yearNum = parseInt(year, 10);
      const hourNum = parseInt(hour, 10);
      const minuteNum = parseInt(minute, 10);
      const secondNum = parseInt(second, 10);
      
      // Check if values are within valid ranges
      if (monthNum >= 1 && monthNum <= 12 && 
          dayNum >= 1 && dayNum <= 31 && 
          yearNum >= 1900 && yearNum <= 3000 &&
          hourNum >= 0 && hourNum <= 23 &&
          minuteNum >= 0 && minuteNum <= 59 &&
          secondNum >= 0 && secondNum <= 59) {
        
        const processingDate = `${year}-${month}-${day}`;
        const processingTime = `${hour}:${minute}:${second}`;
        const processingDatetime = `${processingDate}T${processingTime}`;
        
        // Final validation with Date constructor
        const testDate = new Date(processingDatetime);
        if (!isNaN(testDate.getTime())) {
          result.processingDate = processingDate;
          result.processingTime = processingTime;
          result.processingDatetime = processingDatetime;
          result.isValidTddfFilename = true;
        }
      }
    }
  } catch (error: any) {
    console.warn(`[TDDF-FILENAME] Error parsing TDDF filename "${filename}":`, error.message);
  }

  return result;
}

/**
 * Calculate universal timestamp for TDDF records
 * Implements enhanced timestamp resolution algorithm
 */
function calculateUniversalTimestamp(
  recordType: string,
  extractedFields: any,
  filename: string,
  lineNumber: number
): {
  parsedDatetime: string | null;
  recordTimeSource: string;
} {
  try {
    // Priority 1: DT records have transaction date + time
    if (recordType === 'DT' && extractedFields.transactionDate) {
      const transactionDate = extractedFields.transactionDate;
      const transactionTime = extractedFields.transactionTime || '00:00:00';
      return {
        parsedDatetime: `${transactionDate}T${transactionTime}`,
        recordTimeSource: 'dt_line'
      };
    }
    
    // Priority 2: BH records have batch date
    if (recordType === 'BH' && extractedFields.batchDate) {
      return {
        parsedDatetime: `${extractedFields.batchDate}T00:00:00`,
        recordTimeSource: 'bh_line'
      };
    }
    
    // Priority 3: Use filename timestamp
    const filenameData = extractTddfProcessingDatetime(filename);
    if (filenameData.processingDatetime) {
      return {
        parsedDatetime: filenameData.processingDatetime,
        recordTimeSource: 'file_timestamp'
      };
    }
    
    // Priority 4: Current time as fallback
    return {
      parsedDatetime: new Date().toISOString(),
      recordTimeSource: 'ingest_time'
    };
    
  } catch (error: any) {
    console.warn(`[TDDF-TIMESTAMP] Error calculating timestamp for line ${lineNumber}:`, error.message);
    return {
      parsedDatetime: new Date().toISOString(),
      recordTimeSource: 'ingest_time_fallback'
    };
  }
}

// TDDF Field Position Specifications
// DT Record (Detail Transaction) - Fixed-width format
// Positions updated to match TDDF specification (converting 1-based TDDF positions to 0-based array indices)
//
// TERMINAL ID EXTRACTION AND V-NUMBER CONVERSION:
// - Terminal IDs are extracted from TDDF positions 277-284 (8 characters)
// - Raw terminal IDs typically start with '7' (most common) or '0' 
// - Example raw TDDF terminal IDs: "75679867", "00183380"
// - For storage in api_terminals table, first digit is replaced with 'V'
// - Conversion: 75679867 → V5679867, 00183380 → V0183380
// - The v_number field stores the converted V-format (VXXXXXXX)
// - The terminal_id field preserves the original 8-digit format (7XXXXXXX or 0XXXXXXX)
const DT_FIELD_SPECS = {
  sequenceNumber: { start: 0, end: 7, type: 'string' },           // TDDF 1-7
  entryRunNumber: { start: 7, end: 13, type: 'string' },          // TDDF 8-13
  sequenceWithinRun: { start: 13, end: 17, type: 'string' },      // TDDF 14-17
  recordIdentifier: { start: 17, end: 19, type: 'string' },       // TDDF 18-19
  bankNumber: { start: 19, end: 23, type: 'string' },             // TDDF 20-23
  merchantAccountNumber: { start: 23, end: 39, type: 'string' },  // TDDF 24-39
  associationNumber1: { start: 39, end: 45, type: 'string' },     // TDDF 40-45
  groupNumber: { start: 45, end: 51, type: 'string' },            // TDDF 46-51
  transactionCode: { start: 51, end: 55, type: 'string' },        // TDDF 52-55
  associationNumber2: { start: 55, end: 61, type: 'string' },     // TDDF 56-61
  referenceNumber: { start: 61, end: 84, type: 'string' },        // TDDF 62-84
  transactionDate: { start: 84, end: 92, type: 'date' },          // TDDF 85-92
  transactionAmount: { start: 92, end: 103, type: 'amount' },     // TDDF 93-103
  batchJulianDate: { start: 103, end: 108, type: 'string' },      // TDDF 104-108
  netDeposit: { start: 108, end: 123, type: 'amount' },           // TDDF 109-123
  cardNumber: { start: 123, end: 142, type: 'string' },           // TDDF 124-142
  authorizationCode: { start: 142, end: 148, type: 'string' },    // TDDF 143-148
  merchantName: { start: 217, end: 242, type: 'string' },         // TDDF 218-242 [FIXED]
  authSourceCode: { start: 195, end: 196, type: 'string' },       // TDDF 196
  authResponseCode: { start: 196, end: 198, type: 'string' },     // TDDF 197-198
  validationCode: { start: 199, end: 202, type: 'string' },       // TDDF 200-202
  catIndicator: { start: 196, end: 197, type: 'string' },         // TDDF 197
  retrievalReferenceNumber: { start: 211, end: 223, type: 'string' }, // TDDF 212-223
  marketSpecificData: { start: 223, end: 225, type: 'string' },   // TDDF 224-225
  cardType: { start: 252, end: 254, type: 'string' },             // TDDF 253-254 [CORRECTED]
  cardholderIdMethod: { start: 227, end: 229, type: 'string' },   // TDDF 228-229
  posEntryMode: { start: 229, end: 231, type: 'string' },         // TDDF 230-231
  networkIdentifier: { start: 226, end: 231, type: 'string' },    // TDDF 227-231
  mccCode: { start: 272, end: 276, type: 'string' },              // TDDF 273-276 [FIXED]
  terminalId: { start: 276, end: 284, type: 'string' },           // TDDF 277-284 [CORRECTED]
  purchaseId: { start: 287, end: 312, type: 'string' },           // TDDF 288-312 [CORRECTED]
  posDataCode: { start: 322, end: 335, type: 'string' },          // TDDF 323-335 [CORRECTED]
  transactionTypeIdentifier: { start: 335, end: 338, type: 'string' }, // TDDF 336-338
  cardType3: { start: 338, end: 341, type: 'string' },            // TDDF 339-341 [CORRECTED]
  networkIdentifierDebit: { start: 289, end: 302, type: 'string' }, // TDDF 290-302 [FIXED]
  amexMerchantSellerName: { start: 512, end: 537, type: 'string' } // TDDF 513-537 [CORRECTED]
};

// BH Record (Batch Header) - Fixed-width format
const BH_FIELD_SPECS = {
  sequenceNumber: { start: 0, end: 7, type: 'string' },              // TDDF 1-7
  entryRunNumber: { start: 7, end: 13, type: 'string' },             // TDDF 8-13
  sequenceWithinRun: { start: 13, end: 17, type: 'string' },         // TDDF 14-17
  recordIdentifier: { start: 17, end: 19, type: 'string' },          // TDDF 18-19
  bankNumber: { start: 19, end: 23, type: 'string' },                // TDDF 20-23
  merchantAccountNumber: { start: 23, end: 39, type: 'string' },     // TDDF 24-39
  associationNumber: { start: 39, end: 45, type: 'string' },         // TDDF 40-45
  groupNumber: { start: 45, end: 51, type: 'string' },               // TDDF 46-51
  transactionCode: { start: 51, end: 55, type: 'string' },           // TDDF 52-55
  batchDate: { start: 55, end: 63, type: 'date' },                   // TDDF 56-63 [CORRECTED]
  batchJulianDate: { start: 63, end: 68, type: 'string' },           // TDDF 64-68
  netDeposit: { start: 68, end: 83, type: 'amount' },                // TDDF 69-83 [CORRECTED]
  rejectReason: { start: 83, end: 87, type: 'string' },              // TDDF 84-87
  merchantReferenceNum: { start: 87, end: 103, type: 'string' },     // TDDF 88-103 [CORRECTED]
  batchHeaderCarryIndicator: { start: 103, end: 104, type: 'string' }, // TDDF 104
  associationNumberBatch: { start: 104, end: 110, type: 'string' },  // TDDF 105-110
  merchantBankNumber: { start: 110, end: 114, type: 'string' },      // TDDF 111-114
  debitCreditIndicator: { start: 114, end: 115, type: 'string' },    // TDDF 115
  achPostingDate: { start: 115, end: 123, type: 'date' },            // TDDF 116-123
  batchId: { start: 123, end: 126, type: 'string' }                  // TDDF 124-126 [CORRECTED]
};

/**
 * Encode a TDDF line to JSON representation
 */
export function encodeTddfLineToJson(line: string, lineNumber: number): {
  recordType: string;
  extractedFields: any;
  lineLength: number;
} {
  const lineLength = line.length;
  
  // Extract record type from positions 18-19 (DT, BH, P1, P2, etc.)
  const recordType = line.substring(17, 19).trim();
  
  let extractedFields: any = {
    recordIdentifier: recordType
  };
  
  // Parse based on record type
  if (recordType === 'DT') {
    for (const [fieldName, spec] of Object.entries(DT_FIELD_SPECS)) {
      const rawValue = line.substring(spec.start, spec.end);
      extractedFields[fieldName] = parseFieldValue(rawValue, spec.type);
    }
  } else if (recordType === 'BH') {
    for (const [fieldName, spec] of Object.entries(BH_FIELD_SPECS)) {
      const rawValue = line.substring(spec.start, spec.end);
      extractedFields[fieldName] = parseFieldValue(rawValue, spec.type);
    }
  } else {
    // For other record types, store basic info
    extractedFields = {
      recordIdentifier: recordType,
      sequenceNumber: line.substring(0, 7).trim(),
      rawContent: line.trim()
    };
  }
  
  return {
    recordType,
    extractedFields,
    lineLength
  };
}

/**
 * Parse field value based on type
 */
function parseFieldValue(rawValue: string, type: string): any {
  const trimmed = rawValue.trim();
  
  if (!trimmed || trimmed === '') return null;
  
  switch (type) {
    case 'date':
      // MMDDCCYY format -> YYYY-MM-DD with validation
      if (trimmed.length === 8) {
        const month = trimmed.substring(0, 2);
        const day = trimmed.substring(2, 4);
        const year = trimmed.substring(4, 8);
        
        // Validate date components
        const monthNum = parseInt(month, 10);
        const dayNum = parseInt(day, 10);
        const yearNum = parseInt(year, 10);
        
        // Check for valid ranges
        if (monthNum < 1 || monthNum > 12) {
          console.warn(`[TDDF-DATE-PARSE] Invalid month in date: ${trimmed} (month: ${month})`);
          return null;
        }
        if (dayNum < 1 || dayNum > 31) {
          console.warn(`[TDDF-DATE-PARSE] Invalid day in date: ${trimmed} (day: ${day})`);
          return null;
        }
        if (yearNum < 1900 || yearNum > 2100) {
          console.warn(`[TDDF-DATE-PARSE] Invalid year in date: ${trimmed} (year: ${year})`);
          return null;
        }
        
        return `${year}-${month}-${day}`;
      }
      return trimmed;
      
    case 'amount':
      // Remove leading zeros and convert to decimal
      const cleanAmount = trimmed.replace(/^0+/, '') || '0';
      // Assume last 2 digits are cents
      if (cleanAmount.length <= 2) {
        return `0.${cleanAmount.padStart(2, '0')}`;
      }
      const dollars = cleanAmount.substring(0, cleanAmount.length - 2);
      const cents = cleanAmount.substring(cleanAmount.length - 2);
      return `${dollars}.${cents}`;
      
    case 'number':
      return parseInt(trimmed, 10) || 0;
      
    case 'string':
    default:
      return trimmed;
  }
}

/**
 * Step 6 Processing: Process ALL records to master tddfJsonb table
 * Removes the 10K limit and processes comprehensive financial data
 * Also populates enhanced tddApiRecords schema with full capabilities
 * NOW INCLUDES: Merchant and Terminal table updates from DT records
 */
export async function processAllRecordsToMasterTable(fileContent: string, upload: UploaderUpload): Promise<any> {
  const startTime = Date.now();
  const startTimeDate = new Date();
  console.log(`[STEP-6-PROCESSING] Starting comprehensive processing for ${upload.filename} - ALL records to master table`);
  
  // Create timing log entry for Step 6 processing
  let timingLogId: number | null = null;
  try {
    const { getTableName } = await import("./table-config");
    const timingTableName = getTableName('processing_timing_logs');
    const separateClient = await batchPool.connect();
    try {
      const result = await separateClient.query(`
        INSERT INTO ${timingTableName} (upload_id, operation_type, start_time, status, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [upload.id, 'step6-processing', startTimeDate, 'in_progress', JSON.stringify({ filename: upload.filename })]);
      timingLogId = result.rows[0]?.id;
      console.log(`[STEP-6-TIMING] Created timing log ${timingLogId} for upload ${upload.id}`);
    } finally {
      separateClient.release();
    }
  } catch (timingError: any) {
    console.warn(`[STEP-6-TIMING] Could not create timing log: ${timingError.message}`);
  }
  
  try {
    // Process ALL lines - no limits for Step 6
    const lines = fileContent.split('\n');
    console.log(`[STEP-6-PROCESSING] Processing ${lines.length} lines total (NO 10K LIMIT)`);
    
    // Get table configuration
    const { getTableName } = await import("./table-config");
    const tddfJsonbTable = getTableName('tddf_jsonb');
    const apiRecordsTable = getTableName('uploader_tddf_jsonb_records');
    
    // Extract filename metadata for universal TDDF processing
    const filenameData = extractTddfProcessingDatetime(upload.filename);
    const { processingDate, processingDatetime } = filenameData;
    
    let masterRecordCount = 0;
    let apiRecordCount = 0;
    let skipCount = 0;
    
    // Record type counters for UI display
    let bhCount = 0;
    let dtCount = 0;
    let otherCount = 0;
    
    // Tracking for merchant and terminal updates
    let merchantsCreated = 0;
    let merchantsUpdated = 0;
    let terminalsCreated = 0;
    let terminalsUpdated = 0;
    
    // Batch arrays for bulk inserts
    const masterTableBatch = [];
    const apiRecordsBatch = [];
    
    // Collect DT records for merchant/terminal processing
    const dtRecordsForMerchantProcessing: any[] = [];
    
    // Process each line without limits
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;
      
      // Skip empty lines but preserve line numbers
      if (!line.trim()) {
        skipCount++;
        continue;
      }
      
      // Extract TDDF record type and fields
      const jsonRecord = encodeTddfLineToJson(line, lineNumber);
      const recordType = jsonRecord.recordType;
      const extractedFields = jsonRecord.extractedFields;
      
      // Calculate universal timestamp using enhanced logic
      const timestampData = calculateUniversalTimestamp(
        recordType, 
        extractedFields, 
        upload.filename, 
        lineNumber
      );
      
      // Generate unique record ID for master table
      const masterRecordId = `${upload.id}_line_${lineNumber}_${recordType}`;
      
      // Calculate hash from first 52 characters for duplicate detection
      const first52Chars = line.substring(0, 52);
      const rawLineHash = crypto.createHash('sha256').update(first52Chars).digest('hex');
      
      // Prepare master table record (tddfJsonb)
      const masterRecord = {
        id: masterRecordId,
        uploadId: upload.id,
        filename: upload.filename,
        lineNumber: lineNumber,
        recordType: recordType,
        rawLine: line,
        rawLineHash: rawLineHash,
        extractedFields: JSON.stringify(extractedFields),
        recordIdentifier: extractedFields.recordIdentifier || null,
        tddfProcessingDatetime: processingDatetime,
        tddfProcessingDate: processingDate,
        parsedDatetime: timestampData.parsedDatetime,
        recordTimeSource: timestampData.recordTimeSource,
        createdAt: new Date().toISOString()
      };
      
      masterTableBatch.push(masterRecord);
      masterRecordCount++;
      
      // Count record types for UI display
      if (recordType === 'BH') {
        bhCount++;
      } else if (recordType === 'DT') {
        dtCount++;
      } else {
        otherCount++;
      }
      
      // Prepare enhanced API records table entry (tddApiRecords)
      const apiRecord = {
        uploadId: upload.id,
        filename: upload.filename,
        recordType: recordType,
        lineNumber: lineNumber,
        rawLine: line,
        extractedFields: JSON.stringify(extractedFields),
        recordIdentifier: extractedFields.recordIdentifier || null,
        processingTimeMs: 0,
        tddfProcessingDatetime: processingDatetime,
        tddfProcessingDate: processingDate,
        parsedDatetime: timestampData.parsedDatetime,
        recordTimeSource: timestampData.recordTimeSource,
        parsedData: JSON.stringify(extractedFields), // Legacy compatibility
        isValid: true,
        validationErrors: null,
        status: 'completed',
        processedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      apiRecordsBatch.push(apiRecord);
      apiRecordCount++;
      
      // Collect DT records for merchant/terminal processing
      if (recordType === 'DT' && extractedFields) {
        dtRecordsForMerchantProcessing.push({
          merchantAccountNumber: extractedFields.merchantAccountNumber,
          merchantName: extractedFields.merchantName,
          terminalId: extractedFields.terminalId,
          groupNumber: extractedFields.groupNumber,
          mccCode: extractedFields.mccCode,
          transactionDate: timestampData.parsedDatetime,
          lineNumber: lineNumber
        });
      }
      
      // Batch insert every 1000 records to manage memory for large files
      if (masterTableBatch.length >= 1000) {
        await insertMasterTableBatch(tddfJsonbTable, masterTableBatch);
        await insertApiRecordsBatch(apiRecordsTable, apiRecordsBatch);
        console.log(`[STEP-6-PROCESSING] Inserted batch: ${masterRecordCount} master records, ${apiRecordCount} API records`);
        masterTableBatch.length = 0;
        apiRecordsBatch.length = 0;
      }
    }
    
    // Insert remaining records
    if (masterTableBatch.length > 0) {
      await insertMasterTableBatch(tddfJsonbTable, masterTableBatch);
      await insertApiRecordsBatch(apiRecordsTable, apiRecordsBatch);
    }
    
    console.log(`[STEP-6-VALIDATION] Starting duplicate validation and cleanup...`);
    
    // Update status to 'validating'
    const { getTableName: getUploaderTableName } = await import("./table-config");
    const uploaderTableName = getUploaderTableName('uploader_uploads');
    await batchPool.query(`
      UPDATE ${uploaderTableName}
      SET current_phase = 'validating', 
          status_message = 'Validating & removing duplicates...'
      WHERE id = $1
    `, [upload.id]);
    
    // Count records before cleanup
    const beforeCountResult = await batchPool.query(`
      SELECT COUNT(*) as count FROM ${tddfJsonbTable} WHERE upload_id = $1
    `, [upload.id]);
    const recordsBeforeCleanup = parseInt(beforeCountResult.rows[0]?.count || '0', 10);
    
    // Remove duplicate records (keep newest based on MAX(id))
    // Optimized: Single-pass deletion using CTE with ROW_NUMBER() window function
    const deleteResult = await batchPool.query(`
      WITH duplicates_to_delete AS (
        SELECT id
        FROM (
          SELECT 
            id,
            ROW_NUMBER() OVER (
              PARTITION BY raw_line_hash 
              ORDER BY id DESC
            ) as row_num
          FROM ${tddfJsonbTable}
          WHERE upload_id = $1 AND raw_line_hash IS NOT NULL
        ) ranked
        WHERE row_num > 1
      )
      DELETE FROM ${tddfJsonbTable}
      WHERE id IN (SELECT id FROM duplicates_to_delete)
    `, [upload.id]);
    
    const duplicatesRemoved = deleteResult.rowCount || 0;
    const recordsAfterCleanup = recordsBeforeCleanup - duplicatesRemoved;
    
    console.log(`[STEP-6-VALIDATION] ✅ Duplicate cleanup completed:`);
    console.log(`[STEP-6-VALIDATION] - Records before: ${recordsBeforeCleanup}`);
    console.log(`[STEP-6-VALIDATION] - Duplicates removed: ${duplicatesRemoved}`);
    console.log(`[STEP-6-VALIDATION] - Records after: ${recordsAfterCleanup}`);
    
    // Process merchants and terminals from DT records
    if (dtRecordsForMerchantProcessing.length > 0) {
      console.log(`[STEP-6-MERCHANTS] Processing ${dtRecordsForMerchantProcessing.length} DT records for merchant/terminal updates`);
      const merchantStats = await updateMerchantsAndTerminalsFromDT(dtRecordsForMerchantProcessing, upload.filename, upload.id);
      merchantsCreated = merchantStats.merchantsCreated;
      merchantsUpdated = merchantStats.merchantsUpdated;
      terminalsCreated = merchantStats.terminalsCreated;
      terminalsUpdated = merchantStats.terminalsUpdated;
    }
    
    const endTime = Date.now();
    const endTimeDate = new Date();
    const processingTimeMs = endTime - startTime;
    const durationSeconds = Math.floor(processingTimeMs / 1000);
    const totalRecords = masterRecordCount + apiRecordCount;
    const recordsPerSecond = totalRecords > 0 && durationSeconds > 0 ? totalRecords / durationSeconds : 0;
    
    // Update to 'completed' status with duplicate stats and record type counts
    await batchPool.query(`
      UPDATE ${uploaderTableName}
      SET current_phase = 'completed', 
          status_message = $1,
          bh_record_count = $3,
          dt_record_count = $4,
          other_record_count = $5
      WHERE id = $2
    `, [
      `Completed: ${recordsAfterCleanup} records, ${duplicatesRemoved} duplicates removed`, 
      upload.id,
      bhCount,
      dtCount,
      otherCount
    ]);
    
    console.log(`[STEP-6-PROCESSING] ✅ Successfully processed ${upload.filename}:`);
    console.log(`[STEP-6-PROCESSING] - Total lines: ${lines.length}`);
    console.log(`[STEP-6-PROCESSING] - Master table records: ${masterRecordCount}`);
    console.log(`[STEP-6-PROCESSING] - API records: ${apiRecordCount}`);
    console.log(`[STEP-6-PROCESSING] - Skipped lines: ${skipCount}`);
    console.log(`[STEP-6-PROCESSING] - Duplicates removed: ${duplicatesRemoved}`);
    console.log(`[STEP-6-PROCESSING] - Final record count: ${recordsAfterCleanup}`);
    console.log(`[STEP-6-PROCESSING] - Merchants created: ${merchantsCreated}, updated: ${merchantsUpdated}`);
    console.log(`[STEP-6-PROCESSING] - Terminals created: ${terminalsCreated}, updated: ${terminalsUpdated}`);
    console.log(`[STEP-6-PROCESSING] - Processing time: ${processingTimeMs}ms`);
    
    // Complete timing log entry
    if (timingLogId) {
      try {
        const { getTableName } = await import("./table-config");
        const timingTableName = getTableName('processing_timing_logs');
        await batchPool.query(`
          UPDATE ${timingTableName}
          SET end_time = $1, duration_seconds = $2, total_records = $3, 
              records_per_second = $4, status = $5
          WHERE id = $6
        `, [endTimeDate, durationSeconds, totalRecords, recordsPerSecond, 'completed', timingLogId]);
        console.log(`[STEP-6-TIMING] Completed timing log ${timingLogId}: ${durationSeconds}s, ${totalRecords} records, ${recordsPerSecond.toFixed(2)} records/sec`);
      } catch (timingError: any) {
        console.warn(`[STEP-6-TIMING] Could not complete timing log: ${timingError.message}`);
      }
    }
    
    return {
      success: true,
      totalRecords: totalRecords,
      masterRecords: masterRecordCount,
      apiRecords: apiRecordCount,
      skippedLines: skipCount,
      duplicatesRemoved: duplicatesRemoved,
      finalRecordCount: recordsAfterCleanup,
      processingTimeMs: processingTimeMs,
      merchantsCreated,
      merchantsUpdated,
      terminalsCreated,
      terminalsUpdated
    };
    
  } catch (error: any) {
    console.error(`[STEP-6-PROCESSING] Error processing ${upload.filename}:`, error);
    
    // Update timing log with failure status
    if (timingLogId) {
      try {
        const { getTableName } = await import("./table-config");
        const timingTableName = getTableName('processing_timing_logs');
        const endTimeDate = new Date();
        const durationSeconds = Math.floor((endTimeDate.getTime() - startTimeDate.getTime()) / 1000);
        await batchPool.query(`
          UPDATE ${timingTableName}
          SET end_time = $1, duration_seconds = $2, status = $3, metadata = $4
          WHERE id = $5
        `, [endTimeDate, durationSeconds, 'failed', JSON.stringify({ error: error.message }), timingLogId]);
        console.log(`[STEP-6-TIMING] Failed timing log ${timingLogId}: ${error.message}`);
      } catch (timingError: any) {
        console.warn(`[STEP-6-TIMING] Could not update failed timing log: ${timingError.message}`);
      }
    }
    
    return {
      success: false,
      error: error.message || 'Step 6 processing failed',
      totalRecords: 0,
      masterRecords: 0,
      apiRecords: 0
    };
  }
}

/**
 * Helper function to insert batch records into master tddfJsonb table
 */
async function insertMasterTableBatch(tableName: string, records: any[]): Promise<void> {
  if (records.length === 0) return;
  
  const values = records.map((_, index) => {
    const offset = index * 13;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
  }).join(', ');
  
  const params = records.flatMap(record => [
    record.uploadId,
    record.filename,
    record.lineNumber,
    record.recordType,
    record.rawLine,
    record.rawLineHash,
    record.extractedFields,
    record.recordIdentifier,
    record.tddfProcessingDatetime,
    record.tddfProcessingDate,
    record.parsedDatetime,
    record.recordTimeSource,
    record.createdAt
  ]);
  
  await batchPool.query(`
    INSERT INTO ${tableName} (
      upload_id, filename, line_number, record_type, raw_line, raw_line_hash,
      extracted_fields, record_identifier, tddf_processing_datetime, tddf_processing_date,
      parsed_datetime, record_time_source, created_at
    ) VALUES ${values}
  `, params);
}

/**
 * Helper function to insert batch records into uploader_tddf_jsonb_records table (Raw Data destination)
 */
async function insertApiRecordsBatch(tableName: string, records: any[]): Promise<void> {
  if (records.length === 0) return;
  
  const values = records.map((_, index) => {
    const offset = index * 8;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
  }).join(', ');
  
  const params = records.flatMap(record => {
    // Calculate hash in Node.js instead of SQL
    const hash = crypto.createHash('sha256').update((record.rawLine || '').trim()).digest('hex');
    return [
      record.uploadId,
      record.recordType,
      record.extractedFields, // Maps to record_data column
      record.lineNumber,
      record.rawLine,
      record.recordIdentifier,
      record.createdAt,
      hash // Add the calculated hash
    ];
  });
  
  await batchPool.query(`
    INSERT INTO ${tableName} (
      upload_id, record_type, record_data, line_number, raw_line,
      record_identifier, created_at, raw_line_hash
    ) VALUES ${values}
  `, params);
}

/**
 * Update merchants and terminals tables from DT record data
 * Based on TDDF1 processing pattern but adapted for Step 6
 */
async function updateMerchantsAndTerminalsFromDT(
  dtRecords: any[],
  sourceFilename: string,
  uploadId: string
): Promise<{
  merchantsCreated: number;
  merchantsUpdated: number;
  terminalsCreated: number;
  terminalsUpdated: number;
}> {
  const { getTableName } = await import("./table-config");
  const merchantsTableName = getTableName('merchants');
  const terminalsTableName = getTableName('api_terminals');
  
  let merchantsCreated = 0;
  let merchantsUpdated = 0;
  let terminalsCreated = 0;
  let terminalsUpdated = 0;
  
  // Group by merchant account number to aggregate data
  const merchantDataMap = new Map<string, {
    merchantAccountNumber: string;
    merchantName?: string;
    mccCode?: string;
    terminals: Set<string>;
    groupNumbers: Set<string>;
    firstSeen: Date | null;
    lastSeen: Date | null;
  }>();
  
  // Process all DT records and collect unique merchants and terminals
  for (const record of dtRecords) {
    const merchantAccountNumber = record.merchantAccountNumber;
    const merchantName = record.merchantName;
    const terminalId = record.terminalId;
    const groupNumber = record.groupNumber;
    const mccCode = record.mccCode;
    const transactionDate = record.transactionDate ? new Date(record.transactionDate) : null;
    
    // Skip if missing required fields
    if (!merchantAccountNumber) continue;
    
    // Initialize merchant data if not exists
    if (!merchantDataMap.has(merchantAccountNumber)) {
      merchantDataMap.set(merchantAccountNumber, {
        merchantAccountNumber,
        merchantName: merchantName || undefined,
        mccCode: mccCode || undefined,
        terminals: new Set(),
        groupNumbers: new Set(),
        firstSeen: transactionDate,
        lastSeen: transactionDate
      });
    }
    
    const merchantData = merchantDataMap.get(merchantAccountNumber)!;
    
    // Update merchant name if we have a better one
    if (merchantName && !merchantData.merchantName) {
      merchantData.merchantName = merchantName;
    }
    
    // Update MCC if we have one
    if (mccCode && !merchantData.mccCode) {
      merchantData.mccCode = mccCode;
    }
    
    // Track terminals
    if (terminalId) {
      merchantData.terminals.add(terminalId);
    }
    
    // Track group numbers
    if (groupNumber) {
      merchantData.groupNumbers.add(groupNumber);
    }
    
    // Update date ranges
    if (transactionDate) {
      if (!merchantData.firstSeen || transactionDate < merchantData.firstSeen) {
        merchantData.firstSeen = transactionDate;
      }
      if (!merchantData.lastSeen || transactionDate > merchantData.lastSeen) {
        merchantData.lastSeen = transactionDate;
      }
    }
  }
  
  console.log(`[STEP-6-MERCHANTS] Processing ${merchantDataMap.size} unique merchants`);
  
  // Process each merchant - upsert into merchants table
  for (const [merchantAccountNumber, data] of Array.from(merchantDataMap.entries())) {
    try {
      // Use merchant account number as the ID (matching existing pattern)
      const merchantId = merchantAccountNumber;
      
      // Check if merchant exists
      const checkQuery = `SELECT id FROM ${merchantsTableName} WHERE id = $1`;
      const existingResult = await batchPool.query(checkQuery, [merchantId]);
      
      if (existingResult.rows.length > 0) {
        // Update existing merchant
        const updateQuery = `
          UPDATE ${merchantsTableName}
          SET 
            name = COALESCE($2, name),
            mcc = COALESCE($3, mcc),
            last_upload_date = NOW(),
            edit_date = NOW(),
            updated_by = $4
          WHERE id = $1
        `;
        
        await batchPool.query(updateQuery, [
          merchantId,
          data.merchantName,
          data.mccCode,
          `TDDF_STEP6:${sourceFilename}`
        ]);
        
        merchantsUpdated++;
      } else {
        // Insert new merchant
        const insertQuery = `
          INSERT INTO ${merchantsTableName} (
            id, name, mcc, status, created_at, last_upload_date, 
            edit_date, updated_by, client_mid
          ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW(), $5, $6)
        `;
        
        await batchPool.query(insertQuery, [
          merchantId,
          data.merchantName || `Merchant ${merchantAccountNumber}`,
          data.mccCode,
          'Active',
          `TDDF_STEP6:${sourceFilename}`,
          merchantAccountNumber
        ]);
        
        merchantsCreated++;
      }
      
      // Process terminals for this merchant
      for (const terminalId of Array.from(data.terminals)) {
        try {
          // TDDF terminals start with '7' or '0' - convert to V-number format for storage
          // Format: 7XXXXXXX -> VXXXXXXX or 0XXXXXXX -> VXXXXXXX (matching existing terminal pattern)
          const vNumber = (terminalId.startsWith('7') || terminalId.startsWith('0')) 
            ? 'V' + terminalId.substring(1) 
            : terminalId;
          
          // Check if terminal exists
          const checkTerminalQuery = `SELECT id FROM ${terminalsTableName} WHERE v_number = $1`;
          const existingTerminal = await batchPool.query(checkTerminalQuery, [vNumber]);
          
          // Get line number and most recent transaction date for this terminal
          const terminalTransactions = dtRecords.filter(r => r.terminalId === terminalId);
          const terminalLineNumber = terminalTransactions[0]?.lineNumber || 0;
          
          // Find most recent transaction date for last_activity_date
          let lastActivityDate: Date | null = null;
          for (const txn of terminalTransactions) {
            if (txn.transactionDate) {
              const txnDate = new Date(txn.transactionDate);
              if (!lastActivityDate || txnDate > lastActivityDate) {
                lastActivityDate = txnDate;
              }
            }
          }
          
          const updateSource = `TDDF: ${sourceFilename} Line: ${terminalLineNumber}`;
          const createdUpdatedBy = `STEP6:${uploadId}`;
          
          // Log warning if no line number found for terminal
          if (terminalLineNumber === 0) {
            console.warn(`[STEP-6-MERCHANTS] No DT record found for terminal ${terminalId}, using line 0 in audit trail`);
          }
          
          if (existingTerminal.rows.length > 0) {
            // Update existing terminal - PRESERVE terminal_id and v_number, only update merchant info and last_activity_date
            const updateTerminalQuery = `
              UPDATE ${terminalsTableName}
              SET 
                pos_merchant_number = $2,
                dba_name = COALESCE($3, dba_name),
                mcc = COALESCE($4, mcc),
                status = 'Active',
                record_status = 'Active',
                last_update = NOW(),
                last_activity_date = COALESCE($5, last_activity_date),
                update_source = $6,
                updated_by = $7,
                updated_at = NOW()
              WHERE v_number = $1
            `;
            
            await batchPool.query(updateTerminalQuery, [
              vNumber,
              merchantAccountNumber,
              data.merchantName,
              data.mccCode,
              lastActivityDate, // Set last activity date from most recent transaction
              updateSource,
              createdUpdatedBy
            ]);
            
            terminalsUpdated++;
          } else {
            // Insert new terminal with audit trail
            const insertTerminalQuery = `
              INSERT INTO ${terminalsTableName} (
                v_number, pos_merchant_number, dba_name, mcc, 
                terminal_id, status, record_status,
                last_activity_date,
                update_source, created_by, updated_by,
                last_update, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), NOW())
            `;
            
            await batchPool.query(insertTerminalQuery, [
              vNumber,
              merchantAccountNumber,
              data.merchantName,
              data.mccCode,
              terminalId, // Store original terminal ID with '7' or '0' prefix
              'Active',
              'Active',
              lastActivityDate, // Set last activity date from most recent transaction
              updateSource,
              createdUpdatedBy,
              createdUpdatedBy
            ]);
            
            terminalsCreated++;
          }
        } catch (terminalError: any) {
          console.error(`[STEP-6-MERCHANTS] Error processing terminal ${terminalId}:`, terminalError.message);
          // Continue processing other terminals
        }
      }
      
    } catch (merchantError: any) {
      console.error(`[STEP-6-MERCHANTS] Error processing merchant ${merchantAccountNumber}:`, merchantError.message);
      // Continue processing other merchants
    }
  }
  
  console.log(`[STEP-6-MERCHANTS] ✅ Merchant updates: ${merchantsCreated} created, ${merchantsUpdated} updated`);
  console.log(`[STEP-6-MERCHANTS] ✅ Terminal updates: ${terminalsCreated} created, ${terminalsUpdated} updated`);
  
  return {
    merchantsCreated,
    merchantsUpdated,
    terminalsCreated,
    terminalsUpdated
  };
}
