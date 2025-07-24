/**
 * MMS Database Schema
 * Version: 2.4.0 (follows Semantic Versioning - see SCHEMA_VERSIONING_POLICY.md)
 * Last Updated: July 23, 2025
 * 
 * MINOR VERSION: Hierarchical TDDF Record Architecture
 * New Feature: Separate tables for each TDDF record type (BH, DT, P1/P2, AD/DR/G2/etc.) with hierarchical relationships while preserving all raw line processing data
 * 
 * Version History:
 * - 1.0.0: Initial schema with core merchant and transaction tables
 * - 1.1.0: Enhanced merchant fields with country support  
 * - 1.2.0: Added backup scheduling and S3 storage support
 * - 1.3.0: Comprehensive TDDF processing with terminals, raw import tables
 * - 2.0.0: NEW BASELINE - Database-based schema management, formal versioning policy, production-ready system
 * - 2.0.1: PATCH FIX - Corrected schema API to serve current version content, established automatic database sync
 * - 2.1.0: MINOR FEATURE - Enhanced schema update testing and production safety demonstration with dynamic version detection
 * - 2.1.2: MINOR FEATURE - Advanced schema versioning workflow testing and complete version mismatch detection validation
 * - 2.2.0: MINOR FEATURE - Universal raw data processing with raw_lines_count and processing_notes fields for comprehensive file diagnostics
 * - 2.3.0: MINOR FEATURE - Hidden millisecond sort values implementation for performance-optimized precise sorting with preserved user-friendly display
 */
import { pgTable, text, serial, integer, numeric, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Environment-specific table name helper
function getTableName(baseName: string): string {
  const NODE_ENV = typeof process !== 'undefined' ? process.env.NODE_ENV : 'production';
  const prefix = NODE_ENV === 'development' ? 'dev_' : '';
  return `${prefix}${baseName}`;
}

// Merchants table
export const merchants = pgTable(getTableName("merchants"), {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientMID: text("client_mid"),
  otherClientNumber1: text("other_client_number1"),
  otherClientNumber2: text("other_client_number2"),
  clientSinceDate: timestamp("client_since_date"),
  status: text("status").notNull().default("Pending"),
  merchantType: text("merchant_type"), // Can be blank, "0", "1", "2", "3", or custom text
  salesChannel: text("sales_channel"),
  association: text("association"), // Business association field
  mcc: text("mcc"), // Merchant Category Code
  masterMID: text("master_mid"), // Master Merchant ID for terminal linkage (now renamed to pos_merchant_number in terminals table)
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  country: text("country"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUploadDate: timestamp("last_upload_date"),
  asOfDate: timestamp("as_of_date"), // Date from demographic import
  editDate: timestamp("edit_date").defaultNow(), // System-controlled last edit date
  updatedBy: text("updated_by") // System-controlled field for tracking who made changes
});

// Terminals table - based on TSYS Merchant Export structure
export const terminals = pgTable(getTableName("terminals"), {
  id: serial("id").primaryKey(),
  vNumber: text("v_number").notNull().unique(), // VAR Number from TSYS (unique terminal identifier)
  posMerchantNumber: text("pos_merchant_number").notNull(), // Links to merchants.masterMID (POS Merchant # from TSYS)
  
  // Core TSYS fields
  bin: text("bin"), // Bank Identification Number
  dbaName: text("dba_name"), // Doing Business As name
  dailyAuth: text("daily_auth"), // Daily authorization limit
  dialPay: text("dial_pay"), // Dial payment configuration
  encryption: text("encryption"), // Payment encryption settings
  prr: text("prr"), // Processing rate/rule
  mcc: text("mcc"), // Merchant Category Code
  ssl: text("ssl"), // SSL security configuration
  tokenization: text("tokenization"), // Tokenization settings
  agent: text("agent"), // Agent information
  chain: text("chain"), // Chain store identifier
  store: text("store"), // Store number
  terminalInfo: text("terminal_info"), // Terminal information from TSYS
  recordStatus: text("record_status"), // Record status from TSYS
  boardDate: timestamp("board_date"), // Board date from TSYS
  terminalVisa: text("terminal_visa"), // Visa terminal settings
  
  // Additional management fields
  terminalType: text("terminal_type"), // countertop, mobile, virtual, integrated POS, etc.
  status: text("status").notNull().default("Active"), // Active, Inactive, Maintenance, Deployed
  location: text("location"), // Physical location description
  
  // Local information fields (database-only, not from external systems)
  mType: text("m_type"), // Local merchant type information
  mLocation: text("m_location"), // Local location information
  installationDate: timestamp("installation_date"), // When terminal was installed
  hardwareModel: text("hardware_model"), // Terminal hardware model
  manufacturer: text("manufacturer"), // Terminal manufacturer
  firmwareVersion: text("firmware_version"), // Current firmware version
  networkType: text("network_type"), // Connection type (ethernet, wifi, cellular, etc.)
  ipAddress: text("ip_address"), // IP address if applicable
  
  // Generic fields as requested
  genericField1: text("generic_field_1"), // Generic field for custom use
  genericField2: text("generic_field_2"), // Generic field for custom use
  
  // Description and notes fields
  description: text("description"), // Terminal description
  notes: text("notes"), // Additional notes about terminal
  internalNotes: text("internal_notes"), // Internal staff notes
  
  // Audit and logging fields
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"), // Who created this terminal record
  updatedBy: text("updated_by"), // Who last updated this terminal record
  lastActivity: timestamp("last_activity"), // For tracking terminal transaction activity (future use)
  lastUpdate: timestamp("last_update"), // For tracking when terminal record was last updated
  updateSource: text("update_source"), // Source of last update: "File: filename.csv" or "Form: admin"
  lastSyncDate: timestamp("last_sync_date"), // Last sync with TSYS
  syncStatus: text("sync_status").default("Pending") // Sync status with external systems
});

// Transactions table
export const transactions = pgTable(getTableName("transactions"), {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  type: text("type").notNull().default("Sale"),
  // Raw data preservation fields
  rawData: jsonb("raw_data"), // Store complete original CSV row as JSON
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id), // Link to source file
  sourceRowNumber: integer("source_row_number"), // Row number in original CSV
  recordedAt: timestamp("recorded_at").defaultNow().notNull() // When transaction record was added
});

// Uploaded files table 
export const uploadedFiles = pgTable(getTableName("uploaded_files"), {
  id: text("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path"),
  fileType: text("file_type").notNull(), // 'merchant', 'transaction', 'terminal', or 'tddf'
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
  processingErrors: text("processing_errors"),
  deleted: boolean("deleted").default(false).notNull(),
  // New fields for production file processing
  fileContent: text("file_content"), // Store file content for reliable processing
  fileSize: integer("file_size"), // Size of the file in bytes
  mimeType: text("mime_type"), // MIME type of the file
  processedAt: timestamp("processed_at"), // When the file was processed
  processingStatus: text("processing_status").default("queued").notNull(), // queued, processing, completed, failed
  processingStartedAt: timestamp("processing_started_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  processingServerId: text("processing_server_id"), // Which server is processing this file
  // Processing metrics
  recordsProcessed: integer("records_processed").default(0),
  recordsSkipped: integer("records_skipped").default(0),
  recordsWithErrors: integer("records_with_errors").default(0),
  processingTimeMs: integer("processing_time_ms"),
  processingDetails: text("processing_details"), // JSON string with detailed stats
  uploadEnvironment: text("upload_environment").notNull().default("production"), // Track which environment uploaded this file
  rawLinesCount: integer("raw_lines_count"), // Number of raw lines processed for diagnostics
  processingNotes: text("processing_notes") // Processing notes with field detection and analysis results
});

// Backup history table
export const backupHistory = pgTable("backup_history", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  size: integer("size").notNull(), // Changed from fileSize to size to match DB column
  tables: jsonb("tables").notNull(), // Changed from text to jsonb to match DB data type
  notes: text("notes"),
  downloaded: boolean("downloaded").default(false).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  storageType: text("storage_type").default("local").notNull(), // "local" or "s3"
  s3Bucket: text("s3_bucket"),
  s3Key: text("s3_key")
  // Fields below are not in the current DB schema, will be added later if needed
  // isScheduled: boolean("is_scheduled").default(false).notNull(),
  // scheduleId: integer("schedule_id"),
  // createdBy: text("created_by").default("system").notNull()
});

// Backup schedule table
export const backupSchedules = pgTable("backup_schedules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  frequency: text("frequency").notNull(), // "daily", "weekly", "monthly"
  time_of_day: text("time_of_day").notNull(), // HH:MM format in 24-hour time
  day_of_week: integer("day_of_week"), // 0-6 (Sunday to Saturday) for weekly backups
  day_of_month: integer("day_of_month"), // 1-31 for monthly backups
  enabled: boolean("enabled").default(true).notNull(),
  use_s3: boolean("use_s3").default(false).notNull(),
  retention_days: integer("retention_days").default(30).notNull(),
  last_run: timestamp("last_run"),
  next_run: timestamp("next_run"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  notes: text("notes")
});

// Schema version table
export const schemaVersions = pgTable("schema_versions", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(), // Semantic version (e.g., "1.0.0")
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  description: text("description").notNull(),
  changes: jsonb("changes"), // Schema changes in JSON format
  appliedBy: text("applied_by"),
  script: text("script") // Optional script used for the migration
});

// Schema content storage table - stores schema file content for viewing without file system access
export const schemaContent = pgTable("schema_content", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(), // Schema version this content represents
  content: text("content").notNull(), // Complete schema file content
  fileName: text("file_name").notNull().default("schema.ts"),
  storedAt: timestamp("stored_at").defaultNow().notNull(),
  storedBy: text("stored_by").default("Alex-ReplitAgent"),
  contentHash: text("content_hash"), // SHA256 hash for change detection
  notes: text("notes") // Optional notes about changes
});

// Zod schemas for merchants
export const merchantsSchema = createInsertSchema(merchants);
export const insertMerchantSchema = merchantsSchema.omit({ id: true });

// Zod schemas for transactions
export const transactionsSchema = createInsertSchema(transactions);
export const insertTransactionSchema = transactionsSchema.omit({ id: true });

// TDDF Batch Headers (BH) - Contains batch-level information that groups DT records
export const tddfBatchHeaders = pgTable(getTableName("tddf_batch_headers"), {
  id: serial("id").primaryKey(),
  
  // Unique BH record identifier to prevent duplicates and ensure all BH records load
  bhRecordNumber: text("bh_record_number").unique(), // Generated unique identifier for each BH record
  
  // Core TDDF header fields (positions 18-23)
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "BH"
  
  // Updated BH-specific fields based on TDDF specification
  transactionCode: text("transaction_code"), // Positions 52-55: Global Payments Transaction code (4 chars)
  batchDate: text("batch_date"), // Positions 56-60: Batch Date MMDDCCYY format (5 chars)
  batchJulianDate: text("batch_julian_date"), // Positions 61-65: Batch Julian Date DDDYY format (5 chars)
  netDeposit: numeric("net_deposit", { precision: 15, scale: 2 }), // Positions 69-83: Net Deposit amount (15 chars N)
  rejectReason: text("reject_reason"), // Positions 84-87: Global Payments Reject Reason Code (4 chars AN)
  
  // Merchant identification (keeping for existing data compatibility)
  merchantAccountNumber: text("merchant_account_number"), // GP account number for reference
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  bhRecordNumberIndex: index("tddf_bh_record_number_idx").on(table.bhRecordNumber),
  merchantAccountIndex: index("tddf_bh_merchant_account_idx").on(table.merchantAccountNumber),
  batchDateIndex: index("tddf_bh_batch_date_idx").on(table.batchDate),
  transactionCodeIndex: index("tddf_bh_transaction_code_idx").on(table.transactionCode)
}));

// TDDF Transaction Records (DT) - Main transaction records linked to batch headers
export const tddfTransactionRecords = pgTable(getTableName("tddf_transaction_records"), {
  id: serial("id").primaryKey(),
  
  // Link to batch header
  batchHeaderId: integer("batch_header_id").references(() => tddfBatchHeaders.id),
  
  // Core TDDF header fields (positions 1-23) - shared with all record types
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "DT"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Account and merchant fields (positions 24-61)
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39: GP account number
  associationNumber1: text("association_number_1"), // Positions 40-45: Association number
  groupNumber: text("group_number"), // Positions 46-51: Group number
  transactionCode: text("transaction_code"), // Positions 52-55: GP transaction code
  associationNumber2: text("association_number_2"), // Positions 56-61: Second association number
  
  // Core transaction fields (positions 62-142)
  referenceNumber: text("reference_number"), // Positions 62-84: Reference number (23 chars)
  transactionDate: timestamp("transaction_date"), // Positions 85-92: MMDDCCYY format
  transactionAmount: numeric("transaction_amount", { precision: 15, scale: 2 }), // Positions 93-103: Transaction amount
  batchJulianDate: text("batch_julian_date"), // Positions 104-108: Batch Julian date
  netDeposit: numeric("net_deposit", { precision: 15, scale: 2 }), // Positions 109-119: Net deposit amount
  cardholderAccountNumber: text("cardholder_account_number"), // Positions 120-135: Cardholder account
  
  // Transaction details (positions 143-187)
  bestInterchangeEligible: text("best_interchange_eligible"), // Positions 143-145: Best interchange eligible
  transactionDataConditionCode: text("transaction_data_condition_code"), // Positions 146-148: Transaction data condition
  downgradeReason1: text("downgrade_reason_1"), // Positions 149-151: First downgrade reason
  downgradeReason2: text("downgrade_reason_2"), // Positions 152-154: Second downgrade reason
  downgradeReason3: text("downgrade_reason_3"), // Positions 155-157: Third downgrade reason
  onlineEntry: text("online_entry"), // Positions 158-160: Online entry indicator
  achFlag: text("ach_flag"), // Positions 161-163: ACH flag
  authSource: text("auth_source"), // Positions 164-166: Authorization source
  cardholderIdMethod: text("cardholder_id_method"), // Positions 167-169: Cardholder ID method
  catIndicator: text("cat_indicator"), // Positions 170-172: CAT indicator
  reimbursementAttribute: text("reimbursement_attribute"), // Positions 173-175: Reimbursement attribute
  mailOrderTelephoneIndicator: text("mail_order_telephone_indicator"), // Positions 176-178: Mail order telephone indicator
  authCharInd: text("auth_char_ind"), // Positions 179-181: Authorization character indicator
  banknetReferenceNumber: text("banknet_reference_number"), // Positions 182-187: Banknet reference number
  
  // Additional transaction info (positions 188-242)
  draftAFlag: text("draft_a_flag"), // Positions 188-190: Draft A flag
  authCurrencyCode: text("auth_currency_code"), // Positions 191-193: Authorization currency code
  authAmount: numeric("auth_amount", { precision: 15, scale: 2 }), // Positions 192-203: Authorization amount
  validationCode: text("validation_code"), // Positions 204-207: Validation code
  authResponseCode: text("auth_response_code"), // Positions 208-209: Authorization response code
  networkIdentifierDebit: text("network_identifier_debit"), // Positions 210-211: Network identifier debit
  switchSettledIndicator: text("switch_settled_indicator"), // Positions 212-214: Switch settled indicator
  posEntryMode: text("pos_entry_mode"), // Positions 215-216: POS entry mode
  debitCreditIndicator: text("debit_credit_indicator"), // Positions 217-219: Debit/credit indicator
  reversalFlag: text("reversal_flag"), // Positions 220-222: Reversal flag
  merchantName: text("merchant_name"), // Positions 223-242: Merchant name (20 chars)
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  mmsRawLine: text("mms_raw_line"), // Custom MMS-RAW-Line field to store original line before processing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  referenceNumberIndex: index("tddf_dt_reference_number_idx").on(table.referenceNumber),
  merchantAccountIndex: index("tddf_dt_merchant_account_idx").on(table.merchantAccountNumber),
  transactionDateIndex: index("tddf_dt_transaction_date_idx").on(table.transactionDate),
  merchantNameIndex: index("tddf_dt_merchant_name_idx").on(table.merchantName),
  batchHeaderIndex: index("tddf_dt_batch_header_idx").on(table.batchHeaderId)
}));

// TDDF Purchasing Extensions (P1, P2) - Extended purchasing card data linked to transactions
export const tddfPurchasingExtensions = pgTable(getTableName("tddf_purchasing_extensions"), {
  id: serial("id").primaryKey(),
  
  // Link to parent transaction
  transactionRecordId: integer("transaction_record_id").references(() => tddfTransactionRecords.id),
  
  // Core TDDF header fields (positions 1-23) - shared with all record types
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: "P1" or "P2"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Purchasing card specific fields
  vatTaxAmount: numeric("vat_tax_amount", { precision: 15, scale: 2 }), // VAT tax amount
  productIdentifier: text("product_identifier"), // Product identifier
  productDescription: text("product_description"), // Product description
  unitCost: numeric("unit_cost", { precision: 15, scale: 2 }), // Unit cost
  quantity: numeric("quantity", { precision: 12, scale: 3 }), // Quantity
  unitOfMeasure: text("unit_of_measure"), // Unit of measure
  extendedItemAmount: numeric("extended_item_amount", { precision: 15, scale: 2 }), // Extended item amount
  discountAmount: numeric("discount_amount", { precision: 15, scale: 2 }), // Discount amount
  freightAmount: numeric("freight_amount", { precision: 15, scale: 2 }), // Freight amount
  dutyAmount: numeric("duty_amount", { precision: 15, scale: 2 }), // Duty amount
  destinationPostalCode: text("destination_postal_code"), // Destination postal code
  shipFromPostalCode: text("ship_from_postal_code"), // Ship from postal code
  destinationCountryCode: text("destination_country_code"), // Destination country code
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  transactionRecordIndex: index("tddf_pe_transaction_record_idx").on(table.transactionRecordId)
}));

// TDDF Other Records (AD, DR, G2, CT, LG, FT, F2, CK, HD, TR) - Catch-all table for other record types
export const tddfOtherRecords = pgTable(getTableName("tddf_other_records"), {
  id: serial("id").primaryKey(),
  
  // Optional link to transaction (for AD, DR records that relate to specific transactions)
  transactionRecordId: integer("transaction_record_id").references(() => tddfTransactionRecords.id),
  
  // Core TDDF header fields (positions 1-23) - shared with all record types
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: "AD", "DR", "G2", etc.
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Record type specific information
  recordType: text("record_type").notNull(), // AD, DR, G2, CT, LG, FT, F2, CK, HD, TR
  recordDescription: text("record_description"), // Human-readable description of record type
  
  // Flexible data storage for different record types
  recordData: jsonb("record_data"), // Structured data specific to each record type
  
  // Common fields that might appear across multiple record types
  merchantAccountNumber: text("merchant_account_number"), // Account number when applicable
  referenceNumber: text("reference_number"), // Reference number when applicable
  amount: numeric("amount", { precision: 15, scale: 2 }), // Amount when applicable
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  recordTypeIndex: index("tddf_or_record_type_idx").on(table.recordType),
  merchantAccountIndex: index("tddf_or_merchant_account_idx").on(table.merchantAccountNumber),
  transactionRecordIndex: index("tddf_or_transaction_record_idx").on(table.transactionRecordId)
}));

// Legacy TDDF Records table - keeping for backward compatibility and migration
export const tddfRecords = pgTable(getTableName("tddf_records"), {
  id: serial("id").primaryKey(),
  
  // Core TDDF header fields (positions 1-23)
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "DT"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Account and merchant fields (positions 24-61)
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39: GP account number
  associationNumber1: text("association_number_1"), // Positions 40-45: Association number
  groupNumber: text("group_number"), // Positions 46-51: Group number
  transactionCode: text("transaction_code"), // Positions 52-55: GP transaction code
  associationNumber2: text("association_number_2"), // Positions 56-61: Second association number
  
  // Core transaction fields (positions 62-142)
  referenceNumber: text("reference_number"), // Positions 62-84: Reference number (23 chars)
  transactionDate: timestamp("transaction_date"), // Positions 85-92: MMDDCCYY format
  transactionAmount: numeric("transaction_amount", { precision: 15, scale: 2 }), // Positions 93-103: Transaction amount
  batchJulianDate: text("batch_julian_date"), // Positions 104-108: DDDYY format
  netDeposit: numeric("net_deposit", { precision: 17, scale: 2 }), // Positions 109-123: Deposited amount
  cardholderAccountNumber: text("cardholder_account_number"), // Positions 124-142: Card account number
  
  // Transaction details (positions 143-187)
  bestInterchangeEligible: text("best_interchange_eligible"), // Positions 143-144
  transactionDataConditionCode: text("transaction_data_condition_code"), // Positions 145-146
  downgradeReason1: text("downgrade_reason_1"), // Positions 147-150
  downgradeReason2: text("downgrade_reason_2"), // Positions 151-154
  downgradeReason3: text("downgrade_reason_3"), // Positions 155-164
  onlineEntry: text("online_entry"), // Position 165
  achFlag: text("ach_flag"), // Position 166: Y/N
  authSource: text("auth_source"), // Position 167
  cardholderIdMethod: text("cardholder_id_method"), // Position 168
  catIndicator: text("cat_indicator"), // Position 169
  reimbursementAttribute: text("reimbursement_attribute"), // Position 170
  mailOrderTelephoneIndicator: text("mail_order_telephone_indicator"), // Position 171
  authCharInd: text("auth_char_ind"), // Position 172
  banknetReferenceNumber: text("banknet_reference_number"), // Positions 173-187
  
  // Additional transaction info (positions 188-242)
  draftAFlag: text("draft_a_flag"), // Position 188: Y/N
  authCurrencyCode: text("auth_currency_code"), // Positions 189-191
  authAmount: numeric("auth_amount", { precision: 14, scale: 2 }), // Positions 192-203
  validationCode: text("validation_code"), // Positions 204-207
  authResponseCode: text("auth_response_code"), // Positions 208-209
  networkIdentifierDebit: text("network_identifier_debit"), // Positions 210-212
  switchSettledIndicator: text("switch_settled_indicator"), // Position 213
  posEntryMode: text("pos_entry_mode"), // Positions 214-215
  debitCreditIndicator: text("debit_credit_indicator"), // Position 216: D/C
  reversalFlag: text("reversal_flag"), // Position 217
  merchantName: text("merchant_name"), // Positions 218-242: DBA name (25 chars)
  
  // Authorization and card details (positions 243-268)
  authorizationNumber: text("authorization_number"), // Positions 243-248
  rejectReason: text("reject_reason"), // Positions 249-252
  cardType: text("card_type"), // Positions 251-256: Updated to match PowerShell spec (2 chars to 6 chars)
  currencyCode: text("currency_code"), // Positions 255-257
  originalTransactionAmount: numeric("original_transaction_amount", { precision: 13, scale: 2 }), // Positions 258-268
  
  // Additional flags and codes (positions 269-284)
  foreignCardIndicator: text("foreign_card_indicator"), // Position 269
  carryoverIndicator: text("carryover_indicator"), // Position 270
  extensionRecordIndicator: text("extension_record_indicator"), // Positions 271-272
  mccCode: text("mcc_code"), // Positions 273-276: Merchant Category Code (4 chars)
  vNumber: text("v_number"), // Positions 277-284: V Number (8 chars) - matches PowerShell spec
  
  // Legacy terminalId field (keeping for backward compatibility)
  terminalId: text("terminal_id"), // Legacy field - use vNumber instead
  
  // Extended fields (positions 285-400+)
  discoverPosEntryMode: text("discover_pos_entry_mode"), // Positions 285-287
  purchaseId: text("purchase_id"), // Positions 288-312
  cashBackAmount: numeric("cash_back_amount", { precision: 11, scale: 2 }), // Positions 313-321
  cashBackAmountSign: text("cash_back_amount_sign"), // Position 322: +/-
  posDataCode: text("pos_data_code"), // Positions 323-335
  transactionTypeIdentifier: text("transaction_type_identifier"), // Positions 336-338
  cardTypeExtended: text("card_type_extended"), // Positions 339-341
  productId: text("product_id"), // Positions 342-343
  submittedInterchange: text("submitted_interchange"), // Positions 344-348
  systemTraceAuditNumber: text("system_trace_audit_number"), // Positions 349-354
  discoverTransactionType: text("discover_transaction_type"), // Positions 355-356
  localTransactionTime: text("local_transaction_time"), // Positions 357-362: HHMMSS
  discoverProcessingCode: text("discover_processing_code"), // Positions 363-368
  commercialCardServiceIndicator: text("commercial_card_service_indicator"), // Position 369
  
  // Fee and regulatory fields (positions 370-400+)
  mastercardCrossBorderFee: numeric("mastercard_cross_border_fee", { precision: 11, scale: 2 }), // Positions 370-378
  cardBrandFeeCode: text("card_brand_fee_code"), // Position 379
  dccIndicator: text("dcc_indicator"), // Position 380: U/E
  regulatedIndicator: text("regulated_indicator"), // Position 381
  visaIntegrityFee: numeric("visa_integrity_fee", { precision: 11, scale: 2 }), // Positions 382-390
  foreignExchangeFlag: text("foreign_exchange_flag"), // Position 391
  visaFeeProgramIndicator: text("visa_fee_program_indicator"), // Positions 392-394
  transactionFeeDebitCreditIndicator: text("transaction_fee_debit_credit_indicator"), // Positions 395-396
  transactionFeeAmount: numeric("transaction_fee_amount", { precision: 17, scale: 2 }), // Positions 397-413
  transactionFeeAmountCardholder: numeric("transaction_fee_amount_cardholder", { precision: 13, scale: 2 }), // Positions 414-424
  
  // IASF and additional fees (positions 425-500+)
  iasfFeeType: text("iasf_fee_type"), // Positions 425-426
  iasfFeeAmount: numeric("iasf_fee_amount", { precision: 13, scale: 2 }), // Positions 427-437
  iasfFeeDebitCreditIndicator: text("iasf_fee_debit_credit_indicator"), // Position 438
  merchantAssignedReferenceNumber: text("merchant_assigned_reference_number"), // Positions 439-450
  netDepositAdjustmentAmount: numeric("net_deposit_adjustment_amount", { precision: 17, scale: 0 }), // Positions 451-465
  netDepositAdjustmentDc: text("net_deposit_adjustment_dc"), // Position 466
  mcCashBackFee: text("mc_cash_back_fee"), // Positions 467-481
  mcCashBackFeeSign: text("mc_cash_back_fee_sign"), // Position 482
  
  // American Express fields (positions 483-628)
  amexIndustrySeNumber: text("amex_industry_se_number"), // Positions 483-492
  amexMerchantSellerId: text("amex_merchant_seller_id"), // Positions 493-512
  amexMerchantSellerName: text("amex_merchant_seller_name"), // Positions 513-537
  amexMerchantSellerAddress: text("amex_merchant_seller_address"), // Positions 538-562
  amexMerchantSellerPhone: text("amex_merchant_seller_phone"), // Positions 563-578
  amexMerchantSellerPostalCode: text("amex_merchant_seller_postal_code"), // Positions 579-588
  amexMerchantSellerEmail: text("amex_merchant_seller_email"), // Positions 589-628
  
  // Advanced transaction classification (positions 629-650+)
  mastercardTransactionIntegrityClass: text("mastercard_transaction_integrity_class"), // Positions 629-630
  equipmentSourceIdentification: text("equipment_source_identification"), // Positions 631-633
  operatorId: text("operator_id"), // Positions 634-636
  requestedPaymentService: text("requested_payment_service"), // Position 637
  totalAuthorizedAmount: numeric("total_authorized_amount", { precision: 14, scale: 0 }), // Positions 638-649
  interchangeFeeAmount: numeric("interchange_fee_amount", { precision: 17, scale: 2 }), // Positions 650-666
  mastercardWalletIdentifier: text("mastercard_wallet_identifier"), // Positions 667-669
  visaSpecialConditionIndicator: text("visa_special_condition_indicator"), // Position 670
  interchangePercentRate: numeric("interchange_percent_rate", { precision: 12, scale: 5 }), // Positions 671-676
  interchangePerItemRate: numeric("interchange_per_item_rate", { precision: 12, scale: 2 }), // Positions 677-682
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  mmsRawLine: text("mms_raw_line"), // Custom MMS-RAW-Line field to store original line before processing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  referenceNumberIndex: index("tddf_reference_number_idx").on(table.referenceNumber),
  merchantAccountIndex: index("tddf_merchant_account_idx").on(table.merchantAccountNumber),
  transactionDateIndex: index("tddf_transaction_date_idx").on(table.transactionDate),
  merchantNameIndex: index("tddf_merchant_name_idx").on(table.merchantName)
}));

// Zod schemas for uploaded files
export const uploadedFilesSchema = createInsertSchema(uploadedFiles);
export const insertUploadedFileSchema = uploadedFilesSchema.omit({ id: true });

// TDDF Raw Import table - stores all raw lines in order for reprocessing and linking
export const tddfRawImport = pgTable(getTableName("tddf_raw_import"), {
  id: serial("id").primaryKey(),
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id).notNull(),
  lineNumber: integer("line_number").notNull(), // Order of line in original file
  rawLine: text("raw_line").notNull(), // Complete original line as received
  recordType: text("record_type"), // BH, DT, A1, A2, P1, P2, DR, CT, LG, FT, F2, CK, AD
  recordDescription: text("record_description"), // Human-readable description
  lineLength: integer("line_length"), // Character count for validation
  processed: boolean("processed").default(false), // Whether this line has been processed
  processedAt: timestamp("processed_at"), // When it was processed
  processedIntoTable: text("processed_into_table"), // Which table it was processed into (e.g., 'tddf_records')
  processedRecordId: text("processed_record_id"), // ID of record created from this line
  skipReason: text("skip_reason"), // Why line was skipped (e.g., 'non_dt_record', 'too_short')
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  sourceFileLineIndex: index("tddf_raw_import_file_line_idx").on(table.sourceFileId, table.lineNumber),
  recordTypeIndex: index("tddf_raw_import_record_type_idx").on(table.recordType),
  processedIndex: index("tddf_raw_import_processed_idx").on(table.processed)
}));

// Zod schemas for TDDF Batch Headers
export const tddfBatchHeadersSchema = createInsertSchema(tddfBatchHeaders);
export const insertTddfBatchHeaderSchema = tddfBatchHeadersSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF Transaction Records
export const tddfTransactionRecordsSchema = createInsertSchema(tddfTransactionRecords);
export const insertTddfTransactionRecordSchema = tddfTransactionRecordsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF Purchasing Extensions
export const tddfPurchasingExtensionsSchema = createInsertSchema(tddfPurchasingExtensions);
export const insertTddfPurchasingExtensionSchema = tddfPurchasingExtensionsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF Other Records
export const tddfOtherRecordsSchema = createInsertSchema(tddfOtherRecords);
export const insertTddfOtherRecordSchema = tddfOtherRecordsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF records (legacy)
export const tddfRecordsSchema = createInsertSchema(tddfRecords);
export const insertTddfRecordSchema = tddfRecordsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF raw import
export const tddfRawImportSchema = createInsertSchema(tddfRawImport);
export const insertTddfRawImportSchema = tddfRawImportSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for backup history
export const backupHistorySchema = createInsertSchema(backupHistory);
export const insertBackupHistorySchema = backupHistorySchema.omit({ id: true });

// Zod schemas for backup schedules
export const backupSchedulesSchema = createInsertSchema(backupSchedules);
export const insertBackupScheduleSchema = backupSchedulesSchema;

// Zod schemas for schema versions
export const schemaVersionsSchema = createInsertSchema(schemaVersions);
export const insertSchemaVersionSchema = schemaVersionsSchema.omit({ id: true });

// Zod schemas for schema content
export const schemaContentSchema = createInsertSchema(schemaContent);
export const insertSchemaContentSchema = schemaContentSchema.omit({ id: true });

// Users table
export const users = pgTable(getTableName("users"), {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login")
});

// API Users table for TDDF uploader client keys
export const apiUsers = pgTable(getTableName("api_users"), {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(), // Friendly name for the client
  apiKey: text("api_key").notNull().unique(), // Generated API key
  description: text("description"), // Description of what this key is for
  permissions: text("permissions").array().notNull().default(['tddf:upload']), // Array of permissions
  isActive: boolean("is_active").notNull().default(true),
  lastUsed: timestamp("last_used"), // Track when key was last used
  requestCount: integer("request_count").notNull().default(0), // Track API usage
  createdBy: text("created_by").notNull(), // Which admin user created this key
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration date
  ipWhitelist: text("ip_whitelist").array(), // Optional IP restrictions
}, (table) => {
  return {
    apiKeyIdx: index("api_users_api_key_idx").on(table.apiKey),
    activeIdx: index("api_users_active_idx").on(table.isActive),
  };
});

// Zod schemas for users
export const usersSchema = createInsertSchema(users);
export const insertUserSchema = usersSchema.omit({ id: true, createdAt: true, lastLogin: true });

// Extended user schema with validation
export const userValidationSchema = insertUserSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Zod schemas for API users
export const apiUsersSchema = createInsertSchema(apiUsers);
export const insertApiUserSchema = apiUsersSchema.omit({ 
  id: true, 
  apiKey: true, 
  createdAt: true, 
  lastUsed: true, 
  requestCount: true 
});

// Types for API users
export type ApiUser = typeof apiUsers.$inferSelect;
export type InsertApiUser = z.infer<typeof insertApiUserSchema>;

// Export types
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = typeof uploadedFiles.$inferInsert;
export type BackupHistory = typeof backupHistory.$inferSelect;
export type InsertBackupHistory = typeof backupHistory.$inferInsert;
export type SchemaVersion = typeof schemaVersions.$inferSelect;
export type InsertSchemaVersion = typeof schemaVersions.$inferInsert;
export type BackupSchedule = typeof backupSchedules.$inferSelect;
export type InsertBackupSchedule = typeof backupSchedules.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TDDF Table Types
export type TddfBatchHeader = typeof tddfBatchHeaders.$inferSelect;
export type InsertTddfBatchHeader = typeof tddfBatchHeaders.$inferInsert;
export type TddfTransactionRecord = typeof tddfTransactionRecords.$inferSelect;
export type InsertTddfTransactionRecord = typeof tddfTransactionRecords.$inferInsert;
export type TddfPurchasingExtension = typeof tddfPurchasingExtensions.$inferSelect;
export type InsertTddfPurchasingExtension = typeof tddfPurchasingExtensions.$inferInsert;
export type TddfOtherRecord = typeof tddfOtherRecords.$inferSelect;
export type InsertTddfOtherRecord = typeof tddfOtherRecords.$inferInsert;

// Legacy TDDF types (for backward compatibility)
export type TddfRecord = typeof tddfRecords.$inferSelect;
export type InsertTddfRecord = typeof tddfRecords.$inferInsert;
export type TddfRawImport = typeof tddfRawImport.$inferSelect;
export type InsertTddfRawImport = typeof tddfRawImport.$inferInsert;
export type Terminal = typeof terminals.$inferSelect;
export type InsertTerminal = typeof terminals.$inferInsert;

// Audit log table with performance optimizations
export const auditLogs = pgTable(getTableName("audit_logs"), {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "merchant" or "transaction"
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // "create", "update", "delete"
  userId: integer("user_id").references(() => users.id),
  username: text("username").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  oldValues: jsonb("old_values"), // Store previous values as JSON
  newValues: jsonb("new_values"), // Store new values as JSON
  changedFields: text("changed_fields").array(), // Array of field names that were changed
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  notes: text("notes")
}, (table) => {
  return {
    // Create indexes for better query performance
    entityTypeIdx: index("audit_logs_entity_type_idx").on(table.entityType),
    entityIdIdx: index("audit_logs_entity_id_idx").on(table.entityId),
    timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
    userIdIdx: index("audit_logs_user_id_idx").on(table.userId)
  };
});

// Zod schemas for audit logs
export const auditLogsSchema = createInsertSchema(auditLogs);
export const insertAuditLogSchema = auditLogsSchema.omit({ id: true });

// Export audit log types
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// System log table for technical operational events
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  level: text("level").notNull(), // "info", "warning", "error", "critical"
  source: text("source").notNull(), // Component/module that generated the log
  message: text("message").notNull(),
  details: jsonb("details"), // Additional structured data about the event
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  hostname: text("hostname"), // Server name/identifier
  processId: text("process_id"), // Process identifier
  sessionId: text("session_id"), // Optional session identifier
  correlationId: text("correlation_id"), // For tracking related events
  stackTrace: text("stack_trace") // For errors
}, (table) => {
  return {
    // Create indexes for better query performance
    levelIdx: index("system_logs_level_idx").on(table.level),
    sourceIdx: index("system_logs_source_idx").on(table.source),
    timestampIdx: index("system_logs_timestamp_idx").on(table.timestamp)
  };
});

// Zod schemas for system logs
export const systemLogsSchema = createInsertSchema(systemLogs);
export const insertSystemLogSchema = systemLogsSchema.omit({ id: true });

// Export system log types
export type SystemLog = typeof systemLogs.$inferSelect;
export type InsertSystemLog = typeof systemLogs.$inferInsert;

// Security log table for authentication and access events
export const securityLogs = pgTable("security_logs", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(), // "login", "logout", "access_denied", "permission_change", etc.
  userId: integer("user_id").references(() => users.id),
  username: text("username"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  resourceType: text("resource_type"), // Type of resource being accessed
  resourceId: text("resource_id"), // ID of the resource being accessed
  action: text("action"), // Action being performed
  result: text("result").notNull(), // "success", "failure", etc.
  details: jsonb("details"), // Additional details about the security event
  sessionId: text("session_id"), // Session identifier
  reason: text("reason") // Especially for failures/denials
}, (table) => {
  return {
    // Create indexes for better query performance
    eventTypeIdx: index("security_logs_event_type_idx").on(table.eventType),
    usernameIdx: index("security_logs_username_idx").on(table.username),
    timestampIdx: index("security_logs_timestamp_idx").on(table.timestamp),
    resultIdx: index("security_logs_result_idx").on(table.result)
  };
});

// Zod schemas for security logs
export const securityLogsSchema = createInsertSchema(securityLogs);
export const insertSecurityLogSchema = securityLogsSchema.omit({ id: true });

// Export security log types
export type SecurityLog = typeof securityLogs.$inferSelect;
export type InsertSecurityLog = typeof securityLogs.$inferInsert;

// Processing performance metrics for persistent tracking (environment-specific)
export const processingMetrics = pgTable(getTableName("processing_metrics"), {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  transactionsPerSecond: numeric("transactions_per_second", { precision: 8, scale: 2 }).notNull(),
  peakTransactionsPerSecond: numeric("peak_transactions_per_second", { precision: 8, scale: 2 }).notNull(),
  recordsPerMinute: numeric("records_per_minute", { precision: 8, scale: 2 }).notNull().default('0'),
  peakRecordsPerMinute: numeric("peak_records_per_minute", { precision: 8, scale: 2 }).notNull().default('0'),
  totalFiles: integer("total_files").notNull(),
  queuedFiles: integer("queued_files").notNull(),
  processedFiles: integer("processed_files").notNull(),
  filesWithErrors: integer("files_with_errors").notNull(),
  currentlyProcessing: integer("currently_processing").notNull(),
  averageProcessingTimeMs: integer("average_processing_time_ms"),
  systemStatus: text("system_status").notNull().default("idle"), // idle, processing, paused
  metricType: text("metric_type").notNull().default("snapshot"), // snapshot, peak_update, hourly_summary
  notes: text("notes"),
  // Raw line processing tracking
  rawLinesProcessed: integer("raw_lines_processed").default(0),
  rawLinesSkipped: integer("raw_lines_skipped").default(0),
  rawLinesTotal: integer("raw_lines_total").default(0)
}, (table) => {
  return {
    // Create indexes for better query performance
    timestampIdx: index("processing_metrics_timestamp_idx").on(table.timestamp),
    metricTypeIdx: index("processing_metrics_type_idx").on(table.metricType),
    systemStatusIdx: index("processing_metrics_status_idx").on(table.systemStatus)
  };
});

// Zod schemas for processing metrics
export const processingMetricsSchema = createInsertSchema(processingMetrics);
export const insertProcessingMetricsSchema = processingMetricsSchema.omit({ id: true });

// Export processing metrics types
export type ProcessingMetrics = typeof processingMetrics.$inferSelect;
export type InsertProcessingMetrics = typeof processingMetrics.$inferInsert;

// Terminal schema for validation and types - handles string dates from forms
export const insertTerminalSchema = createInsertSchema(terminals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUpdate: true,
  updateSource: true,
  createdBy: true,
  updatedBy: true
}).extend({
  // Override date fields to accept strings from forms
  boardDate: z.union([z.date(), z.string()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') {
      return val === '' ? undefined : new Date(val);
    }
    return val;
  }),
  installationDate: z.union([z.date(), z.string()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') {
      return val === '' ? undefined : new Date(val);
    }
    return val;
  }),
  lastActivity: z.union([z.date(), z.string()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') {
      return val === '' ? undefined : new Date(val);
    }
    return val;
  }),
  lastSyncDate: z.union([z.date(), z.string()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') {
      return val === '' ? undefined : new Date(val);
    }
    return val;
  })
});
// Remove duplicate Terminal type declarations - they are defined below
