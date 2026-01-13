import { pgTable, text, timestamp, boolean, index, foreignKey, serial, integer, jsonb, unique, varchar, date, numeric, json, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const merchants = pgTable("merchants", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	clientMid: text("client_mid"),
	status: text().default('Pending').notNull(),
	merchantType: text("merchant_type"),
	salesChannel: text("sales_channel"),
	address: text(),
	city: text(),
	state: text(),
	zipCode: text("zip_code"),
	country: text(),
	category: text(),
	otherClientNumber1: text("other_client_number1"),
	otherClientNumber2: text("other_client_number2"),
	clientSinceDate: timestamp("client_since_date", { withTimezone: true, mode: 'string' }),
	lastUploadDate: timestamp("last_upload_date", { withTimezone: true, mode: 'string' }),
	editDate: timestamp("edit_date", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	asOfDate: timestamp("as_of_date", { withTimezone: true, mode: 'string' }),
	updatedBy: text("updated_by"),
});

export const uploadedFiles = pgTable("uploaded_files", {
	id: text().primaryKey().notNull(),
	originalFilename: text("original_filename").notNull(),
	storagePath: text("storage_path").notNull(),
	fileType: text("file_type").notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	processed: boolean().default(false).notNull(),
	processingErrors: text("processing_errors"),
	deleted: boolean().default(false).notNull(),
});

export const auditLogs = pgTable("audit_logs", {
	id: serial().primaryKey().notNull(),
	entityType: text("entity_type").notNull(),
	entityId: text("entity_id").notNull(),
	action: text().notNull(),
	userId: integer("user_id"),
	username: text().notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	oldValues: jsonb("old_values"),
	newValues: jsonb("new_values"),
	changedFields: text("changed_fields").array(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	notes: text(),
}, (table) => [
	index("audit_logs_entity_id_idx").using("btree", table.entityId.asc().nullsLast().op("text_ops")),
	index("audit_logs_entity_type_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops")),
	index("audit_logs_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("audit_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "audit_logs_user_id_fkey"
		}),
]);

export const systemLogs = pgTable("system_logs", {
	id: serial().primaryKey().notNull(),
	level: text().notNull(),
	source: text().notNull(),
	message: text().notNull(),
	details: jsonb(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	hostname: text(),
	processId: text("process_id"),
	sessionId: text("session_id"),
	correlationId: text("correlation_id"),
	stackTrace: text("stack_trace"),
}, (table) => [
	index("system_logs_level_idx").using("btree", table.level.asc().nullsLast().op("text_ops")),
	index("system_logs_source_idx").using("btree", table.source.asc().nullsLast().op("text_ops")),
	index("system_logs_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	password: text().notNull(),
	email: text(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	role: text().default('user').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }),
	developerFlag: boolean("developer_flag").default(false),
	darkMode: boolean("dark_mode").default(false),
	canCreateUsers: boolean("can_create_users").default(true),
	defaultDashboard: varchar("default_dashboard").default('merchants'),
	themePreference: varchar("theme_preference").default('system'),
}, (table) => [
	unique("users_username_key").on(table.username),
]);

export const terminals = pgTable("terminals", {
	id: serial().primaryKey().notNull(),
	vNumber: text("v_number").notNull(),
	posMerchantNumber: text("pos_merchant_number"),
	bin: text(),
	dbaName: text("dba_name"),
	dailyAuth: text("daily_auth"),
	dialPay: text("dial_pay"),
	encryption: text(),
	prr: text(),
	mcc: text(),
	ssl: text(),
	tokenization: text(),
	agent: text(),
	chain: text(),
	store: text(),
	terminalInfo: text("terminal_info"),
	recordStatus: text("record_status"),
	boardDate: date("board_date"),
	terminalVisa: text("terminal_visa"),
	terminalType: text("terminal_type").default('unknown'),
	status: text().default('Active'),
	location: text(),
	mType: text("m_type"),
	mLocation: text("m_location"),
	installationDate: date("installation_date"),
	hardwareModel: text("hardware_model"),
	manufacturer: text(),
	firmwareVersion: text("firmware_version"),
	networkType: text("network_type"),
	ipAddress: text("ip_address"),
	genericField1: text("generic_field1"),
	genericField2: text("generic_field2"),
	description: text(),
	notes: text(),
	internalNotes: text("internal_notes"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdBy: text("created_by").default('System Import'),
	updatedBy: text("updated_by").default('System Import'),
	lastActivity: timestamp("last_activity", { withTimezone: true, mode: 'string' }),
	lastUpdate: timestamp("last_update", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updateSource: text("update_source").default('System Import'),
	lastSyncDate: timestamp("last_sync_date", { withTimezone: true, mode: 'string' }),
	syncStatus: text("sync_status").default('Pending'),
}, (table) => [
	unique("terminals_v_number_key").on(table.vNumber),
]);

export const apiUsers = pgTable("api_users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	apiKey: text("api_key").notNull(),
	permissions: jsonb().default([]),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	lastUsed: timestamp("last_used", { withTimezone: true, mode: 'string' }),
	description: text(),
}, (table) => [
	unique("api_users_username_key").on(table.username),
	unique("api_users_api_key_key").on(table.apiKey),
]);

export const processingMetrics = pgTable("processing_metrics", {
	id: serial().primaryKey().notNull(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	filesProcessed: integer("files_processed").default(0),
	recordsProcessed: integer("records_processed").default(0),
	errorsCount: integer("errors_count").default(0),
	processingTimeMs: integer("processing_time_ms").default(0),
	metricType: text("metric_type").default('snapshot'),
	dtRecordsProcessed: integer("dt_records_processed").default(0),
	bhRecordsProcessed: integer("bh_records_processed").default(0),
	p1RecordsProcessed: integer("p1_records_processed").default(0),
	otherRecordsProcessed: integer("other_records_processed").default(0),
	nonDtRecordsSkipped: integer("non_dt_records_skipped").default(0),
	otherSkipped: integer("other_skipped").default(0),
	systemStatus: text("system_status").default('operational'),
});

export const tddfRecords = pgTable("tddf_records", {
	id: serial().primaryKey().notNull(),
	sequenceNumber: text("sequence_number"),
	referenceNumber: text("reference_number"),
	merchantName: text("merchant_name"),
	transactionAmount: numeric("transaction_amount", { precision: 15, scale:  2 }),
	transactionDate: date("transaction_date"),
	terminalId: text("terminal_id"),
	cardType: text("card_type"),
	authorizationNumber: text("authorization_number"),
	merchantAccountNumber: text("merchant_account_number"),
	mccCode: text("mcc_code"),
	transactionTypeIdentifier: text("transaction_type_identifier"),
	associationNumber1: text("association_number_1"),
	associationNumber2: text("association_number_2"),
	transactionCode: text("transaction_code"),
	cardholderAccountNumber: text("cardholder_account_number"),
	groupNumber: text("group_number"),
	batchJulianDate: text("batch_julian_date"),
	debitCreditIndicator: text("debit_credit_indicator"),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	sourceRowNumber: integer("source_row_number"),
	rawData: text("raw_data"),
	mmsRawLine: text("mms_raw_line"),
}, (table) => [
	index("idx_tddf_records_reference_number").using("btree", table.referenceNumber.asc().nullsLast().op("text_ops")),
]);

export const tddfRawImport = pgTable("tddf_raw_import", {
	id: serial().primaryKey().notNull(),
	sourceFileId: text("source_file_id").notNull(),
	lineNumber: integer("line_number").notNull(),
	recordType: text("record_type"),
	rawLine: text("raw_line").notNull(),
	processingStatus: text("processing_status").default('pending'),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	skipReason: text("skip_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	targetTable: text("target_table"),
	errorMessage: text("error_message"),
}, (table) => [
	index("idx_tddf_raw_import_processing_status").using("btree", table.processingStatus.asc().nullsLast().op("text_ops")),
	index("idx_tddf_raw_import_source_file").using("btree", table.sourceFileId.asc().nullsLast().op("text_ops")),
]);

export const tddfBatchHeaders = pgTable("tddf_batch_headers", {
	id: serial().primaryKey().notNull(),
	bhRecordNumber: text("bh_record_number"),
	recordIdentifier: text("record_identifier").default('BH'),
	transactionCode: text("transaction_code"),
	batchDate: text("batch_date"),
	batchJulianDate: text("batch_julian_date"),
	netDeposit: numeric("net_deposit", { precision: 15, scale:  2 }),
	rejectReason: text("reject_reason"),
	merchantAccountNumber: text("merchant_account_number"),
	sourceFileId: text("source_file_id"),
	sourceRowNumber: integer("source_row_number"),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	rawData: jsonb("raw_data"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const tddfPurchasingExtensions = pgTable("tddf_purchasing_extensions", {
	id: serial().primaryKey().notNull(),
	recordIdentifier: text("record_identifier").default('P1'),
	parentDtReference: text("parent_dt_reference"),
	taxAmount: numeric("tax_amount", { precision: 15, scale:  2 }),
	discountAmount: numeric("discount_amount", { precision: 15, scale:  2 }),
	freightAmount: numeric("freight_amount", { precision: 15, scale:  2 }),
	dutyAmount: numeric("duty_amount", { precision: 15, scale:  2 }),
	purchaseIdentifier: text("purchase_identifier"),
	sourceFileId: text("source_file_id"),
	sourceRowNumber: integer("source_row_number"),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	rawData: jsonb("raw_data"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const tddfOtherRecords = pgTable("tddf_other_records", {
	id: serial().primaryKey().notNull(),
	recordType: text("record_type").notNull(),
	referenceNumber: text("reference_number"),
	merchantAccount: text("merchant_account"),
	transactionDate: date("transaction_date"),
	amount: numeric({ precision: 15, scale:  2 }),
	description: text(),
	sourceFileId: text("source_file_id"),
	sourceRowNumber: integer("source_row_number"),
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	rawData: jsonb("raw_data"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const tddfJsonb = pgTable("tddf_jsonb", {
	id: serial().primaryKey().notNull(),
	uploadId: text("upload_id").notNull(),
	filename: text().notNull(),
	recordType: text("record_type").notNull(),
	lineNumber: integer("line_number").notNull(),
	rawLine: text("raw_line").notNull(),
	extractedFields: jsonb("extracted_fields").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_tddf_jsonb_extracted_fields").using("gin", table.extractedFields.asc().nullsLast().op("jsonb_ops")),
	index("idx_tddf_jsonb_record_type").using("btree", table.recordType.asc().nullsLast().op("text_ops")),
	index("idx_tddf_jsonb_upload_id").using("btree", table.uploadId.asc().nullsLast().op("text_ops")),
]);

export const uploaderJson = pgTable("uploader_json", {
	id: serial().primaryKey().notNull(),
	uploadId: text("upload_id").notNull(),
	rawLineData: text("raw_line_data"),
	processedJson: jsonb("processed_json"),
	fieldSeparationData: jsonb("field_separation_data"),
	processingTimeMs: integer("processing_time_ms"),
	errors: jsonb(),
	sourceFileName: text("source_file_name"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_uploader_json_upload_id").using("btree", table.uploadId.asc().nullsLast().op("text_ops")),
]);

export const uploaderTddfJsonbRecords = pgTable("uploader_tddf_jsonb_records", {
	id: serial().primaryKey().notNull(),
	uploadId: text("upload_id").notNull(),
	recordType: text("record_type").notNull(),
	lineNumber: integer("line_number").notNull(),
	rawLine: text("raw_line").notNull(),
	extractedFields: jsonb("extracted_fields").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_uploader_tddf_jsonb_records_record_type").using("btree", table.recordType.asc().nullsLast().op("text_ops")),
	index("idx_uploader_tddf_jsonb_records_upload_id").using("btree", table.uploadId.asc().nullsLast().op("text_ops")),
]);

export const uploaderMastercardDiEditRecords = pgTable("uploader_mastercard_di_edit_records", {
	id: serial().primaryKey().notNull(),
	uploadId: text("upload_id").notNull(),
	recordData: jsonb("record_data").notNull(),
	processingStatus: text("processing_status").default('pending'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_uploader_mastercard_di_edit_records_upload_id").using("btree", table.uploadId.asc().nullsLast().op("text_ops")),
]);

export const backupHistory = pgTable("backup_history", {
	id: text().primaryKey().notNull(),
	fileName: text("file_name").notNull(),
	filePath: text("file_path"),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	size: integer().notNull(),
	tables: jsonb().notNull(),
	notes: text(),
	downloaded: boolean().default(false).notNull(),
	deleted: boolean().default(false).notNull(),
	storageType: text("storage_type").default('local').notNull(),
	s3Bucket: text("s3_bucket"),
	s3Key: text("s3_key"),
});

export const backupSchedules = pgTable("backup_schedules", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	frequency: text().notNull(),
	timeOfDay: text("time_of_day").notNull(),
	dayOfWeek: integer("day_of_week"),
	dayOfMonth: integer("day_of_month"),
	enabled: boolean().default(true).notNull(),
	useS3: boolean("use_s3").default(false).notNull(),
	retentionDays: integer("retention_days").default(30).notNull(),
	lastRun: timestamp("last_run", { withTimezone: true, mode: 'string' }),
	nextRun: timestamp("next_run", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	notes: text(),
	createdBy: text("created_by"),
});

export const schemaVersions = pgTable("schema_versions", {
	id: serial().primaryKey().notNull(),
	version: text().notNull(),
	description: text().notNull(),
	changes: jsonb(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	appliedBy: text("applied_by"),
	script: text(),
});

export const schemaContent = pgTable("schema_content", {
	id: serial().primaryKey().notNull(),
	version: text().notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	appliedBy: text("applied_by").default('Alex-ReplitAgent'),
}, (table) => [
	index("idx_schema_content_version").using("btree", table.version.asc().nullsLast().op("text_ops")),
]);

export const apiAchtransactions = pgTable("api_achtransactions", {
	id: serial().primaryKey().notNull(),
	merchantId: varchar("merchant_id", { length: 255 }),
	amount: numeric({ precision: 10, scale:  2 }),
	date: date(),
	type: varchar({ length: 100 }),
	description: text(),
	traceNumber: varchar("trace_number", { length: 255 }),
	rawData: jsonb("raw_data"),
	sourceFileId: integer("source_file_id"),
	sourceRowNumber: integer("source_row_number"),
	recordedAt: timestamp("recorded_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const apiMerchants = pgTable("api_merchants", {
	id: varchar({ length: 255 }).primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	clientMid: varchar("client_mid", { length: 255 }),
	status: varchar({ length: 100 }).default('Active'),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const apiTerminals = pgTable("api_terminals", {
	id: serial().primaryKey().notNull(),
	terminalId: varchar("terminal_id", { length: 255 }),
	merchantId: varchar("merchant_id", { length: 255 }),
	location: varchar({ length: 255 }),
	status: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const dashboardCache = pgTable("dashboard_cache", {
	id: serial().primaryKey().notNull(),
	cacheKey: varchar("cache_key", { length: 255 }).notNull(),
	cacheData: jsonb("cache_data"),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	refreshState: varchar("refresh_state", { length: 100 }),
	lastManualRefresh: timestamp("last_manual_refresh", { mode: 'string' }),
	buildTimeMs: integer("build_time_ms"),
}, (table) => [
	unique("dashboard_cache_cache_key_key").on(table.cacheKey),
]);

export const session = pgTable("session", {
	sid: varchar().primaryKey().notNull(),
	sess: json().notNull(),
	expire: timestamp({ precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const securityLogs = pgTable("security_logs", {
	id: serial().primaryKey().notNull(),
	eventType: text("event_type").notNull(),
	userId: integer("user_id"),
	username: text(),
	timestamp: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	resourceType: text("resource_type"),
	resourceId: text("resource_id"),
	action: text(),
	result: text().notNull(),
	details: jsonb(),
	sessionId: text("session_id"),
	reason: text(),
	severity: text().default('info'),
	message: text(),
	source: text().default('authentication'),
}, (table) => [
	index("security_logs_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("security_logs_result_idx").using("btree", table.result.asc().nullsLast().op("text_ops")),
	index("security_logs_timestamp_idx").using("btree", table.timestamp.asc().nullsLast().op("timestamptz_ops")),
	index("security_logs_username_idx").using("btree", table.username.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "security_logs_user_id_fkey"
		}),
]);

export const tddf1Totals = pgTable("tddf1_totals", {
	id: serial().primaryKey().notNull(),
	processingDate: date("processing_date").notNull(),
	fileDate: date("file_date"),
	totalFiles: integer("total_files").default(0),
	totalRecords: integer("total_records").default(0),
	dtTransactionAmounts: numeric("dt_transaction_amounts", { precision: 15, scale:  2 }).default('0'),
	bhNetDeposits: numeric("bh_net_deposits", { precision: 15, scale:  2 }).default('0'),
	recordBreakdown: jsonb("record_breakdown"),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_tddf1_totals_date").using("btree", table.processingDate.asc().nullsLast().op("date_ops")),
	index("idx_tddf1_totals_file_date").using("btree", table.fileDate.asc().nullsLast().op("date_ops")),
]);

export const devTddfApiSchemas = pgTable("dev_tddf_api_schemas", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	version: varchar({ length: 50 }).notNull(),
	description: text(),
	schemaData: jsonb("schema_data").notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	createdBy: varchar("created_by", { length: 100 }).notNull(),
});

export const transactions = pgTable("transactions", {
	id: text().primaryKey().notNull(),
	merchantId: text("merchant_id").notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	date: timestamp({ withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	type: text().default('Sale').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.merchantId],
			foreignColumns: [merchants.id],
			name: "transactions_merchant_id_fkey"
		}).onDelete("cascade"),
]);

export const devUploads = pgTable("dev_uploads", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	compressedPayload: jsonb("compressed_payload").notNull(),
	schemaInfo: jsonb("schema_info").notNull(),
	uploadDate: timestamp("upload_date", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	status: text().default('uploaded').notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	recordCount: integer("record_count"),
	processingTimeMs: integer("processing_time_ms"),
	notes: text(),
});

export const uploaderUploads = pgTable("uploader_uploads", {
	id: text().primaryKey().notNull(),
	filename: text().notNull(),
	fileType: text("file_type").notNull(),
	status: text().default('started').notNull(),
	sessionId: text("session_id"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }),
	identifiedAt: timestamp("identified_at", { withTimezone: true, mode: 'string' }),
	encodingAt: timestamp("encoding_at", { withTimezone: true, mode: 'string' }),
	processingAt: timestamp("processing_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }),
	lineCount: integer("line_count"),
	hasHeaders: boolean("has_headers"),
	fileFormat: text("file_format"),
	encodingDetected: text("encoding_detected"),
	storageKey: text("storage_key"),
	bucketName: text("bucket_name"),
	encodingStatus: text("encoding_status"),
	encodingTimeMs: integer("encoding_time_ms"),
	jsonRecordsCreated: integer("json_records_created"),
	processingErrors: text("processing_errors"),
	keepForReview: boolean("keep_for_review").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	uploadStatus: text("upload_status").default('pending').notNull(),
	startTime: timestamp("start_time", { mode: 'string' }).defaultNow(),
	currentPhase: text("current_phase").default('started'),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
	createdBy: text("created_by"),
	serverId: text("server_id"),
	uploadProgress: integer("upload_progress").default(0),
	chunkedUpload: boolean("chunked_upload").default(false),
	chunkCount: integer("chunk_count"),
	chunksUploaded: integer("chunks_uploaded").default(0),
}, (table) => [
	index("idx_uploader_uploads_file_type").using("btree", table.fileType.asc().nullsLast().op("text_ops")),
	index("idx_uploader_uploads_session_id").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("idx_uploader_uploads_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);
