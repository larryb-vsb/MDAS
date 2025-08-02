/**
 * TDDF to JSON/JSONB Encoder
 * Uses TDDF Record type schema definitions for structured field extraction
 * Includes universal TDDF processing datetime extraction from filenames
 */

import { UploaderUpload } from '@shared/schema';

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
        } else {
          console.warn(`[TDDF-DATETIME] Invalid date constructed: ${processingDatetime} from ${filename}`);
        }
      } else {
        console.warn(`[TDDF-DATETIME] Invalid date components: ${monthNum}/${dayNum}/${yearNum} ${hourNum}:${minuteNum}:${secondNum} from ${filename}`);
      }
    }
  } catch (error) {
    console.warn(`[TDDF-DATETIME] Failed to extract datetime from filename ${filename}:`, error);
  }

  return result;
}

/**
 * Universal Timestamp Calculation for TDDF Records
 * Implements Larry B.'s timestamp hierarchy for chronological ordering
 * 
 * Hierarchy:
 * 1. DT record embedded date → "dt_line"
 * 2. BH record date (if no DT) → "bh_line"
 * 3. Filename timestamp + line offset → "file_timestamp + line_offset"
 * 4. Fallback to ingestion time → "ingest_time"
 */
function calculateUniversalTimestamp(
  recordType: string,
  extractedFields: any,
  filename: string,
  lineNumber: number,
  lineOffsetMs: number = 100 // Default 100ms intervals
): {
  parsedDatetime: string | null;
  recordTimeSource: string;
} {
  // Priority 1: DT record embedded transaction date
  if (recordType === 'DT' && extractedFields.transactionDate) {
    try {
      const dtDate = extractedFields.transactionDate;
      // Parse MMDDCCYY format from DT record
      if (typeof dtDate === 'string' && dtDate.length === 8) {
        const month = dtDate.substring(0, 2);
        const day = dtDate.substring(2, 4);
        const century = dtDate.substring(4, 6);
        const year = dtDate.substring(6, 8);
        
        // Convert century + year to full year (CC=20 means 2000s)
        const fullYear = century === '20' ? `20${year}` : century === '19' ? `19${year}` : `20${year}`;
        
        const parsedDate = new Date(`${fullYear}-${month}-${day}`);
        if (!isNaN(parsedDate.getTime())) {
          return {
            parsedDatetime: parsedDate.toISOString(),
            recordTimeSource: 'dt_line'
          };
        }
      }
    } catch (error) {
      console.warn(`[UNIVERSAL-TIMESTAMP] Failed to parse DT transaction date: ${extractedFields.transactionDate}`, error);
    }
  }
  
  // Priority 2: BH record batch date (if no DT and this is BH record)
  if (recordType === 'BH' && extractedFields.batchDate) {
    try {
      const bhDate = extractedFields.batchDate;
      // Parse MMDDCCYY format from BH record
      if (typeof bhDate === 'string' && bhDate.length === 8) {
        const month = bhDate.substring(0, 2);
        const day = bhDate.substring(2, 4);
        const century = bhDate.substring(4, 6);
        const year = bhDate.substring(6, 8);
        
        const fullYear = century === '20' ? `20${year}` : century === '19' ? `19${year}` : `20${year}`;
        
        const parsedDate = new Date(`${fullYear}-${month}-${day}`);
        if (!isNaN(parsedDate.getTime())) {
          return {
            parsedDatetime: parsedDate.toISOString(),
            recordTimeSource: 'bh_line'
          };
        }
      }
    } catch (error) {
      console.warn(`[UNIVERSAL-TIMESTAMP] Failed to parse BH batch date: ${extractedFields.batchDate}`, error);
    }
  }
  
  // Priority 3: Filename timestamp + line offset
  const filenameDateTime = extractTddfProcessingDatetime(filename);
  if (filenameDateTime.processingDatetime) {
    try {
      const baseDate = new Date(filenameDateTime.processingDatetime);
      if (!isNaN(baseDate.getTime())) {
        // Add line offset: lineNumber * lineOffsetMs (default 100ms)
        const offsetMs = lineNumber * lineOffsetMs;
        const offsetDate = new Date(baseDate.getTime() + offsetMs);
        return {
          parsedDatetime: offsetDate.toISOString(),
          recordTimeSource: 'file_timestamp + line_offset'
        };
      }
    } catch (error) {
      console.warn(`[UNIVERSAL-TIMESTAMP] Failed to calculate filename + offset timestamp:`, error);
    }
  }
  
  // Priority 4: Fallback to current ingestion time
  const ingestTime = new Date();
  return {
    parsedDatetime: ingestTime.toISOString(),
    recordTimeSource: 'ingest_time'
  };
}

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
  
  // Authorization and card details (positions 243-284)
  { name: 'authorizationNumber', positions: [243, 248], type: 'text', description: 'Authorization number (6 chars)' },
  { name: 'rejectReason', positions: [249, 250], type: 'text', description: 'Reject reason (2 chars)' },
  { name: 'cardType', positions: [253, 254], type: 'text', description: 'Card type code (2 chars)' },
  { name: 'terminalId', positions: [277, 284], type: 'text', description: 'Terminal ID (8 chars)' }
];

// P1 Record Field Definitions (corrected positions based on TDDF specification)
export const P1_RECORD_FIELDS: TddfFieldDefinition[] = [
  // Core TDDF header fields (positions 1-23) - same as DT records
  { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
  { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
  { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
  { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Always "P1"' },
  { name: 'bankNumber', positions: [20, 23], type: 'text', description: 'Global Payments bank number' },
  
  // Account and merchant fields (positions 24-55) - same as DT records  
  { name: 'merchantAccountNumber', positions: [24, 39], type: 'text', description: 'GP account number (16 chars)' },
  { name: 'associationNumber', positions: [40, 45], type: 'text', description: 'Association number (6 chars)' },
  { name: 'groupNumber', positions: [46, 51], type: 'text', description: 'Group number (6 chars)' },
  { name: 'transactionCode', positions: [52, 55], type: 'text', description: 'GP transaction code (4 chars)' },
  
  // P1 Purchasing Card Level 1 Data (positions 56+)
  { name: 'taxAmount', positions: [56, 67], type: 'numeric', precision: 12, scale: 2, description: 'Tax amount (12 chars)' },
  { name: 'taxRate', positions: [68, 74], type: 'numeric', precision: 7, scale: 4, description: 'Tax rate (7 chars)' },
  { name: 'taxType', positions: [75, 75], type: 'text', description: 'Tax type indicator (1 char)' },
  
  // Purchasing Card Level 2 Data (positions 76+)
  { name: 'purchaseIdentifier', positions: [76, 100], type: 'text', description: 'Purchase identifier (25 chars)' },
  { name: 'customerCode', positions: [101, 125], type: 'text', description: 'Customer code (25 chars)' },
  { name: 'salesTax', positions: [126, 137], type: 'numeric', precision: 12, scale: 2, description: 'Sales tax amount (12 chars)' },
  { name: 'freightAmount', positions: [150, 161], type: 'numeric', precision: 12, scale: 2, description: 'Freight amount (12 chars)' },
  { name: 'destinationZip', positions: [162, 171], type: 'text', description: 'Destination ZIP (10 chars)' },
  { name: 'merchantType', positions: [172, 175], type: 'text', description: 'Merchant type (4 chars)' },
  { name: 'dutyAmount', positions: [176, 187], type: 'numeric', precision: 12, scale: 2, description: 'Duty amount (12 chars)' },
  { name: 'discountAmount', positions: [253, 264], type: 'numeric', precision: 12, scale: 2, description: 'Discount amount (12 chars)' }
];

// BH Record Field Definitions (aligned with shared/schema.ts tddfBatchHeaders)
export const BH_RECORD_FIELDS: TddfFieldDefinition[] = [
  // Core TDDF header fields matching schema field names
  { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
  { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
  { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
  { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Always "BH"' },
  
  // Bank and account fields (positions 20-39) 
  { name: 'bankNumber', positions: [20, 23], type: 'text', description: 'Global Payments bank number' },
  { name: 'merchantAccountNumber', positions: [24, 39], type: 'text', description: 'GP account number (16 chars)' },
  
  // Enhanced BH fields (positions 40-103) - User requested fields
  { name: 'associationNumber', positions: [40, 45], type: 'text', description: 'Association ID (6 chars)' },
  { name: 'groupNumber', positions: [46, 51], type: 'text', description: 'Group number (6 chars)' },
  { name: 'transactionCode', positions: [52, 55], type: 'numeric', description: 'GP transaction code (4 chars)' },
  { name: 'batchDate', positions: [56, 63], type: 'date', description: 'Batch date (MMDDCCYY)' },
  { name: 'batchJulianDate', positions: [64, 68], type: 'numeric', description: 'Batch Julian Date DDDYY format (5 chars)' },
  { name: 'netDeposit', positions: [69, 83], type: 'numeric', precision: 15, scale: 2, description: 'Net deposit amount (15 chars)' },
  { name: 'rejectReason', positions: [84, 87], type: 'text', description: 'Global Payments Reject Reason Code (4 chars)' },
  { name: 'merchantReferenceNumber', positions: [88, 103], type: 'numeric', description: 'Merchant reference number (16 chars)' },
  
  // Legacy batch ID for compatibility (positions 124-126) 
  { name: 'batchId', positions: [124, 126], type: 'text', description: 'Batch ID (3 chars)' }
];

/**
 * Extract field value from TDDF line using field definition
 */
/**
 * Enhanced field extraction with comprehensive validation
 */
function extractFieldValue(line: string, field: TddfFieldDefinition): {
  value: any;
  isValid: boolean;
  validationError?: string;
} {
  const [start, end] = field.positions;
  const rawValue = line.substring(start - 1, end).trim(); // Convert to 0-based indexing
  
  // Special handling for cardType field - allow "00" and other values
  if (field.name === 'cardType') {
    if (rawValue.length > 0) {
      return { value: rawValue, isValid: true }; // Return any non-empty value for card type
    }
    return { value: null, isValid: true };
  }
  
  // Special handling for terminalId field - allow numeric terminal IDs and mixed values
  if (field.name === 'terminalId') {
    if (rawValue.length > 0) {
      return { value: rawValue, isValid: true }; // Return any non-empty value for terminal ID
    }
    return { value: null, isValid: true };
  }
  
  if (!rawValue) return { value: null, isValid: true };
  
  switch (field.type) {
    case 'numeric':
      const numValue = parseFloat(rawValue);
      if (isNaN(numValue)) {
        return { 
          value: null, 
          isValid: false, 
          validationError: `Invalid numeric value: "${rawValue}" for field ${field.name}` 
        };
      }
      const finalValue = field.scale ? numValue / Math.pow(10, field.scale) : numValue;
      
      // Additional validation for financial amounts
      if (field.name === 'transactionAmount' || field.name === 'authAmount') {
        if (finalValue < 0) {
          return { 
            value: finalValue, 
            isValid: false, 
            validationError: `Negative amount not allowed: ${finalValue} for field ${field.name}` 
          };
        }
        if (finalValue > 999999.99) {
          return { 
            value: finalValue, 
            isValid: false, 
            validationError: `Amount exceeds maximum: ${finalValue} for field ${field.name}` 
          };
        }
      }
      
      return { value: finalValue, isValid: true };
      
    case 'date':
      // TDDF dates are in MMDDCCYY format
      if (rawValue.length === 8) {
        const month = rawValue.substring(0, 2);
        const day = rawValue.substring(2, 4);
        const year = rawValue.substring(4, 8);
        
        // Validate date components
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (monthNum < 1 || monthNum > 12) {
          return { 
            value: null, 
            isValid: false, 
            validationError: `Invalid month: ${monthNum} in date ${rawValue}` 
          };
        }
        
        if (dayNum < 1 || dayNum > 31) {
          return { 
            value: null, 
            isValid: false, 
            validationError: `Invalid day: ${dayNum} in date ${rawValue}` 
          };
        }
        
        if (yearNum < 1900 || yearNum > 2100) {
          return { 
            value: null, 
            isValid: false, 
            validationError: `Invalid year: ${yearNum} in date ${rawValue}` 
          };
        }
        
        // Test date validity
        const testDate = new Date(`${year}-${month}-${day}`);
        if (isNaN(testDate.getTime())) {
          return { 
            value: null, 
            isValid: false, 
            validationError: `Invalid date: ${rawValue} (${year}-${month}-${day})` 
          };
        }
        
        return { value: `${year}-${month}-${day}`, isValid: true };
      }
      return { 
        value: null, 
        isValid: false, 
        validationError: `Invalid date format: "${rawValue}" (expected MMDDCCYY)` 
      };
      
    case 'text':
    default:
      // Text field validation
      if (field.name === 'merchantId' && rawValue.length < 4) {
        return { 
          value: rawValue, 
          isValid: false, 
          validationError: `Merchant ID too short: "${rawValue}" (minimum 4 characters)` 
        };
      }
      
      return { value: rawValue, isValid: true };
  }
}

/**
 * Encode TDDF line to JSON using record type schema definitions
 */
/**
 * Enhanced TDDF line encoding with comprehensive row validation
 */
function encodeTddfLineToJson(line: string, lineNumber: number): any {
  const validationResults = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[]
  };
  
  // Basic line length validation
  if (line.length < 19) {
    return { 
      error: 'Line too short for TDDF format', 
      lineNumber, 
      rawLine: line,
      validationResults: {
        isValid: false,
        errors: ['Line length insufficient for TDDF format (minimum 19 characters)'],
        warnings: []
      }
    };
  }
  
  // Extract and validate record type
  const recordType = line.substring(17, 19); // Positions 18-19
  if (!recordType || recordType.trim().length === 0) {
    validationResults.isValid = false;
    validationResults.errors.push('Missing record type at positions 18-19');
  }
  
  // Validate record type against known types
  const validRecordTypes = ['DT', 'BH', 'P1', 'P2', 'E1', 'G2', 'AD', 'DR', 'CK', 'LG', 'GE'];
  if (!validRecordTypes.includes(recordType)) {
    validationResults.warnings.push(`Unknown record type: ${recordType}`);
  }
  
  let fields: TddfFieldDefinition[] = [];
  
  switch (recordType) {
    case 'DT':
      fields = DT_RECORD_FIELDS;
      // Additional DT-specific validations
      if (line.length < 650) { // DT records should be approximately 650+ characters
        validationResults.warnings.push(`DT record shorter than expected: ${line.length} characters`);
      }
      break;
    case 'P1':
    case 'P2':
      fields = P1_RECORD_FIELDS;
      break;
    case 'BH':
      fields = BH_RECORD_FIELDS;
      // Additional BH-specific validations
      if (line.length < 200) { // BH records should be approximately 200+ characters
        validationResults.warnings.push(`BH record shorter than expected: ${line.length} characters`);
      }
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
    extractedFields: {},
    validationResults
  };
  
  // Extract all defined fields with enhanced validation
  let fieldValidationErrors = 0;
  for (const field of fields) {
    const fieldResult = extractFieldValue(line, field);
    
    // Store the extracted value
    if (fieldResult.value !== null) {
      jsonRecord.extractedFields[field.name] = fieldResult.value;
    }
    
    // Track validation results
    if (!fieldResult.isValid) {
      validationResults.isValid = false;
      validationResults.errors.push(fieldResult.validationError || `Field validation failed: ${field.name}`);
      fieldValidationErrors++;
    }
  }
  
  // Additional transaction-specific validations for DT records
  if (recordType === 'DT') {
    const transactionAmount = jsonRecord.extractedFields.transactionAmount;
    const authAmount = jsonRecord.extractedFields.authAmount;
    const merchantId = jsonRecord.extractedFields.merchantAccountNumber;
    const cardNumber = jsonRecord.extractedFields.cardNumber;
    
    // Critical DT record validations
    if (!transactionAmount && transactionAmount !== 0) {
      validationResults.errors.push('DT record missing required transaction amount');
      validationResults.isValid = false;
    }
    
    if (!merchantId) {
      validationResults.errors.push('DT record missing required merchant account number (positions 24-39)');
      validationResults.isValid = false;
    }
    
    if (transactionAmount && authAmount && Math.abs(transactionAmount - authAmount) > transactionAmount * 0.10) {
      validationResults.warnings.push(`Large discrepancy between transaction (${transactionAmount}) and auth (${authAmount}) amounts`);
    }
    
    // Card number basic validation (should be masked or valid format)
    if (cardNumber && cardNumber.length > 0) {
      const cardStr = String(cardNumber);
      if (cardStr.length < 12 || cardStr.length > 19) {
        validationResults.warnings.push(`Unusual card number length: ${cardStr.length} digits`);
      }
    }
  }
  
  // Batch Header validation for BH records
  if (recordType === 'BH') {
    const batchDate = jsonRecord.extractedFields.batchDate;
    const batchTime = jsonRecord.extractedFields.batchTime;
    
    if (!batchDate) {
      validationResults.errors.push('BH record missing required batch date');
      validationResults.isValid = false;
    }
  }
  
  // Log validation results for monitoring
  if (!validationResults.isValid) {
    console.warn(`[TDDF-VALIDATION] Line ${lineNumber} validation failed:`, validationResults.errors);
  }
  
  if (validationResults.warnings.length > 0) {
    console.info(`[TDDF-VALIDATION] Line ${lineNumber} validation warnings:`, validationResults.warnings);
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
    errors: [] as string[],
    validationStats: {
      validRecords: 0,
      invalidRecords: 0,
      warnings: 0,
      criticalErrors: 0,
      byRecordType: {} as Record<string, { valid: number; invalid: number; warnings: number }>
    }
  };
  
  console.log(`[TDDF-JSON-ENCODER] Starting enhanced validation encoding for ${upload.filename} (${lines.length} lines)`);
  
  // Process each line with comprehensive validation
  for (let i = 0; i < lines.length; i++) {
    try {
      const jsonRecord = encodeTddfLineToJson(lines[i], i + 1);
      results.jsonRecords.push(jsonRecord);
      results.totalRecords++;
      
      if (jsonRecord.recordType) {
        results.recordCounts.byType[jsonRecord.recordType] = 
          (results.recordCounts.byType[jsonRecord.recordType] || 0) + 1;
      }
      
      // Track validation statistics
      if (jsonRecord.validationResults) {
        const validation = jsonRecord.validationResults;
        const recordType = jsonRecord.recordType || 'UNKNOWN';
        
        // Initialize record type stats if needed
        if (!results.validationStats.byRecordType[recordType]) {
          results.validationStats.byRecordType[recordType] = { valid: 0, invalid: 0, warnings: 0 };
        }
        
        if (validation.isValid) {
          results.validationStats.validRecords++;
          results.validationStats.byRecordType[recordType].valid++;
        } else {
          results.validationStats.invalidRecords++;
          results.validationStats.byRecordType[recordType].invalid++;
          results.validationStats.criticalErrors += validation.errors?.length || 0;
        }
        
        if (validation.warnings?.length > 0) {
          results.validationStats.warnings += validation.warnings.length;
          results.validationStats.byRecordType[recordType].warnings += validation.warnings.length;
        }
      }
      
    } catch (error: any) {
      const errorMsg = `Line ${i + 1}: ${error.message}`;
      results.errors.push(errorMsg);
      results.validationStats.criticalErrors++;
      console.error(`[TDDF-VALIDATION] Critical processing error: ${errorMsg}`);
    }
  }
  
  results.recordCounts.total = results.totalRecords;
  results.encodingTimeMs = Date.now() - startTime;
  
  // Enhanced completion logging with validation statistics
  console.log(`[TDDF-VALIDATION] Completed enhanced encoding: ${results.totalRecords} records in ${results.encodingTimeMs}ms`);
  console.log(`[TDDF-VALIDATION] Record type breakdown:`, results.recordCounts.byType);
  console.log(`[TDDF-VALIDATION] Validation summary:`);
  console.log(`  ✅ Valid records: ${results.validationStats.validRecords}`);
  console.log(`  ❌ Invalid records: ${results.validationStats.invalidRecords}`);
  console.log(`  ⚠️  Warnings: ${results.validationStats.warnings}`);
  console.log(`  🚨 Critical errors: ${results.validationStats.criticalErrors}`);
  console.log(`[TDDF-VALIDATION] Validation by record type:`, results.validationStats.byRecordType);
  
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
  
  // Extract universal TDDF processing datetime from filename
  const tddfDatetime = extractTddfProcessingDatetime(upload.filename);
  console.log(`[TDDF-DATETIME] Extracted from ${upload.filename}:`, tddfDatetime);
  
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
    
    // Process batch with enhanced validation tracking
    for (let i = 0; i < batch.length; i++) {
      try {
        const lineNumber = batchStart + i + 1;
        const jsonRecord = encodeTddfLineToJson(batch[i], lineNumber);
        
        // Log validation results for critical issues
        if (jsonRecord.validationResults && !jsonRecord.validationResults.isValid) {
          console.warn(`[TDDF-VALIDATION] Line ${lineNumber} failed validation:`, jsonRecord.validationResults.errors);
        }
        
        // Add universal TDDF processing datetime to extracted fields
        if (tddfDatetime.isValidTddfFilename) {
          jsonRecord.extractedFields.tddfProcessingDate = tddfDatetime.processingDate;
          jsonRecord.extractedFields.tddfProcessingTime = tddfDatetime.processingTime;
          jsonRecord.extractedFields.tddfProcessingDatetime = tddfDatetime.processingDatetime;
        }
        
        // Track individual record processing time
        const recordStartTime = Date.now();
        const recordProcessingTime = Date.now() - recordStartTime;
        
        // Calculate universal timestamp using Larry B.'s hierarchy
        const universalTimestamp = calculateUniversalTimestamp(
          jsonRecord.recordType, 
          jsonRecord.extractedFields, 
          upload.filename, 
          lineNumber
        );
        
        // Prepare database record with timing data and universal TDDF datetime
        const dbRecord = {
          upload_id: upload.id,
          filename: upload.filename,
          record_type: jsonRecord.recordType,
          line_number: lineNumber,
          raw_line: batch[i],
          extracted_fields: JSON.stringify(jsonRecord.extractedFields),
          record_identifier: jsonRecord.extractedFields.recordIdentifier || jsonRecord.recordType,
          processing_time_ms: recordProcessingTime,
          // Add universal TDDF processing datetime fields for sorting/pagination
          tddf_processing_datetime: tddfDatetime.processingDatetime,
          tddf_processing_date: tddfDatetime.processingDate,
          // Add universal timestamp fields (Larry B. feature)
          parsed_datetime: universalTimestamp.parsedDatetime,
          record_time_source: universalTimestamp.recordTimeSource
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
            extracted_fields, record_identifier, processing_time_ms, 
            parsed_datetime, record_time_source, created_at
          ) VALUES ${batchRecords.map((_, index) => 
            `($${index * 10 + 1}, $${index * 10 + 2}, $${index * 10 + 3}, $${index * 10 + 4}, $${index * 10 + 5}, $${index * 10 + 6}, $${index * 10 + 7}, $${index * 10 + 8}, $${index * 10 + 9}, $${index * 10 + 10}, NOW())`
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
          record.processing_time_ms,
          record.parsed_datetime,
          record.record_time_source
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

/**
 * TDDF1 File-Based Encoding Function
 * Creates individual file-based tables with dev_tddf1_file_{filename} naming convention
 * Replaces dev_tddf_jsonb approach with file-specific tables
 */
export async function encodeTddfToTddf1FileBased(fileContent: string, upload: UploaderUpload): Promise<any> {
  const startTime = Date.now();
  // Process ALL lines - do not filter out any lines including empty ones
  const lines = fileContent.split('\n');
  
  // Import database connection
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL!);
  
  // Extract universal TDDF processing datetime from filename
  const tddfDatetime = extractTddfProcessingDatetime(upload.filename);
  console.log(`[TDDF1-ENCODER] Extracted from ${upload.filename}:`, tddfDatetime);
  
  // Determine environment and create file-based table name
  const environment = process.env.NODE_ENV || 'development';
  const tablePrefix = environment === 'production' ? 'prod_tddf1_file_' : 'dev_tddf1_file_';
  
  // Sanitize filename for table name (remove special characters, keep only alphanumeric and underscores)
  const sanitizedFilename = upload.filename
    .replace(/\.TSYSO$/i, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();
  
  const tableName = `${tablePrefix}${sanitizedFilename}`;
  
  console.log(`[TDDF1-ENCODER] Creating file-based table: ${tableName}`);
  
  // Create file-specific table with TDDF1 schema
  try {
    // Build the CREATE TABLE query with string interpolation for table name
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        record_type VARCHAR(10) NOT NULL,
        raw_line TEXT NOT NULL,
        record_sequence INTEGER,
        field_data JSONB,
        transaction_amount DECIMAL(12,2),
        merchant_id VARCHAR(50),
        terminal_id VARCHAR(50),
        batch_id VARCHAR(50),
        transaction_date DATE,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source_filename VARCHAR(255),
        line_number INTEGER,
        parsed_datetime TIMESTAMP,
        record_time_source VARCHAR(50)
      )
    `;
    
    await sql(createTableQuery);
    console.log(`[TDDF1-ENCODER] Successfully created table: ${tableName}`);
  } catch (tableError: any) {
    console.error(`[TDDF1-ENCODER] Failed to create table ${tableName}:`, tableError);
    throw new Error(`Failed to create TDDF1 table: ${tableError.message}`);
  }
  
  const results = {
    uploadId: upload.id,
    filename: upload.filename,
    tableName: tableName,
    totalLines: lines.length,
    totalRecords: 0,
    recordCounts: {
      total: 0,
      byType: {} as Record<string, number>
    },
    encodingTimeMs: 0,
    errors: [] as string[],
    timingData: {
      startTime: new Date(startTime).toISOString(),
      finishTime: '',
      totalProcessingTime: 0
    }
  };
  
  // Process lines and insert into file-specific table with optimized bulk inserts
  const batchSize = 2000; // Increased from 500 to 2000 for lightning-fast processing
  let processedCount = 0;
  
  for (let batchStart = 0; batchStart < lines.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, lines.length);
    const batch = lines.slice(batchStart, batchEnd);
    
    const batchRecords: any[] = [];
    
    for (let i = 0; i < batch.length; i++) {
      try {
        const lineNumber = batchStart + i + 1;
        const jsonRecord = encodeTddfLineToJson(batch[i], lineNumber);
        
        // Calculate universal timestamp
        const universalTimestamp = calculateUniversalTimestamp(
          jsonRecord.recordType, 
          jsonRecord.extractedFields, 
          upload.filename, 
          lineNumber
        );
        
        // Extract key fields for TDDF1 structure
        const recordType = jsonRecord.recordType || 'UNK';
        const extractedFields = jsonRecord.extractedFields || {};
        
        // Extract transaction amount for DT records
        let transactionAmount = null;
        if (recordType === 'DT' && extractedFields.transactionAmount) {
          const amountStr = extractedFields.transactionAmount.toString().trim();
          if (amountStr && amountStr !== '' && !isNaN(parseFloat(amountStr))) {
            transactionAmount = parseFloat(amountStr) / 100; // Convert from cents
          }
        }
        
        // Extract merchant ID - use merchantAccountNumber from TDDF positions 24-39
        const merchantId = extractedFields.merchantAccountNumber || null;
        
        // Extract terminal ID
        const terminalId = extractedFields.terminalId || null;
        
        // Extract batch information
        const batchId = extractedFields.batchId || extractedFields.entryRunNumber || null;
        
        // Extract transaction date
        let transactionDate = null;
        if (extractedFields.transactionDate && tddfDatetime.processingDate) {
          transactionDate = tddfDatetime.processingDate;
        }
        
        batchRecords.push({
          record_type: recordType,
          raw_line: batch[i],
          record_sequence: lineNumber,
          field_data: extractedFields,
          transaction_amount: transactionAmount,
          merchant_id: merchantId,
          terminal_id: terminalId,
          batch_id: batchId,
          transaction_date: transactionDate,
          source_filename: upload.filename,
          line_number: lineNumber,
          parsed_datetime: universalTimestamp.parsedDatetime,
          record_time_source: universalTimestamp.recordTimeSource
        });
        
        results.totalRecords++;
        results.recordCounts.byType[recordType] = (results.recordCounts.byType[recordType] || 0) + 1;
        
      } catch (error: any) {
        const errorMsg = `Line ${batchStart + i + 1}: ${error.message}`;
        results.errors.push(errorMsg);
        console.error(`[TDDF1-ENCODER] ${errorMsg}`);
      }
    }
    
    // Lightning-fast bulk insert to file-specific table (like yesterday's performance)
    if (batchRecords.length > 0) {
      try {
        const batchInsertStart = Date.now();
        
        // Build single bulk insert query with all records
        const insertQuery = `
          INSERT INTO ${tableName} (
            record_type, raw_line, record_sequence, field_data, transaction_amount,
            merchant_id, terminal_id, batch_id, transaction_date, source_filename,
            line_number, parsed_datetime, record_time_source
          ) VALUES ${batchRecords.map((_, index) => 
            `($${index * 13 + 1}, $${index * 13 + 2}, $${index * 13 + 3}, $${index * 13 + 4}, $${index * 13 + 5}, $${index * 13 + 6}, $${index * 13 + 7}, $${index * 13 + 8}, $${index * 13 + 9}, $${index * 13 + 10}, $${index * 13 + 11}, $${index * 13 + 12}, $${index * 13 + 13})`
          ).join(', ')}
        `;
        
        // Flatten all record values for bulk insert
        const values = batchRecords.flatMap(record => [
          record.record_type, 
          record.raw_line, 
          record.record_sequence, 
          JSON.stringify(record.field_data), 
          record.transaction_amount,
          record.merchant_id, 
          record.terminal_id, 
          record.batch_id,
          record.transaction_date, 
          record.source_filename, 
          record.line_number,
          record.parsed_datetime, 
          record.record_time_source
        ]);
        
        await sql(insertQuery, values);
        
        const batchInsertTime = Date.now() - batchInsertStart;
        processedCount += batchRecords.length;
        
        // Lightning-fast processing metrics (like yesterday's performance)
        console.log(`[TDDF1-ENCODER] Batch ${Math.floor(batchStart/batchSize) + 1}: Inserted ${batchRecords.length} records in ${batchInsertTime}ms (${processedCount}/${lines.length})`);
        
      } catch (dbError: any) {
        console.error(`[TDDF1-ENCODER] Database batch insert failed:`, dbError);
        results.errors.push(`Database batch insert failed: ${dbError.message}`);
      }
    }
  }
  
  results.recordCounts.total = results.totalRecords;
  results.encodingTimeMs = Date.now() - startTime;
  results.timingData.finishTime = new Date().toISOString();
  results.timingData.totalProcessingTime = results.encodingTimeMs;
  
  console.log(`[TDDF1-ENCODER] Completed file-based encoding: ${results.totalRecords} records in ${results.encodingTimeMs}ms`);
  console.log(`[TDDF1-ENCODER] Record type breakdown:`, results.recordCounts.byType);
  console.log(`[TDDF1-ENCODER] File table: ${tableName}`);
  
  // Update upload status to "encoded" when processing completes
  try {
    console.log(`[TDDF1-ENCODER] Updating upload ${upload.id} status to 'encoded'`);
    const environment = process.env.NODE_ENV || 'development';
    const uploadsTableName = environment === 'development' ? 'dev_uploader_uploads' : 'uploader_uploads';
    
    await sql(`
      UPDATE ${uploadsTableName} 
      SET current_phase = 'encoded', 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [upload.id]);
    
    console.log(`[TDDF1-ENCODER] ✅ Successfully updated upload ${upload.id} to 'encoded' status`);
  } catch (updateError: any) {
    console.error(`[TDDF1-ENCODER] Failed to update upload status to 'encoded':`, updateError);
    results.errors.push(`Failed to update status: ${updateError.message}`);
  }

  // Update TDDF1 totals cache for daily breakdown widget
  try {
    console.log(`[TDDF1-ENCODER] Updating totals cache for daily breakdown`);
    const environment = process.env.NODE_ENV || 'development';
    const totalsTableName = environment === 'development' ? 'dev_tddf1_totals' : 'prod_tddf1_totals';
    
    // Calculate total transaction value from DT records
    const totalTransactionValue = Object.entries(results.recordCounts.byType)
      .filter(([type]) => type === 'DT')
      .reduce((sum, [, count]) => {
        // For now, we'll need to query the actual table for transaction values
        return sum;
      }, 0);
    
    // Extract date from filename for daily grouping (MMDDYYYY format)
    const dateMatch = upload.filename.match(/(\d{8})/);
    let processedDate = new Date();
    if (dateMatch) {
      const dateStr = dateMatch[1];
      // Parse MMDDYYYY format
      const month = parseInt(dateStr.substring(0, 2));
      const day = parseInt(dateStr.substring(2, 4));
      const year = parseInt(dateStr.substring(4, 8));
      processedDate = new Date(year, month - 1, day);
    }
    
    // Insert or update totals cache entry
    await sql(`
      INSERT INTO ${totalsTableName} (
        date_processed, file_name, table_name, total_records, 
        total_transaction_value, record_type_breakdown, processing_time_ms,
        total_net_deposit_bh, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (date_processed, file_name) 
      DO UPDATE SET 
        table_name = EXCLUDED.table_name,
        total_records = EXCLUDED.total_records,
        total_transaction_value = EXCLUDED.total_transaction_value,
        record_type_breakdown = EXCLUDED.record_type_breakdown,
        processing_time_ms = EXCLUDED.processing_time_ms,
        total_net_deposit_bh = EXCLUDED.total_net_deposit_bh,
        updated_at = CURRENT_TIMESTAMP
    `, [
      processedDate.toISOString().split('T')[0], // Date in YYYY-MM-DD format
      upload.filename,
      tableName,
      results.totalRecords,
      0, // Will be calculated in a separate query
      JSON.stringify(results.recordCounts.byType),
      results.encodingTimeMs,
      0 // Will be calculated in a separate query
    ]);
    
    // Now calculate and update the actual transaction value and BH Net Deposit totals
    const transactionValueResult = await sql(`
      SELECT COALESCE(SUM(transaction_amount), 0) as total_value
      FROM ${tableName}
      WHERE record_type = 'DT' AND transaction_amount IS NOT NULL
    `);
    
    // Calculate BH Net Deposit totals from raw TDDF positions 69-83
    const bhNetDepositResult = await sql(`
      SELECT COALESCE(SUM(CAST(SUBSTRING(raw_line, 69, 15) AS DECIMAL) / 100.0), 0) as total_net_deposit_bh
      FROM ${tableName}
      WHERE record_type = 'BH' AND LENGTH(raw_line) >= 83
    `);
    
    if (transactionValueResult.length > 0 || bhNetDepositResult.length > 0) {
      await sql(`
        UPDATE ${totalsTableName} 
        SET total_transaction_value = $1, total_net_deposit_bh = $2, updated_at = CURRENT_TIMESTAMP
        WHERE date_processed = $3 AND file_name = $4
      `, [
        parseFloat(transactionValueResult[0]?.total_value || '0'),
        parseFloat(bhNetDepositResult[0]?.total_net_deposit_bh || '0'),
        processedDate.toISOString().split('T')[0],
        upload.filename
      ]);
    }
    
    console.log(`[TDDF1-ENCODER] ✅ Successfully updated totals cache for ${processedDate.toISOString().split('T')[0]}`);
  } catch (cacheError: any) {
    console.error(`[TDDF1-ENCODER] Failed to update totals cache:`, cacheError);
    results.errors.push(`Failed to update totals cache: ${cacheError.message}`);
  }
  
  return results;
}