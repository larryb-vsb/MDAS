# Schema Sanity Check Report

**Generated:** 2026-01-07T16:46:15.674Z

## Summary

| Metric | Count |
|--------|-------|
| Dev Tables | 93 |
| Prod Tables | 92 |
| Matching Tables | 10 |
| Tables with Differences | 62 |
| Dev-Only Tables | 12 |
| Prod-Only Tables | 16 |
| Total Column Differences | 197 |

## Tables with Differences

### api_achtransactions

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| merchant_id | different | Type: dev=varchar(50), prod=varchar(255) |
| account_number | different | Type: dev=varchar(50), prod=varchar(255) |
| code | different | Type: dev=varchar(10), prod=varchar(255) |
| company | different | Type: dev=varchar(50), prod=varchar(255) |
| trace_number | different | Type: dev=varchar(50), prod=varchar(255) |

**Index Differences:**

- `api_achtransactions_account_number_idx`: prod_only
- `api_achtransactions_code_idx`: prod_only
- `api_achtransactions_file_source_idx`: prod_only

### api_terminals

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| v_number | different | Type: dev=text, prod=varchar(20); Nullable: dev=NO, prod=YES |
| pos_merchant_number | different | Nullable: dev=YES, prod=NO |
| terminal_id | different | Type: dev=text, prod=varchar(255) |
| status | different | Type: dev=text, prod=varchar(100); Nullable: dev=NO, prod=YES |
| location | different | Type: dev=text, prod=varchar(255) |
| created_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=NO, prod=YES |
| merchant_id | prod_only | Column exists in prod but not in dev |
| account_number | prod_only | Column exists in prod but not in dev |
| exposure_amount | prod_only | Column exists in prod but not in dev |
| date_of_first_deposit | prod_only | Column exists in prod but not in dev |
| merchant_category_code | prod_only | Column exists in prod but not in dev |
| processing_status | prod_only | Column exists in prod but not in dev |
| last_transaction_date | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `api_terminals_merchant_id_idx`: prod_only
- `api_terminals_terminal_id_idx`: prod_only

### api_users

**Index Differences:**

- `api_users_api_key_idx`: prod_only

### audit_logs

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| timestamp | different | Type: dev=timestamp without time zone, prod=timestamp with time zone |

### cache_configuration

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| refresh_on_startup | prod_only | Column exists in prod but not in dev |
| cache_update_policy | prod_only | Column exists in prod but not in dev |
| priority_level | prod_only | Column exists in prod but not in dev |
| max_records | prod_only | Column exists in prod but not in dev |
| enable_compression | prod_only | Column exists in prod but not in dev |
| environment_specific | prod_only | Column exists in prod but not in dev |

### charts_pre_cache

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| id | prod_only | Column exists in prod but not in dev |
| cache_key | prod_only | Column exists in prod but not in dev |
| chart_data | prod_only | Column exists in prod but not in dev |
| chart_type | prod_only | Column exists in prod but not in dev |
| upload_id | prod_only | Column exists in prod but not in dev |
| created_at | prod_only | Column exists in prod but not in dev |
| expires_at | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `charts_pre_cache_pkey`: prod_only
- `charts_pre_cache_cache_key_idx`: prod_only

### connection_log

**Index Differences:**

- `idx_connection_log_timestamp_ip`: dev_only
- `connection_log_client_ip_idx`: prod_only
- `connection_log_api_key_used_idx`: prod_only

### dashboard_cache

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| cache_data | different | Nullable: dev=NO, prod=YES |
| expires_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=NO, prod=YES |
| build_time_ms | different | Nullable: dev=NO, prod=YES |
| created_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=NO, prod=YES |
| updated_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=NO, prod=YES |
| refresh_state | prod_only | Column exists in prod but not in dev |
| last_manual_refresh | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `dashboard_cache_cache_key_idx`: prod_only
- `dashboard_cache_expires_at_idx`: prod_only
- `dashboard_cache_created_at_idx`: prod_only
- `dashboard_cache_key_idx`: prod_only
- `dashboard_cache_expires_idx`: prod_only

### dev_uploads

**Index Differences:**

- `dev_uploads_pkey`: dev_only
- `dev_uploads_pkey1`: prod_only

### host_approvals

**Index Differences:**

- `host_approvals_api_key_prefix_idx`: prod_only

### ip_blocklist

**Index Differences:**

- `ip_blocklist_ip_address_idx`: prod_only
- `ip_blocklist_is_active_idx`: prod_only

### merchant_mcc_schema

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| field_length | different | Nullable: dev=NO, prod=YES |
| format | different | Nullable: dev=NO, prod=YES |
| mms_enabled | different | Nullable: dev=NO, prod=YES |
| created_at | different | Nullable: dev=NO, prod=YES |
| updated_at | different | Nullable: dev=NO, prod=YES |
| tab_position | different | Type: dev=text, prod=integer |

**Index Differences:**

- `merchant_mcc_schema_position_key`: prod_only

### merchants

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| name | different | Nullable: dev=YES, prod=NO |
| status | different | Nullable: dev=YES, prod=NO |
| created_at | different | Nullable: dev=YES, prod=NO |
| mcc | different | Type: dev=text, prod=varchar(10) |
| exposure_amount | different | Type: dev=text, prod=numeric |
| merchant_activation_date | different | Type: dev=timestamp without time zone, prod=date |
| date_of_first_deposit | different | Type: dev=timestamp without time zone, prod=date |

**Index Differences:**

- `idx_merchants_search_index`: prod_only
- `idx_merchants_name_lower`: prod_only
- `idx_merchants_id_lower`: prod_only
- `idx_merchants_client_mid_lower`: prod_only
- `idx_merchants_federal_tax_id_lower`: prod_only

### mms-app-DatabaseInfo

**Index Differences:**

- `mms-app-DatabaseInfo_pkey`: dev_only

### pre_cache_runs

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| cache_size_bytes | prod_only | Column exists in prod but not in dev |
| error_stack | prod_only | Column exists in prod but not in dev |
| notes | prod_only | Column exists in prod but not in dev |

### processing_metrics

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| timestamp | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=YES, prod=NO |
| metric_type | different | Nullable: dev=YES, prod=NO |
| system_status | different | Nullable: dev=YES, prod=NO |
| transactions_per_second | different | Nullable: dev=YES, prod=NO |
| peak_transactions_per_second | different | Nullable: dev=YES, prod=NO |
| records_per_minute | different | Nullable: dev=YES, prod=NO |
| peak_records_per_minute | different | Nullable: dev=YES, prod=NO |
| total_files | different | Nullable: dev=YES, prod=NO |
| queued_files | different | Nullable: dev=YES, prod=NO |
| processed_files | different | Nullable: dev=YES, prod=NO |
| files_with_errors | different | Nullable: dev=YES, prod=NO |
| currently_processing | different | Nullable: dev=YES, prod=NO |

**Index Differences:**

- `processing_metrics_type_idx`: prod_only
- `processing_metrics_status_idx`: prod_only
- `processing_metrics_bh_processed_idx`: prod_only
- `processing_metrics_p1_processed_idx`: prod_only

### processing_timing_logs

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| created_at | different | Nullable: dev=YES, prod=NO |

**Index Differences:**

- `processing_timing_logs_upload_id_idx`: prod_only
- `processing_timing_logs_operation_type_idx`: prod_only
- `processing_timing_logs_status_idx`: prod_only
- `processing_timing_logs_start_time_idx`: prod_only

### security_logs

**Index Differences:**

- `security_logs_user_id_idx`: prod_only
- `security_logs_user_action_idx`: prod_only

### session

**Index Differences:**

- `idx_session_expire`: prod_only

### sub_merchant_terminals

**Index Differences:**

- `sub_merchant_terminals_pkey`: dev_only

### system_logs

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| timestamp | different | Type: dev=timestamp without time zone, prod=timestamp with time zone; Nullable: dev=YES, prod=NO |
| level | different | Type: dev=varchar(10), prod=text |
| source | different | Nullable: dev=YES, prod=NO |
| hostname | prod_only | Column exists in prod but not in dev |
| process_id | prod_only | Column exists in prod but not in dev |
| session_id | prod_only | Column exists in prod but not in dev |
| correlation_id | prod_only | Column exists in prod but not in dev |
| stack_trace | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `system_logs_level_idx`: prod_only
- `system_logs_source_idx`: prod_only
- `system_logs_timestamp_idx`: prod_only

### system_settings

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| setting_key | different | Type: dev=text, prod=varchar(255) |
| setting_value | different | Nullable: dev=NO, prod=YES |
| setting_type | different | Type: dev=text, prod=varchar(50) |
| updated_at | different | Nullable: dev=NO, prod=YES |
| updated_by | different | Type: dev=varchar(100), prod=varchar(255) |

### tddf1_activity_cache

**Index Differences:**

- `tddf1_activity_cache_pkey`: dev_only

### tddf1_monthly_cache

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| totals_json | different | Nullable: dev=NO, prod=YES |
| updated_at | different | Nullable: dev=YES, prod=NO |
| cache_key | different | Nullable: dev=YES, prod=NO |
| status | different | Nullable: dev=YES, prod=NO |
| total_transaction_count | prod_only | Column exists in prod but not in dev |
| total_merchant_count | prod_only | Column exists in prod but not in dev |
| total_terminal_count | prod_only | Column exists in prod but not in dev |
| total_file_count | prod_only | Column exists in prod but not in dev |
| build_duration_ms | prod_only | Column exists in prod but not in dev |
| error_message | prod_only | Column exists in prod but not in dev |
| data_source | prod_only | Column exists in prod but not in dev |
| never_expires | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `tddf1_monthly_cache_year_month_idx`: prod_only
- `tddf1_monthly_cache_key_idx`: prod_only
- `tddf1_monthly_cache_status_idx`: prod_only
- `tddf1_monthly_cache_refresh_idx`: prod_only
- `tddf1_monthly_cache_year_month_unique`: prod_only

### tddf1_totals

**Index Differences:**

- `tddf1_totals_cache_pkey`: dev_only
- `tddf1_totals_pkey`: prod_only
- `idx_tddf1_totals_file_date`: prod_only

### tddf_api_files

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| filename | different | Nullable: dev=NO, prod=YES |
| original_name | different | Type: dev=varchar(255), prod=varchar |
| file_size | different | Nullable: dev=NO, prod=YES |
| file_hash | different | Type: dev=varchar(64), prod=text; Nullable: dev=NO, prod=YES |
| storage_path | different | Type: dev=varchar(500), prod=varchar; Nullable: dev=NO, prod=YES |
| status | different | Type: dev=varchar(50), prod=varchar |
| uploaded_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=YES, prod=NO |
| uploaded_by | different | Type: dev=varchar(100), prod=text |
| created_at | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `tddf_api_files_business_day_idx`: prod_only
- `tddf_api_files_status_idx`: prod_only
- `tddf_api_files_uploaded_at_idx`: prod_only

### tddf_api_keys

**Index Differences:**

- `idx_tddf_api_keys_hash`: prod_only
- `idx_tddf_api_keys_prefix`: prod_only
- `idx_tddf_api_keys_active`: prod_only

### tddf_api_queue

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| file_id | different | Nullable: dev=YES, prod=NO |
| status | different | Type: dev=varchar(50), prod=varchar |

### tddf_api_records

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| file_id | different | Nullable: dev=YES, prod=NO |
| record_number | different | Nullable: dev=NO, prod=YES |
| raw_line | different | Nullable: dev=NO, prod=YES |
| record_type | different | Type: dev=text, prod=varchar |
| record_data | prod_only | Column exists in prod but not in dev |
| processing_status | prod_only | Column exists in prod but not in dev |

### tddf_api_request_logs

**Index Differences:**

- `idx_tddf_api_requests_key_time`: prod_only
- `idx_tddf_api_requests_endpoint_time`: prod_only
- `idx_tddf_api_requests_requested_at`: prod_only

### tddf_api_schemas

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| name | different | Type: dev=varchar(255), prod=varchar |
| version | different | Type: dev=varchar(50), prod=varchar; Nullable: dev=NO, prod=YES |
| created_by | different | Type: dev=varchar(100), prod=varchar; Nullable: dev=NO, prod=YES |

**Index Differences:**

- `tddf_api_schemas_name_key`: prod_only

### tddf_archive

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| archived_at | different | Nullable: dev=YES, prod=NO |
| created_by | different | Nullable: dev=NO, prod=YES |
| updated_by | different | Nullable: dev=NO, prod=YES |
| archived_by | prod_only | Column exists in prod but not in dev |
| uploaded_at | prod_only | Column exists in prod but not in dev |
| encoding_complete | prod_only | Column exists in prod but not in dev |
| file_type | prod_only | Column exists in prod but not in dev |
| upload_id | prod_only | Column exists in prod but not in dev |
| record_count | prod_only | Column exists in prod but not in dev |
| file_sequence_number | prod_only | Column exists in prod but not in dev |
| processing_notes | prod_only | Column exists in prod but not in dev |
| step6_completed_at | prod_only | Column exists in prod but not in dev |
| step6_error | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `tddf_archive_filename_idx`: different

### tddf_archive_records

**Index Differences:**

- `tddf_archive_records_pkey`: dev_only

### tddf_batch_headers

**Index Differences:**

- `tddf_batch_headers_source_file_id_idx`: prod_only
- `tddf_batch_headers_batch_date_idx`: prod_only

### tddf_datamaster

**Index Differences:**

- `tddf_datamaster_pkey`: dev_only

### tddf_import_log

**Index Differences:**

- `tddf_import_log_pkey`: dev_only

### tddf_json_record_type_counts_pre_cache

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| expires_at | different | Type: dev=timestamp without time zone, prod=timestamp with time zone |
| created_at | different | Type: dev=timestamp without time zone, prod=timestamp with time zone |
| upload_id | prod_only | Column exists in prod but not in dev |
| record_type | prod_only | Column exists in prod but not in dev |
| record_count | prod_only | Column exists in prod but not in dev |
| percentage | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `tddf_json_record_type_counts_pre_cache_upload_id_idx`: prod_only

### tddf_jsonb

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

**Index Differences:**

- `idx_tddf_jsonb_record_type_transaction_date`: dev_only
- `tddf_jsonb_pkey`: dev_only
- `idx_tddf_jsonb_batch_date`: dev_only
- `idx_tddf_jsonb_transaction_date`: dev_only
- `idx_tddf_jsonb_record_type_batch_date`: dev_only
- `tddf_jsonb_partitioned_pkey`: prod_only

### tddf_jsonb_2022_q4

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2023_q1

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2023_q2

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2023_q3

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2023_q4

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2024_q1

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2024_q2

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2024_q3

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2024_q4

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2025_q1

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2025_q2

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2025_q3

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2025_q4

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_2026_q1

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

**Index Differences:**

- `idx_tddf_jsonb_2026_q1_upload_hash`: dev_only

### tddf_jsonb_2026_q2

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_jsonb_default

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| parsed_datetime | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |

### tddf_object_totals_cache_2025

**Index Differences:**

- `tddf_object_totals_cache_2025_pkey`: dev_only

### tddf_purchasing_extensions

**Index Differences:**

- `tddf_purchasing_extensions_source_file_id_idx`: prod_only

### tddf_records

**Index Differences:**

- `tddf_records_transaction_date_idx`: prod_only
- `tddf_records_merchant_account_number_idx`: prod_only

### transactions

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| id | different | Type: dev=integer, prod=text |
| amount | different | Type: dev=text, prod=numeric |

**Index Differences:**

- `transactions_merchant_id_idx`: prod_only
- `transactions_date_idx`: prod_only
- `transactions_source_filename_idx`: prod_only

### uploaded_files

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| id | different | Type: dev=integer, prod=text |
| filename | different | Nullable: dev=NO, prod=YES |
| original_filename | different | Nullable: dev=NO, prod=YES |
| file_path | different | Nullable: dev=NO, prod=YES |
| file_size | different | Nullable: dev=NO, prod=YES |

**Index Differences:**

- `uploaded_files_uploaded_at_idx`: prod_only
- `uploaded_files_status_idx`: prod_only

### uploader_tddf_jsonb_records

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| raw_line_hash | different | Type: dev=text, prod=varchar(64) |
| processed_at | prod_only | Column exists in prod but not in dev |

**Index Differences:**

- `idx_tddf_jsonb_merchant_account`: dev_only
- `idx_tddf_jsonb_batch_date`: dev_only
- `idx_uploader_tddf_jsonb_records_upload_id`: prod_only
- `idx_uploader_tddf_jsonb_records_record_type`: prod_only
- `idx_uploader_tddf_jsonb_records_processing_status`: prod_only
- `idx_uploader_tddf_jsonb_records_created_at`: prod_only
- `idx_uploader_tddf_jsonb_records_processed_at`: prod_only
- `idx_uploader_tddf_jsonb_records_line_number`: prod_only
- `idx_uploader_tddf_jsonb_records_merchant_account`: prod_only
- `idx_uploader_tddf_jsonb_records_file_processing_date`: prod_only

### uploader_uploads

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| file_size | different | Type: dev=integer, prod=bigint |
| start_time | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=NO, prod=YES |
| upload_started_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| current_phase | different | Nullable: dev=NO, prod=YES |
| last_updated | different | Type: dev=timestamp with time zone, prod=timestamp without time zone; Nullable: dev=NO, prod=YES |
| encoding_completion_time | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| last_retry_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| last_warning_at | different | Type: dev=timestamp with time zone, prod=timestamp without time zone |
| business_day | different | Type: dev=date, prod=timestamp without time zone |
| file_sequence_number | different | Type: dev=text, prod=varchar(10) |
| file_processing_time | different | Type: dev=text, prod=varchar(10) |
| deleted_by | different | Type: dev=varchar, prod=varchar(255) |

**Index Differences:**

- `idx_uploader_uploads_status`: prod_only
- `idx_uploader_uploads_file_type`: prod_only
- `idx_uploader_uploads_session_id`: prod_only
- `uploader_uploads_deleted_at_idx`: prod_only
- `idx_uploader_uploads_deleted_at`: prod_only
- `uploader_uploads_status_idx`: prod_only
- `uploader_uploads_file_type_idx`: prod_only

### users

**Column Differences:**

| Column | Status | Details |
|--------|--------|----------|
| username | different | Type: dev=varchar(255), prod=text |
| password | different | Type: dev=varchar(255), prod=text |
| email | different | Type: dev=varchar(255), prod=text; Nullable: dev=NO, prod=YES |
| first_name | different | Type: dev=varchar(255), prod=text |
| last_name | different | Type: dev=varchar(255), prod=text |
| role | different | Type: dev=varchar(50), prod=text; Nullable: dev=YES, prod=NO |
| created_at | different | Type: dev=timestamp without time zone, prod=timestamp with time zone |
| last_login | different | Type: dev=timestamp without time zone, prod=timestamp with time zone |
| default_dashboard | different | Type: dev=varchar(255), prod=varchar |
| theme_preference | different | Type: dev=varchar(50), prod=varchar |

**Index Differences:**

- `users_username_idx`: prod_only
- `users_email_idx`: prod_only

## Dev-Only Tables

- del_duplicate_finder_cache
- del_king-server
- del_processing_metrics
- del_processing_timing_logs
- del_system_logs
- del_tddf1_merchants
- del_tddf_jsonb
- del_transactions
- del_uploaded_files
- del_uploader_tddf_jsonb_records
- del_uploader_uploads
- del_uploader_uploads_backup

## Prod-Only Tables

- backup_history
- backup_schedules
- tddf_batch_relationships_pre_cache
- tddf_json_activity_pre_cache
- tddf_json_stats_pre_cache
- tddf_jsonb_backup
- tddf_records_all_pre_cache
- tddf_records_bh_pre_cache
- tddf_records_dt_pre_cache
- tddf_records_other_pre_cache
- tddf_records_p1_pre_cache
- tddf_records_p2_pre_cache
- tddf_records_tab_processing_status
- tddf_transaction_records
- temp_backup_info
- uploads

