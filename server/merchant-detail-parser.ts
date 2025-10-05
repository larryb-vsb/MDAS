/**
 * TSYS Merchant Detail File Parser
 * Uses MCC Schema Configuration for dynamic field extraction
 * Parses fixed-width merchant detail files based on database-configured field positions
 */

import { pool } from './db';
import { getTableName } from './table-config';

interface MccSchemaField {
  position: string;
  fieldName: string;
  fieldLength: number;
  format: string;
  description: string | null;
  mmsEnabled: number;
}

interface ParsedMerchantDetail {
  [key: string]: string | number | null;
  _raw: string;
  _errors: string[];
}

/**
 * Parse position string into start/end indices
 * Examples: "1-4" => {start: 0, end: 4}, "1818-1827" => {start: 1817, end: 1827}
 */
function parsePosition(position: string): { start: number; end: number } | null {
  try {
    const parts = position.split('-');
    if (parts.length !== 2) {
      return null;
    }
    
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      return null;
    }
    
    // Convert to 0-based index for substring extraction
    return { start: start - 1, end: end };
  } catch {
    return null;
  }
}

/**
 * Parse date string from various formats
 */
function parseDate(value: string): string | null {
  const trimmed = value.trim();
  
  // Empty values
  if (!trimmed || trimmed === '0' || trimmed === '00000000') {
    return null;
  }
  
  // YYYY/MM/DD format
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, '-');
  }
  
  // YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // MMDDYYYY format (common in TSYS files)
  if (/^\d{8}$/.test(trimmed)) {
    const month = trimmed.substring(0, 2);
    const day = trimmed.substring(2, 4);
    const year = trimmed.substring(4, 8);
    
    // Validate ranges
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const yearNum = parseInt(year, 10);
    
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
      return `${year}-${month}-${day}`;
    }
  }
  
  return null;
}

/**
 * Validate and convert field value based on format
 */
function validateAndConvertField(
  value: string, 
  format: string, 
  fieldName: string,
  fieldLength: number
): { value: string | number | null; error: string | null } {
  const trimmed = value.trim();
  
  // Empty values are null
  if (!trimmed || trimmed === '') {
    return { value: null, error: null };
  }
  
  try {
    switch (format.toUpperCase()) {
      case 'N': // Numeric only
        // Check if this might be a decimal field based on field name
        const isDecimalField = /amount|exposure|fee|limit|threshold/i.test(fieldName);
        
        if (isDecimalField && fieldLength >= 6) {
          // Assume last 2 digits are decimal places for amount fields
          const cleanAmount = trimmed.replace(/^0+/, '') || '0';
          if (cleanAmount.length <= 2) {
            return { value: `0.${cleanAmount.padStart(2, '0')}`, error: null };
          }
          const dollars = cleanAmount.substring(0, cleanAmount.length - 2);
          const cents = cleanAmount.substring(cleanAmount.length - 2);
          return { value: `${dollars}.${cents}`, error: null };
        } else {
          // Regular numeric field
          const numStr = trimmed.replace(/^0+/, '') || '0';
          const numValue = parseInt(numStr, 10);
          if (isNaN(numValue)) {
            return { value: trimmed, error: `Invalid numeric value for ${fieldName}` };
          }
          return { value: numValue, error: null };
        }
      
      case 'AN': // Alphanumeric
        return { value: trimmed, error: null };
      
      case 'A': // Alpha only
        // Allow letters, spaces, and basic punctuation
        if (!/^[A-Za-z\s.,'-]+$/.test(trimmed)) {
          return { value: trimmed, error: `Invalid alpha characters in ${fieldName}` };
        }
        return { value: trimmed, error: null };
      
      case 'D': // Date format
        const parsedDate = parseDate(trimmed);
        if (parsedDate) {
          return { value: parsedDate, error: null };
        }
        // If we can't parse but it's not empty, return warning
        return { value: trimmed, error: `Could not parse date format for ${fieldName}: ${trimmed}` };
      
      default:
        // Unknown format - accept as-is but log warning
        return { value: trimmed, error: null };
    }
  } catch (error) {
    return { value: trimmed, error: `Validation error for ${fieldName}: ${error}` };
  }
}

/**
 * Get MCC schema fields from database
 */
export async function getMccSchemaFields(): Promise<MccSchemaField[]> {
  const tableName = getTableName('Merchant_MCC_Schema');
  
  try {
    const result = await pool.query(`
      SELECT position, field_name as "fieldName", field_length as "fieldLength", 
             format, description, mms_enabled as "mmsEnabled"
      FROM ${tableName}
      WHERE mms_enabled = 1
      ORDER BY position
    `);
    
    return result.rows;
  } catch (error) {
    console.error('[MCC-PARSER] Error fetching schema fields:', error);
    throw new Error('Failed to fetch MCC schema configuration');
  }
}

/**
 * Parse a single merchant detail line using MCC schema
 */
export async function parseMerchantDetailLine(
  line: string, 
  schemaFields?: MccSchemaField[]
): Promise<ParsedMerchantDetail> {
  // Get schema if not provided
  const fields = schemaFields || await getMccSchemaFields();
  
  const parsed: ParsedMerchantDetail = {
    _raw: line,
    _errors: []
  };
  
  for (const field of fields) {
    const positions = parsePosition(field.position);
    
    if (!positions) {
      parsed._errors.push(`Invalid position format for ${field.fieldName}: ${field.position}`);
      continue;
    }
    
    // Extract value from line at specified position
    const rawValue = line.substring(positions.start, positions.end);
    
    // Validate and convert
    const result = validateAndConvertField(rawValue, field.format, field.fieldName, field.fieldLength);
    
    // Create safe field key (camelCase from field name)
    const fieldKey = field.fieldName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map((word, idx) => idx === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    
    parsed[fieldKey] = result.value;
    
    if (result.error) {
      parsed._errors.push(result.error);
    }
  }
  
  return parsed;
}

/**
 * Parse entire merchant detail file
 */
export async function parseMerchantDetailFile(
  fileContent: string
): Promise<{ 
  records: ParsedMerchantDetail[];
  totalLines: number;
  successfulLines: number;
  errorLines: number;
  schemaFieldCount: number;
}> {
  console.log('[MCC-PARSER] Starting merchant detail file parsing...');
  
  // Get schema fields once for all lines
  const schemaFields = await getMccSchemaFields();
  console.log(`[MCC-PARSER] Loaded ${schemaFields.length} schema fields for parsing`);
  
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
  const records: ParsedMerchantDetail[] = [];
  let successfulLines = 0;
  let errorLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    try {
      const parsed = await parseMerchantDetailLine(line, schemaFields);
      records.push(parsed);
      
      if (parsed._errors.length === 0) {
        successfulLines++;
      } else {
        errorLines++;
        console.log(`[MCC-PARSER] Line ${i + 1} has ${parsed._errors.length} validation errors:`, parsed._errors);
      }
    } catch (error) {
      errorLines++;
      console.error(`[MCC-PARSER] Error parsing line ${i + 1}:`, error);
      records.push({
        _raw: line,
        _errors: [`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      });
    }
  }
  
  console.log(`[MCC-PARSER] Parsing complete: ${successfulLines} successful, ${errorLines} with errors`);
  
  return {
    records,
    totalLines: lines.length,
    successfulLines,
    errorLines,
    schemaFieldCount: schemaFields.length
  };
}

/**
 * Map parsed merchant detail to merchant database schema
 */
export function mapParsedToMerchantSchema(parsed: ParsedMerchantDetail): any {
  return {
    // Core merchant identification fields from schema
    bankNumber: parsed.bankNumber || null,
    bank: parsed.bank || 'Valley State Bank',
    
    // Exposure and risk fields
    exposureAmount: parsed.exposureAmount || null,
    
    // Date fields
    merchantActivationDate: parsed.merchantActivationDate ? new Date(parsed.merchantActivationDate as string) : null,
    dateOfFirstDeposit: parsed.dateOfFirstDeposit ? new Date(parsed.dateOfFirstDeposit as string) : null,
    dateOfLastDeposit: parsed.dateOfLastDeposit ? new Date(parsed.dateOfLastDeposit as string) : null,
    
    // Additional fields from schema
    ...(parsed as any)
  };
}
