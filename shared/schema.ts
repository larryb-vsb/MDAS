import { pgTable, text, serial, integer, numeric, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Merchants table
export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientMID: text("client_mid"),
  otherClientNumber1: text("other_client_number1"),
  otherClientNumber2: text("other_client_number2"),
  clientSinceDate: timestamp("client_since_date"),
  status: text("status").notNull().default("Pending"),
  merchantType: text("merchant_type"), // Can be blank, "0", "1", "2", "3", or custom text
  salesChannel: text("sales_channel"),
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

// Transactions table
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  type: text("type").notNull().default("Sale")
});

// Uploaded files table 
export const uploadedFiles = pgTable("uploaded_files", {
  id: text("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path"),
  fileType: text("file_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
  processingErrors: text("processing_errors"),
  deleted: boolean("deleted").default(false).notNull()
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

// Zod schemas for uploaded files
export const uploadedFilesSchema = createInsertSchema(uploadedFiles);
export const insertUploadedFileSchema = uploadedFilesSchema.omit({ id: true });

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
export const users = pgTable("users", {
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

// Audit log table with performance optimizations
export const auditLogs = pgTable("audit_logs", {
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
