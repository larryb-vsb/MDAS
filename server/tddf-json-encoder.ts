/**
 * TDDF to JSON/JSONB Encoder
 * Uses TDDF Record type schema definitions for structured field extraction
 */

import { UploaderUpload } from '@shared/schema';

// TDDF Record Type Field Definitions based on schema
export interface TddfFieldDefinition {
  name: string;
  positions: [number, number]; // Start and end positions (1-based)
  type: 'text' | 'numeric' | 'date' | 'timestamp';
  precision?: number;
  scale?: number;
  description?: string;
}

// DT Record Field Definitions (based on shared/schema.ts tddfTransactionRecords) - Fixed positioning
export const DT_RECORD_FIELDS: TddfFieldDefinition[] = [
  // Core TDDF header fields (positions 1-23)
  { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
  { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
  { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
  { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Always "DT"' },
  { name: 'bankNumber', positions: [20, 23], type: 'text', description: 'Global Payments bank number' },
  
  // Account and merchant fields (positions 24-61)
  { name: 'merchantAccountNumber', positions: [24, 39], type: 'text', description: 'GP account number (16 chars)' },
  { name: 'associationNumber1', positions: [40, 45], type: 'text', description: 'Association number' },
  { name: 'groupNumber', positions: [46, 51], type: 'text', description: 'Group number' },
  { name: 'transactionCode', positions: [52, 55], type: 'text', description: 'GP transaction code' },
  { name: 'associationNumber2', positions: [56, 61], type: 'text', description: 'Second association number' },
  
  // Core transaction fields (positions 62-142)
  { name: 'referenceNumber', positions: [62, 84], type: 'text', description: 'Reference number (23 chars)' },
  { name: 'transactionDate', positions: [85, 92], type: 'date', description: 'Transaction date (MMDDCCYY)' },
  { name: 'transactionAmount', positions: [93, 103], type: 'numeric', precision: 15, scale: 2, description: 'Transaction amount' },
  { name: 'batchJulianDate', positions: [104, 108], type: 'text', description: 'Batch julian date (DDDYY)' },
  { name: 'netDeposit', positions: [109, 123], type: 'numeric', precision: 17, scale: 2, description: 'Net deposit amount' },
  { name: 'cardholderAccountNumber', positions: [124, 142], type: 'text', description: 'Cardholder account number' },
  
  // Authorization and additional transaction info (positions 188-242)
  { name: 'authAmount', positions: [192, 203], type: 'numeric', precision: 14, scale: 2, description: 'Authorization amount' },
  { name: 'authResponseCode', positions: [208, 209], type: 'text', description: 'Authorization response code' },
  { name: 'posEntryMode', positions: [214, 215], type: 'text', description: 'POS entry mode' },
  { name: 'debitCreditIndicator', positions: [216, 216], type: 'text', description: 'Debit/Credit indicator' },
  { name: 'reversalFlag', positions: [217, 217], type: 'text', description: 'Reversal flag' },
  { name: 'merchantName', positions: [218, 242], type: 'text', description: 'DBA name (25 chars)' },
  
  // Card type and extended fields (positions 253-254)
  { name: 'cardType', positions: [253, 254], type: 'text', description: 'Card type code (2 chars)' }
];

// P1 Record Field Definitions (based on shared/schema.ts tddfPurchasingExtensions)
export const P1_RECORD_FIELDS: TddfFieldDefinition[] = [
  // Core TDDF header fields (positions 1-19)
  { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
  { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
  { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
  { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'P1 or P2' },
  
  // Purchasing Card Level 1 Data (positions 20-39)
  { name: 'taxAmount', positions: [20, 31], type: 'numeric', precision: 12, scale: 2, description: 'Tax amount' },
  { name: 'taxRate', positions: [32, 38], type: 'numeric', precision: 15, scale: 4, description: 'Tax rate' },
  { name: 'taxType', positions: [39, 39], type: 'text', description: 'Tax type indicator' },
  
  // Purchasing Card Level 2 Data (positions 40-287)
  { name: 'purchaseIdentifier', positions: [40, 64], type: 'text', description: 'Purchase identifier' },
  { name: 'customerCode', positions: [65, 89], type: 'text', description: 'Customer code' },
  { name: 'salesTax', positions: [90, 101], type: 'numeric', precision: 12, scale: 2, description: 'Sales tax amount' },
  { name: 'freightAmount', positions: [114, 125], type: 'numeric', precision: 12, scale: 2, description: 'Freight amount' },
  { name: 'destinationZip', positions: [126, 135], type: 'text', description: 'Destination ZIP' },
  { name: 'merchantType', positions: [136, 139], type: 'text', description: 'Merchant type' },
  { name: 'dutyAmount', positions: [140, 151], type: 'numeric', precision: 12, scale: 2, description: 'Duty amount' },
  { name: 'discountAmount', positions: [217, 228], type: 'numeric', precision: 12, scale: 2, description: 'Discount amount' }
];

// BH Record Field Definitions (based on shared/schema.ts tddfBatchHeaders)
export const BH_RECORD_FIELDS: TddfFieldDefinition[] = [
  // Core TDDF header fields (positions 1-19)
  { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
  { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
  { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
  { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Always "BH"' },
  
  // Bank and account fields (positions 20-55)
  { name: 'bankNumber', positions: [20, 23], type: 'text', description: 'Global Payments bank number' },
  { name: 'merchantAccountNumber', positions: [24, 39], type: 'text', description: 'GP account number (16 chars)' },
  { name: 'associationNumber', positions: [40, 45], type: 'text', description: 'Association ID (6 chars)' },
  { name: 'groupNumber', positions: [46, 51], type: 'text', description: 'Group number (6 chars)' },
  { name: 'transactionCode', positions: [52, 55], type: 'text', description: 'GP transaction code (4 chars)' },
  
  // Batch information (positions 56-135)
  { name: 'batchId', positions: [56, 71], type: 'text', description: 'Batch ID (16 chars)' },
  { name: 'batchDate', positions: [72, 79], type: 'date', description: 'Batch date (MMDDCCYY)' },
  { name: 'transactionCount', positions: [80, 87], type: 'numeric', precision: 8, scale: 0, description: 'Transaction count' },
  { name: 'totalAmount', positions: [88, 103], type: 'numeric', precision: 16, scale: 2, description: 'Total batch amount' }
];

/**
 * Extract field value from TDDF line using field definition
 */
function extractFieldValue(line: string, field: TddfFieldDefinition): any {
  const [start, end] = field.positions;
  const rawValue = line.substring(start - 1, end).trim(); // Convert to 0-based indexing
  
  if (!rawValue) return null;
  
  switch (field.type) {
    case 'numeric':
      const numValue = parseFloat(rawValue);
      if (isNaN(numValue)) return null;
      return field.scale ? numValue / Math.pow(10, field.scale) : numValue;
      
    case 'date':
      // TDDF dates are in MMDDCCYY format
      if (rawValue.length === 8) {
        const month = rawValue.substring(0, 2);
        const day = rawValue.substring(2, 4);
        const year = rawValue.substring(4, 8);
        return `${year}-${month}-${day}`;
      }
      return null;
      
    case 'text':
    default:
      return rawValue;
  }
}

/**
 * Encode TDDF line to JSON using record type schema definitions
 */
function encodeTddfLineToJson(line: string, lineNumber: number): any {
  if (line.length < 19) {
    return { error: 'Line too short for TDDF format', lineNumber, rawLine: line };
  }
  
  const recordType = line.substring(17, 19); // Positions 18-19
  let fields: TddfFieldDefinition[] = [];
  
  switch (recordType) {
    case 'DT':
      fields = DT_RECORD_FIELDS;
      break;
    case 'P1':
    case 'P2':
      fields = P1_RECORD_FIELDS;
      break;
    case 'BH':
      fields = BH_RECORD_FIELDS;
      break;
    default:
      // For other record types (E1, G2, AD, DR, etc.), extract basic header fields
      fields = [
        { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
        { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
        { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
        { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Record type' }
      ];
  }
  
  const jsonRecord: any = {
    recordType,
    lineNumber,
    rawLine: line,
    extractedFields: {}
  };
  
  // Extract all defined fields
  for (const field of fields) {
    const value = extractFieldValue(line, field);
    if (value !== null) {
      jsonRecord.extractedFields[field.name] = value;
    }
  }
  
  return jsonRecord;
}

/**
 * Main TDDF to JSONB encoding function
 */
export async function encodeTddfToJsonb(fileContent: string, upload: UploaderUpload): Promise<any> {
  const startTime = Date.now();
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
  
  const results = {
    uploadId: upload.id,
    filename: upload.filename,
    totalLines: lines.length,
    totalRecords: 0,
    recordCounts: {
      total: 0,
      byType: {} as Record<string, number>
    },
    jsonRecords: [] as any[],
    encodingTimeMs: 0,
    errors: [] as string[]
  };
  
  console.log(`[TDDF-JSON-ENCODER] Starting encoding for ${upload.filename} (${lines.length} lines)`);
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    try {
      const jsonRecord = encodeTddfLineToJson(lines[i], i + 1);
      results.jsonRecords.push(jsonRecord);
      results.totalRecords++;
      
      if (jsonRecord.recordType) {
        results.recordCounts.byType[jsonRecord.recordType] = 
          (results.recordCounts.byType[jsonRecord.recordType] || 0) + 1;
      }
      
    } catch (error: any) {
      const errorMsg = `Line ${i + 1}: ${error.message}`;
      results.errors.push(errorMsg);
      console.error(`[TDDF-JSON-ENCODER] ${errorMsg}`);
    }
  }
  
  results.recordCounts.total = results.totalRecords;
  results.encodingTimeMs = Date.now() - startTime;
  
  console.log(`[TDDF-JSON-ENCODER] Completed encoding: ${results.totalRecords} records in ${results.encodingTimeMs}ms`);
  console.log(`[TDDF-JSON-ENCODER] Record type breakdown:`, results.recordCounts.byType);
  
  return results;
}

/**
 * Direct TDDF to JSONB encoding with database storage
 */
export async function encodeTddfToJsonbDirect(fileContent: string, upload: UploaderUpload): Promise<any> {
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const startTime = Date.now();
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
  
  // Determine table name based on environment
  const environment = process.env.NODE_ENV || 'development';
  const tableName = environment === 'development' ? 'dev_tddf_jsonb' : 'tddf_jsonb';
  
  const results = {
    uploadId: upload.id,
    filename: upload.filename,
    totalLines: lines.length,
    totalRecords: 0,
    recordCounts: {
      total: 0,
      byType: {} as Record<string, number>
    },
    jsonRecords: [] as any[], // Keep sample for display
    encodingTimeMs: 0,
    errors: [] as string[],
    tableName: tableName,
    timingData: {
      startTime: new Date(startTime).toISOString(),
      finishTime: '', // Will be set at completion
      totalProcessingTime: 0,
      batchTimes: [] as any[]
    }
  };
  
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Starting JSONB database encoding for ${upload.filename} (${lines.length} lines)`);
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Using table: ${tableName}`);
  
  // Process lines in batches for better performance
  const batchSize = 1000;
  let processedCount = 0;
  
  for (let batchStart = 0; batchStart < lines.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, lines.length);
    const batch = lines.slice(batchStart, batchEnd);
    
    const batchRecords: any[] = [];
    
    // Process batch
    for (let i = 0; i < batch.length; i++) {
      try {
        const lineNumber = batchStart + i + 1;
        const jsonRecord = encodeTddfLineToJson(batch[i], lineNumber);
        
        // Track individual record processing time
        const recordStartTime = Date.now();
        const recordProcessingTime = Date.now() - recordStartTime;
        
        // Prepare database record with timing data
        const dbRecord = {
          upload_id: upload.id,
          filename: upload.filename,
          record_type: jsonRecord.recordType,
          line_number: lineNumber,
          raw_line: batch[i],
          extracted_fields: JSON.stringify(jsonRecord.extractedFields),
          record_identifier: jsonRecord.extractedFields.recordIdentifier || jsonRecord.recordType,
          processing_time_ms: recordProcessingTime
        };
        
        batchRecords.push(dbRecord);
        results.totalRecords++;
        
        if (jsonRecord.recordType) {
          results.recordCounts.byType[jsonRecord.recordType] = 
            (results.recordCounts.byType[jsonRecord.recordType] || 0) + 1;
        }
        
        // Keep first 3 records as samples for display
        if (results.jsonRecords.length < 3) {
          results.jsonRecords.push(jsonRecord);
        }
        
      } catch (error: any) {
        const errorMsg = `Line ${batchStart + i + 1}: ${error.message}`;
        results.errors.push(errorMsg);
        console.error(`[TDDF-JSON-ENCODER-DIRECT] ${errorMsg}`);
      }
    }
    
    // Batch insert to database with timing
    if (batchRecords.length > 0) {
      try {
        const batchInsertStart = Date.now();
        const insertQuery = `
          INSERT INTO ${tableName} (
            upload_id, filename, record_type, line_number, raw_line, 
            extracted_fields, record_identifier, processing_time_ms, created_at
          ) VALUES ${batchRecords.map((_, index) => 
            `($${index * 8 + 1}, $${index * 8 + 2}, $${index * 8 + 3}, $${index * 8 + 4}, $${index * 8 + 5}, $${index * 8 + 6}, $${index * 8 + 7}, $${index * 8 + 8}, NOW())`
          ).join(', ')}
        `;
        
        const values = batchRecords.flatMap(record => [
          record.upload_id,
          record.filename,
          record.record_type,
          record.line_number,
          record.raw_line,
          record.extracted_fields,
          record.record_identifier,
          record.processing_time_ms
        ]);
        
        await pool.query(insertQuery, values);
        const batchInsertTime = Date.now() - batchInsertStart;
        processedCount += batchRecords.length;
        
        // Track batch timing
        results.timingData.batchTimes.push({
          batchNumber: Math.floor(batchStart/batchSize) + 1,
          recordsInBatch: batchRecords.length,
          insertTimeMs: batchInsertTime,
          cumulativeRecords: processedCount
        });
        
        console.log(`[TDDF-JSON-ENCODER-DIRECT] Batch ${Math.floor(batchStart/batchSize) + 1}: Inserted ${batchRecords.length} records in ${batchInsertTime}ms (${processedCount}/${lines.length})`);
        
      } catch (dbError: any) {
        console.error(`[TDDF-JSON-ENCODER-DIRECT] Database batch insert failed:`, dbError);
        results.errors.push(`Database batch insert failed: ${dbError.message}`);
      }
    }
  }
  
  results.recordCounts.total = results.totalRecords;
  results.encodingTimeMs = Date.now() - startTime;
  results.timingData.finishTime = new Date().toISOString();
  results.timingData.totalProcessingTime = results.encodingTimeMs;
  
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Completed JSONB encoding: ${results.totalRecords} records in ${results.encodingTimeMs}ms`);
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Record type breakdown:`, results.recordCounts.byType);
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Database table: ${tableName}`);
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Timing: Started ${results.timingData.startTime}, Finished ${results.timingData.finishTime}`);
  console.log(`[TDDF-JSON-ENCODER-DIRECT] Average batch time: ${(results.timingData.batchTimes.reduce((sum, batch) => sum + batch.insertTimeMs, 0) / results.timingData.batchTimes.length).toFixed(2)}ms`);
  
  await pool.end();
  return results;
}