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
  key: string | null;
  tabPosition: string | null;
  fieldLength: number;
  format: string;
  description: string | null;
  mmsEnabled: number;
}

interface ParsedMerchantDetail {
  [key: string]: string | number | null | string[];
  _raw: string;
  _errors: string[];
}

/**
 * Parse position string into start/end indices
 * Examples: "1-4" => {start: 0, end: 4}, "1818-1827" => {start: 1817, end: 1827}, "377" => {start: 376, end: 377}
 */
function parsePosition(position: string): { start: number; end: number } | null {
  try {
    const parts = position.split('-');
    
    // Handle single number positions (e.g., "377" for single character at position 377)
    if (parts.length === 1) {
      const pos = parseInt(parts[0], 10);
      if (isNaN(pos) || pos < 1) {
        return null;
      }
      return {
        start: pos - 1,  // Convert to 0-based index
        end: pos         // Single character
      };
    }
    
    // Handle range positions (e.g., "1-4" for positions 1 through 4)
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      
      if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
        return null;
      }
      
      // Convert to 0-based index for substring extraction
      return { start: start - 1, end: end };
    }
    
    // Invalid format (more than 2 parts)
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse date string from various formats
 */
function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  
  // Empty values
  if (!trimmed || trimmed === '0' || trimmed === '00000000') {
    return null;
  }
  
  // YYYY/MM/DD format
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const dateStr = trimmed.replace(/\//g, '-');
    return new Date(dateStr);
  }
  
  // YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
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
      return new Date(`${year}-${month}-${day}`);
    }
  }
  
  // MM/DD/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split('/');
    return new Date(`${year}-${month}-${day}`);
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
): { value: string | number | Date | null; error: string | null } {
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
      SELECT position, field_name as "fieldName", key, tab_position as "tabPosition",
             field_length as "fieldLength", format, description, mms_enabled as "mmsEnabled"
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
 * Detect if the file is tab-delimited or fixed-width
 */
function detectFileFormat(line: string): 'tab-delimited' | 'fixed-width' {
  // Check if line contains tabs
  if (line.includes('\t')) {
    return 'tab-delimited';
  }
  return 'fixed-width';
}

/**
 * Parse tab-delimited line using tab_position from schema
 * Splits ONLY by tabs (\t), uses tab_position as column index
 */
function parseTabDelimitedLine(
  line: string,
  schemaFields: MccSchemaField[]
): ParsedMerchantDetail {
  const parsed: ParsedMerchantDetail = {
    _raw: line,
    _errors: []
  };
  
  // Split line by TABS ONLY - do not split by spaces
  const values = line.split('\t');
  
  console.log(`[TAB-PARSER] Line has ${values.length} tab-delimited columns`);
  console.log(`[TAB-PARSER] First 10 columns:`, values.slice(0, 10));
  
  // Process each schema field using tab_position as column index
  for (const field of schemaFields) {
    const colIndex = field.tabPosition ? parseInt(field.tabPosition) : -1;
    
    if (colIndex < 0) continue;
    
    const rawValue = values[colIndex] || '';
    
    // Validate and convert
    const result = validateAndConvertField(rawValue, field.format, field.fieldName, field.fieldLength);
    
    // Use 'key' field if available, otherwise generate from fieldName
    const fieldKey = field.key || field.fieldName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map((word, idx) => idx === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    
    parsed[fieldKey] = result.value;
    
    if (result.error) {
      parsed._errors.push(result.error);
    }
    
    if (rawValue && colIndex < 10) {
      console.log(`[TAB-PARSER] Col ${colIndex} (${field.fieldName}): "${rawValue}" -> ${fieldKey} = ${result.value}`);
    }
  }
  
  return parsed;
}

/**
 * Parse fixed-width line using position ranges
 */
function parseFixedWidthLine(
  line: string,
  schemaFields: MccSchemaField[]
): ParsedMerchantDetail {
  const parsed: ParsedMerchantDetail = {
    _raw: line,
    _errors: []
  };
  
  for (const field of schemaFields) {
    const positions = parsePosition(field.position);
    
    if (!positions) {
      parsed._errors.push(`Invalid position format for ${field.fieldName}: ${field.position}`);
      continue;
    }
    
    // Extract value from line at specified position
    const rawValue = line.substring(positions.start, positions.end);
    
    // Validate and convert
    const result = validateAndConvertField(rawValue, field.format, field.fieldName, field.fieldLength);
    
    // Use 'key' field if available, otherwise generate from fieldName
    const fieldKey = field.key || field.fieldName
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
 * Parse a single merchant detail line using MCC schema
 * Uses provided file format or auto-detects if not specified
 */
export async function parseMerchantDetailLine(
  line: string, 
  schemaFields?: MccSchemaField[],
  fileFormat?: string
): Promise<ParsedMerchantDetail> {
  // Get schema if not provided
  const fields = schemaFields || await getMccSchemaFields();
  
  // Use provided format or auto-detect
  const format = fileFormat || detectFileFormat(line);
  
  console.log(`[MCC-PARSER] Using format: ${format}${fileFormat ? ' (from database)' : ' (auto-detected)'}`);
  
  if (format === 'tab-delimited' || format === 'tab_delimited') {
    return parseTabDelimitedLine(line, fields);
  } else {
    return parseFixedWidthLine(line, fields);
  }
}

/**
 * Parse entire merchant detail file
 */
export async function parseMerchantDetailFile(
  fileContent: string,
  fileFormat?: string
): Promise<{ 
  records: ParsedMerchantDetail[];
  totalLines: number;
  successfulLines: number;
  errorLines: number;
  schemaFieldCount: number;
}> {
  console.log('[MCC-PARSER] Starting merchant detail file parsing...');
  console.log(`[MCC-PARSER] File format: ${fileFormat || 'auto-detect'}`);
  
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
      const parsed = await parseMerchantDetailLine(line, schemaFields, fileFormat);
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
 * Convert camelCase to snake_case
 */
function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Map parsed merchant detail to merchant database schema
 * Uses the 'key' field from MCC schema to map to correct database columns
 */
export function mapParsedToMerchantSchema(parsed: ParsedMerchantDetail, schemaFields: MccSchemaField[]): any {
  const merchantData: any = {
    // Required fields
    name: null,
    status: 'Active',
    merchantType: '0', // DACQ files are always type 0
  };
  
  let mappedCount = 0;
  
  // Map each schema field using its 'key' field
  for (const field of schemaFields) {
    // Generate camelCase field name from field_name
    const generatedFieldName = field.fieldName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(' ')
      .map((word, idx) => idx === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
    
    const value = parsed[generatedFieldName];
    
    // Use camelCase property name for Drizzle ORM
    // Drizzle expects merchantData.bankNumber (not merchantData.bank_number)
    const propertyName = field.key || generatedFieldName;
    
    if (value !== null && value !== undefined) {
      merchantData[propertyName] = value;
      mappedCount++;
      if (mappedCount <= 10) {
        console.log(`[MAPPER] ${field.fieldName} (${generatedFieldName}) -> ${propertyName} = ${value}`);
      }
    }
  }
  
  console.log(`[MAPPER] Mapped ${mappedCount} fields to database columns`);
  
  // Special handling for required fields
  // Ensure 'id' field is properly set (Account Number/Client MID)
  if (!merchantData.id && parsed.accountNumber) {
    merchantData.id = parsed.accountNumber;
  }
  if (!merchantData.id && parsed.clientMid) {
    merchantData.id = parsed.clientMid;
  }
  
  // Ensure 'name' field is set (DBA Name or Legal Name)
  if (!merchantData.name && parsed.dbaName) {
    merchantData.name = parsed.dbaName;
  }
  if (!merchantData.name && parsed.legalName) {
    merchantData.name = parsed.legalName;
  }
  if (!merchantData.name && parsed.associationName) {
    merchantData.name = parsed.associationName;
  }
  
  // Set default bank if not provided
  if (!merchantData.bank) {
    merchantData.bank = 'Valley State Bank';
  }
  
  return merchantData;
}

/**
 * Process merchant detail file - parse and import to database
 * This is the main entry point called by the MMS watcher
 */
export async function processMerchantDetailFile(
  fileContent: string,
  uploadId?: string,
  fileFormat?: string
): Promise<{
  success: boolean;
  totalRecords: number;
  imported: number;
  skipped: number;
  processingTimeMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    console.log('[MERCHANT-IMPORT] Starting merchant detail file processing...');
    console.log(`[MERCHANT-IMPORT] File format: ${fileFormat || 'auto-detect'}`);
    
    // Parse the file with specified format
    const parseResult = await parseMerchantDetailFile(fileContent, fileFormat);
    console.log(`[MERCHANT-IMPORT] Parsed ${parseResult.records.length} records`);
    
    // Get schema fields for mapping
    const schemaFields = await getMccSchemaFields();
    console.log(`[MERCHANT-IMPORT] Loaded ${schemaFields.length} MCC schema fields for mapping`);
    
    // Import to database
    const { db } = await import('./db.ts');
    const { merchants } = await import('@shared/schema.ts');
    
    let imported = 0;
    let skipped = 0;
    
    for (const record of parseResult.records) {
      // Skip records with errors
      if (record._errors && record._errors.length > 0) {
        console.log(`[MERCHANT-IMPORT] Skipping record with errors:`, record._errors);
        skipped++;
        continue;
      }
      
      try {
        // Map to merchant schema
        const merchantData = mapParsedToMerchantSchema(record, schemaFields);
        
        // Validate required fields
        if (!merchantData.id || !merchantData.name) {
          console.log(`[MERCHANT-IMPORT] Skipping record - missing required fields (id: ${merchantData.id}, name: ${merchantData.name})`);
          skipped++;
          continue;
        }
        
        // Insert or update merchant
        await db.insert(merchants)
          .values(merchantData)
          .onConflictDoUpdate({
            target: merchants.id,
            set: merchantData
          });
        
        imported++;
      } catch (error) {
        console.error(`[MERCHANT-IMPORT] Error importing merchant:`, error);
        skipped++;
      }
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    console.log(`[MERCHANT-IMPORT] ✅ Processing complete: ${imported} imported, ${skipped} skipped in ${processingTimeMs}ms`);
    
    return {
      success: true,
      totalRecords: parseResult.records.length,
      imported,
      skipped,
      processingTimeMs
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error('[MERCHANT-IMPORT] Error processing merchant detail file:', error);
    
    return {
      success: false,
      totalRecords: 0,
      imported: 0,
      skipped: 0,
      processingTimeMs,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
