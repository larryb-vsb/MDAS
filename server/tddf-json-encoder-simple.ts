/**
 * TDDF to JSON/JSONB Encoder - Simple Working Version
 * Restores the basic encoder that was working 6 hours ago
 */

import { UploaderUpload } from '@shared/schema';

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
    record_type: recordType,
    record_sequence: lineNumber,
    field_data: {},
    raw_line: line,
    source_filename: '',
    line_number: lineNumber,
    processed_at: new Date(),
    can_reconstruct: true,
    reconstruction_ref: 'original'
  };

  // Extract common fields for all record types
  const merchantAccountNumber = extractField(line, 24, 39);

  // Extract type-specific fields
  if (recordType === 'DT') {
    // DT record - transaction details
    const transactionAmount = parseNumericField(extractField(line, 93, 103));
    const terminalId = extractField(line, 277, 284);
    const transactionDate = extractField(line, 85, 92);
    
    record.field_data = {
      transactionAmount: transactionAmount,
      terminalId: terminalId,
      transactionDate: transactionDate,
      merchantAccountNumber: merchantAccountNumber
    };
    record.transaction_amount = transactionAmount;
    record.merchant_id = merchantAccountNumber;
    record.terminal_id = terminalId;
    
  } else if (recordType === 'BH') {
    // BH record - batch header
    const netDeposit = parseNumericField(extractField(line, 69, 83));
    const batchDate = extractField(line, 56, 63);
    const batchId = extractField(line, 124, 126);
    
    record.field_data = {
      netDeposit: netDeposit,
      batchDate: batchDate,
      batchId: batchId,
      merchantAccountNumber: merchantAccountNumber
    };
    record.merchant_id = merchantAccountNumber;
    record.batch_id = batchId;
  } else {
    // Other record types
    record.field_data = {
      recordType: recordType,
      merchantAccountNumber: merchantAccountNumber
    };
    record.merchant_id = merchantAccountNumber;
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
      record.source_filename = upload.filename;
      records.push(record);
      
      // Track totals
      if (record.record_type === 'DT') {
        dtCount++;
        if (record.transaction_amount) {
          totalTransactionAmount += record.transaction_amount;
        }
      } else if (record.record_type === 'BH') {
        bhCount++;
        if (record.field_data.netDeposit) {
          totalNetDeposit += record.field_data.netDeposit;
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
    records
  };

  console.log(`[TDDF-ENCODER] Processed ${records.length} records from ${upload.filename}`);
  console.log(`[TDDF-ENCODER] DT: ${dtCount}, BH: ${bhCount}, Total Amount: $${totalTransactionAmount.toFixed(2)}`);

  return result;
}