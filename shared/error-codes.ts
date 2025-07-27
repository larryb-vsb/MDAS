// TDDF Processing Error Code Database System
// Version: 1.0.0 - Clean Architecture Implementation

export interface ErrorCode {
  code: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  resolution: string;
  triggerAction?: 'SKIP' | 'RETRY' | 'EMERGENCY_R1' | 'BULK_WARNING';
}

export const TDDF_ERROR_CODES: Record<string, ErrorCode> = {
  // BULK PROCESSING WARNINGS
  'BWN001': {
    code: 'BWN001',
    category: 'BULK_PROCESSING',
    severity: 'MEDIUM',
    description: 'Bulk processing batch contained problematic records',
    resolution: 'Records marked with bulk processing warning for review',
    triggerAction: 'BULK_WARNING'
  },
  'BWN002': {
    code: 'BWN002',
    category: 'BULK_PROCESSING',
    severity: 'MEDIUM',
    description: 'Partial batch processing failure',
    resolution: 'Some records in batch failed, marking successful ones as processed',
    triggerAction: 'BULK_WARNING'
  },

  // SCHEMA/DATABASE ERRORS
  'SCH001': {
    code: 'SCH001',
    category: 'SCHEMA',
    severity: 'HIGH',
    description: 'Column does not exist in target table',
    resolution: 'Schema migration required, trigger emergency R1 processing',
    triggerAction: 'EMERGENCY_R1'
  },
  'SCH002': {
    code: 'SCH002',
    category: 'SCHEMA',
    severity: 'HIGH',
    description: 'Data type mismatch in field extraction',
    resolution: 'Field format validation needed, trigger single-line analysis',
    triggerAction: 'EMERGENCY_R1'
  },

  // FIELD EXTRACTION ERRORS
  'FLD001': {
    code: 'FLD001',
    category: 'FIELD_EXTRACTION',
    severity: 'MEDIUM',
    description: 'Invalid field position in TDDF specification',
    resolution: 'Verify field positions against TDDF spec, skip record',
    triggerAction: 'SKIP'
  },
  'FLD002': {
    code: 'FLD002',
    category: 'FIELD_EXTRACTION',
    severity: 'LOW',
    description: 'Field contains invalid characters',
    resolution: 'Clean field data and retry processing',
    triggerAction: 'RETRY'
  },

  // RECORD TYPE ERRORS
  'REC001': {
    code: 'REC001',
    category: 'RECORD_TYPE',
    severity: 'MEDIUM',
    description: 'Unknown record type in TDDF data',
    resolution: 'Add support for new record type or skip if obsolete',
    triggerAction: 'SKIP'
  },
  'REC002': {
    code: 'REC002',
    category: 'RECORD_TYPE',
    severity: 'HIGH',
    description: 'Record type switch case missing',
    resolution: 'Add switch case for record type processing',
    triggerAction: 'EMERGENCY_R1'
  },

  // SYSTEM PERFORMANCE ERRORS
  'SYS001': {
    code: 'SYS001',
    category: 'SYSTEM',
    severity: 'CRITICAL',
    description: 'Processing rate below 1000 records/min threshold',
    resolution: 'Performance optimization required, enable emergency processing',
    triggerAction: 'EMERGENCY_R1'
  },
  'SYS002': {
    code: 'SYS002',
    category: 'SYSTEM',
    severity: 'HIGH',
    description: 'Database connection timeout during bulk processing',
    resolution: 'Reduce batch size and retry with connection pooling',
    triggerAction: 'RETRY'
  },

  // VALIDATION ERRORS
  'VAL001': {
    code: 'VAL001',
    category: 'VALIDATION',
    severity: 'LOW',
    description: 'Field validation failed but record processable',
    resolution: 'Process record with warning, log validation issue',
    triggerAction: 'BULK_WARNING'
  },
  'VAL002': {
    code: 'VAL002',
    category: 'VALIDATION',
    severity: 'MEDIUM',
    description: 'Critical field missing or corrupt',
    resolution: 'Skip record processing, requires manual review',
    triggerAction: 'SKIP'
  }
};

export function getErrorCode(code: string): ErrorCode | null {
  return TDDF_ERROR_CODES[code] || null;
}

export function createErrorLogEntry(
  errorCode: string,
  recordId: string,
  additionalContext?: Record<string, any>
): {
  errorCode: string;
  recordId: string;
  timestamp: string;
  severity: string;
  category: string;
  description: string;
  resolution: string;
  triggerAction?: string;
  context?: Record<string, any>;
} {
  const error = getErrorCode(errorCode);
  if (!error) {
    throw new Error(`Unknown error code: ${errorCode}`);
  }

  return {
    errorCode,
    recordId,
    timestamp: new Date().toISOString(),
    severity: error.severity,
    category: error.category,
    description: error.description,
    resolution: error.resolution,
    triggerAction: error.triggerAction,
    context: additionalContext
  };
}

export function shouldTriggerEmergencyR1(errorCode: string): boolean {
  const error = getErrorCode(errorCode);
  return error?.triggerAction === 'EMERGENCY_R1' || false;
}

export function shouldMarkBulkWarning(errorCode: string): boolean {
  const error = getErrorCode(errorCode);
  return error?.triggerAction === 'BULK_WARNING' || false;
}