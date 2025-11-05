/**
 * MMS Database Schema
 * Version: 2.8.0 (follows Semantic Versioning - see SCHEMA_VERSIONING_POLICY.md)
 * Last Updated: July 30, 2025
 * 
 * MINOR VERSION: Comprehensive Pre-Caching Tables System for Performance Optimization
 * New Features: Comprehensive TSYS merchant risk report fields integration including bank identifiers, risk assessment metrics, bypass controls, amount thresholds, compliance status, and enhanced risk management capabilities
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
 * - 2.4.0: MINOR FEATURE - Hierarchical TDDF Record Architecture with separate tables for each TDDF record type and comprehensive raw line processing data preservation
 * - 2.5.0: MINOR FEATURE - Emergency Processing Recovery & Zero Backlog Achievement with SQL batch processing, load management, duplicate conflict resolution, and production-ready emergency protocols
 * - 2.6.0: MINOR FEATURE - Complete AD/DR Record Type Frontend Implementation with comprehensive tabbed interface, pagination, detailed view modals, and professional styling
 * - 2.7.0: MINOR FEATURE - Production Deployment Schema Synchronization with complete P1 purchasing extension fields (34 total fields), missing production tables creation, and comprehensive schema alignment for seamless deployment
 * - 2.7.1: PATCH - Pre-deployment validation and schema synchronization fix for production readiness with comprehensive environment detection improvements  
 * - 2.8.0: MINOR FEATURE - Comprehensive Pre-Caching Tables System with dedicated page-specific tables, last update date/time tracking, metadata capture, and standardized performance optimization architecture
 */
import { pgTable, text, serial, integer, numeric, timestamp, date, boolean, jsonb, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Environment-specific table name helper
// EXPORTED: Use this helper for ALL raw SQL queries to ensure environment-aware table naming
export function getTableName(baseName: string): string {
  // FIXED: Use TABLE_PREFIX env var with deterministic fallback for DrizzleKit consistency
  const TABLE_PREFIX = typeof process !== 'undefined' ? process.env.TABLE_PREFIX : 'dev_';
  const prefix = TABLE_PREFIX || 'dev_'; // Default to dev_ to match existing database
  return `${prefix}${baseName}`;
}

// Alias for convenience in server code
export const tableName = getTableName;



// Merchants table
export const merchants = pgTable(getTableName("merchants"), {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientMID: text("client_mid"),
  otherClientNumber1: text("other_client_number1"),
  otherClientNumber2: text("other_client_number2"),
  clientSinceDate: timestamp("client_since_date"),
  status: text("status").notNull().default("Pending"),
  merchantStatus: text("merchant_status"), // TSYS merchant status code (I/F/S/Z/C/D/B or blank)
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
  updatedBy: text("updated_by"), // System-controlled field for tracking who made changes
  
  // TSYS Merchant Risk Report Fields
  bank: text("bank"), // Bank identifier
  associateMerchantNumber: text("associate_merchant_number"), // Associate merchant number
  dbaNameCwob: text("dba_name_cwob"), // DBA Name CWOB
  cwobDebitRisk: text("cwob_debit_risk"), // CWOB Debit Risk
  vwobEbtReturn: text("vwob_ebt_return"), // VWOB EBT Return
  bypassEa: text("bypass_ea"), // Bypass EA
  bypassCo: text("bypass_co"), // Bypass Co
  merchantRecordSt: text("merchant_record_st"), // Merchant Record Status
  boardDt: timestamp("board_dt"), // Board Date
  saleAmt: numeric("sale_amt", { precision: 15, scale: 2 }), // Sale Amount
  creditAmt: numeric("credit_amt", { precision: 15, scale: 2 }), // Credit Amount
  negativeAmount: numeric("negative_amount", { precision: 15, scale: 2 }), // Negative Amount
  numberO: text("number_o"), // Number O field
  bypassForce: text("bypass_force"), // Bypass Force
  feeVisa: numeric("fee_visa", { precision: 15, scale: 2 }), // Fee Visa
  visaMcc: text("visa_mcc"), // Visa MCC
  dailyAuthLimit: numeric("daily_auth_limit", { precision: 15, scale: 2 }), // Daily Auth Limit
  bypassEx: text("bypass_ex"), // Bypass Ex
  excessiveDepositAmount: numeric("excessive_deposit_amount", { precision: 15, scale: 2 }), // Excessive Deposit Amount
  threshold: numeric("threshold", { precision: 15, scale: 2 }), // Threshold amount
  
  // Additional risk assessment fields
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }), // Overall risk score
  riskLevel: text("risk_level"), // Low, Medium, High, Critical
  lastRiskAssessment: timestamp("last_risk_assessment"), // Last risk assessment date
  riskFlags: text("risk_flags").array(), // Array of risk flag indicators
  complianceStatus: text("compliance_status"), // Compliance status
  reviewRequired: boolean("review_required").default(false), // Manual review flag
  riskNotes: text("risk_notes"), // Risk assessment notes
  
  // TSYS MCC Schema Fields (MMS-enabled fields only - 51 fields)
  bankNumber: text("bank_number"), // The merchant's bank number
  groupLevel1: text("group_level_1"), // The group number in which the association points to
  associationNumber: text("association_number"), // The identification number of an association
  accountNumber: text("account_number"), // The TSYS Acquiring Solutions account number
  associationName: text("association_name"), // The name of the association
  groupLevel1Name: text("group_level_1_name"), // The name of the group
  sic: text("sic"), // Standard Industry Classification
  class: text("class"), // MCC (Merchant Category Code)
  dbaName: text("dba_name"), // The trade name under which merchants operate
  dbaAddressCity: text("dba_address_city"), // The city from where merchants operate
  dbaAddressState: text("dba_address_state"), // The state code associated with merchant's business
  dbaZip: text("dba_zip"), // The ZIP code of merchant's business location
  phone1: text("phone_1"), // The merchant's phone number
  phone2: text("phone_2"), // The merchant's phone number
  businessLicense: text("business_license"), // The business license number
  bankOfficer1: text("bank_officer_1"), // Bank officer who approved merchant
  bankOfficer2: text("bank_officer_2"), // Bank officer who approved DDA
  federalTaxId: text("federal_tax_id"), // The merchant federal tax ID
  stateTaxId: text("state_tax_id"), // The merchant state tax ID
  merchantTypeField: text("merchant_type_field"), // Merchant type from MCC schema
  ownerName: text("owner_name"), // Owner name
  managerName: text("manager_name"), // Manager name
  lastActivityDate: timestamp("last_activity_date"), // Last activity date
  dailyFeeIndicator: text("daily_fee_indicator"), // Daily fee indicator
  mcRegId: text("mc_reg_id"), // MC Reg ID
  customerServiceNumber: text("customer_service_number"), // Customer service number
  updateDateTime: timestamp("update_date_time"), // Update date time stamp
  statusChangeDate: timestamp("status_change_date"), // Status change date
  discoverMapFlag: text("discover_map_flag"), // Discover MAP Flag
  amexOptblueFlag: text("amex_optblue_flag"), // Amex OptBlue Flag
  visaDescriptor: text("visa_descriptor"), // Visa Descriptor
  mcDescriptor: text("mc_descriptor"), // MC Descriptor
  url: text("url"), // URL
  closeDate: timestamp("close_date"), // Close date
  dateOfLastAuth: timestamp("date_of_last_auth"), // Date of last auth
  dunsNumber: text("duns_number"), // DUNS Number
  printStatementIndicator: text("print_statement_indicator"), // Print statement indicator
  visaBin: text("visa_bin"), // Visa BIN
  mcBin: text("mc_bin"), // MC BIN
  mcIca: text("mc_ica"), // MC ICA
  amexCapId: text("amex_cap_id"), // Amex CAP ID
  discoverAiid: text("discover_aiid"), // Discover AIID
  ddaNumber: text("dda_number"), // DDA Number
  transitRoutingNumber: text("transit_routing_number"), // Transit Routing Number
  exposureAmount: text("exposure_amount"), // Exposure Amount
  merchantActivationDate: timestamp("merchant_activation_date"), // Merchant Activation Date
  dateOfFirstDeposit: timestamp("date_of_first_deposit"), // Date of First Deposit
  dateOfLastDeposit: timestamp("date_of_last_deposit"), // Date of Last Deposit
  transDestination: text("trans_destination"), // Trans Destination
  merchantEmailAddress: text("merchant_email_address"), // Merchant Email Address
  chargebackEmailAddress: text("chargeback_email_address") // Chargeback Email Address
}, (table) => ({
  // Time-based analytics indexes
  createdAtIdx: index("merchants_created_at_idx").on(table.createdAt),
  lastUploadDateIdx: index("merchants_last_upload_date_idx").on(table.lastUploadDate),
  clientSinceDateIdx: index("merchants_client_since_date_idx").on(table.clientSinceDate),
  lastActivityDateIdx: index("merchants_last_activity_date_idx").on(table.lastActivityDate),
  merchantActivationDateIdx: index("merchants_merchant_activation_date_idx").on(table.merchantActivationDate),
  dateOfFirstDepositIdx: index("merchants_date_of_first_deposit_idx").on(table.dateOfFirstDeposit),
  dateOfLastDepositIdx: index("merchants_date_of_last_deposit_idx").on(table.dateOfLastDeposit),
  // Composite indexes for common query patterns
  statusCreatedAtIdx: index("merchants_status_created_at_idx").on(table.status, table.createdAt),
  merchantTypeLastUploadIdx: index("merchants_type_last_upload_idx").on(table.merchantType, table.lastUploadDate)
}));

// API Merchants table - for merchant imports from file uploads (ACH merchants)
export const apiMerchants = pgTable(getTableName("api_merchants"), {
  id: text("id").primaryKey(),
  name: text("name"),
  status: text("status"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUploadDate: timestamp("last_upload_date"),
  clientMid: text("client_mid"),
  otherClientNumber1: text("other_client_number1"),
  otherClientNumber2: text("other_client_number2"),
  clientSinceDate: timestamp("client_since_date"),
  country: text("country").default("USA"),
  editDate: timestamp("edit_date"),
  merchantType: text("merchant_type").default("ACH"),
  salesChannel: text("sales_channel"),
  asOfDate: timestamp("as_of_date"),
  updatedBy: text("updated_by").default("VSB_UPLOAD"),
  searchIndex: text("search_index"),
  association: text("association"),
  mcc: text("mcc"),
  masterMid: text("master_mid"),
  bank: text("bank").default("Valley State Bank"),
  associateMerchantNumber: text("associate_merchant_number"),
  dbaNameCwob: text("dba_name_cwob"),
  cwobDebitRisk: text("cwob_debit_risk"),
  vwobEbtReturn: text("vwob_ebt_return"),
  bypassEa: text("bypass_ea"),
  bypassCo: text("bypass_co"),
  merchantRecordSt: text("merchant_record_st").default("A"),
  boardDt: timestamp("board_dt"),
  saleAmt: numeric("sale_amt", { precision: 15, scale: 2 }).default("0.00"),
  creditAmt: numeric("credit_amt", { precision: 15, scale: 2 }).default("0.00"),
  negativeAmount: numeric("negative_amount", { precision: 15, scale: 2 }),
  numberO: text("number_o"),
  bypassForce: text("bypass_force"),
  feeVisa: numeric("fee_visa", { precision: 15, scale: 2 }).default("0.00"),
  visaMcc: text("visa_mcc"),
  dailyAuthLimit: numeric("daily_auth_limit", { precision: 15, scale: 2 }),
  bypassEx: text("bypass_ex"),
  excessiveDepositAmount: numeric("excessive_deposit_amount", { precision: 15, scale: 2 }),
  threshold: numeric("threshold", { precision: 15, scale: 2 }),
  riskScore: numeric("risk_score", { precision: 5, scale: 2 }).default("0"),
  riskLevel: text("risk_level").default("LOW"),
  lastRiskAssessment: timestamp("last_risk_assessment"),
  riskFlags: text("risk_flags").array(),
  complianceStatus: text("compliance_status").default("COMPLIANT"),
  reviewRequired: boolean("review_required").default(false),
  riskNotes: text("risk_notes")
});

// API Terminals table - based on TSYS Merchant Export structure
export const apiTerminals = pgTable(getTableName("api_terminals"), {
  id: serial("id").primaryKey(),
  vNumber: text("v_number").notNull().unique(), // VAR Number from TSYS (unique terminal identifier)
  posMerchantNumber: text("pos_merchant_number"), // Optional - Links to merchants.masterMID (POS Merchant # from TSYS)
  
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
  
  // Extended payment processing fields from comprehensive specification
  bankNumber: text("bank_number"), // Bank identification number
  associationNumber1: text("association_number_1"), // Association mapping
  transactionCode: text("transaction_code"), // Processing codes
  authSource: text("auth_source"), // Authorization source
  networkIdentifierDebit: text("network_identifier_debit"), // Network routing
  posEntryMode: text("pos_entry_mode"), // Entry method capability
  authResponseCode: text("auth_response_code"), // Response handling
  validationCode: text("validation_code"), // Transaction validation
  catIndicator: text("cat_indicator"), // Cardholder authentication capability
  onlineEntry: text("online_entry"), // Online processing capability
  achFlag: text("ach_flag"), // ACH capability flag
  cardholderIdMethod: text("cardholder_id_method"), // ID verification method
  terminalId: text("terminal_id"), // Terminal hardware ID
  discoverPosEntryMode: text("discover_pos_entry_mode"), // Discover network entry mode
  purchaseId: text("purchase_id"), // Purchase identification capability
  posDataCode: text("pos_data_code"), // POS configuration code
  
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
  termNumber: text("term_number"), // Terminal number (renamed from generic_field_1)
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
  // FIXED: Match existing database structure - integer auto-increment ID
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id"), // Match database field
  amount: text("amount").notNull(), // Match database field (text, not numeric)
  date: timestamp("date").defaultNow().notNull(),
  type: text("type").notNull().default("Sale"),
  createdAt: timestamp("created_at").defaultNow(), // Match database field
  traceNumber: text("trace_number"), // Match database field
  company: text("company"), // Match database field  
  code: text("code"), // Match database field
  // Raw data preservation fields
  rawData: jsonb("raw_data"), // Store complete original CSV row as JSON
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id), // Link to source file
  sourceRowNumber: integer("source_row_number"), // Row number in original CSV
  recordedAt: timestamp("recorded_at").defaultNow().notNull(), // When transaction record was added
  
  // NEW: Autonumber + filename-based duplicate prevention fields
  sourceFilename: text("source_filename"), // Direct filename tracking (no join required)
  sourceFileHash: text("source_file_hash"), // File integrity checking
  updatedAt: timestamp("updated_at").defaultNow() // Update tracking
}, (table) => ({
  // NEW: Unique constraint for duplicate prevention using filename + line
  uniqueFilenameLine: unique().on(table.sourceFilename, table.sourceRowNumber)
}));

// ACH Transactions table - imported from uploader system
export const apiAchTransactions = pgTable(getTableName("api_achtransactions"), {
  id: text("id").primaryKey(), // Text ID from uploader system
  merchantName: text("merchant_name"),
  merchantId: text("merchant_id"),
  accountNumber: text("account_number"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  transactionDate: date("transaction_date"),
  code: text("code"),
  description: text("description"),
  company: text("company"),
  traceNumber: text("trace_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  fileSource: text("file_source") // Source CSV filename
});

// Uploaded files table - PRODUCTION-COMPATIBLE ID TYPE
export const uploadedFiles = pgTable(getTableName("uploaded_files"), {
  id: text("id").primaryKey(), // TEXT TYPE matches production (dev uses serial but we preserve compatibility)
  filename: text("filename"), // Added for dev compatibility 
  originalFilename: text("original_filename").notNull(),
  filePath: text("file_path"), // Added for dev compatibility
  fileSize: integer("file_size"), // File size in bytes
  storagePath: text("storage_path"),
  fileType: text("file_type").notNull(), // 'merchant', 'transaction', 'terminal', or 'tddf'
  status: text("status"), // Added for dev compatibility
  createdAt: timestamp("created_at"), // Added for dev compatibility
  updatedAt: timestamp("updated_at"), // Added for dev compatibility
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
  processingErrors: text("processing_errors"),
  deleted: boolean("deleted").default(false).notNull(),
  // Additional dev fields
  metadata: jsonb("metadata"), // Added for dev compatibility
  businessDay: date("business_day"), // Added for dev compatibility 
  fileDate: date("file_date"), // Added for dev compatibility
  // New fields for production file processing
  fileContent: text("file_content"), // Store file content for reliable processing
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
  processingNotes: text("processing_notes"), // Processing notes with field detection and analysis results
  // Additional dev compatibility fields
  processedBy: text("processed_by"), // Who processed the file
  tags: text("tags").array(), // Array of tags for categorization
  notes: text("notes") // General notes about the file
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

export const apiAchTransactionsSchema = createInsertSchema(apiAchTransactions);
export const insertApiAchTransactionSchema = apiAchTransactionsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// TDDF Batch Headers (BH) - Contains batch-level information that groups DT records
export const tddfBatchHeaders = pgTable(getTableName("tddf_batch_headers"), {
  id: serial("id").primaryKey(),
  
  // Unique BH record identifier to prevent duplicates and ensure all BH records load
  bhRecordNumber: text("bh_record_number").unique(), // Generated unique identifier for each BH record
  
  // Core TDDF header fields (positions 1-23) - aligned with encoder
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "BH"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Bank and account fields (positions 24-55) - aligned with encoder
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39: GP account number (16 chars)
  associationNumber: text("association_number"), // Positions 40-45: Association ID (6 chars)
  groupNumber: text("group_number"), // Positions 46-51: Group number (6 chars)
  transactionCode: text("transaction_code"), // Positions 52-55: GP transaction code (4 chars)
  
  // Batch information (positions 56-126) - aligned with encoder
  batchDate: text("batch_date"), // Positions 56-63: Batch Date MMDDCCYY format (8 chars)
  batchJulianDate: text("batch_julian_date"), // Positions 64-68: Batch Julian Date DDDYY format (5 chars)
  netDeposit: numeric("net_deposit", { precision: 15, scale: 2 }), // Positions 69-83: Net Deposit amount (15 chars N)
  rejectReason: text("reject_reason"), // Positions 84-87: Global Payments Reject Reason Code (4 chars AN)
  batchId: text("batch_id"), // Positions 124-126: Batch ID (3 chars)
  
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
  transactionDate: date("transaction_date"), // Positions 85-92: MMDDCCYY format (stored as date)
  transactionAmount: numeric("transaction_amount", { precision: 15, scale: 2 }), // Positions 93-103: Transaction amount
  batchJulianDate: text("batch_julian_date"), // Positions 104-108: DDDYY format
  netDeposit: numeric("net_deposit", { precision: 17, scale: 2 }), // Positions 109-123: Net deposit amount
  cardholderAccountNumber: text("cardholder_account_number"), // Positions 124-142: Cardholder account
  
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
  
  // Core TDDF header fields (positions 1-23) - aligned with encoder
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "P1"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Account and merchant fields (positions 24-55) - aligned with encoder
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39: GP account number (16 chars)
  associationNumber: text("association_number"), // Positions 40-45: Association number (6 chars)
  groupNumber: text("group_number"), // Positions 46-51: Group number (6 chars)
  transactionCode: text("transaction_code"), // Positions 52-55: GP transaction code (4 chars)
  
  // P1 Purchasing Card Level 1 Data (corrected positions 56+)
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }), // Positions 56-67: Tax amount (12 chars)
  taxRate: numeric("tax_rate", { precision: 7, scale: 4 }), // Positions 68-74: Tax rate (7 chars)
  taxType: text("tax_type"), // Position 75: Tax type indicator (1 char)
  
  // Purchasing Card Level 2 Data (corrected positions 76+)
  purchaseIdentifier: text("purchase_identifier"), // Positions 76-100: Purchase identifier (25 chars)
  customerCode: text("customer_code"), // Positions 101-125: Customer code (25 chars)  
  salesTax: numeric("sales_tax", { precision: 12, scale: 2 }), // Positions 90-101: Sales tax amount
  freightAmount: numeric("freight_amount", { precision: 12, scale: 2 }), // Positions 114-125: Freight amount
  destinationZip: text("destination_zip"), // Positions 126-135: Destination ZIP
  merchantType: text("merchant_type"), // Positions 136-139: Merchant type
  dutyAmount: numeric("duty_amount", { precision: 12, scale: 2 }), // Positions 140-151: Duty amount
  merchantTaxId: text("merchant_tax_id"), // Positions 152-161: Merchant tax ID
  shipFromZipCode: text("ship_from_zip_code"), // Positions 162-171: Ship from ZIP
  nationalTaxIncluded: text("national_tax_included"), // Position 172: National tax included
  nationalTaxAmount: numeric("national_tax_amount", { precision: 12, scale: 2 }), // Positions 173-184: National/ALT tax amount
  otherTax: numeric("other_tax", { precision: 12, scale: 2 }), // Positions 185-196: Other tax
  destinationCountryCode: text("destination_country_code"), // Positions 197-199: Destination country code
  merchantReferenceNumber: text("merchant_reference_number"), // Positions 200-216: Merchant reference number
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }), // Positions 217-228: Discount amount
  merchantVatRegistration: text("merchant_vat_registration"), // Positions 229-248: Merchant VAT registration
  customerVatRegistration: text("customer_vat_registration"), // Positions 249-261: Customer VAT registration
  summaryCommodityCode: text("summary_commodity_code"), // Positions 262-265: Summary commodity code
  vatInvoiceReferenceNumber: text("vat_invoice_reference_number"), // Positions 266-280: VAT invoice reference number
  orderDate: text("order_date"), // Positions 281-286: Order date (MMDDYY)
  detailRecordToFollow: text("detail_record_to_follow"), // Position 287: Detail record to follow
  
  // Additional fields added for production deployment schema synchronization
  destinationPostalCode: text("destination_postal_code"), // Destination postal code
  shipFromPostalCode: text("ship_from_postal_code"), // Ship from postal code
  uniqueInvoiceIdentifier: text("unique_invoice_identifier"), // Unique invoice identifier
  commodityCode: text("commodity_code"), // Commodity code
  unitOfMeasure: text("unit_of_measure"), // Unit of measure
  unitCost: text("unit_cost"), // Unit cost
  discountIndicator: text("discount_indicator"), // Discount indicator
  discountAmountCurrencyCode: text("discount_amount_currency_code"), // Discount amount currency code
  discountRate: text("discount_rate"), // Discount rate
  freightAmountCurrencyCode: text("freight_amount_currency_code"), // Freight amount currency code
  dutyAmountCurrencyCode: text("duty_amount_currency_code"), // Duty amount currency code
  destinationCountrySubdivisionCode: text("destination_country_subdivision_code"), // Destination country subdivision code
  shipFromCountrySubdivisionCode: text("ship_from_country_subdivision_code"), // Ship from country subdivision code
  itemDescription: text("item_description"), // Item description
  productCode: text("product_code"), // Product code
  quantity: text("quantity"), // Quantity
  
  // Note: Core TDDF header fields already defined above (bankNumber, merchantAccountNumber, etc.)
  
  // Reserved for future use (positions 288-700)
  reservedFutureUse: text("reserved_future_use"), // Positions 288-700: Reserved for future use
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  mmsRawLine: text("mms_raw_line"), // Custom MMS-RAW-Line field to store original line before processing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  transactionRecordIndex: index("tddf_pe_transaction_record_idx").on(table.transactionRecordId),
  recordIdentifierIndex: index("tddf_pe_record_identifier_idx").on(table.recordIdentifier)
}));

// Pre-cached TDDF Merchants table for performance optimization
export const tddfMerchantsCache = pgTable(getTableName("tddf_merchants_cache"), {
  id: serial("id").primaryKey(),
  merchantName: text("merchant_name").notNull(),
  merchantAccountNumber: text("merchant_account_number").notNull().unique(),
  mccCode: text("mcc_code"),
  transactionTypeIdentifier: text("transaction_type_identifier"),
  terminalCount: integer("terminal_count").default(0),
  totalTransactions: integer("total_transactions").default(0),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).default("0.00"),
  lastTransactionDate: timestamp("last_transaction_date"),
  posRelativeCode: text("pos_relative_code"), // First 5 digits of account for terminal linking
  firstTransactionDate: timestamp("first_transaction_date"),
  averageTransactionAmount: numeric("average_transaction_amount", { precision: 15, scale: 2 }).default("0.00"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  merchantAccountNumberIdx: index("tddf_merchants_cache_merchant_account_number_idx").on(table.merchantAccountNumber),
  merchantNameIdx: index("tddf_merchants_cache_merchant_name_idx").on(table.merchantName),
  mccCodeIdx: index("tddf_merchants_cache_mcc_code_idx").on(table.mccCode),
  totalTransactionsIdx: index("tddf_merchants_cache_total_transactions_idx").on(table.totalTransactions),
  totalAmountIdx: index("tddf_merchants_cache_total_amount_idx").on(table.totalAmount),
  terminalCountIdx: index("tddf_merchants_cache_terminal_count_idx").on(table.terminalCount),
}));

// TDDF Purchasing Card 2 Extensions (P2) - Item-level purchasing card data with VAT and discount details
export const tddfPurchasingExtensions2 = pgTable(getTableName("tddf_purchasing_extensions_2"), {
  id: serial("id").primaryKey(),
  
  // Link to parent transaction
  transactionRecordId: integer("transaction_record_id").references(() => tddfTransactionRecords.id),
  
  // Core TDDF header fields (positions 1-23) - shared with all record types
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "P2"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Account and merchant fields (positions 24-55)
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39: GP account number (16 chars N)
  associationNumber: text("association_number"), // Positions 40-45: Association ID (6 chars AN)
  groupNumber: text("group_number"), // Positions 46-51: Group number (6 chars AN)
  transactionCode: text("transaction_code"), // Positions 52-55: GP transaction code (4 chars N)
  
  // Reserved area (positions 56-74)
  reservedFutureUse1: text("reserved_future_use_1"), // Positions 56-74: Reserved for future use (19 chars AN)
  
  // Discount information (positions 75-84)
  discountAmountIndicator: text("discount_amount_indicator"), // Position 75: Discount applicable indicator (1 char N)
  discountAmount: numeric("discount_amount", { precision: 9, scale: 2 }), // Positions 76-84: Discount amount (9 chars N, format: 999999999)
  
  // Tax and identification (positions 85-114)
  alternateTaxIdentifier: text("alternate_tax_identifier"), // Positions 85-99: Alternate tax identifier (15 chars AN)
  productCode: text("product_code"), // Positions 100-111: Product code for VS/MC (12 chars AN)
  reservedFutureUse2: text("reserved_future_use_2"), // Positions 112-114: Reserved for future use (3 chars AN)
  
  // Item details (positions 115-185)
  itemDescription: text("item_description"), // Positions 115-149: Item description (35 chars AN)
  itemQuantity: numeric("item_quantity", { precision: 12, scale: 0 }), // Positions 150-161: Item quantity (12 chars N, format: 999999999999)
  itemUnitOfMeasure: numeric("item_unit_of_measure", { precision: 12, scale: 0 }), // Positions 162-173: Unit of measure (12 chars N, format: 999999999999)
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }), // Positions 174-185: Unit cost (12 chars N, format: 999999999999)
  
  // VAT and financial details (positions 186-235)
  netGrossIndicator: text("net_gross_indicator"), // Position 186: Net/Gross indicator for extended amount (1 char N)
  vatRateApplied: numeric("vat_rate_applied", { precision: 5, scale: 4 }), // Positions 187-191: VAT rate applied (5 chars N, format: 9999)
  vatTypeApplied: text("vat_type_applied"), // Positions 192-195: VAT type applied/rating (4 chars AN)
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }), // Positions 196-207: VAT amount MC/VS (12 chars N, format: 999999999999)
  debitCreditIndicator: text("debit_credit_indicator"), // Position 208: Debit/Credit indicator (1 char AN) - D=Debit, C=Credit
  typeOfSupply: text("type_of_supply"), // Positions 209-210: Type of supply (2 chars AN)
  extensionRecordIndicator: text("extension_record_indicator"), // Position 211: Extension record indicator (1 char AN)
  itemCommodityCode: numeric("item_commodity_code", { precision: 12, scale: 0 }), // Positions 212-223: Item commodity code (12 chars N)
  lineItemTotal: numeric("line_item_total", { precision: 12, scale: 2 }), // Positions 224-235: Line item total (12 chars N, format: 999999999999)
  
  // Item descriptor and reserved area (positions 236-700)
  itemDescriptor: text("item_descriptor"), // Positions 236-261: Item descriptor (26 chars AN)
  reservedFutureUse3: text("reserved_future_use_3"), // Positions 262-700: Reserved for future use (439 chars AN)
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  mmsRawLine: text("mms_raw_line"), // Custom MMS-RAW-Line field to store original line before processing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  transactionRecordIndex: index("tddf_pe2_transaction_record_idx").on(table.transactionRecordId),
  merchantAccountIndex: index("tddf_pe2_merchant_account_idx").on(table.merchantAccountNumber),
  recordIdentifierIndex: index("tddf_pe2_record_identifier_idx").on(table.recordIdentifier),
  itemDescriptionIndex: index("tddf_pe2_item_description_idx").on(table.itemDescription)
}));

// TDDF Merchant General Data 2 (E1) - EMV merchant data records
export const tddfMerchantGeneralData2 = pgTable(getTableName("tddf_merchant_general_data_2"), {
  id: serial("id").primaryKey(),
  
  // Core TDDF header fields (positions 1-23) - shared with all record types
  sequenceNumber: text("sequence_number"), // Positions 1-7: File position identifier
  entryRunNumber: text("entry_run_number"), // Positions 8-13: Entry run number
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17: Sequence within entry run
  recordIdentifier: text("record_identifier"), // Positions 18-19: Always "E1"
  bankNumber: text("bank_number"), // Positions 20-23: Global Payments bank number
  
  // Merchant identification (positions 24-51)
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39: GP account number (16 chars N)
  associationNumber: text("association_number"), // Positions 40-45: Association ID (6 chars AN)
  groupNumber: text("group_number"), // Positions 46-51: Group number (6 chars AN)
  transactionCode: text("transaction_code"), // Positions 52-55: GP transaction code (4 chars N)
  
  // EMV Transaction Data (positions 56-82)
  emvTranType: text("emv_tran_type"), // Positions 56-57: EMV Transaction Type (2 chars CH)
  emvTermCapProfile: text("emv_term_cap_profile"), // Positions 58-63: EMV Terminal Capability Profile (6 chars CH)
  emvAppTranCounter: text("emv_app_tran_counter"), // Positions 64-67: EMV Application Transaction Counter (4 chars CH)
  emvCryptogramAmount: numeric("emv_cryptogram_amount", { precision: 15, scale: 2 }), // Positions 68-82: EMV Cryptogram Amount (15 chars N)
  
  // EMV Script and Application Data (positions 83-196)
  emvIssScriptResults: text("emv_iss_script_results"), // Positions 83-132: EMV Issuer Script Results (50 chars CH)
  emvIssAppData: text("emv_iss_app_data"), // Positions 133-196: EMV Issuer Application Data (64 chars CH)
  
  // EMV Card and Terminal Data (positions 197-232)
  emvCardSequenceNumber: text("emv_card_sequence_number"), // Positions 197-200: EMV Card Sequence Number (4 chars CH)
  emvTermCountryCode: text("emv_term_country_code"), // Positions 201-204: EMV Terminal Country Code (4 chars CH)
  emvAppInterchangeProfile: text("emv_app_interchange_profile"), // Positions 205-208: EMV Application Interchange Profile (4 chars CH)
  emvTermVerifyResults: text("emv_term_verify_results"), // Positions 209-218: EMV Terminal Verify Results (10 chars CH)
  emvTermTranDate: text("emv_term_tran_date"), // Positions 219-224: EMV Terminal Transaction Date (6 chars CH)
  emvUnpredictableNumber: text("emv_unpredictable_number"), // Positions 225-232: EMV Unpredictable Number (8 chars CH)
  
  // EMV Cryptogram and Form Factor (positions 233-256)
  emvCryptogram: text("emv_cryptogram"), // Positions 233-248: EMV Cryptogram (16 chars CH)
  emvFormFactorIndicator: text("emv_form_factor_indicator"), // Positions 249-256: EMV Form Factor Indicator (8 chars CH)
  
  // EMV Currency and Files (positions 257-292)
  emvTranCurrencyCode: text("emv_tran_currency_code"), // Positions 257-260: EMV Transaction Currency Code (4 chars CH)
  emvDedFileName: text("emv_ded_file_name"), // Positions 261-292: EMV DED File Name (32 chars CH)
  
  // EMV Authorization and Processing Data (positions 293-340)
  emvIssAuthData: text("emv_iss_auth_data"), // Positions 293-324: EMV Issuer Authorization Data (32 chars CH)
  emvTranCatCode: text("emv_tran_cat_code"), // Positions 325-326: EMV Transaction CAT Code (2 chars CH)
  emvCryptInfoData: text("emv_crypt_info_data"), // Positions 327-330: EMV Cryptogram Information Data (4 chars CH)
  emvTermType: text("emv_term_type"), // Positions 331-332: EMV Terminal Type (2 chars CH)
  emvTransactionSequenceNumber: text("emv_transaction_sequence_number"), // Positions 333-340: EMV Transaction Sequence Number (8 chars CH)
  
  // EMV Amount Fields (positions 341-366)
  emvAmountAuthorized: numeric("emv_amount_authorized", { precision: 13, scale: 2 }), // Positions 341-353: EMV Amount Authorized (13 chars N)
  emvAmountOther: numeric("emv_amount_other", { precision: 13, scale: 2 }), // Positions 354-366: EMV Amount Other (13 chars N)
  
  // EMV CVM and Interface Data (positions 367-392)
  emvCvmResult: text("emv_cvm_result"), // Positions 367-372: EMV CVM Result (6 chars CH)
  emvInterfaceDevSerial: text("emv_interface_dev_serial"), // Positions 373-388: EMV Interface Device Serial (16 chars CH)
  emvTerminalApplicationVersion: text("emv_terminal_application_version"), // Positions 389-392: EMV Terminal Application Version (4 chars CH)
  
  // EMV Final Fields and Reserved (positions 393-700)
  emvCryptogramInformation: text("emv_cryptogram_information"), // Positions 393-394: EMV Cryptogram Information (2 chars CH)
  reservedFutureUse: text("reserved_future_use"), // Positions 395-700: Reserved for future use (306 chars CH)
  
  // System and audit fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete fixed-width record for reference
  mmsRawLine: text("mms_raw_line"), // Custom MMS-RAW-Line field to store original line before processing
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  merchantAccountIndex: index("tddf_mgd2_merchant_account_idx").on(table.merchantAccountNumber),
  recordIdentifierIndex: index("tddf_mgd2_record_identifier_idx").on(table.recordIdentifier),
  associationNumberIndex: index("tddf_mgd2_association_number_idx").on(table.associationNumber),
  transactionCodeIndex: index("tddf_mgd2_transaction_code_idx").on(table.transactionCode)
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
  transactionDate: date("transaction_date"), // Positions 85-92: MMDDCCYY format (stored as date)
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
  rejectReason: text("reject_reason"), // Positions 249-250
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

// Zod schemas for TDDF Purchasing Extensions (P1)
export const tddfPurchasingExtensionsSchema = createInsertSchema(tddfPurchasingExtensions);
export const insertTddfPurchasingExtensionSchema = tddfPurchasingExtensionsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF Purchasing Extensions 2 (P2)
export const tddfPurchasingExtensions2Schema = createInsertSchema(tddfPurchasingExtensions2);
export const insertTddfPurchasingExtension2Schema = tddfPurchasingExtensions2Schema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF Merchant General Data 2
export const tddfMerchantGeneralData2Schema = createInsertSchema(tddfMerchantGeneralData2);
export const insertTddfMerchantGeneralData2Schema = tddfMerchantGeneralData2Schema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF Other Records
export const tddfOtherRecordsSchema = createInsertSchema(tddfOtherRecords);
export const insertTddfOtherRecordSchema = tddfOtherRecordsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF records (legacy)
export const tddfRecordsSchema = createInsertSchema(tddfRecords);
export const insertTddfRecordSchema = tddfRecordsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF raw import
export const tddfRawImportSchema = createInsertSchema(tddfRawImport);
export const insertTddfRawImportSchema = tddfRawImportSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for TDDF merchants cache
export const tddfMerchantsCacheSchema = createInsertSchema(tddfMerchantsCache);
export const insertTddfMerchantsCacheSchema = tddfMerchantsCacheSchema.omit({ id: true, createdAt: true });

// TypeScript types for TDDF merchants cache
export type TddfMerchantCache = typeof tddfMerchantsCache.$inferSelect;
export type InsertTddfMerchantCache = z.infer<typeof insertTddfMerchantsCacheSchema>;

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
  developerFlag: boolean("developer_flag").default(false),
  defaultDashboard: text("default_dashboard").default("main").notNull(), // "main" or "monthly"
  themePreference: text("theme_preference").default("light").notNull(), // "light" or "dark"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login")
});

// API Users table for TDDF uploader client keys
export const apiUsers = pgTable(getTableName("api_users"), {
  id: serial("id").primaryKey(),
  username: text("username").notNull(), // Friendly name for the client (matches existing DB column)
  apiKey: text("api_key").notNull().unique(), // Generated API key
  description: text("description"), // Description of what this key is for
  permissions: jsonb("permissions"), // JSONB permissions (matches existing DB column)
  isActive: boolean("is_active"), // Active status
  createdAt: timestamp("created_at"), // Creation timestamp
  lastUsed: timestamp("last_used"), // Track when key was last used
  requestCount: integer("request_count").default(0), // Track API usage
}, (table) => {
  return {
    apiKeyIdx: index("api_users_api_key_idx").on(table.apiKey),
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
export type ApiAchTransaction = typeof apiAchTransactions.$inferSelect;
export type InsertApiAchTransaction = typeof apiAchTransactions.$inferInsert;
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
export type TddfPurchasingExtension2 = typeof tddfPurchasingExtensions2.$inferSelect;
export type InsertTddfPurchasingExtension2 = typeof tddfPurchasingExtensions2.$inferInsert;
export type TddfMerchantGeneralData2 = typeof tddfMerchantGeneralData2.$inferSelect;
export type InsertTddfMerchantGeneralData2 = typeof tddfMerchantGeneralData2.$inferInsert;
export type TddfOtherRecord = typeof tddfOtherRecords.$inferSelect;
export type InsertTddfOtherRecord = typeof tddfOtherRecords.$inferInsert;

// Legacy TDDF types (for backward compatibility)
export type TddfRecord = typeof tddfRecords.$inferSelect;
export type InsertTddfRecord = typeof tddfRecords.$inferInsert;
export type TddfRawImport = typeof tddfRawImport.$inferSelect;
export type InsertTddfRawImport = typeof tddfRawImport.$inferInsert;
export type Terminal = typeof apiTerminals.$inferSelect;
export type InsertTerminal = typeof apiTerminals.$inferInsert;

// Audit log table with performance optimizations (supports merchant, transaction, and file deletion tracking)
export const auditLogs = pgTable(getTableName("audit_logs"), {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // "merchant", "transaction", "uploader_upload", etc.
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // "create", "update", "delete", "soft_delete", "purge", "restore"
  userId: integer("user_id").references(() => users.id),
  username: text("username").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  oldValues: jsonb("old_values"), // Store previous values as JSON
  newValues: jsonb("new_values"), // Store new values as JSON
  changedFields: text("changed_fields").array(), // Array of field names that were changed
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  notes: text("notes"),
  // Additional context for file deletions (filename, size, record counts)
  fileMetadata: jsonb("file_metadata") // Stores filename, fileSize, recordCounts for uploader_upload deletions
}, (table) => {
  return {
    // Create indexes for better query performance
    entityTypeIdx: index("audit_logs_entity_type_idx").on(table.entityType),
    entityIdIdx: index("audit_logs_entity_id_idx").on(table.entityId),
    timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
    userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
    actionIdx: index("audit_logs_action_idx").on(table.action)
  };
});

// Zod schemas for audit logs
export const auditLogsSchema = createInsertSchema(auditLogs);
export const insertAuditLogSchema = auditLogsSchema.omit({ id: true });

// Export audit log types
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// MMSUploader uploads table for compressed JSON uploads and dynamic schema testing
export const uploads = pgTable("uploads", {
  id: text("id").primaryKey(), // String ID for upload identification
  filename: text("filename").notNull(), // Original filename
  compressedPayload: jsonb("compressed_payload").notNull(), // Compressed JSON data
  schemaInfo: jsonb("schema_info"), // Schema information for validation
  uploadDate: timestamp("upload_date").defaultNow().notNull(), // Upload timestamp
  status: text("status").default("pending").notNull(), // Processing status
  processedAt: timestamp("processed_at"), // Processing completion timestamp
  recordCount: integer("record_count"), // Number of records processed
  processingTimeMs: integer("processing_time_ms"), // Processing time in milliseconds
  notes: text("notes") // Additional processing notes
}, (table) => ({
  statusIdx: index("uploads_status_idx").on(table.status),
  uploadDateIdx: index("uploads_upload_date_idx").on(table.uploadDate),
  filenameIdx: index("uploads_filename_idx").on(table.filename)
}));

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

// Zod schemas for uploads table
export const uploadsSchema = createInsertSchema(uploads);
export const insertUploadSchema = uploadsSchema.omit({ id: true, uploadDate: true });

// Export upload types
export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;

// =============================================================================
// MERCHANT TERMINAL CROSS-REFERENCE TABLE
// =============================================================================

// SubMerchantTerminals cross-reference table for linking merchants with terminals via fuzzy name matching
export const subMerchantTerminals = pgTable(getTableName("sub_merchant_terminals"), {
  id: serial("id").primaryKey(), // TermID - unique identifier
  deviceName: text("device_name").notNull(), // DeviceName - terminal device name
  dNumber: text("d_number").notNull(), // D_Number - Terminal Number (maps to terminal.v_number)
  merchantId: text("merchant_id").references(() => merchants.id), // Link to merchant table
  terminalId: integer("terminal_id").references(() => apiTerminals.id), // Link to API terminals table
  matchType: text("match_type"), // Type of match: "exact", "fuzzy", "manual"
  matchScore: numeric("match_score", { precision: 5, scale: 2 }), // Fuzzy match confidence score (0.00-1.00)
  fuzzyMatchDetails: jsonb("fuzzy_match_details"), // Details about the fuzzy matching process
  isActive: boolean("is_active").default(true).notNull(), // Whether this cross-reference is active
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"), // User who created this cross-reference
  notes: text("notes") // Additional notes about the linking
}, (table) => ({
  deviceNameIdx: index("sub_merchant_terminals_device_name_idx").on(table.deviceName),
  dNumberIdx: index("sub_merchant_terminals_d_number_idx").on(table.dNumber),
  merchantIdIdx: index("sub_merchant_terminals_merchant_id_idx").on(table.merchantId),
  terminalIdIdx: index("sub_merchant_terminals_terminal_id_idx").on(table.terminalId),
  matchTypeIdx: index("sub_merchant_terminals_match_type_idx").on(table.matchType),
  activeIdx: index("sub_merchant_terminals_active_idx").on(table.isActive)
}));

// Zod schemas for SubMerchantTerminals
export const subMerchantTerminalsSchema = createInsertSchema(subMerchantTerminals);
export const insertSubMerchantTerminalSchema = subMerchantTerminalsSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

// Export SubMerchantTerminals types
export type SubMerchantTerminal = typeof subMerchantTerminals.$inferSelect;
export type InsertSubMerchantTerminal = z.infer<typeof insertSubMerchantTerminalSchema>;

// =============================================================================
// MMS UPLOADER SYSTEM TABLES
// =============================================================================
// Parallel upload system with 4-phase processing: Started -> Uploading -> Uploaded -> Identified

// Phase 1-4: Main uploader uploads table
export const uploaderUploads = pgTable(getTableName("uploader_uploads"), {
  id: text("id").primaryKey(), // String ID for upload identification
  filename: text("filename").notNull(), // Original filename
  fileSize: integer("file_size"), // File size in bytes
  
  // Comprehensive Status Date Tracking
  // Upload Phase Tracking
  uploadStart: timestamp("upload_start"), // When upload process began
  uploadComplete: timestamp("upload_complete"), // When upload finished
  uploadedLineCount: integer("uploaded_line_count"), // Number of lines in uploaded file
  
  // Identify Phase Tracking  
  identifyStart: timestamp("identify_start"), // When identification process began
  identifyComplete: timestamp("identify_complete"), // When identification finished
  
  // Encoding Phase Tracking
  encodingStart: timestamp("encoding_start"), // When encoding process began
  encodingComplete: timestamp("encoding_complete"), // When encoding finished
  encodedLines: integer("encoded_lines"), // Number of lines that were encoded
  
  // Business day extracted from filename (MMDDYYYY format)
  businessDay: date("business_day"), // Extracted business day from filename during identification
  
  // TDDF filename metadata (extracted during identification)
  fileSequenceNumber: text("file_sequence_number"), // Sequence number from TDDF filename (e.g., 830, 2400)
  fileProcessingTime: text("file_processing_time"), // Processing time from TDDF filename (e.g., HHMMSS format)
  
  // Phase 1: Started
  startTime: timestamp("start_time").defaultNow().notNull(), // When upload was initiated
  
  // Phase 2: Uploading
  uploadStartedAt: timestamp("upload_started_at"), // When actual file transfer began
  uploadProgress: integer("upload_progress").default(0), // Upload progress 0-100
  chunkedUpload: boolean("chunked_upload").default(false), // Whether using chunked upload
  chunkCount: integer("chunk_count"), // Total number of chunks (if chunked)
  chunksUploaded: integer("chunks_uploaded").default(0), // Number of chunks uploaded
  
  // Phase 3: Uploaded  
  uploadedAt: timestamp("uploaded_at"), // When file upload completed
  storagePath: text("storage_path"), // S3 object key/path where file is permanently stored
  s3Bucket: text("s3_bucket"), // S3 bucket name where file is stored
  s3Key: text("s3_key"), // S3 object key for file retrieval
  s3Url: text("s3_url"), // Full S3 URL for file access
  s3Etag: text("s3_etag"), // S3 ETag for file integrity verification
  uploadStatus: text("upload_status").default("started").notNull(), // started, uploading, uploaded, failed
  
  // Phase 4: Identified
  identifiedAt: timestamp("identified_at"), // When file analysis completed
  detectedFileType: text("detected_file_type"), // auto-detected file type
  userClassifiedType: text("user_classified_type"), // user-override type
  finalFileType: text("final_file_type"), // final determined type
  lineCount: integer("line_count"), // Number of lines in file
  dataSize: integer("data_size"), // Analyzed data size
  hasHeaders: boolean("has_headers"), // Whether file has header row
  fileFormat: text("file_format"), // csv, fixed-width, json, etc.
  
  // Phase 5: Encoding
  encodingStartedAt: timestamp("encoding_started_at"), // When encoding process began
  encodingCompletedAt: timestamp("encoding_completed_at"), // When encoding finished
  encodingTimeMs: integer("encoding_time_ms"), // Time taken for encoding process
  encodingStatus: text("encoding_status"), // pending, processing, completed, failed
  jsonRecordsCreated: integer("json_records_created"), // Number of JSON records created
  tddfRecordsCreated: integer("tddf_records_created"), // Number of TDDF records created (for TDDF files)
  bhRecordCount: integer("bh_record_count"), // Batch Header record count
  dtRecordCount: integer("dt_record_count"), // Detail Transaction record count
  otherRecordCount: integer("other_record_count"), // Other record types (P1, P2, etc.)
  fieldSeparationStrategy: text("field_separation_strategy"), // Method used for field separation
  encodingErrors: jsonb("encoding_errors"), // Array of encoding errors/warnings
  healthMetadata: jsonb("health_metadata"), // Encoding health and quality metrics
  
  // Metadata and error handling
  compressionUsed: text("compression_used"), // gzip, none, etc.
  encodingDetected: text("encoding_detected"), // utf-8, ascii, etc.
  validationErrors: jsonb("validation_errors"), // Array of validation issues
  processingNotes: text("processing_notes"), // General processing notes
  processingLogPath: text("processing_log_path"), // Path to processing log file in object storage (for merchant detail files)
  
  // System tracking
  createdBy: text("created_by"), // Username who uploaded
  serverId: text("server_id"), // Which server handled upload
  sessionId: text("session_id"), // Session identifier
  
  // Review mode control
  keepForReview: boolean("keep_for_review").default(false), // Whether to hold at uploaded phase for manual review
  
  // Current processing state
  currentPhase: text("current_phase").default("started").notNull(), // started, uploading, uploaded, identified, hold, encoding, processing, completed, failed
  statusMessage: text("status_message"), // User-friendly status message for current phase
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  
  // Archive tracking
  isArchived: boolean("is_archived").default(false).notNull(), // Whether file has been archived
  archivedAt: timestamp("archived_at"), // When file was marked as archived
  archivedBy: text("archived_by"), // Username who archived the file
  
  // Soft-delete tracking
  deletedAt: timestamp("deleted_at"), // When file was soft-deleted
  deletedBy: text("deleted_by") // Username who deleted the file
}, (table) => ({
  currentPhaseIdx: index("uploader_uploads_current_phase_idx").on(table.currentPhase),
  uploadStatusIdx: index("uploader_uploads_upload_status_idx").on(table.uploadStatus),
  startTimeIdx: index("uploader_uploads_start_time_idx").on(table.startTime),
  filenameIdx: index("uploader_uploads_filename_idx").on(table.filename),
  createdByIdx: index("uploader_uploads_created_by_idx").on(table.createdBy),
  finalFileTypeIdx: index("uploader_uploads_final_file_type_idx").on(table.finalFileType),
  // Time-based analytics indexes
  uploadedAtIdx: index("uploader_uploads_uploaded_at_idx").on(table.uploadedAt),
  encodingStartedAtIdx: index("uploader_uploads_encoding_started_at_idx").on(table.encodingStartedAt),
  encodingCompletedAtIdx: index("uploader_uploads_encoding_completed_at_idx").on(table.encodingCompletedAt),
  identifiedAtIdx: index("uploader_uploads_identified_at_idx").on(table.identifiedAt),
  lastUpdatedIdx: index("uploader_uploads_last_updated_idx").on(table.lastUpdated),
  // Composite indexes for pipeline analytics
  phaseStartTimeIdx: index("uploader_uploads_phase_start_time_idx").on(table.currentPhase, table.startTime),
  statusUploadedAtIdx: index("uploader_uploads_status_uploaded_at_idx").on(table.uploadStatus, table.uploadedAt)
}));

// JSON processing table for Phase 5+ (future expansion)
export const uploaderJson = pgTable(getTableName("uploader_json"), {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull().references(() => uploaderUploads.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(), // Line number in original file
  rawLineData: text("raw_line_data").notNull(), // Original line content
  processedJson: jsonb("processed_json"), // Parsed JSON representation
  fieldSeparationData: jsonb("field_separation_data"), // Field parsing metadata
  processingTimeMs: integer("processing_time_ms"), // Processing time for this line
  errors: jsonb("errors"), // Any parsing errors
  sourceFileName: text("source_file_name").notNull(), // Original filename reference
  metadata: jsonb("metadata"), // Additional line-level metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
}, (table) => ({
  uploadIdIdx: index("uploader_json_upload_id_idx").on(table.uploadId),
  lineNumberIdx: index("uploader_json_line_number_idx").on(table.lineNumber),
  sourceFileNameIdx: index("uploader_json_source_file_name_idx").on(table.sourceFileName)
}));

// TDDF JSONB records table for future TDDF processing
export const uploaderTddfJsonbRecords = pgTable(getTableName("uploader_tddf_jsonb_records"), {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull().references(() => uploaderUploads.id, { onDelete: "cascade" }),
  recordType: text("record_type").notNull(), // DT, BH, P1, P2, etc.
  lineNumber: integer("line_number"), // Line number in source file
  rawLine: text("raw_line"), // Original raw line data
  rawLineHash: text("raw_line_hash"), // SHA-256 hash of raw line for duplicate detection
  recordData: jsonb("record_data").notNull(), // Complete TDDF record as JSON
  processingStatus: text("processing_status").default("pending").notNull(), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
}, (table) => ({
  uploadIdIdx: index("uploader_tddf_jsonb_upload_id_idx").on(table.uploadId),
  recordTypeIdx: index("uploader_tddf_jsonb_record_type_idx").on(table.recordType),
  processingStatusIdx: index("uploader_tddf_jsonb_processing_status_idx").on(table.processingStatus),
  lineNumberIdx: index("uploader_tddf_jsonb_line_number_idx").on(table.lineNumber),
  // Time-based analytics indexes
  createdAtIdx: index("uploader_tddf_jsonb_created_at_idx").on(table.createdAt),
  processedAtIdx: index("uploader_tddf_jsonb_processed_at_idx").on(table.processedAt),
  // Composite index for timeline queries
  recordTypeCreatedAtIdx: index("uploader_tddf_jsonb_record_type_created_at_idx").on(table.recordType, table.createdAt)
}));

// TDDF JSONB storage table for fast batch encoding (Stage 5)
export const tddfJsonb = pgTable(getTableName("tddf_jsonb"), {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull(), // Reference to uploader_uploads.id
  filename: text("filename").notNull(),
  recordType: text("record_type").notNull(), // DT, BH, P1, P2, etc.
  lineNumber: integer("line_number").notNull(), // Original line number in file
  rawLine: text("raw_line").notNull(), // Original TDDF fixed-width line
  rawLineHash: text("raw_line_hash"), // SHA-256 hash of first 52 chars for duplicate detection
  extractedFields: jsonb("extracted_fields").notNull(), // Parsed TDDF fields as JSONB
  recordIdentifier: text("record_identifier"), // Extracted record identifier for highlighting
  processingTimeMs: integer("processing_time_ms").default(0), // Processing duration
  // Universal TDDF processing datetime fields extracted from filename
  tddfProcessingDatetime: timestamp("tddf_processing_datetime"), // Full datetime from filename (e.g., 2025-07-14T08:33:32)
  tddfProcessingDate: date("tddf_processing_date"), // Date portion for sorting/pagination
  // Universal timestamp fields for chronological ordering (Larry B. feature)
  parsedDatetime: timestamp("parsed_datetime"), // Universal chronological timestamp for every record
  recordTimeSource: text("record_time_source"), // Documents timestamp origin: "dt_line", "bh_line", "file_timestamp", "file_timestamp + line_offset", "ingest_time"
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  uploadIdIdx: index("tddf_jsonb_upload_id_idx").on(table.uploadId),
  recordTypeIdx: index("tddf_jsonb_record_type_idx").on(table.recordType),
  lineNumberIdx: index("tddf_jsonb_line_number_idx").on(table.lineNumber),
  recordIdentifierIdx: index("tddf_jsonb_record_identifier_idx").on(table.recordIdentifier),
  // Indexes for universal TDDF processing datetime sorting and pagination
  tddfProcessingDatetimeIdx: index("tddf_jsonb_processing_datetime_idx").on(table.tddfProcessingDatetime),
  tddfProcessingDateIdx: index("tddf_jsonb_processing_date_idx").on(table.tddfProcessingDate),
  // Indexes for universal timestamp fields
  parsedDatetimeIdx: index("tddf_jsonb_parsed_datetime_idx").on(table.parsedDatetime),
  recordTimeSourceIdx: index("tddf_jsonb_record_time_source_idx").on(table.recordTimeSource),
  // Index for duplicate detection
  rawLineHashIdx: index("tddf_jsonb_raw_line_hash_idx").on(table.rawLineHash)
}));

// Processing timing logs table for performance tracking
export const processingTimingLogs = pgTable(getTableName("processing_timing_logs"), {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull().references(() => uploaderUploads.id, { onDelete: "cascade" }),
  operationType: text("operation_type").notNull(), // 're-encode', 'initial-process', 'cache-build'
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationSeconds: integer("duration_seconds"),
  totalRecords: integer("total_records"),
  recordsPerSecond: numeric("records_per_second", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("in_progress"), // 'in_progress', 'completed', 'failed'
  metadata: jsonb("metadata"), // Additional operation details
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uploadIdIdx: index("processing_timing_logs_upload_id_idx").on(table.uploadId),
  operationTypeIdx: index("processing_timing_logs_operation_type_idx").on(table.operationType),
  statusIdx: index("processing_timing_logs_status_idx").on(table.status),
  startTimeIdx: index("processing_timing_logs_start_time_idx").on(table.startTime)
}));

// MasterCard Data Integrity records table for future expansion
export const uploaderMastercardDiEditRecords = pgTable(getTableName("uploader_mastercard_di_edit_records"), {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id").notNull().references(() => uploaderUploads.id, { onDelete: "cascade" }),
  editData: jsonb("edit_data").notNull(), // Variable length field data
  editNumbers: jsonb("edit_numbers"), // Array of edit numbers
  processingStatus: text("processing_status").default("pending").notNull(), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
}, (table) => ({
  uploadIdIdx: index("uploader_mastercard_di_upload_id_idx").on(table.uploadId),
  processingStatusIdx: index("uploader_mastercard_di_processing_status_idx").on(table.processingStatus)
}));

// Zod schemas for uploader tables
export const uploaderUploadsSchema = createInsertSchema(uploaderUploads);
export const insertUploaderUploadSchema = uploaderUploadsSchema.omit({ 
  id: true, 
  startTime: true, 
  lastUpdated: true 
});

export const uploaderJsonSchema = createInsertSchema(uploaderJson);
export const insertUploaderJsonSchema = uploaderJsonSchema.omit({ 
  id: true, 
  createdAt: true 
});

export const uploaderTddfJsonbRecordsSchema = createInsertSchema(uploaderTddfJsonbRecords);
export const insertUploaderTddfJsonbRecordSchema = uploaderTddfJsonbRecordsSchema.omit({ 
  id: true, 
  createdAt: true 
});

export const uploaderMastercardDiEditRecordsSchema = createInsertSchema(uploaderMastercardDiEditRecords);
export const insertUploaderMastercardDiEditRecordSchema = uploaderMastercardDiEditRecordsSchema.omit({ 
  id: true, 
  createdAt: true 
});

// Zod schemas for processing timing logs
export const insertProcessingTimingLogSchema = createInsertSchema(processingTimingLogs).omit({ 
  id: true, 
  createdAt: true 
});

// Export uploader types
export type UploaderUpload = typeof uploaderUploads.$inferSelect;
export type InsertUploaderUpload = typeof uploaderUploads.$inferInsert;
export type UploaderJson = typeof uploaderJson.$inferSelect;
export type InsertUploaderJson = typeof uploaderJson.$inferInsert;
export type UploaderTddfJsonbRecord = typeof uploaderTddfJsonbRecords.$inferSelect;
export type InsertUploaderTddfJsonbRecord = typeof uploaderTddfJsonbRecords.$inferInsert;
export type UploaderMastercardDiEditRecord = typeof uploaderMastercardDiEditRecords.$inferSelect;
export type InsertUploaderMastercardDiEditRecord = typeof uploaderMastercardDiEditRecords.$inferInsert;
export type ProcessingTimingLog = typeof processingTimingLogs.$inferSelect;
export type InsertProcessingTimingLog = z.infer<typeof insertProcessingTimingLogSchema>;

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
  rawLinesTotal: integer("raw_lines_total").default(0),
  // TDDF-specific fields for historical tracking
  tddfFiles: integer("tddf_files").default(0),
  tddfRecords: integer("tddf_records").default(0),
  tddfRawLines: integer("tddf_raw_lines").default(0),
  tddfTotalValue: numeric("tddf_total_value", { precision: 15, scale: 2 }).default('0'),
  tddfPendingLines: integer("tddf_pending_lines").default(0),
  // Individual TDDF record type breakdowns
  dtProcessed: integer("dt_processed").default(0),
  dtPending: integer("dt_pending").default(0),
  dtSkipped: integer("dt_skipped").default(0),
  bhProcessed: integer("bh_processed").default(0),
  bhPending: integer("bh_pending").default(0),
  bhSkipped: integer("bh_skipped").default(0),
  p1Processed: integer("p1_processed").default(0),
  p1Pending: integer("p1_pending").default(0),
  p1Skipped: integer("p1_skipped").default(0),
  e1Processed: integer("e1_processed").default(0),
  e1Pending: integer("e1_pending").default(0),
  e1Skipped: integer("e1_skipped").default(0),
  g2Processed: integer("g2_processed").default(0),
  g2Pending: integer("g2_pending").default(0),
  g2Skipped: integer("g2_skipped").default(0),
  adProcessed: integer("ad_processed").default(0),
  adSkipped: integer("ad_skipped").default(0),
  drProcessed: integer("dr_processed").default(0),
  drSkipped: integer("dr_skipped").default(0),
  p2Processed: integer("p2_processed").default(0),
  p2Skipped: integer("p2_skipped").default(0),
  otherProcessed: integer("other_processed").default(0),
  otherSkipped: integer("other_skipped").default(0)
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
export const insertTerminalSchema = createInsertSchema(apiTerminals).omit({
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

// New DevUpload table for testing compressed storage architecture
export const devUploads = pgTable(getTableName("dev_uploads"), {
  id: text("id").primaryKey(),
  original_filename: text("original_filename").notNull(),
  file_size: numeric("file_size", { precision: 15, scale: 0 }).notNull(),
  upload_date: timestamp("upload_date").defaultNow().notNull(),
  compressed_payload: text("compressed_payload").notNull(), // GZIP compressed base64
  upload_status: text("upload_status").notNull().default("uploaded"), // uploaded, processing, completed, failed
  created_by: text("created_by").notNull(),
  
  // File analysis metadata (JSON)
  line_count: integer("line_count").notNull(),
  record_type_breakdown: jsonb("record_type_breakdown").notNull(), // {"DT": 1234, "BH": 56, "P1": 78}
  
  // Processing metadata
  processing_started_at: timestamp("processing_started_at"),
  processing_completed_at: timestamp("processing_completed_at"),
  processing_time_ms: integer("processing_time_ms"),
  processing_errors: text("processing_errors"),
  
  // Dynamic JSON schema detection results
  schema_detected: jsonb("schema_detected"), // Dynamic schema based on actual content
  records_created: jsonb("records_created"), // {"DT": 1234, "BH": 56} - actual records created
});

export const DevUpload = typeof devUploads.$inferSelect;
export const insertDevUploadSchema = createInsertSchema(devUploads);
export type InsertDevUpload = z.infer<typeof insertDevUploadSchema>;

// Dashboard cache table for pre-computed metrics using target-source naming
export const dashboardCache = pgTable(getTableName("dashboard-merchants_cache_2025"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'main_metrics', 'additional_metrics', etc.
  cache_data: jsonb("cache_data").notNull(), // Pre-computed metrics in JSON format
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(), // TTL for cache invalidation
  build_time_ms: integer("build_time_ms"), // Time taken to build the cache
  record_count: integer("record_count"), // Number of records processed
});

export type DashboardCache = typeof dashboardCache.$inferSelect;
export const insertDashboardCacheSchema = createInsertSchema(dashboardCache);
export type InsertDashboardCache = z.infer<typeof insertDashboardCacheSchema>;

// Uploader dashboard cache table for MMS Uploader metrics
export const uploaderDashboardCache = pgTable(getTableName("uploader_dashboard_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'uploader_stats'
  cache_data: jsonb("cache_data").notNull(), // Pre-computed uploader metrics
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  build_time_ms: integer("build_time_ms"),
  refresh_state: text("refresh_state").notNull().default("paused"), // paused, green_30s, blue_1min, off, red_issues
  last_manual_refresh: timestamp("last_manual_refresh"),
});

export type UploaderDashboardCache = typeof uploaderDashboardCache.$inferSelect;
export const insertUploaderDashboardCacheSchema = createInsertSchema(uploaderDashboardCache);
export type InsertUploaderDashboardCache = z.infer<typeof insertUploaderDashboardCacheSchema>;

// Duplicate finder cache table for TDDF record deduplication status
export const duplicateFinderCache = pgTable(getTableName("duplicate_finder_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'duplicate_scan_status'
  scan_status: text("scan_status").notNull().default("gray"), // gray, red, green
  duplicate_count: integer("duplicate_count").notNull().default(0),
  total_scanned: integer("total_scanned").notNull().default(0),
  last_scan_date: timestamp("last_scan_date"),
  scan_in_progress: boolean("scan_in_progress").notNull().default(false),
  cooldown_until: timestamp("cooldown_until"), // 6-minute cooldown timer
  scan_history: jsonb("scan_history"), // Array of historical scan results
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type DuplicateFinderCache = typeof duplicateFinderCache.$inferSelect;

// Charts Pre-Cache Table for 60-day TDDF DT Trends
export const chartsPreCache = pgTable(getTableName("charts_pre_cache"), {
  id: serial("id").primaryKey(),
  cacheKey: text("cache_key").notNull().unique(), // "60day_trends"
  dailyData: jsonb("daily_data").notNull(), // Array of daily aggregations
  merchantTrends: jsonb("merchant_trends").notNull(), // Top merchants by volume
  authAmountTrends: jsonb("auth_amount_trends").notNull(), // Auth vs transaction amounts
  cardTypeTrends: jsonb("card_type_trends").notNull(), // Card type breakdown by day
  totalRecords: integer("total_records").notNull(),
  dateRange: jsonb("date_range").notNull(), // {start_date, end_date}
  totalTransactionAmount: numeric("total_transaction_amount", { precision: 15, scale: 2 }),
  totalAuthAmount: numeric("total_auth_amount", { precision: 15, scale: 2 }),
  uniqueMerchants: integer("unique_merchants"),
  processingTimeMs: integer("processing_time_ms").notNull(),
  lastRefreshDatetime: timestamp("last_refresh_datetime").notNull(),
  neverExpires: boolean("never_expires").notNull().default(true),
  refreshRequestedBy: text("refresh_requested_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export type ChartsPreCache = typeof chartsPreCache.$inferSelect;
export const insertChartsPreCacheSchema = createInsertSchema(chartsPreCache);
export type InsertChartsPreCache = z.infer<typeof insertChartsPreCacheSchema>;
export const insertDuplicateFinderCacheSchema = createInsertSchema(duplicateFinderCache);
export type InsertDuplicateFinderCache = z.infer<typeof insertDuplicateFinderCacheSchema>;

// Heat Map Cache Processing Statistics table for comprehensive processing metadata tracking
export const heatMapCacheProcessingStats = pgTable(getTableName("heat_map_cache_processing_stats"), {
  id: serial("id").primaryKey(),
  job_id: text("job_id").notNull(), // Unique job identifier (e.g., "heatmap_2025_DT_1753985985533")
  year: integer("year").notNull(), // Year being processed (e.g., 2025)
  month: integer("month").notNull(), // Month being processed (1-12)
  record_type: text("record_type").notNull().default("DT"), // Record type (DT, BH, P1, etc.)
  
  // Processing timestamps and duration
  started_at: timestamp("started_at").notNull(), // When month processing started
  completed_at: timestamp("completed_at"), // When month processing completed (null if still running)
  processing_time_ms: integer("processing_time_ms"), // Time taken to process this month in milliseconds
  
  // Processing results and metrics
  record_count: integer("record_count").notNull().default(0), // Number of records processed for this month
  records_per_second: numeric("records_per_second", { precision: 10, scale: 2 }).default('0'), // Processing rate
  cache_entries_created: integer("cache_entries_created").default(0), // Number of cache entries created
  
  // Processing status and outcome
  status: text("status").notNull().default("pending"), // pending, building, completed, error
  error_message: text("error_message"), // Error details if processing failed
  
  // Job-level metadata (duplicated for easier querying)
  job_started_at: timestamp("job_started_at"), // When the entire job started
  job_completed_at: timestamp("job_completed_at"), // When the entire job completed
  total_months_in_job: integer("total_months_in_job").default(12), // Total months in this job
  job_status: text("job_status").default("running"), // pending, running, completed, error
  
  // Performance benchmarking
  database_query_time_ms: integer("database_query_time_ms"), // Time spent on database queries
  cache_write_time_ms: integer("cache_write_time_ms"), // Time spent writing to cache
  memory_usage_mb: numeric("memory_usage_mb", { precision: 10, scale: 2 }), // Peak memory usage during processing
  
  // System context
  server_id: text("server_id"), // Server/instance that processed this month
  environment: text("environment").notNull().default("development"), // development, production
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  jobIdIdx: index("heat_map_stats_job_id_idx").on(table.job_id),
  yearMonthIdx: index("heat_map_stats_year_month_idx").on(table.year, table.month),
  statusIdx: index("heat_map_stats_status_idx").on(table.status),
  recordTypeIdx: index("heat_map_stats_record_type_idx").on(table.record_type),
  processedAtIdx: index("heat_map_stats_processed_at_idx").on(table.completed_at)
}));

// Zod schemas for heat map cache processing stats
export const heatMapCacheProcessingStatsSchema = createInsertSchema(heatMapCacheProcessingStats);
export const insertHeatMapCacheProcessingStatsSchema = heatMapCacheProcessingStatsSchema.omit({ 
  id: true, 
  created_at: true, 
  updated_at: true 
});

// Export heat map cache processing stats types
export type HeatMapCacheProcessingStats = typeof heatMapCacheProcessingStats.$inferSelect;
export type InsertHeatMapCacheProcessingStats = z.infer<typeof insertHeatMapCacheProcessingStatsSchema>;

// Dedicated Pre-Caching Tables System - Every page has its own pre-cache table
// with last update date/time and comprehensive metadata capture

// Dashboard Page Pre-Cache Table
export const dashboardPagePreCache = pgTable(getTableName("dashboard_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'dashboard_main_metrics'
  page_name: text("page_name").notNull().default("Dashboard"), // Page identifier
  cache_data: jsonb("cache_data").notNull(), // Pre-computed dashboard data
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // Array of tables/sources used
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Additional page-specific metadata
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"), // System or user identifier
}, (table) => ({
  pageNameIdx: index("dashboard_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("dashboard_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("dashboard_page_pre_cache_expires_at_idx").on(table.expires_at)
}));

// Merchants Page Pre-Cache Table
export const merchantsPagePreCache = pgTable(getTableName("merchants_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'merchants_list_data'
  page_name: text("page_name").notNull().default("Merchants"), 
  cache_data: jsonb("cache_data").notNull(), // Pre-computed merchants data
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // merchant tables, tddf_records, etc.
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Merchant count, filter options, etc.
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
}, (table) => ({
  pageNameIdx: index("merchants_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("merchants_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("merchants_page_pre_cache_expires_at_idx").on(table.expires_at)
}));

// Terminals Page Pre-Cache Table  
export const terminalsPagePreCache = pgTable(getTableName("terminals_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'terminals_list_data'
  page_name: text("page_name").notNull().default("Terminals"),
  cache_data: jsonb("cache_data").notNull(), // Pre-computed terminals data
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // terminals table, transaction counts
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Terminal counts, activity metrics
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
}, (table) => ({
  pageNameIdx: index("terminals_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("terminals_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("terminals_page_pre_cache_expires_at_idx").on(table.expires_at)
}));

// TDDF JSON Page Pre-Cache Table
export const tddfJsonPagePreCache = pgTable(getTableName("tddf_json_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'tddf_json_records_data'
  page_name: text("page_name").notNull().default("TDDF JSON"),
  cache_data: jsonb("cache_data").notNull(), // Pre-computed TDDF JSON data
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // tddf_jsonb table
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Record type breakdown, file counts
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
}, (table) => ({
  pageNameIdx: index("tddf_json_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("tddf_json_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("tddf_json_page_pre_cache_expires_at_idx").on(table.expires_at)
}));

// TDDF JSON Activity Pre-Cache Table (Month-by-Month Heat Map Data)
export const tddfJsonActivityPreCache = pgTable(getTableName("tddf_json_activity_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'activity_2024_01_DT'
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  record_type: text("record_type").notNull().default("DT"),
  cache_data: jsonb("cache_data").notNull(), // Daily aggregated data for the month
  record_count: integer("record_count").notNull().default(0),
  build_time_ms: integer("build_time_ms").notNull().default(0),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  yearMonthTypeIdx: index("tddf_json_activity_year_month_type_idx").on(table.year, table.month, table.record_type),
  expiresAtIdx: index("tddf_json_activity_expires_at_idx").on(table.expires_at),
  cacheKeyIdx: index("tddf_json_activity_cache_key_idx").on(table.cache_key)
}));

// Processing Page Pre-Cache Table
export const processingPagePreCache = pgTable(getTableName("processing_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'processing_status_data'
  page_name: text("page_name").notNull().default("Processing"),
  cache_data: jsonb("cache_data").notNull(), // Pre-computed processing metrics
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // uploaded_files, processing queues
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Queue status, processing rates
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
}, (table) => ({
  pageNameIdx: index("processing_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("processing_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("processing_page_pre_cache_expires_at_idx").on(table.expires_at)
}));

// Uploader Page Pre-Cache Table - CRITICAL for New Data Status Widget
export const uploaderPagePreCache = pgTable(getTableName("uploader_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'uploader_metrics_data'
  page_name: text("page_name").notNull().default("Uploader"),
  cache_data: jsonb("cache_data").notNull(), // Pre-computed uploader metrics
  record_count: integer("record_count").notNull().default(0), // Total files uploaded
  data_sources: jsonb("data_sources"), // uploader_uploads table
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Upload counts, completion rates, storage info
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
  // Additional uploader-specific fields
  total_files_uploaded: integer("total_files_uploaded").notNull().default(0),
  completed_files: integer("completed_files").notNull().default(0),
  failed_files: integer("failed_files").notNull().default(0),
  processing_files: integer("processing_files").notNull().default(0),
  new_data_ready: boolean("new_data_ready").notNull().default(false),
  last_upload_datetime: timestamp("last_upload_datetime"),
  storage_service: text("storage_service").default("Replit Object Storage"),
}, (table) => ({
  pageNameIdx: index("uploader_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("uploader_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("uploader_page_pre_cache_expires_at_idx").on(table.expires_at),
  newDataReadyIdx: index("uploader_page_pre_cache_new_data_ready_idx").on(table.new_data_ready),
  lastUploadIdx: index("uploader_page_pre_cache_last_upload_idx").on(table.last_upload_datetime)
}));

// Settings Page Pre-Cache Table
export const settingsPagePreCache = pgTable(getTableName("settings_page_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'settings_system_info'
  page_name: text("page_name").notNull().default("Settings"),
  cache_data: jsonb("cache_data").notNull(), // Pre-computed system metrics
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // system tables, schema info
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // System info, database stats
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
}, (table) => ({
  pageNameIdx: index("settings_page_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("settings_page_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("settings_page_pre_cache_expires_at_idx").on(table.expires_at)
}));

// Heat Map Pre-Cache Tables for Performance Testing
export const heatMapTestingCache2025 = pgTable(getTableName("heat_map_testing_cache_2025"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'heat_map_2025_data'
  year: integer("year").notNull().default(2025),
  cache_data: jsonb("cache_data").notNull(), // Pre-computed heat map data
  record_count: integer("record_count").notNull().default(0),
  data_sources: jsonb("data_sources"), // tddf_jsonb, activity sources
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Heat map specific metrics
  created_at: timestamp("created_at").defaultNow().notNull(),
  aggregation_level: text("aggregation_level").notNull().default("daily"), // daily, weekly, monthly
  performance_tier: text("performance_tier").notNull().default("standard"), // standard, large, enterprise
}, (table) => ({
  yearIdx: index("heat_map_testing_cache_2025_year_idx").on(table.year),
  lastUpdateIdx: index("heat_map_testing_cache_2025_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("heat_map_testing_cache_2025_expires_at_idx").on(table.expires_at),
  aggregationIdx: index("heat_map_testing_cache_2025_aggregation_idx").on(table.aggregation_level),
  performanceTierIdx: index("heat_map_testing_cache_2025_performance_tier_idx").on(table.performance_tier)
}));

// TDDF JSON Record Type Counts Pre-Cache Table for Settings Page
export const tddfJsonRecordTypeCountsPreCache = pgTable(getTableName("tddf_json_record_type_counts_pre_cache"), {
  id: serial("id").primaryKey(),
  cache_key: text("cache_key").notNull().unique(), // 'tddf_json_record_type_counts'
  page_name: text("page_name").notNull().default("Settings"),
  total_records: integer("total_records").notNull().default(0),
  dt_count: integer("dt_count").notNull().default(0),
  bh_count: integer("bh_count").notNull().default(0),
  p1_count: integer("p1_count").notNull().default(0),
  p2_count: integer("p2_count").notNull().default(0),
  e1_count: integer("e1_count").notNull().default(0),
  g2_count: integer("g2_count").notNull().default(0),
  ad_count: integer("ad_count").notNull().default(0),
  dr_count: integer("dr_count").notNull().default(0),
  other_count: integer("other_count").notNull().default(0),
  cache_data: jsonb("cache_data").notNull(), // Complete record type breakdown with metadata
  data_sources: jsonb("data_sources"), // Source table and query info
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_update_datetime: timestamp("last_update_datetime").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata"), // Additional stats and processing info
  created_at: timestamp("created_at").defaultNow().notNull(),
  created_by: text("created_by"),
}, (table) => ({
  pageNameIdx: index("tddf_json_record_type_counts_pre_cache_page_name_idx").on(table.page_name),
  lastUpdateIdx: index("tddf_json_record_type_counts_pre_cache_last_update_idx").on(table.last_update_datetime),
  expiresAtIdx: index("tddf_json_record_type_counts_pre_cache_expires_at_idx").on(table.expires_at),
  totalRecordsIdx: index("tddf_json_record_type_counts_pre_cache_total_records_idx").on(table.total_records)
}));

// TDDF1 Totals Table - Comprehensive breakdown tracking
export const tddf1Totals = pgTable(getTableName("tddf1_totals"), {
  id: serial("id").primaryKey(),
  total_files: integer("total_files").notNull().default(0),
  total_records: integer("total_records").notNull().default(0),
  total_transaction_value: numeric("total_transaction_value", { precision: 15, scale: 2 }).notNull().default('0'),
  record_type_breakdown: jsonb("record_type_breakdown").notNull().default('{}'),
  active_tables: text("active_tables").array().notNull().default([]),
  last_processed_date: timestamp("last_processed_date"),
  
  // Enhanced fields for comprehensive tracking
  file_name: text("file_name"), // Current processing file name
  processing_duration_ms: integer("processing_duration_ms"), // Processing time in milliseconds
  total_tddf_lines: integer("total_tddf_lines").default(0), // Total lines in TDDF file
  total_json_lines_inserted: integer("total_json_lines_inserted").default(0), // Lines inserted into JSON table
  processing_start_time: timestamp("processing_start_time"), // When processing started
  processing_end_time: timestamp("processing_end_time"), // When processing ended
  validation_summary: jsonb("validation_summary").default('{}'), // Validation results breakdown
  performance_metrics: jsonb("performance_metrics").default('{}'), // Performance tracking data
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  fileNameIdx: index("tddf1_totals_file_name_idx").on(table.file_name),
  lastProcessedIdx: index("tddf1_totals_last_processed_idx").on(table.last_processed_date),
  processingTimeIdx: index("tddf1_totals_processing_time_idx").on(table.processing_duration_ms)
}));

// Pre-Cache Table Types and Schemas
export type DashboardPagePreCache = typeof dashboardPagePreCache.$inferSelect;
export type MerchantsPagePreCache = typeof merchantsPagePreCache.$inferSelect;
export type TerminalsPagePreCache = typeof terminalsPagePreCache.$inferSelect;
export type TddfJsonPagePreCache = typeof tddfJsonPagePreCache.$inferSelect;
export type ProcessingPagePreCache = typeof processingPagePreCache.$inferSelect;
export type UploaderPagePreCache = typeof uploaderPagePreCache.$inferSelect;
export type SettingsPagePreCache = typeof settingsPagePreCache.$inferSelect;
export type HeatMapTestingCache2025 = typeof heatMapTestingCache2025.$inferSelect;
export type TddfJsonRecordTypeCountsPreCache = typeof tddfJsonRecordTypeCountsPreCache.$inferSelect;
export type Tddf1Totals = typeof tddf1Totals.$inferSelect;

// Insert schemas for pre-cache tables
export const insertDashboardPagePreCacheSchema = createInsertSchema(dashboardPagePreCache).omit({ id: true, created_at: true });
export const insertMerchantsPagePreCacheSchema = createInsertSchema(merchantsPagePreCache).omit({ id: true, created_at: true });
export const insertTerminalsPagePreCacheSchema = createInsertSchema(terminalsPagePreCache).omit({ id: true, created_at: true });
export const insertTddfJsonPagePreCacheSchema = createInsertSchema(tddfJsonPagePreCache).omit({ id: true, created_at: true });
export const insertProcessingPagePreCacheSchema = createInsertSchema(processingPagePreCache).omit({ id: true, created_at: true });
export const insertUploaderPagePreCacheSchema = createInsertSchema(uploaderPagePreCache).omit({ id: true, created_at: true });
export const insertSettingsPagePreCacheSchema = createInsertSchema(settingsPagePreCache).omit({ id: true, created_at: true });
export const insertHeatMapTestingCache2025Schema = createInsertSchema(heatMapTestingCache2025).omit({ id: true, created_at: true });
export const insertTddfJsonRecordTypeCountsPreCacheSchema = createInsertSchema(tddfJsonRecordTypeCountsPreCache).omit({ id: true, created_at: true });
export const insertTddf1TotalsSchema = createInsertSchema(tddf1Totals).omit({ id: true, created_at: true, updated_at: true });

// Remove duplicate Terminal type declarations - they are defined below

// =============================================================================
// PRE-CACHE SETTINGS AND STATUS CONTROL TABLE
// =============================================================================
// Comprehensive pre-cache management table to track all pre-cache performance,
// settings, health, and update control policies across the entire application

export const preCacheSettingsStatus = pgTable(getTableName("pre_cache_settings_status"), {
  id: serial("id").primaryKey(),
  
  // Cache identification and configuration
  cache_name: text("cache_name").notNull().unique(), // Unique identifier for each cache
  page_name: text("page_name").notNull(), // Associated page/component name
  table_name: text("table_name").notNull(), // Actual database table name
  cache_type: text("cache_type").notNull().default("page_cache"), // page_cache, api_cache, heat_map_cache, system_cache
  
  // Cache control policies
  update_policy: text("update_policy").notNull().default("manual"), // manual, auto_15min, auto_1hr, auto_daily, on_demand
  expiration_policy: text("expiration_policy").notNull().default("24_hours"), // never, 15_minutes, 1_hour, 4_hours, 24_hours, 7_days
  auto_refresh_enabled: boolean("auto_refresh_enabled").notNull().default(false),
  refresh_interval_minutes: integer("refresh_interval_minutes").default(60), // Minutes between auto refreshes
  
  // Cache status and health tracking
  cache_status: text("cache_status").notNull().default("inactive"), // active, inactive, building, error, expired
  health_status: text("health_status").notNull().default("unknown"), // healthy, warning, critical, unknown
  last_update_attempt: timestamp("last_update_attempt"),
  last_successful_update: timestamp("last_successful_update"),
  update_success_rate: numeric("update_success_rate", { precision: 5, scale: 2 }).default('100.00'), // Success percentage
  consecutive_failures: integer("consecutive_failures").default(0),
  
  // Performance metrics
  current_record_count: integer("current_record_count").default(0),
  average_build_time_ms: integer("average_build_time_ms").default(0),
  last_build_time_ms: integer("last_build_time_ms").default(0),
  fastest_build_time_ms: integer("fastest_build_time_ms"),
  slowest_build_time_ms: integer("slowest_build_time_ms"),
  total_builds: integer("total_builds").default(0),
  
  // Data source tracking
  data_sources: jsonb("data_sources"), // Array of source tables/APIs used
  dependencies: jsonb("dependencies"), // Cache dependencies on other caches
  cache_size_bytes: integer("cache_size_bytes").default(0),
  compression_enabled: boolean("compression_enabled").default(false),
  compression_ratio: numeric("compression_ratio", { precision: 5, scale: 2 }),
  
  // Expiration and TTL management
  current_expires_at: timestamp("current_expires_at"),
  default_ttl_minutes: integer("default_ttl_minutes").default(1440), // 24 hours default
  max_ttl_minutes: integer("max_ttl_minutes").default(10080), // 7 days max
  min_ttl_minutes: integer("min_ttl_minutes").default(15), // 15 minutes min
  
  // Error tracking and diagnostics
  last_error_message: text("last_error_message"),
  last_error_timestamp: timestamp("last_error_timestamp"),
  error_count_24h: integer("error_count_24h").default(0),
  error_count_7d: integer("error_count_7d").default(0),
  error_history: jsonb("error_history"), // Array of recent error details
  
  // Performance thresholds and alerts
  performance_tier: text("performance_tier").default("standard"), // standard, large, enterprise, critical
  alert_on_slow_build: boolean("alert_on_slow_build").default(true),
  slow_build_threshold_ms: integer("slow_build_threshold_ms").default(30000), // 30 seconds
  alert_on_failure: boolean("alert_on_failure").default(true),
  max_consecutive_failures: integer("max_consecutive_failures").default(3),
  
  // Usage and access patterns
  total_cache_hits: integer("total_cache_hits").default(0),
  total_cache_misses: integer("total_cache_misses").default(0),
  cache_hit_rate: numeric("cache_hit_rate", { precision: 5, scale: 2 }),
  last_accessed: timestamp("last_accessed"),
  access_frequency_24h: integer("access_frequency_24h").default(0),
  peak_access_time: text("peak_access_time"), // Time of day with most access
  
  // Maintenance and cleanup settings
  auto_cleanup_enabled: boolean("auto_cleanup_enabled").default(true),
  cleanup_older_than_days: integer("cleanup_older_than_days").default(30),
  last_cleanup_run: timestamp("last_cleanup_run"),
  cleanup_records_removed: integer("cleanup_records_removed").default(0),
  
  // System integration
  priority_level: integer("priority_level").default(5), // 1-10 priority for cache building order
  environment_specific: boolean("environment_specific").default(true), // Whether cache varies by environment
  requires_authentication: boolean("requires_authentication").default(true),
  public_access_allowed: boolean("public_access_allowed").default(false),
  
  // Configuration metadata
  configuration_notes: text("configuration_notes"),
  created_by: text("created_by").default("system"),
  last_modified_by: text("last_modified_by"),
  configuration_version: text("configuration_version").default("1.0"),
  
  // System timestamps
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_status_check: timestamp("last_status_check").defaultNow().notNull()
}, (table) => ({
  // Primary indexes for performance
  cacheNameIdx: index("pre_cache_settings_cache_name_idx").on(table.cache_name),
  pageNameIdx: index("pre_cache_settings_page_name_idx").on(table.page_name),
  cacheStatusIdx: index("pre_cache_settings_cache_status_idx").on(table.cache_status),
  healthStatusIdx: index("pre_cache_settings_health_status_idx").on(table.health_status),
  lastUpdateIdx: index("pre_cache_settings_last_update_idx").on(table.last_successful_update),
  expiresAtIdx: index("pre_cache_settings_expires_at_idx").on(table.current_expires_at),
  performanceTierIdx: index("pre_cache_settings_performance_tier_idx").on(table.performance_tier),
  priorityLevelIdx: index("pre_cache_settings_priority_level_idx").on(table.priority_level),
  
  // Composite indexes for common queries
  statusHealthIdx: index("pre_cache_settings_status_health_idx").on(table.cache_status, table.health_status),
  pageTypeIdx: index("pre_cache_settings_page_type_idx").on(table.page_name, table.cache_type),
  updatePolicyIdx: index("pre_cache_settings_update_policy_idx").on(table.update_policy, table.auto_refresh_enabled)
}));

// Pre-Cache Settings Status Types and Schemas
export type PreCacheSettingsStatus = typeof preCacheSettingsStatus.$inferSelect;
export type InsertPreCacheSettingsStatus = typeof preCacheSettingsStatus.$inferInsert;

export const preCacheSettingsStatusSchema = createInsertSchema(preCacheSettingsStatus);
export const insertPreCacheSettingsStatusSchema = preCacheSettingsStatusSchema.omit({ 
  id: true, 
  created_at: true, 
  updated_at: true, 
  last_status_check: true 
});

// Cache Configuration table - Persistent cache settings
export const cacheConfiguration = pgTable(getTableName("cache_configuration"), {
  id: serial("id").primaryKey(),
  
  // Cache identification
  cache_name: text("cache_name").notNull().unique(), // e.g., 'dashboard_cache', 'heat_map_cache', etc.
  cache_type: text("cache_type").notNull(), // 'dashboard', 'heat_map', 'merchant', 'pre_cache', etc.
  page_name: text("page_name"), // Associated page or component
  table_name: text("table_name"), // Physical table name storing cache data
  
  // Expiration settings
  default_expiration_minutes: integer("default_expiration_minutes").notNull().default(240), // 4 hours default
  expiration_policy: text("expiration_policy").default("fixed"), // 'fixed', 'sliding', 'never'
  current_expiration_minutes: integer("current_expiration_minutes"), // Current setting (can be different from default)
  
  // Refresh behavior
  auto_refresh_enabled: boolean("auto_refresh_enabled").default(true),
  refresh_interval_minutes: integer("refresh_interval_minutes").default(60),
  refresh_on_startup: boolean("refresh_on_startup").default(false),
  cache_update_policy: text("cache_update_policy").default("manual"), // 'manual', 'once_a_day', 'all_app_restarts', 'new_data_flag'
  
  // Performance settings
  priority_level: integer("priority_level").default(5), // 1-10 for cache building order
  max_records: integer("max_records"), // Maximum records to cache
  enable_compression: boolean("enable_compression").default(false),
  
  // Configuration metadata
  description: text("description"),
  environment_specific: boolean("environment_specific").default(true),
  is_active: boolean("is_active").default(true),
  
  // Tracking
  created_by: text("created_by").default("system"),
  last_modified_by: text("last_modified_by"),
  
  // System timestamps
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  cacheNameIdx: index("cache_config_cache_name_idx").on(table.cache_name),
  cacheTypeIdx: index("cache_config_cache_type_idx").on(table.cache_type),
  pageNameIdx: index("cache_config_page_name_idx").on(table.page_name),
  activeIdx: index("cache_config_active_idx").on(table.is_active),
  expirationIdx: index("cache_config_expiration_idx").on(table.current_expiration_minutes)
}));

// Cache Configuration Types and Schemas
export type CacheConfiguration = typeof cacheConfiguration.$inferSelect;
export type InsertCacheConfiguration = typeof cacheConfiguration.$inferInsert;

export const cacheConfigurationSchema = createInsertSchema(cacheConfiguration);
export const insertCacheConfigurationSchema = cacheConfigurationSchema.omit({ 
  id: true, 
  created_at: true, 
  updated_at: true 
});

// =============================================================================
// TDDF RECORD PRE-CACHE TABLES BY YEAR AND TAB
// =============================================================================
// Dedicated pre-cache tables for each TDDF record tab and year with "never expire" policy
// Similar to heat map cache system but for each tab's specific data patterns

// TDDF All Records Pre-Cache by Year
export const tddfRecordsAllPreCache = pgTable(getTableName("tddf_records_all_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(), // Year of data (e.g., 2024, 2025)
  cache_key: text("cache_key").notNull().unique(), // 'all_records_2024'
  
  // Pre-computed data for "All Records" tab
  cached_data: jsonb("cached_data").notNull(), // Complete pre-computed records data
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // Record type breakdown for this year
  dt_count: integer("dt_count").default(0),
  bh_count: integer("bh_count").default(0),
  p1_count: integer("p1_count").default(0),
  p2_count: integer("p2_count").default(0),
  e1_count: integer("e1_count").default(0),
  g2_count: integer("g2_count").default(0),
  other_count: integer("other_count").default(0),
  
  // Financial aggregates
  total_amount: numeric("total_amount", { precision: 15, scale: 2 }).default('0'),
  unique_files: integer("unique_files").default(0),
  
  // Cache metadata
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(), // Never expire policy
  refresh_requested_by: text("refresh_requested_by"), // User who requested refresh
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_all_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_all_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_all_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF DT (Transactions) Pre-Cache by Year
export const tddfRecordsDtPreCache = pgTable(getTableName("tddf_records_dt_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'dt_records_2024'
  
  // Pre-computed data for "DT - Transactions" tab
  cached_data: jsonb("cached_data").notNull(),
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // DT-specific aggregates
  total_transaction_amount: numeric("total_transaction_amount", { precision: 15, scale: 2 }).default('0'),
  unique_merchants: integer("unique_merchants").default(0),
  unique_terminals: integer("unique_terminals").default(0),
  avg_transaction_amount: numeric("avg_transaction_amount", { precision: 10, scale: 2 }).default('0'),
  
  // Card type breakdown
  visa_count: integer("visa_count").default(0),
  mastercard_count: integer("mastercard_count").default(0),
  amex_count: integer("amex_count").default(0),
  discover_count: integer("discover_count").default(0),
  other_card_count: integer("other_card_count").default(0),
  
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(),
  refresh_requested_by: text("refresh_requested_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_dt_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_dt_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_dt_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF BH (Batch Headers) Pre-Cache by Year
export const tddfRecordsBhPreCache = pgTable(getTableName("tddf_records_bh_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'bh_records_2024'
  
  cached_data: jsonb("cached_data").notNull(),
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // BH-specific aggregates
  total_net_deposit: numeric("total_net_deposit", { precision: 15, scale: 2 }).default('0'),
  total_batch_count: integer("total_batch_count").default(0),
  avg_transactions_per_batch: numeric("avg_transactions_per_batch", { precision: 10, scale: 2 }).default('0'),
  unique_merchant_accounts: integer("unique_merchant_accounts").default(0),
  
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(),
  refresh_requested_by: text("refresh_requested_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_bh_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_bh_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_bh_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF Batch Relationships Pre-Cache by Year
export const tddfBatchRelationshipsPreCache = pgTable(getTableName("tddf_batch_relationships_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'batch_relationships_2024'
  
  cached_data: jsonb("cached_data").notNull(),
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // Relationship-specific aggregates
  batches_with_transactions: integer("batches_with_transactions").default(0),
  orphaned_transactions: integer("orphaned_transactions").default(0),
  avg_transactions_per_batch: numeric("avg_transactions_per_batch", { precision: 10, scale: 2 }).default('0'),
  relationship_accuracy: numeric("relationship_accuracy", { precision: 5, scale: 2 }).default('0'), // Percentage
  
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(),
  refresh_requested_by: text("refresh_requested_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_batch_rel_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_batch_rel_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_batch_rel_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF P1 (Purchasing) Pre-Cache by Year
export const tddfRecordsP1PreCache = pgTable(getTableName("tddf_records_p1_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'p1_records_2024'
  
  cached_data: jsonb("cached_data").notNull(),
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // P1-specific aggregates
  total_extended_amount: numeric("total_extended_amount", { precision: 15, scale: 2 }).default('0'),
  unique_suppliers: integer("unique_suppliers").default(0),
  avg_line_item_amount: numeric("avg_line_item_amount", { precision: 10, scale: 2 }).default('0'),
  
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(),
  refresh_requested_by: text("refresh_requested_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_p1_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_p1_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_p1_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF P2 (Purchasing 2) Pre-Cache by Year
export const tddfRecordsP2PreCache = pgTable(getTableName("tddf_records_p2_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'p2_records_2024'
  
  cached_data: jsonb("cached_data").notNull(),
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // P2-specific aggregates
  total_line_item_total: numeric("total_line_item_total", { precision: 15, scale: 2 }).default('0'),
  total_vat_amount: numeric("total_vat_amount", { precision: 15, scale: 2 }).default('0'),
  avg_vat_rate: numeric("avg_vat_rate", { precision: 5, scale: 4 }).default('0'),
  
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(),
  refresh_requested_by: text("refresh_requested_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_p2_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_p2_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_p2_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF Other Types Pre-Cache by Year (E1, G2, etc.)
export const tddfRecordsOtherPreCache = pgTable(getTableName("tddf_records_other_pre_cache"), {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'other_records_2024'
  
  cached_data: jsonb("cached_data").notNull(),
  record_count: integer("record_count").notNull().default(0),
  total_pages: integer("total_pages").notNull().default(0),
  
  // Other types breakdown
  e1_count: integer("e1_count").default(0), // EMV merchant data
  g2_count: integer("g2_count").default(0), // General data 2
  ad_count: integer("ad_count").default(0), // Merchant adjustments
  dr_count: integer("dr_count").default(0), // Direct marketing
  ck_count: integer("ck_count").default(0), // Electronic checks
  lg_count: integer("lg_count").default(0), // Lodge
  ge_count: integer("ge_count").default(0), // Generic extension
  unknown_count: integer("unknown_count").default(0),
  
  processing_time_ms: integer("processing_time_ms").notNull().default(0),
  last_refresh_datetime: timestamp("last_refresh_datetime").defaultNow().notNull(),
  never_expires: boolean("never_expires").default(true).notNull(),
  refresh_requested_by: text("refresh_requested_by"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  yearIdx: index("tddf_other_cache_year_idx").on(table.year),
  cacheKeyIdx: index("tddf_other_cache_key_idx").on(table.cache_key),
  lastRefreshIdx: index("tddf_other_cache_refresh_idx").on(table.last_refresh_datetime)
}));

// TDDF Records Tab Processing Status - tracks cache building progress
export const tddfRecordsTabProcessingStatus = pgTable(getTableName("tddf_records_tab_processing_status"), {
  id: serial("id").primaryKey(),
  tab_name: text("tab_name").notNull(), // 'all', 'dt', 'bh', 'batch_relationships', 'p1', 'p2', 'other'
  year: integer("year").notNull(),
  cache_key: text("cache_key").notNull().unique(), // 'processing_status_dt_2024'
  
  // Processing status
  is_processing: boolean("is_processing").default(false).notNull(),
  processing_started_at: timestamp("processing_started_at"),
  processing_completed_at: timestamp("processing_completed_at"),
  processing_time_ms: integer("processing_time_ms"),
  
  // Progress tracking
  total_records_to_process: integer("total_records_to_process").default(0),
  records_processed: integer("records_processed").default(0),
  progress_percentage: numeric("progress_percentage", { precision: 5, scale: 2 }).default('0'),
  
  // Status and messaging
  status: text("status").default("pending").notNull(), // pending, processing, completed, error
  status_message: text("status_message"),
  error_details: jsonb("error_details"),
  
  // Job metadata
  job_id: text("job_id"), // Unique identifier for this cache build job
  triggered_by: text("triggered_by").default("manual"), // manual, auto, scheduled
  triggered_by_user: text("triggered_by_user"),
  
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  tabYearIdx: index("tddf_tab_status_tab_year_idx").on(table.tab_name, table.year),
  processingIdx: index("tddf_tab_status_processing_idx").on(table.is_processing),
  statusIdx: index("tddf_tab_status_status_idx").on(table.status),
  jobIdIdx: index("tddf_tab_status_job_id_idx").on(table.job_id)
}));

// Export all TDDF record pre-cache types
export type TddfRecordsAllPreCache = typeof tddfRecordsAllPreCache.$inferSelect;
export type TddfRecordsDtPreCache = typeof tddfRecordsDtPreCache.$inferSelect;
export type TddfRecordsBhPreCache = typeof tddfRecordsBhPreCache.$inferSelect;
export type TddfBatchRelationshipsPreCache = typeof tddfBatchRelationshipsPreCache.$inferSelect;
export type TddfRecordsP1PreCache = typeof tddfRecordsP1PreCache.$inferSelect;
export type TddfRecordsP2PreCache = typeof tddfRecordsP2PreCache.$inferSelect;
export type TddfRecordsOtherPreCache = typeof tddfRecordsOtherPreCache.$inferSelect;
export type TddfRecordsTabProcessingStatus = typeof tddfRecordsTabProcessingStatus.$inferSelect;

// Insert schemas for TDDF record pre-cache tables
export const insertTddfRecordsAllPreCacheSchema = createInsertSchema(tddfRecordsAllPreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfRecordsDtPreCacheSchema = createInsertSchema(tddfRecordsDtPreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfRecordsBhPreCacheSchema = createInsertSchema(tddfRecordsBhPreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfBatchRelationshipsPreCacheSchema = createInsertSchema(tddfBatchRelationshipsPreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfRecordsP1PreCacheSchema = createInsertSchema(tddfRecordsP1PreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfRecordsP2PreCacheSchema = createInsertSchema(tddfRecordsP2PreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfRecordsOtherPreCacheSchema = createInsertSchema(tddfRecordsOtherPreCache).omit({ 
  id: true, created_at: true, updated_at: true 
});
export const insertTddfRecordsTabProcessingStatusSchema = createInsertSchema(tddfRecordsTabProcessingStatus).omit({ 
  id: true, created_at: true, updated_at: true 
});

export type InsertTddfRecordsAllPreCache = z.infer<typeof insertTddfRecordsAllPreCacheSchema>;
export type InsertTddfRecordsDtPreCache = z.infer<typeof insertTddfRecordsDtPreCacheSchema>;
export type InsertTddfRecordsBhPreCache = z.infer<typeof insertTddfRecordsBhPreCacheSchema>;
export type InsertTddfBatchRelationshipsPreCache = z.infer<typeof insertTddfBatchRelationshipsPreCacheSchema>;
export type InsertTddfRecordsP1PreCache = z.infer<typeof insertTddfRecordsP1PreCacheSchema>;
export type InsertTddfRecordsP2PreCache = z.infer<typeof insertTddfRecordsP2PreCacheSchema>;
export type InsertTddfRecordsOtherPreCache = z.infer<typeof insertTddfRecordsOtherPreCacheSchema>;
export type InsertTddfRecordsTabProcessingStatus = z.infer<typeof insertTddfRecordsTabProcessingStatusSchema>;

// TDDF1 Merchants table for tracking merchant volume analytics and account changes
export const tddf1Merchants = pgTable(getTableName("tddf1_merchants"), {
  id: serial("id").primaryKey(),
  
  // Core merchant identifiers
  merchantId: text("merchant_id").notNull().unique(), // Primary merchant ID (BH Merchant Account Number)
  merchantName: text("merchant_name"), // DBA name from DT records (pos 218-242)
  amexMerchantSellerName: text("amex_merchant_seller_name"), // Amex Merchant Seller Name from DT records (pos 513-537)
  
  // Volume analytics
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  totalNetDeposits: numeric("total_net_deposits", { precision: 15, scale: 2 }).notNull().default("0"),
  uniqueTerminals: integer("unique_terminals").notNull().default(0),
  
  // Date ranges
  firstSeenDate: date("first_seen_date"),
  lastSeenDate: date("last_seen_date"),
  
  // Tracking metadata
  recordCount: integer("record_count").notNull().default(0), // Total TDDF records processed
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // Processing tracking
  sourceFiles: text("source_files").array().notNull().default([]), // Files this merchant appeared in
  lastProcessedFile: text("last_processed_file") // Most recent file processed
}, (table) => ({
  merchantIdIdx: index("tddf1_merchants_merchant_id_idx").on(table.merchantId),
  totalAmountIdx: index("tddf1_merchants_total_amount_idx").on(table.totalAmount),
  totalTransactionsIdx: index("tddf1_merchants_total_transactions_idx").on(table.totalTransactions),
  lastSeenIdx: index("tddf1_merchants_last_seen_idx").on(table.lastSeenDate)
}));

export type Tddf1Merchant = typeof tddf1Merchants.$inferSelect;
export const insertTddf1MerchantSchema = createInsertSchema(tddf1Merchants).omit({ 
  id: true, createdAt: true, lastUpdated: true 
});
export type InsertTddf1Merchant = z.infer<typeof insertTddf1MerchantSchema>;

// ===== TDDF API Data System Tables =====
// Schema management for dynamic TDDF record processing

export const tddApiSchemas = pgTable(getTableName("tddf_api_schemas"), {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  description: text("description"),
  schemaData: jsonb("schema_data").notNull(), // Complete schema definition
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
}, (table) => ({
  uniqNameVersion: unique().on(table.name, table.version)
}));

export const tddApiFiles = pgTable(getTableName("tddf_api_files"), {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileHash: text("file_hash").notNull(),
  storagePath: text("storage_path").notNull(),
  schemaId: integer("schema_id").references(() => tddApiSchemas.id),
  status: text("status").notNull().default("uploaded"), // uploaded, processing, completed, failed
  recordCount: integer("record_count").default(0),
  processedRecords: integer("processed_records").default(0),
  errorRecords: integer("error_records").default(0),
  processingStarted: timestamp("processing_started"),
  processingCompleted: timestamp("processing_completed"),
  errorDetails: jsonb("error_details"),
  metadata: jsonb("metadata"), // File-specific metadata
  businessDay: date("business_day"), // Extracted business day from filename
  fileDate: text("file_date"), // Raw date string from filename (MMDDYYYY format)
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  uploadedBy: text("uploaded_by").notNull(),
}, (table) => ({
  businessDayIdx: index("tddf_api_files_business_day_idx").on(table.businessDay),
  statusIdx: index("tddf_api_files_status_idx").on(table.status),
  uploadedAtIdx: index("tddf_api_files_uploaded_at_idx").on(table.uploadedAt)
}));

export const tddApiRecords = pgTable(getTableName("tddf_api_records"), {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => tddApiFiles.id),
  uploadId: text("upload_id"), // Reference to uploader_uploads.id for Step 6 processing
  filename: text("filename"), // Original filename
  recordType: text("record_type"), // DT, BH, P1, P2, etc.
  lineNumber: integer("line_number"), // Original line number in file (renamed from record_number)
  rawLine: text("raw_line").notNull(), // Original TDDF fixed-width line
  extractedFields: jsonb("extracted_fields"), // Parsed TDDF fields as JSONB (renamed from parsed_data)
  recordIdentifier: text("record_identifier"), // Extracted record identifier for highlighting
  processingTimeMs: integer("processing_time_ms").default(0), // Processing duration
  
  // Universal TDDF processing datetime fields extracted from filename
  tddfProcessingDatetime: timestamp("tddf_processing_datetime"), // Full datetime from filename
  tddfProcessingDate: date("tddf_processing_date"), // Date portion for sorting/pagination
  
  // Universal timestamp fields for chronological ordering (Larry B. feature)
  parsedDatetime: timestamp("parsed_datetime"), // Universal chronological timestamp for every record
  recordTimeSource: text("record_time_source"), // Documents timestamp origin: "dt_line", "bh_line", "file_timestamp", etc.
  
  // Legacy fields (keeping for backward compatibility)
  parsedData: jsonb("parsed_data"), // Keep existing parsed_data column
  isValid: boolean("is_valid").default(true),
  validationErrors: jsonb("validation_errors"),
  status: text("status").default("pending"),
  
  // Timestamps
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  fileRecordIdx: index("tddf_api_records_file_record_idx").on(table.fileId, table.recordType),
  fileLineIdx: index("tddf_api_records_file_line_idx").on(table.fileId, table.lineNumber),
  uploadIdIdx: index("tddf_api_records_upload_id_idx").on(table.uploadId),
  recordTypeIdx: index("tddf_api_records_record_type_idx").on(table.recordType),
  recordIdentifierIdx: index("tddf_api_records_record_identifier_idx").on(table.recordIdentifier),
  // Indexes for universal TDDF processing datetime sorting and pagination
  tddfProcessingDatetimeIdx: index("tddf_api_records_processing_datetime_idx").on(table.tddfProcessingDatetime),
  tddfProcessingDateIdx: index("tddf_api_records_processing_date_idx").on(table.tddfProcessingDate),
  // Indexes for universal timestamp fields
  parsedDatetimeIdx: index("tddf_api_records_parsed_datetime_idx").on(table.parsedDatetime),
  recordTimeSourceIdx: index("tddf_api_records_record_time_source_idx").on(table.recordTimeSource)
}));

export const tddApiKeys = pgTable(getTableName("tddf_api_keys"), {
  id: serial("id").primaryKey(),
  keyName: text("key_name").notNull(),
  keyHash: text("key_hash").notNull(), // Hashed API key
  keyPrefix: text("key_prefix").notNull(), // First 8 chars for identification
  permissions: jsonb("permissions").notNull(), // Array of permission strings
  isActive: boolean("is_active").default(true),
  lastUsed: timestamp("last_used"),
  requestCount: integer("request_count").default(0),
  rateLimitPerMinute: integer("rate_limit_per_minute").default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  keyHashIdx: index("tddf_api_keys_hash_idx").on(table.keyHash),
  keyPrefixIdx: index("tddf_api_keys_prefix_idx").on(table.keyPrefix)
}));

export const tddApiRequestLogs = pgTable(getTableName("tddf_api_request_logs"), {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").references(() => tddApiKeys.id),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  requestParams: jsonb("request_params"),
  responseStatus: integer("response_status").notNull(),
  responseTime: integer("response_time"), // milliseconds
  requestSize: integer("request_size"), // bytes
  responseSize: integer("response_size"), // bytes
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
}, (table) => ({
  apiKeyTimeIdx: index("tddf_api_requests_key_time_idx").on(table.apiKeyId, table.requestedAt),
  endpointTimeIdx: index("tddf_api_requests_endpoint_time_idx").on(table.endpoint, table.requestedAt)
}));

export const tddApiFieldConfigs = pgTable(getTableName("tddf_api_field_configs"), {
  id: serial("id").primaryKey(),
  schemaId: integer("schema_id").references(() => tddApiSchemas.id).notNull(),
  recordType: text("record_type").notNull(),
  fieldName: text("field_name").notNull(),
  isSelected: boolean("is_selected").default(true),
  displayName: text("display_name"),
  sortOrder: integer("sort_order").default(0),
  isFilterable: boolean("is_filterable").default(false),
  dataType: text("data_type"), // string, number, date, boolean
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").notNull(),
}, (table) => ({
  schemaRecordFieldIdx: unique().on(table.schemaId, table.recordType, table.fieldName)
}));

export const tddApiProcessingQueue = pgTable(getTableName("tddf_api_processing_queue"), {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").references(() => tddApiFiles.id).notNull(),
  priority: integer("priority").default(50), // 1-100, higher = more urgent
  status: text("status").notNull().default("queued"), // queued, processing, completed, failed
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  errorMessage: text("error_message"),
  processingStarted: timestamp("processing_started"),
  processingCompleted: timestamp("processing_completed"),
  queuedAt: timestamp("queued_at").defaultNow().notNull(),
}, (table) => ({
  statusPriorityIdx: index("tddf_api_queue_status_priority_idx").on(table.status, table.priority),
  queuedAtIdx: index("tddf_api_queue_queued_at_idx").on(table.queuedAt)
}));

// Zod schemas for TDDF API
export const insertTddfApiSchemaSchema = createInsertSchema(tddApiSchemas);
export const insertTddfApiFileSchema = createInsertSchema(tddApiFiles);
export const insertTddfApiRecordSchema = createInsertSchema(tddApiRecords);
export const insertTddfApiKeySchema = createInsertSchema(tddApiKeys);
export const insertTddfApiRequestLogSchema = createInsertSchema(tddApiRequestLogs);
export const insertTddfApiFieldConfigSchema = createInsertSchema(tddApiFieldConfigs);
export const insertTddfApiProcessingQueueSchema = createInsertSchema(tddApiProcessingQueue);

export type TddfApiSchema = typeof tddApiSchemas.$inferSelect;
export type TddfApiFile = typeof tddApiFiles.$inferSelect;
export type TddfApiRecord = typeof tddApiRecords.$inferSelect;
export type TddfApiKey = typeof tddApiKeys.$inferSelect;
export type TddfApiRequestLog = typeof tddApiRequestLogs.$inferSelect;
export type TddfApiFieldConfig = typeof tddApiFieldConfigs.$inferSelect;
export type TddfApiProcessingQueue = typeof tddApiProcessingQueue.$inferSelect;

export type InsertTddfApiSchema = typeof insertTddfApiSchemaSchema._type;
export type InsertTddfApiFile = typeof insertTddfApiFileSchema._type;
export type InsertTddfApiRecord = typeof insertTddfApiRecordSchema._type;
export type InsertTddfApiKey = typeof insertTddfApiKeySchema._type;
export type InsertTddfApiRequestLog = typeof insertTddfApiRequestLogSchema._type;
export type InsertTddfApiFieldConfig = typeof insertTddfApiFieldConfigSchema._type;
export type InsertTddfApiProcessingQueue = typeof insertTddfApiProcessingQueueSchema._type;

// TDDF Archive System - Permanent storage for processed TDDF files
export const tddfArchive = pgTable(getTableName("tddf_archive"), {
  id: serial("id").primaryKey(),
  
  // Archive Identification
  archiveFilename: text("archive_filename").notNull(), // Filename in archive
  originalFilename: text("original_filename").notNull(), // Original upload filename
  
  // Archive Storage Paths
  archivePath: text("archive_path").notNull(), // Full path in archive storage (dev-tddf-archive/ or prod-tddf-archive/)
  originalUploadPath: text("original_upload_path"), // Original transitory upload path
  
  // File Metadata
  fileSize: integer("file_size").notNull(),
  fileHash: text("file_hash").notNull(), // SHA-256 hash for integrity
  contentType: text("content_type").default("text/plain"),
  
  // Archive Status & Processing
  archiveStatus: text("archive_status").notNull().default("pending"), // pending, archived, processed, failed
  step6Status: text("step6_status").default("pending"), // pending, processing, completed, failed
  
  // Record Counts
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  errorRecords: integer("error_records").default(0),
  
  // Business Date Fields
  businessDay: date("business_day"), // Extracted from filename
  fileDate: text("file_date"), // Raw date from filename (MMDDYYYY)
  
  // Relationships
  originalUploadId: text("original_upload_id"), // Reference to uploaderUploads.id
  apiFileId: integer("api_file_id"), // Reference to tddApiFiles.id if processed
  
  // Processing Timestamps
  archivedAt: timestamp("archived_at"), // When file was copied to archive
  step6ProcessedAt: timestamp("step6_processed_at"), // When Step 6 processing completed
  
  // Metadata & Integrity
  metadata: jsonb("metadata"), // Archive-specific metadata
  processingErrors: jsonb("processing_errors"), // Any processing errors
  
  // Audit Fields
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").notNull()
}, (table) => ({
  archiveFilenameIdx: index("tddf_archive_filename_idx").on(table.archiveFilename),
  archivePathIdx: index("tddf_archive_path_idx").on(table.archivePath),
  fileHashIdx: index("tddf_archive_hash_idx").on(table.fileHash),
  archiveStatusIdx: index("tddf_archive_status_idx").on(table.archiveStatus),
  step6StatusIdx: index("tddf_archive_step6_status_idx").on(table.step6Status),
  businessDayIdx: index("tddf_archive_business_day_idx").on(table.businessDay),
  archivedAtIdx: index("tddf_archive_archived_at_idx").on(table.archivedAt),
  originalUploadIdIdx: index("tddf_archive_upload_id_idx").on(table.originalUploadId),
  apiFileIdIdx: index("tddf_archive_api_file_id_idx").on(table.apiFileId)
}));

// TDDF Archive Zod schemas and types
export const insertTddfArchiveSchema = createInsertSchema(tddfArchive).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type TddfArchive = typeof tddfArchive.$inferSelect;
export type InsertTddfArchive = typeof insertTddfArchiveSchema._type;

// TDDF Archive Records - Permanent storage for archived TDDF records
// Matches dev_uploader_tddf_jsonb_records structure with archive flags
export const tddfArchiveRecords = pgTable(getTableName("tddf_archive_records"), {
  id: serial("id").primaryKey(),
  uploadId: text("upload_id"), // Original upload reference (may be null for orphaned records)
  recordType: text("record_type").notNull(), // DT, BH, P1, P2, etc.
  recordData: jsonb("record_data").notNull(), // Complete TDDF record as JSON
  processingStatus: text("processing_status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // Extended TDDF metadata fields (matching uploader_tddf_jsonb_records)
  recordIdentifier: text("record_identifier"),
  lineNumber: integer("line_number"),
  rawLine: text("raw_line"),
  fieldCount: integer("field_count"),
  originalFilename: text("original_filename"),
  fileProcessingDate: date("file_processing_date"),
  fileSequenceNumber: text("file_sequence_number"),
  fileProcessingTime: text("file_processing_time"),
  fileSystemId: text("file_system_id"),
  mainframeProcessData: jsonb("mainframe_process_data"),
  merchantAccountNumber: text("merchant_account_number"),
  rawLineHash: text("raw_line_hash"),
  
  // Archive tracking fields
  isArchived: boolean("is_archived").default(true).notNull(), // Always true for archive records
  archivedAt: timestamp("archived_at").notNull(),
  archiveFileId: integer("archive_file_id").notNull().references(() => tddfArchive.id),
  
  processedAt: timestamp("processed_at")
}, (table) => ({
  recordTypeIdx: index("tddf_archive_records_record_type_idx").on(table.recordType),
  archiveFileIdIdx: index("tddf_archive_records_archive_file_id_idx").on(table.archiveFileId),
  merchantAccountIdx: index("tddf_archive_records_merchant_account_idx").on(table.merchantAccountNumber),
  rawLineHashIdx: index("tddf_archive_records_raw_line_hash_idx").on(table.rawLineHash),
  archivedAtIdx: index("tddf_archive_records_archived_at_idx").on(table.archivedAt)
}));

// TDDF Archive Records Zod schemas and types
export const insertTddfArchiveRecordsSchema = createInsertSchema(tddfArchiveRecords).omit({
  id: true,
  createdAt: true
});
export type TddfArchiveRecord = typeof tddfArchiveRecords.$inferSelect;
export type InsertTddfArchiveRecord = typeof insertTddfArchiveRecordsSchema._type;

// TDDF Daily View System Tables - Complete isolation from existing systems
// Master table containing all TDDF records organized for daily view
export const tddfDatamaster = pgTable(getTableName("tddf_datamaster"), {
  id: serial("id").primaryKey(),
  
  // Core Header Fields (positions 1-23)
  sequenceNumber: text("sequence_number"), // Positions 1-7
  entryRunNumber: text("entry_run_number"), // Positions 8-13
  sequenceWithinRun: text("sequence_within_run"), // Positions 14-17
  recordIdentifier: text("record_identifier"), // Positions 18-19: BH, DT, P1, P2, etc.
  bankNumber: text("bank_number"), // Positions 20-23
  
  // Account & Merchant Fields (positions 24-55)
  merchantAccountNumber: text("merchant_account_number"), // Positions 24-39 (16 chars)
  associationNumber: text("association_number"), // Positions 40-45 (6 chars)
  groupNumber: text("group_number"), // Positions 46-51 (6 chars)
  transactionCode: text("transaction_code"), // Positions 52-55
  
  // Critical Date Fields for Daily Organization
  batchDate: date("batch_date"), // Primary daily grouping field
  transactionDate: date("transaction_date"), // Positions 85-92 MMDDCCYY
  authorizationDateTime: timestamp("authorization_date_time"), // Authorization timestamp
  
  // Transaction & Financial Fields
  referenceNumber: text("reference_number"), // Positions 62-84 (23 chars)
  transactionAmount: numeric("transaction_amount", { precision: 15, scale: 2 }), // Positions 93-103
  netDeposit: numeric("net_deposit", { precision: 17, scale: 2 }), // Positions 109-123
  cardholderAccountNumber: text("cardholder_account_number"), // Positions 124-142
  
  // Authorization & Processing Fields
  authAmount: numeric("auth_amount", { precision: 14, scale: 2 }), // Positions 192-203
  authResponseCode: text("auth_response_code"), // Positions 208-209
  posEntryMode: text("pos_entry_mode"), // Positions 214-215
  debitCreditIndicator: text("debit_credit_indicator"), // Position 216
  reversalFlag: text("reversal_flag"), // Position 217
  merchantName: text("merchant_name"), // Positions 218-242 (25 chars)
  authorizationNumber: text("authorization_number"), // Positions 243-248
  cardType: text("card_type"), // Positions 253-254
  
  // MCC and Terminal Info
  mccCode: text("mcc_code"), // Positions 273-276
  terminalId: text("terminal_id"), // Positions 277-284
  transactionTypeIdentifier: text("transaction_type_identifier"), // Positions 336-338
  
  // Data Integrity & Traceability Fields
  sourceFileId: text("source_file_id"),
  sourceRowNumber: integer("source_row_number"),
  rawData: jsonb("raw_data"), // Complete original record
  mmsRawLine: text("mms_raw_line"), // Original line before processing
  filename: text("filename"), // Original TDDF filename
  processingTimestamp: timestamp("processing_timestamp").defaultNow(),
  
  // Daily Organization Fields
  processingDate: date("processing_date"), // Date for daily grouping
  recordTypeClean: text("record_type_clean"), // Standardized: BH, DT, P1, P2
  dailyBatchId: text("daily_batch_id"), // Organize records within daily batches
  importSessionId: text("import_session_id"), // Track import session
  
  // Audit fields
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  batchDateIdx: index("tddf_datamaster_batch_date_idx").on(table.batchDate),
  transactionDateIdx: index("tddf_datamaster_transaction_date_idx").on(table.transactionDate),
  merchantAccountIdx: index("tddf_datamaster_merchant_account_idx").on(table.merchantAccountNumber),
  recordTypeIdx: index("tddf_datamaster_record_type_idx").on(table.recordTypeClean),
  processingDateIdx: index("tddf_datamaster_processing_date_idx").on(table.processingDate),
  sourceFileIdx: index("tddf_datamaster_source_file_idx").on(table.sourceFileId)
}));

// Daily Stats Cache Table
export const tddfApiDailyStats = pgTable(getTableName("tddf_api_daily_stats"), {
  id: serial("id").primaryKey(),
  processingDate: date("processing_date").notNull(),
  totalRecords: integer("total_records").default(0),
  totalFiles: integer("total_files").default(0),
  totalTransactionAmount: numeric("total_transaction_amount", { precision: 18, scale: 2 }).default("0"),
  totalNetDeposits: numeric("total_net_deposits", { precision: 18, scale: 2 }).default("0"),
  totalAuthAmount: numeric("total_auth_amount", { precision: 18, scale: 2 }).default("0"),
  bhRecordCount: integer("bh_record_count").default(0), // Batch count
  dtRecordCount: integer("dt_record_count").default(0), // Transaction count
  p1RecordCount: integer("p1_record_count").default(0),
  p2RecordCount: integer("p2_record_count").default(0),
  otherRecordCount: integer("other_record_count").default(0),
  uniqueMerchants: integer("unique_merchants").default(0),
  uniqueTerminals: integer("unique_terminals").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  cacheBuiltAt: timestamp("cache_built_at").defaultNow().notNull()
}, (table) => ({
  processingDateIdx: unique().on(table.processingDate)
}));

// Daily Merchant Totals Cache Table
export const tddfApiDailyMerchantTotals = pgTable(getTableName("tddf_api_daily_merchant_totals"), {
  id: serial("id").primaryKey(),
  processingDate: date("processing_date").notNull(),
  merchantAccountNumber: text("merchant_account_number").notNull(),
  merchantName: text("merchant_name"),
  transactionCount: integer("transaction_count").default(0),
  batchCount: integer("batch_count").default(0),
  totalTransactionAmount: numeric("total_transaction_amount", { precision: 15, scale: 2 }).default("0"),
  totalNetDeposits: numeric("total_net_deposits", { precision: 17, scale: 2 }).default("0"),
  totalAuthAmount: numeric("total_auth_amount", { precision: 14, scale: 2 }).default("0"),
  recordTypeBreakdown: jsonb("record_type_breakdown"), // {BH: 5, DT: 245, P1: 12}
  lastUpdated: timestamp("last_updated").defaultNow(),
  cacheBuiltAt: timestamp("cache_built_at").defaultNow().notNull()
}, (table) => ({
  dailyMerchantIdx: unique().on(table.processingDate, table.merchantAccountNumber),
  processingDateIdx: index("tddf_api_daily_merchant_processing_date_idx").on(table.processingDate)
}));

// Daily Record Breakdown Cache Table  
export const tddfApiDailyRecordBreakdown = pgTable(getTableName("tddf_api_daily_record_breakdown"), {
  id: serial("id").primaryKey(),
  processingDate: date("processing_date").notNull(),
  recordType: text("record_type").notNull(), // BH, DT, P1, P2, etc.
  recordCount: integer("record_count").default(0),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).default("0"),
  uniqueMerchants: integer("unique_merchants").default(0),
  uniqueTerminals: integer("unique_terminals").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  cacheBuiltAt: timestamp("cache_built_at").defaultNow().notNull()
}, (table) => ({
  dailyRecordTypeIdx: unique().on(table.processingDate, table.recordType),
  processingDateIdx: index("tddf_api_daily_breakdown_processing_date_idx").on(table.processingDate)
}));

// Daily Import Status Table
export const tddfApiDailyImportStatus = pgTable(getTableName("tddf_api_daily_import_status"), {
  id: serial("id").primaryKey(),
  sourceFileId: text("source_file_id").notNull(), // From TDDF API files
  sourceRecordCount: integer("source_record_count").default(0),
  importedRecordCount: integer("imported_record_count").default(0),
  importStatus: text("import_status").default("pending"), // pending, processing, completed, failed
  importStarted: timestamp("import_started"),
  importCompleted: timestamp("import_completed"),
  errorMessage: text("error_message"),
  processingDate: date("processing_date"), // Date this import represents
  importSessionId: text("import_session_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  sourceFileIdx: index("tddf_api_daily_import_source_file_idx").on(table.sourceFileId),
  importSessionIdx: index("tddf_api_daily_import_session_idx").on(table.importSessionId),
  processingDateIdx: index("tddf_api_daily_import_processing_date_idx").on(table.processingDate)
}));

// Daily Cache Metadata Table
export const tddfApiDailyCacheMetadata = pgTable(getTableName("tddf_api_daily_cache_metadata"), {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(), // Which cache table this represents
  processingDate: date("processing_date"), // Date range covered (null for all-time caches)
  lastCacheBuild: timestamp("last_cache_build").defaultNow(),
  cacheStatus: text("cache_status").default("stale"), // fresh, stale, building, error
  recordCount: integer("record_count").default(0),
  buildDurationMs: integer("build_duration_ms"),
  sourceRecordCount: integer("source_record_count"), // From datamaster
  buildNotes: text("build_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  tableNameDateIdx: unique().on(table.tableName, table.processingDate),
  lastBuildIdx: index("tddf_api_daily_cache_last_build_idx").on(table.lastCacheBuild)
}));

// Daily Processing Log Table
export const tddfApiDailyProcessingLog = pgTable(getTableName("tddf_api_daily_processing_log"), {
  id: serial("id").primaryKey(),
  operation: text("operation").notNull(), // import, cache_build, data_refresh
  operationDetails: text("operation_details"),
  status: text("status").notNull(), // started, completed, failed
  recordsProcessed: integer("records_processed").default(0),
  processingDate: date("processing_date"),
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  sessionId: text("session_id"),
  createdBy: text("created_by").default("system")
}, (table) => ({
  operationDateIdx: index("tddf_api_daily_log_operation_date_idx").on(table.operation, table.processingDate),
  sessionIdx: index("tddf_api_daily_log_session_idx").on(table.sessionId),
  startTimeIdx: index("tddf_api_daily_log_start_time_idx").on(table.startTime)
}));

// System Settings Table - Store application-wide settings like Auto 6 toggle
export const systemSettings = pgTable(getTableName("system_settings"), {
  id: serial("id").primaryKey(),
  settingKey: text("setting_key").notNull().unique(), // e.g., 'auto_step6_enabled'
  settingValue: text("setting_value").notNull(), // Store as string, parse as needed
  settingType: text("setting_type").default("boolean"), // boolean, string, number, json
  description: text("description"), // Human-readable description
  lastUpdatedBy: text("last_updated_by").default("system"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// MCC TSYS Merchant Schema Configuration Table
export const merchantMccSchema = pgTable(getTableName("Merchant_MCC_Schema"), {
  id: serial("id").primaryKey(), // Auto-increment primary key
  position: text("position").notNull().unique(), // e.g., "4-Jan", "11-Jun", "20-35" - now editable
  fieldName: text("field_name").notNull(), // e.g., "Bank Number", "Association"
  key: text("key"), // Database column mapping key (e.g., "agent_bank_number", "dba_name")
  tabPosition: text("tab_position"), // Tab position in tab-delimited file (e.g., "1 (Unused #1)", "2 (Unused #2)")
  fieldLength: integer("field_length").notNull(), // e.g., 4, 6, 16
  format: text("format").notNull(), // e.g., "AN", "N"
  description: text("description"), // Field description
  mmsEnabled: integer("mms_enabled").notNull().default(0), // 0 or 1
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Zod schemas for TDDF Daily View System
export const insertTddfDatamasterSchema = createInsertSchema(tddfDatamaster);
export const insertTddfApiDailyStatsSchema = createInsertSchema(tddfApiDailyStats);
export const insertTddfApiDailyMerchantTotalsSchema = createInsertSchema(tddfApiDailyMerchantTotals);
export const insertTddfApiDailyRecordBreakdownSchema = createInsertSchema(tddfApiDailyRecordBreakdown);
export const insertTddfApiDailyImportStatusSchema = createInsertSchema(tddfApiDailyImportStatus);
export const insertTddfApiDailyCacheMetadataSchema = createInsertSchema(tddfApiDailyCacheMetadata);
export const insertTddfApiDailyProcessingLogSchema = createInsertSchema(tddfApiDailyProcessingLog);
export const insertSystemSettingsSchema = createInsertSchema(systemSettings);
export const insertMerchantMccSchemaSchema = createInsertSchema(merchantMccSchema).omit({ id: true, createdAt: true, updatedAt: true });

export type TddfDatamaster = typeof tddfDatamaster.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type TddfApiDailyStats = typeof tddfApiDailyStats.$inferSelect;
export type TddfApiDailyMerchantTotals = typeof tddfApiDailyMerchantTotals.$inferSelect;
export type TddfApiDailyRecordBreakdown = typeof tddfApiDailyRecordBreakdown.$inferSelect;
export type TddfApiDailyImportStatus = typeof tddfApiDailyImportStatus.$inferSelect;
export type TddfApiDailyCacheMetadata = typeof tddfApiDailyCacheMetadata.$inferSelect;
export type TddfApiDailyProcessingLog = typeof tddfApiDailyProcessingLog.$inferSelect;
export type MerchantMccSchema = typeof merchantMccSchema.$inferSelect;

export type InsertTddfDatamaster = typeof insertTddfDatamasterSchema._type;
export type InsertTddfApiDailyStats = typeof insertTddfApiDailyStatsSchema._type;
export type InsertTddfApiDailyMerchantTotals = typeof insertTddfApiDailyMerchantTotalsSchema._type;
export type InsertTddfApiDailyRecordBreakdown = typeof insertTddfApiDailyRecordBreakdownSchema._type;
export type InsertTddfApiDailyImportStatus = typeof insertTddfApiDailyImportStatusSchema._type;
export type InsertTddfApiDailyCacheMetadata = typeof insertTddfApiDailyCacheMetadataSchema._type;
export type InsertTddfApiDailyProcessingLog = typeof insertTddfApiDailyProcessingLogSchema._type;
export type InsertSystemSettings = typeof insertSystemSettingsSchema._type;
export type InsertMerchantMccSchema = z.infer<typeof insertMerchantMccSchemaSchema>;
