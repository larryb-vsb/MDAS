-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_mid" text,
	"status" text DEFAULT 'Pending' NOT NULL,
	"merchant_type" text,
	"sales_channel" text,
	"address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"country" text,
	"category" text,
	"other_client_number1" text,
	"other_client_number2" text,
	"client_since_date" timestamp with time zone,
	"last_upload_date" timestamp with time zone,
	"edit_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"as_of_date" timestamp with time zone,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" text PRIMARY KEY NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_type" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processing_errors" text,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"user_id" integer,
	"username" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"changed_fields" text[],
	"ip_address" text,
	"user_agent" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"hostname" text,
	"process_id" text,
	"session_id" text,
	"correlation_id" text,
	"stack_trace" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"first_name" text,
	"last_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"last_login" timestamp with time zone,
	"developer_flag" boolean DEFAULT false,
	"dark_mode" boolean DEFAULT false,
	"can_create_users" boolean DEFAULT true,
	"default_dashboard" varchar DEFAULT 'merchants',
	"theme_preference" varchar DEFAULT 'system',
	CONSTRAINT "users_username_key" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "terminals" (
	"id" serial PRIMARY KEY NOT NULL,
	"v_number" text NOT NULL,
	"pos_merchant_number" text,
	"bin" text,
	"dba_name" text,
	"daily_auth" text,
	"dial_pay" text,
	"encryption" text,
	"prr" text,
	"mcc" text,
	"ssl" text,
	"tokenization" text,
	"agent" text,
	"chain" text,
	"store" text,
	"terminal_info" text,
	"record_status" text,
	"board_date" date,
	"terminal_visa" text,
	"terminal_type" text DEFAULT 'unknown',
	"status" text DEFAULT 'Active',
	"location" text,
	"m_type" text,
	"m_location" text,
	"installation_date" date,
	"hardware_model" text,
	"manufacturer" text,
	"firmware_version" text,
	"network_type" text,
	"ip_address" text,
	"generic_field1" text,
	"generic_field2" text,
	"description" text,
	"notes" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_by" text DEFAULT 'System Import',
	"updated_by" text DEFAULT 'System Import',
	"last_activity" timestamp with time zone,
	"last_update" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"update_source" text DEFAULT 'System Import',
	"last_sync_date" timestamp with time zone,
	"sync_status" text DEFAULT 'Pending',
	CONSTRAINT "terminals_v_number_key" UNIQUE("v_number")
);
--> statement-breakpoint
CREATE TABLE "api_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"api_key" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"last_used" timestamp with time zone,
	"description" text,
	CONSTRAINT "api_users_username_key" UNIQUE("username"),
	CONSTRAINT "api_users_api_key_key" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "processing_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"files_processed" integer DEFAULT 0,
	"records_processed" integer DEFAULT 0,
	"errors_count" integer DEFAULT 0,
	"processing_time_ms" integer DEFAULT 0,
	"metric_type" text DEFAULT 'snapshot',
	"dt_records_processed" integer DEFAULT 0,
	"bh_records_processed" integer DEFAULT 0,
	"p1_records_processed" integer DEFAULT 0,
	"other_records_processed" integer DEFAULT 0,
	"non_dt_records_skipped" integer DEFAULT 0,
	"other_skipped" integer DEFAULT 0,
	"system_status" text DEFAULT 'operational'
);
--> statement-breakpoint
CREATE TABLE "tddf_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_number" text,
	"reference_number" text,
	"merchant_name" text,
	"transaction_amount" numeric(15, 2),
	"transaction_date" date,
	"terminal_id" text,
	"card_type" text,
	"authorization_number" text,
	"merchant_account_number" text,
	"mcc_code" text,
	"transaction_type_identifier" text,
	"association_number_1" text,
	"association_number_2" text,
	"transaction_code" text,
	"cardholder_account_number" text,
	"group_number" text,
	"batch_julian_date" text,
	"debit_credit_indicator" text,
	"recorded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"source_row_number" integer,
	"raw_data" text,
	"mms_raw_line" text
);
--> statement-breakpoint
CREATE TABLE "tddf_raw_import" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"record_type" text,
	"raw_line" text NOT NULL,
	"processing_status" text DEFAULT 'pending',
	"processed_at" timestamp with time zone,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"target_table" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "tddf_batch_headers" (
	"id" serial PRIMARY KEY NOT NULL,
	"bh_record_number" text,
	"record_identifier" text DEFAULT 'BH',
	"transaction_code" text,
	"batch_date" text,
	"batch_julian_date" text,
	"net_deposit" numeric(15, 2),
	"reject_reason" text,
	"merchant_account_number" text,
	"source_file_id" text,
	"source_row_number" integer,
	"recorded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "tddf_purchasing_extensions" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_identifier" text DEFAULT 'P1',
	"parent_dt_reference" text,
	"tax_amount" numeric(15, 2),
	"discount_amount" numeric(15, 2),
	"freight_amount" numeric(15, 2),
	"duty_amount" numeric(15, 2),
	"purchase_identifier" text,
	"source_file_id" text,
	"source_row_number" integer,
	"recorded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "tddf_other_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_type" text NOT NULL,
	"reference_number" text,
	"merchant_account" text,
	"transaction_date" date,
	"amount" numeric(15, 2),
	"description" text,
	"source_file_id" text,
	"source_row_number" integer,
	"recorded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "tddf_jsonb" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"filename" text NOT NULL,
	"record_type" text NOT NULL,
	"line_number" integer NOT NULL,
	"raw_line" text NOT NULL,
	"extracted_fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "uploader_json" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"raw_line_data" text,
	"processed_json" jsonb,
	"field_separation_data" jsonb,
	"processing_time_ms" integer,
	"errors" jsonb,
	"source_file_name" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "uploader_tddf_jsonb_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"record_type" text NOT NULL,
	"line_number" integer NOT NULL,
	"raw_line" text NOT NULL,
	"extracted_fields" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "uploader_mastercard_di_edit_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"record_data" jsonb NOT NULL,
	"processing_status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "backup_history" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text,
	"timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"size" integer NOT NULL,
	"tables" jsonb NOT NULL,
	"notes" text,
	"downloaded" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"storage_type" text DEFAULT 'local' NOT NULL,
	"s3_bucket" text,
	"s3_key" text
);
--> statement-breakpoint
CREATE TABLE "backup_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"frequency" text NOT NULL,
	"time_of_day" text NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"use_s3" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"last_run" timestamp with time zone,
	"next_run" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"notes" text,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "schema_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"description" text NOT NULL,
	"changes" jsonb,
	"applied_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"applied_by" text,
	"script" text
);
--> statement-breakpoint
CREATE TABLE "schema_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"applied_by" text DEFAULT 'Alex-ReplitAgent'
);
--> statement-breakpoint
CREATE TABLE "api_achtransactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" varchar(255),
	"amount" numeric(10, 2),
	"date" date,
	"type" varchar(100),
	"description" text,
	"trace_number" varchar(255),
	"raw_data" jsonb,
	"source_file_id" integer,
	"source_row_number" integer,
	"recorded_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "api_merchants" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"client_mid" varchar(255),
	"status" varchar(100) DEFAULT 'Active',
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "api_terminals" (
	"id" serial PRIMARY KEY NOT NULL,
	"terminal_id" varchar(255),
	"merchant_id" varchar(255),
	"location" varchar(255),
	"status" varchar(100),
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "dashboard_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"cache_key" varchar(255) NOT NULL,
	"cache_data" jsonb,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"expires_at" timestamp,
	"refresh_state" varchar(100),
	"last_manual_refresh" timestamp,
	"build_time_ms" integer,
	CONSTRAINT "dashboard_cache_cache_key_key" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"user_id" integer,
	"username" text,
	"timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"resource_type" text,
	"resource_id" text,
	"action" text,
	"result" text NOT NULL,
	"details" jsonb,
	"session_id" text,
	"reason" text,
	"severity" text DEFAULT 'info',
	"message" text,
	"source" text DEFAULT 'authentication'
);
--> statement-breakpoint
CREATE TABLE "tddf1_totals" (
	"id" serial PRIMARY KEY NOT NULL,
	"processing_date" date NOT NULL,
	"file_date" date,
	"total_files" integer DEFAULT 0,
	"total_records" integer DEFAULT 0,
	"dt_transaction_amounts" numeric(15, 2) DEFAULT '0',
	"bh_net_deposits" numeric(15, 2) DEFAULT '0',
	"record_breakdown" jsonb,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dev_tddf_api_schemas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" varchar(50) NOT NULL,
	"description" text,
	"schema_data" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"type" text DEFAULT 'Sale' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"compressed_payload" jsonb NOT NULL,
	"schema_info" jsonb NOT NULL,
	"upload_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"processed_at" timestamp with time zone,
	"record_count" integer,
	"processing_time_ms" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "uploader_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"file_type" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"session_id" text,
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"uploaded_at" timestamp with time zone,
	"identified_at" timestamp with time zone,
	"encoding_at" timestamp with time zone,
	"processing_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"file_size" bigint,
	"line_count" integer,
	"has_headers" boolean,
	"file_format" text,
	"encoding_detected" text,
	"storage_key" text,
	"bucket_name" text,
	"encoding_status" text,
	"encoding_time_ms" integer,
	"json_records_created" integer,
	"processing_errors" text,
	"keep_for_review" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"start_time" timestamp DEFAULT now(),
	"current_phase" text DEFAULT 'started',
	"last_updated" timestamp DEFAULT now(),
	"created_by" text,
	"server_id" text,
	"upload_progress" integer DEFAULT 0,
	"chunked_upload" boolean DEFAULT false,
	"chunk_count" integer,
	"chunks_uploaded" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs" USING btree ("entity_id" text_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs" USING btree ("entity_type" text_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id" int4_ops);--> statement-breakpoint
CREATE INDEX "system_logs_level_idx" ON "system_logs" USING btree ("level" text_ops);--> statement-breakpoint
CREATE INDEX "system_logs_source_idx" ON "system_logs" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "system_logs_timestamp_idx" ON "system_logs" USING btree ("timestamp" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf_records_reference_number" ON "tddf_records" USING btree ("reference_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf_raw_import_processing_status" ON "tddf_raw_import" USING btree ("processing_status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf_raw_import_source_file" ON "tddf_raw_import" USING btree ("source_file_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf_jsonb_extracted_fields" ON "tddf_jsonb" USING gin ("extracted_fields" jsonb_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf_jsonb_record_type" ON "tddf_jsonb" USING btree ("record_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf_jsonb_upload_id" ON "tddf_jsonb" USING btree ("upload_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_json_upload_id" ON "uploader_json" USING btree ("upload_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_tddf_jsonb_records_record_type" ON "uploader_tddf_jsonb_records" USING btree ("record_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_tddf_jsonb_records_upload_id" ON "uploader_tddf_jsonb_records" USING btree ("upload_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_mastercard_di_edit_records_upload_id" ON "uploader_mastercard_di_edit_records" USING btree ("upload_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_schema_content_version" ON "schema_content" USING btree ("version" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_expire" ON "session" USING btree ("expire" timestamp_ops);--> statement-breakpoint
CREATE INDEX "security_logs_event_type_idx" ON "security_logs" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX "security_logs_result_idx" ON "security_logs" USING btree ("result" text_ops);--> statement-breakpoint
CREATE INDEX "security_logs_timestamp_idx" ON "security_logs" USING btree ("timestamp" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "security_logs_username_idx" ON "security_logs" USING btree ("username" text_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf1_totals_date" ON "tddf1_totals" USING btree ("processing_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_tddf1_totals_file_date" ON "tddf1_totals" USING btree ("file_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_uploads_file_type" ON "uploader_uploads" USING btree ("file_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_uploads_session_id" ON "uploader_uploads" USING btree ("session_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_uploader_uploads_status" ON "uploader_uploads" USING btree ("status" text_ops);
*/