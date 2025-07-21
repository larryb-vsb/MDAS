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
  uploadEnvironment: text("upload_environment").notNull().default("production") // Track which environment uploaded this file
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

// Zod schemas for merchants
export const merchantsSchema = createInsertSchema(merchants);
export const insertMerchantSchema = merchantsSchema.omit({ id: true });

// Zod schemas for transactions
export const transactionsSchema = createInsertSchema(transactions);
export const insertTransactionSchema = transactionsSchema.omit({ id: true });

// TDDF (Transaction Daily Detail File) table - specialized table for detailed transaction processing
export const tddfRecords = pgTable(getTableName("tddf_records"), {
  id: serial("id").primaryKey(),
  // Core TDDF fields
  txnId: text("txn_id").notNull(), // Transaction unique identifier
  merchantId: text("merchant_id").notNull(), // Merchant identifier
  txnAmount: numeric("txn_amount", { precision: 10, scale: 2 }).notNull(), // Transaction amount
  txnDate: timestamp("txn_date").notNull(), // Transaction date
  txnType: text("txn_type").notNull(), // Transaction type (SALE, REFUND, VOID, etc.)
  
  // Additional TDDF fields
  txnDesc: text("txn_desc"), // Transaction description
  merchantName: text("merchant_name"), // Merchant business name
  batchId: text("batch_id"), // Batch identifier for grouping
  authCode: text("auth_code"), // Authorization code
  cardType: text("card_type"), // Card type (VISA, MC, AMEX, etc.)
  entryMethod: text("entry_method"), // Entry method (CHIP, SWIPE, MANUAL, etc.)
  responseCode: text("response_code"), // Transaction response code
  cardholderAccountNumber: text("cardholder_account_number"), // Masked card number (e.g., ****1234)
  
  // System fields
  sourceFileId: text("source_file_id").references(() => uploadedFiles.id),
  sourceRowNumber: integer("source_row_number"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  rawData: jsonb("raw_data"), // Store the complete CSV row for reference
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  txnIdIndex: index("tddf_txn_id_idx").on(table.txnId),
  merchantIdIndex: index("tddf_merchant_id_idx").on(table.merchantId),
  dateIndex: index("tddf_date_idx").on(table.txnDate),
  batchIdIndex: index("tddf_batch_id_idx").on(table.batchId)
}));

// Zod schemas for uploaded files
export const uploadedFilesSchema = createInsertSchema(uploadedFiles);
export const insertUploadedFileSchema = uploadedFilesSchema.omit({ id: true });

// Zod schemas for TDDF records
export const tddfRecordsSchema = createInsertSchema(tddfRecords);
export const insertTddfRecordSchema = tddfRecordsSchema.omit({ id: true, createdAt: true, updatedAt: true });

// Zod schemas for backup history
export const backupHistorySchema = createInsertSchema(backupHistory);
export const insertBackupHistorySchema = backupHistorySchema.omit({ id: true });

// Zod schemas for backup schedules
export const backupSchedulesSchema = createInsertSchema(backupSchedules);
export const insertBackupScheduleSchema = backupSchedulesSchema.omit({ 
  id: true, 
  lastRun: true, 
  nextRun: true, 
  createdAt: true, 
  updatedAt: true 
});

// Zod schemas for schema versions
export const schemaVersionsSchema = createInsertSchema(schemaVersions);
export const insertSchemaVersionSchema = schemaVersionsSchema.omit({ id: true });

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
export type TddfRecord = typeof tddfRecords.$inferSelect;
export type InsertTddfRecord = typeof tddfRecords.$inferInsert;

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
  totalFiles: integer("total_files").notNull(),
  queuedFiles: integer("queued_files").notNull(),
  processedFiles: integer("processed_files").notNull(),
  filesWithErrors: integer("files_with_errors").notNull(),
  currentlyProcessing: integer("currently_processing").notNull(),
  averageProcessingTimeMs: integer("average_processing_time_ms"),
  systemStatus: text("system_status").notNull().default("idle"), // idle, processing, paused
  metricType: text("metric_type").notNull().default("snapshot"), // snapshot, peak_update, hourly_summary
  notes: text("notes")
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
export type Terminal = typeof terminals.$inferSelect;
export type InsertTerminal = z.infer<typeof insertTerminalSchema>;
