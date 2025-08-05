/**
 * TDDF to JSON/JSONB Encoder - Working Version from 6 hours ago
 * Simple, reliable encoder that successfully processes TDDF files
 */

import { UploaderUpload } from '@shared/schema';

/**
 * Extract processing datetime from TDDF filename
 * Pattern: VERMNTSB.6759_TDDF_830_07142025_083332.TSYSO
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
      
      const processingDate = `${year}-${month}-${day}`;
      const processingTime = `${hour}:${minute}:${second}`;
      const processingDatetime = `${processingDate}T${processingTime}`;
      
      // Basic validation
      const testDate = new Date(processingDatetime);
      if (!isNaN(testDate.getTime())) {
        result.processingDate = processingDate;
        result.processingTime = processingTime;
        result.processingDatetime = processingDatetime;
        result.isValidTddfFilename = true;
      }
    }
  } catch (error) {
    console.warn(`[TDDF-DATETIME] Error parsing filename: ${filename}`, error);
  }

  return result;
}

/**
 * Extract field value from TDDF line using positions
 */
function extractField(line: string, start: number, end: number): string | null {
  if (!line || start < 1 || end > line.length) return null;
  
  const value = line.substring(start - 1, end).trim();
  return value || null;
}

/**
 * Parse numeric field with validation
 */
function parseNumericField(value: string | null): number | null {
  if (!value) return null;
  
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Process TDDF line and extract key fields
 */
function processTddfLine(line: string, lineNumber: number): any {
  if (!line || line.length < 19) {
    return null; // Skip invalid lines
  }

  // Extract record type (positions 18-19)
  const recordType = extractField(line, 18, 19);
  if (!recordType) return null;

  const record: any = {
    recordType,
    lineNumber,
    rawLine: line
  };

  // Extract common fields for all record types
  const sequenceNumber = extractField(line, 1, 7);
  const entryRunNumber = extractField(line, 8, 13);
  const merchantAccountNumber = extractField(line, 24, 39);

  // Extract type-specific fields
  if (recordType === 'DT') {
    // DT record - transaction details
    const transactionAmount = parseNumericField(extractField(line, 93, 103));
    const terminalId = extractField(line, 277, 284);
    const transactionDate = extractField(line, 85, 92);
    
    record.transactionAmount = transactionAmount;
    record.merchantId = merchantAccountNumber;
    record.terminalId = terminalId;
    record.transactionDate = transactionDate;
    
  } else if (recordType === 'BH') {
    // BH record - batch header
    const netDeposit = parseNumericField(extractField(line, 69, 83));
    const batchDate = extractField(line, 56, 63);
    const batchId = extractField(line, 124, 126);
    
    record.netDeposit = netDeposit;
    record.merchantId = merchantAccountNumber;
    record.batchDate = batchDate;
    record.batchId = batchId;
  }

  return record;
}

/**
 * Main TDDF encoding function - simple and reliable
 */
export async function encodeTddfToJsonb(fileContent: string, upload: UploaderUpload): Promise<any> {
  console.log(`[TDDF-ENCODER] Processing ${upload.filename}`);
  
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
  const records: any[] = [];
  
  let dtCount = 0;
  let bhCount = 0;
  let totalTransactionAmount = 0;
  let totalNetDeposit = 0;

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const record = processTddfLine(lines[i], i + 1);
    if (record) {
      records.push(record);
      
      // Track totals
      if (record.recordType === 'DT') {
        dtCount++;
        if (record.transactionAmount) {
          totalTransactionAmount += record.transactionAmount;
        }
      } else if (record.recordType === 'BH') {
        bhCount++;
        if (record.netDeposit) {
          totalNetDeposit += record.netDeposit;
        }
      }
    }
  }

  const result = {
    uploadId: upload.id,
    filename: upload.filename,
    totalLines: lines.length,
    totalRecords: records.length,
    dtRecords: dtCount,
    bhRecords: bhCount,
    totalTransactionAmount,
    totalNetDeposit,
    records,
    processingInfo: extractTddfProcessingDatetime(upload.filename)
  };

  console.log(`[TDDF-ENCODER] Processed ${records.length} records from ${upload.filename}`);
  console.log(`[TDDF-ENCODER] DT: ${dtCount}, BH: ${bhCount}, Total Amount: $${totalTransactionAmount.toFixed(2)}`);

  return result;
}