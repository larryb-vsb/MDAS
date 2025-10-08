/**
 * TSYS Merchant Detail File Parser
 * Uses MCC Schema Configuration for dynamic field extraction
 * Parses fixed-width merchant detail files based on database-configured field positions
 */

import { pool } from "./db";
import { getTableName } from "./table-config";

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
  [key: string]: string | number | Date | null | string[];
  _raw: string;
  _errors: string[];
}

/**
 * Parse position string into start/end indices
 * Examples: "1-4" => {start: 0, end: 4}, "1818-1827" => {start: 1817, end: 1827}, "377" => {start: 376, end: 377}
 */
function parsePosition(
  position: string,
): { start: number; end: number } | null {
  try {
    const parts = position.split("-");

    // Handle single number positions (e.g., "377" for single character at position 377)
    if (parts.length === 1) {
      const pos = parseInt(parts[0], 10);
      if (isNaN(pos) || pos < 1) {
        return null;
      }
      return {
        start: pos - 1, // Convert to 0-based index
        end: pos, // Single character
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
let dateParseLogCount = 0;
const MAX_DATE_PARSE_LOGS = 5;

function parseDate(value: string): Date | null {
  const trimmed = value.trim();

  // Log only if under limit and increment ONLY when actually logging
  const logIfAllowed = (msg: string) => {
    if (dateParseLogCount < MAX_DATE_PARSE_LOGS) {
      console.log(msg);
      dateParseLogCount++;
    }
  };

  logIfAllowed(`[DATE-PARSE] Attempting to parse: "${trimmed}"`);

  // Empty values
  if (!trimmed || trimmed === "0" || trimmed === "00000000") {
    logIfAllowed(`[DATE-PARSE] ✓ Empty/zero value, returning null`);
    return null;
  }

  // MM/DD/YYYY format (common in TSYS merchant detail files)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split("/");
    const month = parts[0].padStart(2, "0");
    const day = parts[1].padStart(2, "0");
    const year = parts[2];
    const isoFormat = `${year}-${month}-${day}`;
    const date = new Date(isoFormat);
    logIfAllowed(
      `[DATE-PARSE] ✓ Matched MM/DD/YYYY: "${trimmed}" -> ISO: "${isoFormat}" -> Date: ${date.toISOString()}`,
    );
    return date;
  }

  // YYYY/MM/DD format
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const dateStr = trimmed.replace(/\//g, "-");
    const date = new Date(dateStr);
    logIfAllowed(
      `[DATE-PARSE] ✓ Matched YYYY/MM/DD: "${trimmed}" -> "${dateStr}" -> Date: ${date.toISOString()}`,
    );
    return date;
  }

  // YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    logIfAllowed(
      `[DATE-PARSE] ✓ Matched YYYY-MM-DD: "${trimmed}" -> Date: ${date.toISOString()}`,
    );
    return date;
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

    if (
      monthNum >= 1 &&
      monthNum <= 12 &&
      dayNum >= 1 &&
      dayNum <= 31 &&
      yearNum >= 1900 &&
      yearNum <= 2100
    ) {
      const isoFormat = `${year}-${month}-${day}`;
      const date = new Date(isoFormat);
      logIfAllowed(
        `[DATE-PARSE] ✓ Matched MMDDYYYY: "${trimmed}" -> ISO: "${isoFormat}" -> Date: ${date.toISOString()}`,
      );
      return date;
    } else {
      logIfAllowed(
        `[DATE-PARSE] ✗ MMDDYYYY format invalid range: month=${monthNum}, day=${dayNum}, year=${yearNum}`,
      );
    }
  }

  // MM/DD/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split("/");
    const isoFormat = `${year}-${month}-${day}`;
    const date = new Date(isoFormat);
    logIfAllowed(
      `[DATE-PARSE] ✓ Matched MM/DD/YYYY (strict): "${trimmed}" -> ISO: "${isoFormat}" -> Date: ${date.toISOString()}`,
    );
    return date;
  }

  logIfAllowed(`[DATE-PARSE] ✗ No format matched for: "${trimmed}"`);
  return null;
}

/**
 * Validate and convert field value based on format
 */
function validateAndConvertField(
  value: string,
  format: string,
  fieldName: string,
  fieldLength: number,
): { value: string | number | Date | null; error: string | null } {
  const trimmed = value.trim();

  // Empty values are null
  if (!trimmed || trimmed === "") {
    return { value: null, error: null };
  }

  try {
    switch (format.toUpperCase()) {
      case "N": // Numeric only
        // Check if this might be a decimal field based on field name
        const isDecimalField = /amount|exposure|fee|limit|threshold/i.test(
          fieldName,
        );

        if (isDecimalField && fieldLength >= 6) {
          // Assume last 2 digits are decimal places for amount fields
          const cleanAmount = trimmed.replace(/^0+/, "") || "0";
          if (cleanAmount.length <= 2) {
            return { value: `0.${cleanAmount.padStart(2, "0")}`, error: null };
          }
          const dollars = cleanAmount.substring(0, cleanAmount.length - 2);
          const cents = cleanAmount.substring(cleanAmount.length - 2);
          return { value: `${dollars}.${cents}`, error: null };
        } else {
          // Regular numeric field
          const numStr = trimmed.replace(/^0+/, "") || "0";
          const numValue = parseInt(numStr, 10);
          if (isNaN(numValue)) {
            return {
              value: trimmed,
              error: `Invalid numeric value for ${fieldName}`,
            };
          }
          return { value: numValue, error: null };
        }

      case "AN": // Alphanumeric
        return { value: trimmed, error: null };

      case "A": // Alpha only
        // Allow letters, spaces, and basic punctuation
        if (!/^[A-Za-z\s.,'-]+$/.test(trimmed)) {
          return {
            value: trimmed,
            error: `Invalid alpha characters in ${fieldName}`,
          };
        }
        return { value: trimmed, error: null };

      case "D": // Date format
        const parsedDate = parseDate(trimmed);
        if (parsedDate) {
          return { value: parsedDate, error: null };
        }
        // If we can't parse but it's not empty, return warning
        return {
          value: trimmed,
          error: `Could not parse date format for ${fieldName}: ${trimmed}`,
        };

      default:
        // Unknown format - accept as-is but log warning
        return { value: trimmed, error: null };
    }
  } catch (error) {
    return {
      value: trimmed,
      error: `Validation error for ${fieldName}: ${error}`,
    };
  }
}

/**
 * Get MCC schema fields from database
 */
export async function getMccSchemaFields(): Promise<MccSchemaField[]> {
  const tableName = getTableName("dev_merchant_mcc_schema");

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
    console.error("[MCC-PARSER] Error fetching schema fields:", error);
    throw new Error("Failed to fetch MCC schema configuration");
  }
}

/**
 * Detect if the file is tab-delimited or fixed-width
 */
function detectFileFormat(line: string): "tab-delimited" | "fixed-width" {
  // Check if line contains tabs
  if (line.includes("\t")) {
    return "tab-delimited";
  }
  return "fixed-width";
}

/**
 * Parse tab-delimited line using tab_position from schema
 * Splits ONLY by tabs (\t), uses tab_position as column index
 */
let tabLineLogCount = 0;
let tabExtractLogCount = 0;
const MAX_TAB_LINE_LOGS = 2;
const MAX_TAB_EXTRACT_LOGS = 20;

function parseTabDelimitedLine(
  line: string,
  schemaFields: MccSchemaField[],
): ParsedMerchantDetail {
  const parsed: ParsedMerchantDetail = {
    _raw: line,
    _errors: [],
  };

  // Split line by TABS ONLY - do not split by spaces
  const values = line.split("\t");

  // Log line info only if under limit
  if (tabLineLogCount < MAX_TAB_LINE_LOGS) {
    console.log(
      `[TAB-PARSER] Line ${tabLineLogCount + 1} has ${values.length} tab-delimited columns`,
    );
    console.log(`[TAB-PARSER] First 10 columns:`, values.slice(0, 10));
    console.log("[TAB-PARSER] ========== EXTRACTING KEY FIELDS ==========");
    tabLineLogCount++;
  }

  // Process each schema field using tab_position as column index
  for (const field of schemaFields) {
    const colIndex = field.tabPosition ? parseInt(field.tabPosition) : -1;

    if (colIndex < 0) continue;

    const rawValue = values[colIndex] || "";

    // Validate and convert
    const result = validateAndConvertField(
      rawValue,
      field.format,
      field.fieldName,
      field.fieldLength,
    );

    // Use 'key' field if available, otherwise generate from fieldName
    const fieldKey =
      field.key ||
      field.fieldName
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(" ")
        .map((word, idx) =>
          idx === 0
            ? word.toLowerCase()
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join("");

    // COMPREHENSIVE TAB POSITION EXTRACTION LOGGING FOR KEY FIELDS (throttled per extraction)
    const isKeyField =
      colIndex <= 15 || // Log first 15 fields
      field.fieldName.toLowerCase().includes("address") ||
      field.fieldName.toLowerCase().includes("city") ||
      field.fieldName.toLowerCase().includes("state") ||
      field.fieldName.toLowerCase().includes("zip") ||
      field.fieldName.toLowerCase().includes("dba") ||
      field.fieldName.toLowerCase().includes("account");

    if (isKeyField && tabExtractLogCount < MAX_TAB_EXTRACT_LOGS) {
      console.log(`[TAB-EXTRACT] Position ${colIndex}: "${field.fieldName}"`);
      console.log(`[TAB-EXTRACT]   Raw: "${rawValue}"`);
      console.log(
        `[TAB-EXTRACT]   Key: "${fieldKey}"  Value: "${result.value}"  Format: ${field.format}`,
      );
      if (result.error) {
        console.log(`[TAB-EXTRACT]   ERROR: ${result.error}`);
      }
      tabExtractLogCount++;
    }

    parsed[fieldKey] = result.value;

    if (result.error) {
      parsed._errors.push(result.error);
    }
  }

  return parsed;
}

/**
 * Parse fixed-width line using position ranges
 */
function parseFixedWidthLine(
  line: string,
  schemaFields: MccSchemaField[],
): ParsedMerchantDetail {
  const parsed: ParsedMerchantDetail = {
    _raw: line,
    _errors: [],
  };

  for (const field of schemaFields) {
    const positions = parsePosition(field.position);

    if (!positions) {
      parsed._errors.push(
        `Invalid position format for ${field.fieldName}: ${field.position}`,
      );
      continue;
    }

    // Extract value from line at specified position
    const rawValue = line.substring(positions.start, positions.end);

    // Validate and convert
    const result = validateAndConvertField(
      rawValue,
      field.format,
      field.fieldName,
      field.fieldLength,
    );

    // Use 'key' field if available, otherwise generate from fieldName
    const fieldKey =
      field.key ||
      field.fieldName
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(" ")
        .map((word, idx) =>
          idx === 0
            ? word.toLowerCase()
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join("");

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
  fileFormat?: string,
): Promise<ParsedMerchantDetail> {
  // Get schema if not provided
  const fields = schemaFields || (await getMccSchemaFields());

  // Use provided format or auto-detect
  const format = fileFormat || detectFileFormat(line);

  console.log(
    `[MCC-PARSER] Using format: ${format}${fileFormat ? " (from database)" : " (auto-detected)"}`,
  );

  if (format === "tab-delimited" || format === "tab_delimited") {
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
  fileFormat?: string,
): Promise<{
  records: ParsedMerchantDetail[];
  totalLines: number;
  successfulLines: number;
  errorLines: number;
  schemaFieldCount: number;
}> {
  console.log("[MCC-PARSER] ========== FILE STRUCTURE VALIDATION ==========");
  console.log(`[MCC-PARSER] File format: ${fileFormat || "auto-detect"}`);

  // Get schema fields once for all lines
  const schemaFields = await getMccSchemaFields();
  console.log(
    `[MCC-PARSER] Loaded ${schemaFields.length} schema fields for parsing`,
  );

  const lines = fileContent
    .split("\n")
    .filter((line) => line.trim().length > 0);
  console.log(`[MCC-PARSER] Total lines in file: ${lines.length}`);

  // Sample first and last lines for validation
  if (lines.length > 0) {
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];

    // Detect format from first line
    const detectedFormat = detectFileFormat(firstLine);
    console.log(`[MCC-PARSER] Detected format: ${detectedFormat}`);

    // Count tabs/columns
    if (detectedFormat === "tab-delimited") {
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const columnCount = tabCount + 1;
      console.log(
        `[MCC-PARSER] Tab count: ${tabCount}, Column count: ${columnCount}`,
      );
      console.log(
        `[MCC-PARSER] Expected max tab_position: ${Math.max(...schemaFields.map((f) => parseInt(f.tabPosition || "0")))}`,
      );

      if (columnCount < 137) {
        console.warn(
          `[MCC-PARSER] WARNING: File has ${columnCount} columns but schema expects up to position 136`,
        );
      }
    }

    // Log first line sample (truncated)
    console.log(
      `[MCC-PARSER] First line (first 200 chars): ${firstLine.substring(0, 200)}...`,
    );

    // Log last line sample (truncated)
    console.log(
      `[MCC-PARSER] Last line (first 200 chars): ${lastLine.substring(0, 200)}...`,
    );
  }

  console.log(
    "[MCC-PARSER] ========== STARTING LINE-BY-LINE PARSING ==========",
  );

  const records: ParsedMerchantDetail[] = [];
  let successfulLines = 0;
  let errorLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip HEADER and TRAILER rows - they're for validation, not merchant data
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith("HEADER") || trimmedLine.startsWith("TRAILER")) {
      console.log(
        `[MCC-PARSER] Skipping ${trimmedLine.startsWith("HEADER") ? "HEADER" : "TRAILER"} row at line ${i + 1}`,
      );
      continue;
    }

    try {
      const parsed = await parseMerchantDetailLine(
        line,
        schemaFields,
        fileFormat,
      );
      records.push(parsed);

      if (parsed._errors.length === 0) {
        successfulLines++;
      } else {
        errorLines++;
        console.log(
          `[MCC-PARSER] Line ${i + 1} has ${parsed._errors.length} validation errors:`,
          parsed._errors,
        );
      }
    } catch (error) {
      errorLines++;
      console.error(`[MCC-PARSER] Error parsing line ${i + 1}:`, error);
      records.push({
        _raw: line,
        _errors: [
          `Parse error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      });
    }
  }

  console.log(
    `[MCC-PARSER] Parsing complete: ${successfulLines} successful, ${errorLines} with errors`,
  );

  return {
    records,
    totalLines: lines.length,
    successfulLines,
    errorLines,
    schemaFieldCount: schemaFields.length,
  };
}

/**
 * Convert camelCase to snake_case
 */
function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Map parsed merchant detail to merchant database schema
 * Uses the 'key' field from MCC schema to map to correct database columns
 */
export function mapParsedToMerchantSchema(
  parsed: ParsedMerchantDetail,
  schemaFields: MccSchemaField[],
): any {
  const merchantData: any = {
    // Required fields
    name: null,
    status: "Active",
    merchantType: "1", // TSYSO DACQ_MER_DTL files are always Type 1 (MCC Merchants)
  };

  console.log(
    "[LOCATION-TRACE] ========== LOCATION FIELD MAPPING START ==========",
  );

  let mappedCount = 0;

  // Map each schema field using its 'key' field
  for (const field of schemaFields) {
    // Generate camelCase field name from field_name
    const generatedFieldName = field.fieldName
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .split(" ")
      .map((word, idx) =>
        idx === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      )
      .join("");

    // FIX: Look up value using the same key the parser used to store it
    // Parser stores using: field.key || generatedFieldName
    // So we must retrieve using the same logic
    const lookupKey = field.key || generatedFieldName;
    const value = parsed[lookupKey];

    // Use camelCase property name for Drizzle ORM
    // Drizzle expects merchantData.bankNumber (not merchantData.bank_number)
    const propertyName = field.key || generatedFieldName;

    // DETAILED LOGGING FOR LOCATION FIELDS
    const isLocationField =
      field.fieldName.toLowerCase().includes("address") ||
      field.fieldName.toLowerCase().includes("city") ||
      field.fieldName.toLowerCase().includes("state") ||
      field.fieldName.toLowerCase().includes("zip");

    if (isLocationField) {
      console.log(`[LOCATION-TRACE] Field: "${field.fieldName}"`);
      console.log(`[LOCATION-TRACE]   - Tab Position: ${field.tabPosition}`);
      console.log(`[LOCATION-TRACE]   - Generated Key: ${generatedFieldName}`);
      console.log(`[LOCATION-TRACE]   - Database Key: ${propertyName}`);
      console.log(`[LOCATION-TRACE]   - Raw Value: "${value}"`);
      console.log(
        `[LOCATION-TRACE]   - Will Map: ${value !== null && value !== undefined ? "YES" : "NO (null/undefined)"}`,
      );
    }

    if (value !== null && value !== undefined) {
      // Parse value based on data type
      let parsedValue = value;
      if (field.dataType === "D" && typeof value === "string") {
        // Date field - parse string to Date object
        parsedValue = parseDate(value);
      }

      merchantData[propertyName] = parsedValue;
      mappedCount++;
      if (mappedCount <= 10 || isLocationField) {
        console.log(
          `[MAPPER] ${field.fieldName} (${generatedFieldName}) -> ${propertyName} = ${parsedValue instanceof Date ? parsedValue.toISOString() : parsedValue}`,
        );
      }
    }
  }

  console.log(`[MAPPER] Mapped ${mappedCount} fields to database columns`);
  console.log(
    "[LOCATION-TRACE] ========== FINAL MERCHANT DATA LOCATION FIELDS ==========",
  );
  console.log(
    `[LOCATION-TRACE] merchantData.address = "${merchantData.address || "NOT SET"}"`,
  );
  console.log(
    `[LOCATION-TRACE] merchantData.city = "${merchantData.city || "NOT SET"}"`,
  );
  console.log(
    `[LOCATION-TRACE] merchantData.state = "${merchantData.state || "NOT SET"}"`,
  );
  console.log(
    `[LOCATION-TRACE] merchantData.zipCode = "${merchantData.zipCode || "NOT SET"}"`,
  );
  console.log(
    `[LOCATION-TRACE] merchantData.dbaAddressCity = "${merchantData.dbaAddressCity || "NOT SET"}"`,
  );
  console.log(
    `[LOCATION-TRACE] merchantData.dbaAddressState = "${merchantData.dbaAddressState || "NOT SET"}"`,
  );
  console.log(
    `[LOCATION-TRACE] merchantData.dbaZip = "${merchantData.dbaZip || "NOT SET"}"`,
  );
  console.log("[LOCATION-TRACE] ========== END ==========");

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
    merchantData.bank = "Valley State Bank";
  }

  // CRITICAL: Copy DBA location fields to Core Information fields
  // The Core Information section (address, city, state, zipCode) needs the same data
  // as the TSYS Risk & Configuration Fields (dbaAddressCity, dbaAddressState, dbaZip)
  console.log(
    "[LOCATION-COPY] ========== COPYING DBA FIELDS TO CORE FIELDS ==========",
  );

  if (merchantData.dbaAddressCity && !merchantData.city) {
    merchantData.city = merchantData.dbaAddressCity;
    console.log(
      `[LOCATION-COPY] Copied dbaAddressCity "${merchantData.dbaAddressCity}" → city`,
    );
  }

  if (merchantData.dbaAddressState && !merchantData.state) {
    merchantData.state = merchantData.dbaAddressState;
    console.log(
      `[LOCATION-COPY] Copied dbaAddressState "${merchantData.dbaAddressState}" → state`,
    );
  }

  if (merchantData.dbaZip && !merchantData.zipCode) {
    merchantData.zipCode = merchantData.dbaZip;
    console.log(
      `[LOCATION-COPY] Copied dbaZip "${merchantData.dbaZip}" → zipCode`,
    );
  }

  // Also check for Legal Address fields and use them if DBA fields are not available
  if (merchantData.legalAddressCity && !merchantData.city) {
    merchantData.city = merchantData.legalAddressCity;
    console.log(
      `[LOCATION-COPY] Copied legalAddressCity "${merchantData.legalAddressCity}" → city`,
    );
  }

  if (merchantData.legalAddressState && !merchantData.state) {
    merchantData.state = merchantData.legalAddressState;
    console.log(
      `[LOCATION-COPY] Copied legalAddressState "${merchantData.legalAddressState}" → state`,
    );
  }

  if (merchantData.legalZip && !merchantData.zipCode) {
    merchantData.zipCode = merchantData.legalZip;
    console.log(
      `[LOCATION-COPY] Copied legalZip "${merchantData.legalZip}" → zipCode`,
    );
  }

  console.log(
    "[LOCATION-COPY] ========== FINAL CORE LOCATION FIELDS ==========",
  );
  console.log(
    `[LOCATION-COPY] address: "${merchantData.address || "NOT SET"}"`,
  );
  console.log(`[LOCATION-COPY] city: "${merchantData.city || "NOT SET"}"`);
  console.log(`[LOCATION-COPY] state: "${merchantData.state || "NOT SET"}"`);
  console.log(
    `[LOCATION-COPY] zipCode: "${merchantData.zipCode || "NOT SET"}"`,
  );
  console.log("[LOCATION-COPY] ========== END ==========");

  return merchantData;
}

/**
 * Process merchant detail file - parse and import to database
 * This is the main entry point called by the MMS watcher
 */
export async function processMerchantDetailFile(
  fileContent: string,
  uploadId?: string,
  fileFormat?: string,
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
    console.log(
      "[MERCHANT-IMPORT] Starting merchant detail file processing...",
    );
    console.log(
      `[MERCHANT-IMPORT] File format: ${fileFormat || "auto-detect"}`,
    );

    // Parse the file with specified format
    const parseResult = await parseMerchantDetailFile(fileContent, fileFormat);
    console.log(
      `[MERCHANT-IMPORT] Parsed ${parseResult.records.length} records`,
    );

    // Get schema fields for mapping
    const schemaFields = await getMccSchemaFields();
    console.log(
      `[MERCHANT-IMPORT] Loaded ${schemaFields.length} MCC schema fields for mapping`,
    );

    // Import to database
    const { db } = await import("./db.ts");
    const { merchants } = await import("@shared/schema.ts");

    let imported = 0;
    let skipped = 0;

    // Error categorization tracking with sample records
    interface ErrorSample {
      merchantId?: string;
      error: string;
      rawLineSnippet?: string;
    }

    const errorCategories = {
      parseErrors: [] as ErrorSample[],
      dateParsingErrors: [] as ErrorSample[],
      missingRequiredFields: [] as ErrorSample[],
      databaseErrors: [] as ErrorSample[],
      validationErrors: [] as ErrorSample[],
    };

    // Throttle verbose logging to first N records
    const DEBUG_FIRST_N_RECORDS = 3;
    let processedCount = 0;

    for (const record of parseResult.records) {
      processedCount++;
      const isDebugRecord = processedCount <= DEBUG_FIRST_N_RECORDS;

      // Skip records with errors
      if (record._errors && record._errors.length > 0) {
        console.log(
          `[MERCHANT-IMPORT] Skipping record with errors:`,
          record._errors,
        );

        const merchantId = record.id || record.accountNumber || "UNKNOWN";
        const rawSnippet = record._raw?.substring(0, 100) + "...";

        // Categorize errors with sample context
        for (const error of record._errors) {
          const sample: ErrorSample = {
            merchantId: String(merchantId),
            error,
            rawLineSnippet: rawSnippet,
          };

          if (error.toLowerCase().includes("date")) {
            if (errorCategories.dateParsingErrors.length < 5) {
              errorCategories.dateParsingErrors.push(sample);
            }
          } else if (error.toLowerCase().includes("parse")) {
            if (errorCategories.parseErrors.length < 5) {
              errorCategories.parseErrors.push(sample);
            }
          } else {
            if (errorCategories.validationErrors.length < 5) {
              errorCategories.validationErrors.push(sample);
            }
          }
        }

        skipped++;
        continue;
      }

      try {
        // Log parsed object BEFORE mapping (only for first N records)
        if (isDebugRecord) {
          console.log(
            `[FIELD-MAPPING] ========== RECORD ${processedCount} BEFORE MAPPING ==========`,
          );
          console.log(
            "[FIELD-MAPPING] Parsed object keys:",
            Object.keys(record).filter((k) => !k.startsWith("_")),
          );
          const locationFieldsBefore = {
            dbaAddressCity: record.dbaAddressCity,
            dbaAddressState: record.dbaAddressState,
            dbaZip: record.dbaZip,
            legalAddressCity: record.legalAddressCity,
            legalAddressState: record.legalAddressState,
            legalZip: record.legalZip,
            city: record.city,
            state: record.state,
            zipCode: record.zipCode,
          };
          console.log(
            "[FIELD-MAPPING] Location fields before:",
            locationFieldsBefore,
          );
        }

        // Map to merchant schema
        const merchantData = mapParsedToMerchantSchema(record, schemaFields);

        // Log mapped object AFTER mapping (only for first N records)
        if (isDebugRecord) {
          console.log(
            `[FIELD-MAPPING] ========== RECORD ${processedCount} AFTER MAPPING ==========`,
          );
          console.log(
            "[FIELD-MAPPING] Merchant data keys:",
            Object.keys(merchantData),
          );
          const locationFieldsAfter = {
            dbaAddressCity: merchantData.dbaAddressCity,
            dbaAddressState: merchantData.dbaAddressState,
            dbaZip: merchantData.dbaZip,
            legalAddressCity: merchantData.legalAddressCity,
            legalAddressState: merchantData.legalAddressState,
            legalZip: merchantData.legalZip,
            city: merchantData.city,
            state: merchantData.state,
            zipCode: merchantData.zipCode,
            address: merchantData.address,
          };
          console.log(
            "[FIELD-MAPPING] Location fields after:",
            locationFieldsAfter,
          );
          console.log("[FIELD-MAPPING] ========== END ==========");
        }

        // Validate required fields
        if (!merchantData.id || !merchantData.name) {
          const missingFields = [];
          if (!merchantData.id) missingFields.push("id");
          if (!merchantData.name) missingFields.push("name");
          const errorMsg = `Missing required fields: ${missingFields.join(", ")}`;
          console.log(`[MERCHANT-IMPORT] Skipping record - ${errorMsg}`);

          // Add sample with context
          if (errorCategories.missingRequiredFields.length < 5) {
            errorCategories.missingRequiredFields.push({
              merchantId: String(merchantData.id || "NO_ID"),
              error: errorMsg,
              rawLineSnippet: record._raw?.substring(0, 100) + "...",
            });
          }

          skipped++;
          continue;
        }

        // Log database operation (only for first N records)
        if (isDebugRecord) {
          console.log(
            `[DB-OPERATION] ========== RECORD ${processedCount} DATABASE INSERT/UPDATE ==========`,
          );
          console.log(
            `[DB-OPERATION] Operation: INSERT with onConflictDoUpdate`,
          );
          console.log(`[DB-OPERATION] Target: merchants table`);
          console.log(`[DB-OPERATION] Conflict key: id = "${merchantData.id}"`);
          console.log(`[DB-OPERATION] Merchant ID: ${merchantData.id}`);
          console.log(`[DB-OPERATION] Merchant Name: ${merchantData.name}`);
          console.log(`[DB-OPERATION] Location fields being inserted:`);
          console.log(
            `[DB-OPERATION]   - address: "${merchantData.address || "NULL"}"`,
          );
          console.log(
            `[DB-OPERATION]   - city: "${merchantData.city || "NULL"}"`,
          );
          console.log(
            `[DB-OPERATION]   - state: "${merchantData.state || "NULL"}"`,
          );
          console.log(
            `[DB-OPERATION]   - zipCode: "${merchantData.zipCode || "NULL"}"`,
          );
          console.log(`[DB-OPERATION] DBA fields being inserted:`);
          console.log(
            `[DB-OPERATION]   - dbaAddressCity: "${merchantData.dbaAddressCity || "NULL"}"`,
          );
          console.log(
            `[DB-OPERATION]   - dbaAddressState: "${merchantData.dbaAddressState || "NULL"}"`,
          );
          console.log(
            `[DB-OPERATION]   - dbaZip: "${merchantData.dbaZip || "NULL"}"`,
          );
          console.log(
            `[DB-OPERATION] Total fields: ${Object.keys(merchantData).length}`,
          );
          console.log(
            `[DB-OPERATION] Field keys:`,
            Object.keys(merchantData).join(", "),
          );
        }

        // Insert or update merchant
        try {
          const result = await db
            .insert(merchants)
            .values(merchantData)
            .onConflictDoUpdate({
              target: merchants.id,
              set: merchantData,
            });

          if (isDebugRecord) {
            console.log(
              `[DB-OPERATION] ✅ SUCCESS - Merchant ${merchantData.id} inserted/updated`,
            );
            console.log(`[DB-OPERATION] Result:`, result);
            console.log("[DB-OPERATION] ========== END ==========");
          }

          imported++;
        } catch (dbError) {
          console.error(
            `[DB-OPERATION] ❌ FAILED - Database error for merchant ${merchantData.id}`,
          );
          console.error(
            `[DB-OPERATION] Error type: ${dbError instanceof Error ? dbError.constructor.name : typeof dbError}`,
          );
          console.error(
            `[DB-OPERATION] Error message:`,
            dbError instanceof Error ? dbError.message : dbError,
          );
          if (isDebugRecord) {
            console.error(
              `[DB-OPERATION] Stack trace:`,
              dbError instanceof Error ? dbError.stack : "N/A",
            );
            console.error(
              `[DB-OPERATION] Failed merchant data:`,
              JSON.stringify(merchantData, null, 2),
            );
          }
          console.log("[DB-OPERATION] ========== END ==========");

          // Track database error with context
          if (errorCategories.databaseErrors.length < 5) {
            errorCategories.databaseErrors.push({
              merchantId: String(merchantData.id),
              error:
                dbError instanceof Error ? dbError.message : String(dbError),
              rawLineSnippet: record._raw?.substring(0, 100) + "...",
            });
          }

          throw dbError; // Re-throw to be caught by outer try-catch
        }
      } catch (error) {
        console.error(`[MERCHANT-IMPORT] Error importing merchant:`, error);

        // Categorize general import errors with context
        const errorMsg = error instanceof Error ? error.message : String(error);
        const merchantId = record.id || record.accountNumber || "UNKNOWN";

        if (
          !errorCategories.databaseErrors.some(
            (e) => e.merchantId === String(merchantId),
          )
        ) {
          if (errorCategories.validationErrors.length < 5) {
            errorCategories.validationErrors.push({
              merchantId: String(merchantId),
              error: errorMsg,
              rawLineSnippet: record._raw?.substring(0, 100) + "...",
            });
          }
        }

        skipped++;
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // COMPREHENSIVE IMPORT SUMMARY STATISTICS
    console.log("[IMPORT-SUMMARY] ========================================");
    console.log("[IMPORT-SUMMARY] MERCHANT IMPORT COMPLETE");
    console.log("[IMPORT-SUMMARY] ========================================");
    console.log(
      `[IMPORT-SUMMARY] Processing Time: ${processingTimeMs}ms (${(processingTimeMs / 1000).toFixed(2)}s)`,
    );
    console.log(
      `[IMPORT-SUMMARY] Total Records: ${parseResult.records.length}`,
    );
    console.log(`[IMPORT-SUMMARY] Successfully Imported: ${imported}`);
    console.log(`[IMPORT-SUMMARY] Skipped: ${skipped}`);
    console.log(
      `[IMPORT-SUMMARY] Success Rate: ${((imported / parseResult.records.length) * 100).toFixed(1)}%`,
    );

    // ERROR CATEGORIZATION REPORT
    console.log("[IMPORT-SUMMARY] ========================================");
    console.log("[IMPORT-SUMMARY] ERROR BREAKDOWN BY CATEGORY");
    console.log("[IMPORT-SUMMARY] ========================================");

    console.log(
      `[IMPORT-SUMMARY] Parse Errors: ${errorCategories.parseErrors.length}`,
    );
    if (errorCategories.parseErrors.length > 0) {
      console.log("[IMPORT-SUMMARY] Sample parse errors:");
      errorCategories.parseErrors.slice(0, 3).forEach((sample, i) => {
        console.log(
          `[IMPORT-SUMMARY]   ${i + 1}. Merchant: ${sample.merchantId}`,
        );
        console.log(`[IMPORT-SUMMARY]      Error: ${sample.error}`);
        console.log(`[IMPORT-SUMMARY]      Line: ${sample.rawLineSnippet}`);
      });
    }

    console.log(
      `[IMPORT-SUMMARY] Date Parsing Errors: ${errorCategories.dateParsingErrors.length}`,
    );
    if (errorCategories.dateParsingErrors.length > 0) {
      console.log("[IMPORT-SUMMARY] Sample date errors:");
      errorCategories.dateParsingErrors.slice(0, 3).forEach((sample, i) => {
        console.log(
          `[IMPORT-SUMMARY]   ${i + 1}. Merchant: ${sample.merchantId}`,
        );
        console.log(`[IMPORT-SUMMARY]      Error: ${sample.error}`);
        console.log(`[IMPORT-SUMMARY]      Line: ${sample.rawLineSnippet}`);
      });
    }

    console.log(
      `[IMPORT-SUMMARY] Missing Required Fields: ${errorCategories.missingRequiredFields.length}`,
    );
    if (errorCategories.missingRequiredFields.length > 0) {
      console.log("[IMPORT-SUMMARY] Sample missing field errors:");
      errorCategories.missingRequiredFields.slice(0, 3).forEach((sample, i) => {
        console.log(
          `[IMPORT-SUMMARY]   ${i + 1}. Merchant: ${sample.merchantId}`,
        );
        console.log(`[IMPORT-SUMMARY]      Error: ${sample.error}`);
        console.log(`[IMPORT-SUMMARY]      Line: ${sample.rawLineSnippet}`);
      });
    }

    console.log(
      `[IMPORT-SUMMARY] Database Errors: ${errorCategories.databaseErrors.length}`,
    );
    if (errorCategories.databaseErrors.length > 0) {
      console.log("[IMPORT-SUMMARY] Sample database errors:");
      errorCategories.databaseErrors.slice(0, 3).forEach((sample, i) => {
        console.log(
          `[IMPORT-SUMMARY]   ${i + 1}. Merchant: ${sample.merchantId}`,
        );
        console.log(`[IMPORT-SUMMARY]      Error: ${sample.error}`);
        console.log(`[IMPORT-SUMMARY]      Line: ${sample.rawLineSnippet}`);
      });
    }

    console.log(
      `[IMPORT-SUMMARY] Validation Errors: ${errorCategories.validationErrors.length}`,
    );
    if (errorCategories.validationErrors.length > 0) {
      console.log("[IMPORT-SUMMARY] Sample validation errors:");
      errorCategories.validationErrors.slice(0, 3).forEach((sample, i) => {
        console.log(
          `[IMPORT-SUMMARY]   ${i + 1}. Merchant: ${sample.merchantId}`,
        );
        console.log(`[IMPORT-SUMMARY]      Error: ${sample.error}`);
        console.log(`[IMPORT-SUMMARY]      Line: ${sample.rawLineSnippet}`);
      });
    }

    console.log("[IMPORT-SUMMARY] ========================================");
    console.log("[IMPORT-SUMMARY] END OF SUMMARY");
    console.log("[IMPORT-SUMMARY] ========================================");

    return {
      success: true,
      totalRecords: parseResult.records.length,
      imported,
      skipped,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error(
      "[MERCHANT-IMPORT] Error processing merchant detail file:",
      error,
    );

    return {
      success: false,
      totalRecords: 0,
      imported: 0,
      skipped: 0,
      processingTimeMs,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
