-- =====================================================================
-- PRODUCTION MIGRATION: Add Missing Columns
-- =====================================================================
-- Generated: 2025-11-17T21:19:03.091Z
-- Missing columns: 276
-- =====================================================================

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "description" text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "internal_notes" text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "created_by" text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "updated_by" text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "last_activity" timestamp without time zone;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "last_update" timestamp without time zone;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "update_source" text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "last_sync_date" timestamp without time zone;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "sync_status" text DEFAULT 'Pending'::text;

ALTER TABLE "api_terminals" ADD COLUMN IF NOT EXISTS "last_activity_date" timestamp without time zone;

ALTER TABLE "cache_configuration" ADD COLUMN IF NOT EXISTS "last_refresh_at" timestamp without time zone;

ALTER TABLE "cache_configuration" ADD COLUMN IF NOT EXISTS "next_refresh_at" timestamp without time zone;

ALTER TABLE "cache_configuration" ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "cache_configuration" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "charts_pre_cache" ADD COLUMN IF NOT EXISTS "processing_date" date;

ALTER TABLE "charts_pre_cache" ADD COLUMN IF NOT EXISTS "files_processed" bigint;

ALTER TABLE "charts_pre_cache" ADD COLUMN IF NOT EXISTS "total_bytes" bigint;

ALTER TABLE "charts_pre_cache" ADD COLUMN IF NOT EXISTS "successful_files" bigint;

ALTER TABLE "charts_pre_cache" ADD COLUMN IF NOT EXISTS "failed_files" bigint;

ALTER TABLE "charts_pre_cache" ADD COLUMN IF NOT EXISTS "avg_processing_time_seconds" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "zip" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "phone" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "email" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "website" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "legal_name" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "contact_person" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "account_manager" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "monthly_volume" numeric(15,2) DEFAULT 0;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "fee_structure" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "pricing_tier" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "tags" text[];

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "other_client_number3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "processor_name" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "agent_bank_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "chain_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "store_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "terminal_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "merchant_category_code" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "settlement_agent" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "agent_chain_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "ach_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "visa_cps2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "visa_cps1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "visa_supermarket" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "visa_psrf" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "visa_eirf" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "mc_merit_3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "mc_merit_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "mc_supermarket" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "mc_pt_cat" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "mc_warehouse" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "mc_prm" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "discover_eligibility" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "amex_description_code" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "amex_id" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "amex_submitter_id" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "discover_reference_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "discover_acct_id" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "interchange_dollar" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "interchange_count" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "multicurrency_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "reclear_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "merchant_convenience_fee_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_bank_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_branch_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_flag_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_data_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_data_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_data_3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_data_4" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_data_5" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_account_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "user_account_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "edc_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "rep_code" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "storage_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "member_id" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "inc_status" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "grs_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "asst_manager_name" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "other_name" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "ssn_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "owner_license_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "last_statement_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "open_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "last_credit_check_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "last_call_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "next_call_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "fin_statement_due_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "fin_statement_req_date" timestamp without time zone;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "statement_count" integer;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "post_date_debits" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "post_date_credits" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_discount_indicator" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_rcl_list" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_crb_list" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_card_mailer" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_irs" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_imprinters_rentals" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_member_fees" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_pos_terminals" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_mis" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_adjustments" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_chargebacks" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_unique_message" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_bet1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_bet2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "address_bet3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_overall" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_deposits" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_adjustments" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_chargebacks" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_reversals" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_chargeback_reversals" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_dda_adjustments" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_batch_adjustments" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_tran_option_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dest_tran_option_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_account_name" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_account_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_type" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_routing_number" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_per_item" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_net_separate_indicator" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "convenience_fee_transaction_type_indicator" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_name_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_number_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_type_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_routing_number_1" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_percent_1" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_per_item_1" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_name_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_number_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_type_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_routing_number_2" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_percent_2" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_per_item_2" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_name_3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_number_3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_type_3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_routing_number_3" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_percent_3" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_per_item_3" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_name_4" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_account_number_4" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_type_4" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_routing_number_4" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_percent_4" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_per_item_4" numeric;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_merchant_split_funding_flag" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_net_separate_indicator" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_include_credits" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_include_chargebacks" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_include_volume_adjustments" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "split_funding_include_reversals" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "dba_country_code" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "delimiter" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "reserved_for_future_use" text;

ALTER TABLE "merchants" ADD COLUMN IF NOT EXISTS "filler" text;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "trigger_type" text;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "records_created" integer;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "records_updated" integer;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "records_deleted" integer;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "error_details" text;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "triggered_by_user" text;

ALTER TABLE "pre_cache_runs" ADD COLUMN IF NOT EXISTS "trigger_reason" text;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "files_processed" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "records_processed" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "errors_count" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "processing_time_ms" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "dt_records_processed" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "bh_records_processed" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "p1_records_processed" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "other_records_processed" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "non_dt_records_skipped" integer DEFAULT 0;

ALTER TABLE "processing_metrics" ADD COLUMN IF NOT EXISTS "tddf_processing_datetime" timestamp without time zone;

ALTER TABLE "system_logs" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "system_logs" ADD COLUMN IF NOT EXISTS "server_id" varchar(50);

ALTER TABLE "system_logs" ADD COLUMN IF NOT EXISTS "category" varchar(50);

ALTER TABLE "tddf1_merchants" ADD COLUMN IF NOT EXISTS "amex_merchant_seller_name" text;

ALTER TABLE "tddf1_merchants" ADD COLUMN IF NOT EXISTS "dba_name" text;

ALTER TABLE "tddf1_merchants" ADD COLUMN IF NOT EXISTS "legal_name" text;

ALTER TABLE "tddf1_merchants" ADD COLUMN IF NOT EXISTS "contact_person" text;

ALTER TABLE "tddf1_merchants" ADD COLUMN IF NOT EXISTS "account_manager" text;

ALTER TABLE "tddf1_merchants" ADD COLUMN IF NOT EXISTS "unique_terminals" integer DEFAULT 0;

ALTER TABLE "tddf1_monthly_cache" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "tddf_api_files" ADD COLUMN IF NOT EXISTS "filename" varchar(255);

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "record_number" integer;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "raw_line" text;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "parsed_data" jsonb;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "validation_errors" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'pending'::character varying;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "upload_id" text;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "filename" text;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "extracted_fields" jsonb;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "record_identifier" text;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "processing_time_ms" integer DEFAULT 0;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "tddf_processing_datetime" timestamp without time zone;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "tddf_processing_date" date;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "parsed_datetime" timestamp without time zone;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "record_time_source" text;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "is_valid" boolean DEFAULT true;

ALTER TABLE "tddf_api_records" ADD COLUMN IF NOT EXISTS "processed_at" timestamp without time zone;

ALTER TABLE "tddf_api_schemas" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;

ALTER TABLE "tddf_api_schemas" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "total_records" integer DEFAULT 0;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "processed_records" integer DEFAULT 0;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "error_records" integer DEFAULT 0;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "file_date" text;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "original_upload_id" text;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "api_file_id" integer;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "step6_processed_at" timestamp without time zone;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "processing_errors" jsonb;

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "created_at" timestamp without time zone NOT NULL DEFAULT now();

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "updated_at" timestamp without time zone NOT NULL DEFAULT now();

ALTER TABLE "tddf_archive" ADD COLUMN IF NOT EXISTS "updated_by" text;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "cache_key" varchar(255) NOT NULL DEFAULT 'tddf_json_record_type_counts'::character varying;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "page_name" varchar(255) DEFAULT 'settings'::character varying;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "total_records" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "dt_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "bh_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "p1_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "p2_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "e1_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "g2_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "ad_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "dr_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "other_count" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "cache_data" jsonb;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "data_sources" jsonb;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "processing_time_ms" integer DEFAULT 0;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "last_update_datetime" timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "created_by" varchar(255) DEFAULT 'system'::character varying;

ALTER TABLE "tddf_json_record_type_counts_pre_cache" ADD COLUMN IF NOT EXISTS "updated_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "transaction_id" text;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "trace_number" text;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "company" text;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "code" text;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_filename" text;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_row_number" integer;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "source_file_hash" text;

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp without time zone DEFAULT now();

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "filename" varchar(255);

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "original_filename" varchar(255);

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "file_path" varchar(500);

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "file_size" integer;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "status" varchar(50) DEFAULT 'uploaded'::character varying;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "uploaded_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "file_type" varchar(50);

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "business_day" date;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "file_date" date;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processing_status" text DEFAULT 'pending'::text;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processing_server_id" text;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp without time zone;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "storage_path" text;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "file_content" text;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "mime_type" text;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processed_at" timestamp without time zone;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processing_completed_at" timestamp without time zone;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "records_processed" integer DEFAULT 0;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "records_skipped" integer DEFAULT 0;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processed" boolean DEFAULT false;

ALTER TABLE "uploaded_files" ADD COLUMN IF NOT EXISTS "processing_errors" text;

ALTER TABLE "uploader_tddf_jsonb_records" ADD COLUMN IF NOT EXISTS "column_2_test" text;

ALTER TABLE "uploader_uploads" ADD COLUMN IF NOT EXISTS "parsed_scheduled_datetime" timestamp without time zone;

ALTER TABLE "uploader_uploads" ADD COLUMN IF NOT EXISTS "parsed_actual_datetime" timestamp without time zone;

ALTER TABLE "uploader_uploads" ADD COLUMN IF NOT EXISTS "filename_parse_status" text DEFAULT 'pending'::text;
