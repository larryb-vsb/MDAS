// Shared TDDF data utilities and types
import { useQuery, UseQueryResult } from '@tanstack/react-query';

// ===== SHARED TYPES =====

export interface JsonbRecord {
  id: number;
  upload_id: string;
  filename: string;
  record_type: string;
  line_number: number;
  raw_line: string;
  extracted_fields: any;
  record_identifier: string;
  processing_time_ms?: number;
  created_at: string;
}

export interface TddfApiFile {
  id: number;
  filename: string;
  original_name: string;
  file_size: number;
  file_hash: string;
  storage_path: string;
  schema_id?: number;
  status: string;
  current_phase?: string; // Added to match usage in TddfApiDataPage
  fileType?: string; // Added to match usage in TddfApiDataPage
  record_count: number;
  processed_records: number;
  error_records: number;
  processing_started?: string;
  processing_completed?: string;
  error_details?: any;
  metadata?: any;
  business_day?: string;
  file_date?: string;
  uploaded_at: string;
  uploaded_by: string;
  schema_name?: string;
  schema_version?: string;
  queue_status?: string;
  queue_priority?: number;
}

export interface TddfApiSchema {
  id: number;
  name: string;
  version: string;
  description?: string;
  fields?: any;
  created_at: string;
  is_active: boolean;
}

export interface TddfRecordStats {
  totalFiles: number;
  totalRecords: number;
  recordTypes: Record<string, number>;
  dateRange: {
    start: string;
    end: string;
  };
}

// ===== SHARED UTILITIES =====

/**
 * Format file size with proper units and bounds checking
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes || !Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(2)} ${sizes[i]}`;
};

/**
 * Get record type badge styling
 */
export const getRecordTypeBadgeColor = (type: string): string => {
  const colors: Record<string, string> = {
    'BH': 'bg-green-50 text-green-700 border-green-200',
    'DT': 'bg-blue-50 text-blue-700 border-blue-200',
    'P1': 'bg-purple-50 text-purple-700 border-purple-200',
    'P2': 'bg-purple-50 text-purple-700 border-purple-200',
    'G2': 'bg-orange-50 text-orange-700 border-orange-200',
    'AD': 'bg-red-50 text-red-700 border-red-200',
    'DR': 'bg-red-50 text-red-700 border-red-200',
    'E1': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };
  return colors[type] || 'bg-gray-50 text-gray-700 border-gray-200';
};

/**
 * Get file status badge variant
 */
export const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status?.toLowerCase()) {
    case 'completed': return 'default';
    case 'processing': return 'secondary';
    case 'failed':
    case 'error': return 'destructive';
    default: return 'outline';
  }
};

/**
 * Card type badge configuration and utilities
 */
export const getCardTypeBadges = (cardType: string) => {
  const badges: Record<string, { label: string; className: string }> = {
    'VD': { label: 'Visa Debit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'VC': { label: 'Visa Credit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'MD': { label: 'Mastercard Debit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'MC': { label: 'Mastercard Credit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'AX': { label: 'American Express', className: 'bg-green-50 text-green-700 border-green-200' },
    'DS': { label: 'Discover', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    'DI': { label: 'Diners Club', className: 'bg-gray-50 text-gray-700 border-gray-200' },
    'JC': { label: 'JCB', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };
  return badges[cardType] || { label: cardType, className: 'bg-gray-50 text-gray-700 border-gray-200' };
};

/**
 * Extract card type from TDDF record
 */
export const extractCardType = (record: JsonbRecord): string | null => {
  let cardType = record.extracted_fields?.cardType;
  
  // Dynamic extraction from positions 253-254 (1-based inclusive)
  if (!cardType && record.raw_line && record.raw_line.length >= 254) {
    cardType = record.raw_line.substring(252, 254).trim() || null;
  }
  
  return cardType ? cardType.toUpperCase().trim() : null;
};

/**
 * Format field values for display
 */
export const formatFieldValue = (key: string, value: any): string => {
  if (value === null || value === undefined || value === '') {
    return 'N/A';
  }

  const lowerKey = key.toLowerCase();
  
  // Amount formatting
  if (lowerKey.includes('amount') || lowerKey.includes('value')) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(num / 100); // Assuming cents
    }
  }
  
  // Date formatting
  if (lowerKey.includes('date') || lowerKey.includes('time')) {
    if (typeof value === 'string' && /^\d{8}$/.test(value)) {
      // YYYYMMDD format
      const year = value.substring(0, 4);
      const month = value.substring(4, 6);
      const day = value.substring(6, 8);
      return `${month}/${day}/${year}`;
    }
  }
  
  return String(value);
};

// ===== SHARED DATA HOOKS =====

/**
 * Fetch TDDF API files with optional filtering
 */
export const useTddfFiles = (filters?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  businessDayFrom?: string;
  businessDayTo?: string;
}): UseQueryResult<TddfApiFile[], Error> => {
  return useQuery<TddfApiFile[]>({
    queryKey: ["/api/tddf-api/files", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.append('dateTo', filters.dateTo);
      if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters?.businessDayFrom) params.append('businessDayFrom', filters.businessDayFrom);
      if (filters?.businessDayTo) params.append('businessDayTo', filters.businessDayTo);
      
      const response = await fetch(`/api/tddf-api/files?${params.toString()}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF files');
      }
      
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });
};

/**
 * Fetch TDDF schemas
 */
export const useTddfSchemas = (): UseQueryResult<TddfApiSchema[], Error> => {
  return useQuery<TddfApiSchema[]>({
    queryKey: ["/api/tddf-api/schemas"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/schemas", {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF schemas');
      }
      
      return response.json();
    }
  });
};

/**
 * Fetch TDDF file content
 */
export const useTddfFileContent = (fileId: number | null): UseQueryResult<string, Error> => {
  return useQuery<string>({
    queryKey: ["/api/tddf-api/files", fileId, "content"],
    queryFn: async () => {
      if (!fileId) throw new Error('File ID is required');
      
      const response = await fetch(`/api/tddf-api/files/${fileId}/content`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch file content');
      }
      
      return response.text();
    },
    enabled: !!fileId
  });
};

/**
 * Calculate analytics from TDDF files
 */
export const calculateTddfAnalytics = (files: TddfApiFile[]) => {
  const totalDataVolume = files.reduce((sum, f) => sum + (Number(f.file_size) || 0), 0);
  const averageFileSize = files.length > 0 ? totalDataVolume / files.length : 0;
  const totalRecords = files.reduce((sum, f) => sum + (f.record_count || 0), 0);
  const totalProcessedRecords = files.reduce((sum, f) => sum + (f.processed_records || 0), 0);
  const totalErrorRecords = files.reduce((sum, f) => sum + (f.error_records || 0), 0);
  
  return {
    totalFiles: files.length,
    totalDataVolume,
    averageFileSize,
    totalRecords,
    totalProcessedRecords,
    totalErrorRecords,
    successRate: totalRecords > 0 ? (totalProcessedRecords / totalRecords) * 100 : 100,
    errorRate: totalRecords > 0 ? (totalErrorRecords / totalRecords) * 100 : 0
  };
};

// ===== FIELD EXTRACTION UTILITIES =====

/**
 * Extract Transaction Type Identifier (TTI) field with purple highlighting
 */
export const extractTTI = (record: JsonbRecord): string | null => {
  // TTI is typically at positions specific to record type
  if (record.extracted_fields?.transactionTypeIdentifier) {
    return record.extracted_fields.transactionTypeIdentifier;
  }
  
  // Fallback: extract from raw line based on record type
  if (record.record_type === 'DT' && record.raw_line && record.raw_line.length >= 4) {
    return record.raw_line.substring(3, 4) || null;
  }
  
  return null;
};

/**
 * Extract Terminal ID for filtering
 */
export const extractTerminalId = (record: JsonbRecord): string | null => {
  if (record.extracted_fields?.terminalId) {
    return record.extracted_fields.terminalId;
  }
  
  // Extract from raw line based on TDDF specification
  if (record.raw_line && record.raw_line.length >= 8) {
    const terminalId = record.raw_line.substring(4, 8).trim();
    return terminalId || null;
  }
  
  return null;
};