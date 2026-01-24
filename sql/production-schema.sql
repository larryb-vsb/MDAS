-- =====================================================================
-- PRODUCTION DATABASE SCHEMA
-- =====================================================================
-- Version: 2.9.0 (v1014)
-- Last Updated: 2025-12-02
-- 
-- This file creates a complete production database schema from scratch.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- 
-- IMPORTANT: This file is AUTO-GENERATED from shared/schema.ts
-- Do not edit manually - run: npx tsx scripts/generate-production-schema.ts
-- =====================================================================

BEGIN;


-- =====================================================================
-- MERCHANTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  client_mid text,
  other_client_number1 text,
  other_client_number2 text,
  client_since_date timestamp,
  status text NOT NULL DEFAULT 'Pending',
  merchant_status text,
  merchant_type text,
  sales_channel text,
  association text,
  mcc text,
  master_mid text,
  address text,
  city text,
  state text,
  zip_code text,
  country text,
  category text,
  created_at timestamp DEFAULT NOW() NOT NULL,
  last_upload_date timestamp,
  as_of_date timestamp,
  edit_date timestamp DEFAULT NOW(),
  updated_by text,
  
  -- TSYS Merchant Risk Report Fields
  bank text,
  associate_merchant_number text,
  dba_name_cwob text,
  cwob_debit_risk text,
  vwob_ebt_return text,
  bypass_ea text,
  bypass_co text,
  merchant_record_st text,
  board_dt timestamp,
  sale_amt numeric(15, 2),
  credit_amt numeric(15, 2),
  negative_amount numeric(15, 2),
  number_o text,
  bypass_force text,
  fee_visa numeric(15, 2),
  visa_mcc text,
  daily_auth_limit numeric(15, 2),
  bypass_ex text,
  excessive_deposit_amount numeric(15, 2),
  threshold numeric(15, 2),
  
  -- Risk Assessment Fields
  risk_score numeric(5, 2),
  risk_level text,
  last_risk_assessment timestamp,
  risk_flags text[],
  compliance_status text,
  review_required boolean DEFAULT false,
  risk_notes text,
  
  -- TSYS MCC Schema Fields (51 fields)
  bank_number text,
  group_level_1 text,
  association_number text,
  account_number text,
  association_name text,
  group_level_1_name text,
  sic text,
  class text,
  dba_name text,
  dba_address_city text,
  dba_address_state text,
  dba_zip text,
  phone_1 text,
  phone_2 text,
  business_license text,
  bank_officer_1 text,
  bank_officer_2 text,
  federal_tax_id text,
  state_tax_id text,
  merchant_type_field text,
  owner_name text,
  manager_name text,
  last_activity_date timestamp,
  daily_fee_indicator text,
  mc_reg_id text,
  customer_service_number text,
  update_date_time timestamp,
  status_change_date timestamp,
  discover_map_flag text,
  amex_optblue_flag text,
  visa_descriptor text,
  mc_descriptor text,
  url text,
  close_date timestamp,
  date_of_last_auth timestamp,
  duns_number text,
  print_statement_indicator text,
  visa_bin text,
  mc_bin text,
  mc_ica text,
  amex_cap_id text,
  discover_aiid text,
  dda_number text,
  transit_routing_number text,
  exposure_amount text,
  merchant_activation_date timestamp,
  date_of_first_deposit timestamp,
  date_of_last_deposit timestamp,
  trans_destination text,
  merchant_email_address text,
  chargeback_email_address text,
  
  -- TDDF Last Batch and Transaction Tracking
  last_batch_filename text,
  last_batch_date timestamp,
  last_transaction_amount numeric(15, 2),
  last_transaction_date timestamp
);

-- Merchants Table Indexes
CREATE INDEX IF NOT EXISTS merchants_created_at_idx ON merchants(created_at);
CREATE INDEX IF NOT EXISTS merchants_last_upload_date_idx ON merchants(last_upload_date);
CREATE INDEX IF NOT EXISTS merchants_client_since_date_idx ON merchants(client_since_date);
CREATE INDEX IF NOT EXISTS merchants_last_activity_date_idx ON merchants(last_activity_date);
CREATE INDEX IF NOT EXISTS merchants_merchant_activation_date_idx ON merchants(merchant_activation_date);
CREATE INDEX IF NOT EXISTS merchants_date_of_first_deposit_idx ON merchants(date_of_first_deposit);
CREATE INDEX IF NOT EXISTS merchants_date_of_last_deposit_idx ON merchants(date_of_last_deposit);
CREATE INDEX IF NOT EXISTS merchants_last_batch_date_idx ON merchants(last_batch_date);
CREATE INDEX IF NOT EXISTS merchants_last_transaction_date_idx ON merchants(last_transaction_date);
CREATE INDEX IF NOT EXISTS merchants_status_created_at_idx ON merchants(status, created_at);
CREATE INDEX IF NOT EXISTS merchants_type_last_upload_idx ON merchants(merchant_type, last_upload_date);


-- =====================================================================
-- API MERCHANTS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS api_merchants (
  id text PRIMARY KEY,
  name text,
  status text,
  address text,
  city text,
  state text,
  zip_code text,
  category text,
  created_at timestamp DEFAULT NOW(),
  last_upload_date timestamp,
  client_mid text,
  other_client_number1 text,
  other_client_number2 text,
  client_since_date timestamp,
  country text DEFAULT 'USA',
  edit_date timestamp,
  merchant_type text DEFAULT 'ACH',
  sales_channel text,
  as_of_date timestamp
);


-- =====================================================================
-- API TERMINALS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS api_terminals (
  id serial PRIMARY KEY,
  merchant_id text,
  terminal_id text,
  merchant_mid text,
  terminal_name text,
  location text,
  status text,
  created_at timestamp DEFAULT NOW(),
  last_upload_date timestamp,
  as_of_date timestamp
);

CREATE INDEX IF NOT EXISTS api_terminals_merchant_id_idx ON api_terminals(merchant_id);
CREATE INDEX IF NOT EXISTS api_terminals_terminal_id_idx ON api_terminals(terminal_id);


-- =====================================================================
-- TRANSACTIONS TABLE (VSB API)
-- =====================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id serial PRIMARY KEY,
  merchant_id text NOT NULL,
  transaction_id text,
  amount text NOT NULL,
  date timestamp DEFAULT NOW() NOT NULL,
  type text NOT NULL DEFAULT 'Sale',
  created_at timestamp DEFAULT NOW(),
  trace_number text,
  company text,
  code text,
  raw_data jsonb,
  source_file_id text,
  source_row_number integer,
  recorded_at timestamp DEFAULT NOW() NOT NULL,
  source_filename text,
  source_file_hash text,
  updated_at timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_merchant_id_idx ON transactions(merchant_id);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
CREATE INDEX IF NOT EXISTS transactions_source_filename_idx ON transactions(source_filename);


-- =====================================================================
-- UPLOADED FILES TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS uploaded_files (
  id text PRIMARY KEY,
  filename text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  upload_date timestamp DEFAULT NOW() NOT NULL,
  processed boolean DEFAULT false,
  processing_status text DEFAULT 'pending',
  error_message text,
  records_imported integer DEFAULT 0,
  uploaded_by text,
  storage_path text,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS uploaded_files_uploaded_at_idx ON uploaded_files(uploaded_at);
CREATE INDEX IF NOT EXISTS uploaded_files_status_idx ON uploaded_files(processing_status);


-- =====================================================================
-- TDDF BATCH HEADERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS tddf_batch_headers (
  id serial PRIMARY KEY,
  upload_id text,
  filename text NOT NULL,
  batch_number text,
  batch_date timestamp,
  record_count integer DEFAULT 0,
  total_amount numeric(15, 2) DEFAULT 0,
  processing_status text DEFAULT 'pending',
  created_at timestamp DEFAULT NOW(),
  processed_at timestamp,
  raw_data jsonb
);

-- Indexes skipped - production table has different column names (source_file_id instead of upload_id)
CREATE INDEX IF NOT EXISTS tddf_batch_headers_source_file_id_idx ON tddf_batch_headers(source_file_id);
CREATE INDEX IF NOT EXISTS tddf_batch_headers_batch_date_idx ON tddf_batch_headers(batch_date);


-- =====================================================================
-- TDDF TRANSACTION RECORDS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS tddf_transaction_records (
  id serial PRIMARY KEY,
  upload_id text,
  batch_header_id integer,
  merchant_id text,
  terminal_id text,
  transaction_date timestamp,
  transaction_amount numeric(15, 2),
  transaction_type text,
  card_type text,
  authorization_code text,
  reference_number text,
  created_at timestamp DEFAULT NOW(),
  raw_data jsonb
);

CREATE INDEX IF NOT EXISTS tddf_transaction_records_upload_id_idx ON tddf_transaction_records(upload_id);
CREATE INDEX IF NOT EXISTS tddf_transaction_records_merchant_id_idx ON tddf_transaction_records(merchant_id);
CREATE INDEX IF NOT EXISTS tddf_transaction_records_date_idx ON tddf_transaction_records(transaction_date);


-- =====================================================================
-- TDDF PURCHASING EXTENSIONS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS tddf_purchasing_extensions (
  id serial PRIMARY KEY,
  upload_id text,
  transaction_id integer,
  level_ii_data jsonb,
  level_iii_data jsonb,
  tax_amount numeric(15, 2),
  shipping_amount numeric(15, 2),
  duty_amount numeric(15, 2),
  purchase_order text,
  created_at timestamp DEFAULT NOW(),
  raw_data jsonb
);

-- Indexes adjusted - production table uses source_file_id instead of upload_id
CREATE INDEX IF NOT EXISTS tddf_purchasing_extensions_source_file_id_idx ON tddf_purchasing_extensions(source_file_id);
-- transaction_id column doesn't exist in production, skipping that index


-- =====================================================================
-- TDDF RECORDS TABLE (Unified)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tddf_records (
  id serial PRIMARY KEY,
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  record_number integer,
  record_data jsonb NOT NULL,
  processing_status text DEFAULT 'pending',
  created_at timestamp DEFAULT NOW(),
  processed_at timestamp,
  merchant_id text,
  terminal_id text,
  transaction_date timestamp,
  amount numeric(15, 2),
  raw_line text
);

-- Indexes commented out - production tddf_records has different schema
-- The production table has: sequence_number, reference_number, merchant_name, etc.
CREATE INDEX IF NOT EXISTS tddf_records_transaction_date_idx ON tddf_records(transaction_date);
CREATE INDEX IF NOT EXISTS tddf_records_merchant_account_number_idx ON tddf_records(merchant_account_number);


-- =====================================================================
-- USERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  email text UNIQUE,
  role text DEFAULT 'user',
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT NOW() NOT NULL,
  last_login timestamp,
  
  -- Profile columns (v1014)
  first_name varchar(255),
  last_name varchar(255),
  
  -- User preference columns (v1014)
  developer_flag boolean DEFAULT false,
  dark_mode boolean DEFAULT false,
  can_create_users boolean DEFAULT false,
  default_dashboard varchar(255) DEFAULT 'merchants',
  theme_preference varchar(255) DEFAULT 'system',
  
  -- Authentication tracking columns (v1014)
  auth_type text DEFAULT 'local',
  last_login_type text,
  last_failed_login timestamp,
  last_failed_login_type text,
  last_failed_login_reason text
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);


-- =====================================================================
-- SECURITY LOGS TABLE (v1014)
-- =====================================================================

CREATE TABLE IF NOT EXISTS security_logs (
  id serial PRIMARY KEY,
  event_type text NOT NULL,
  user_id integer,
  username text,
  timestamp timestamptz DEFAULT NOW() NOT NULL,
  ip_address text,
  user_agent text,
  resource_type text,
  resource_id text,
  action text,
  result text NOT NULL,
  details jsonb,
  session_id text,
  reason text,
  severity text DEFAULT 'info',
  message text,
  source text DEFAULT 'authentication'
);

CREATE INDEX IF NOT EXISTS security_logs_timestamp_idx ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS security_logs_event_type_idx ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS security_logs_user_id_idx ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS security_logs_user_action_idx ON security_logs(user_id, action);
CREATE INDEX IF NOT EXISTS security_logs_result_idx ON security_logs(result);


-- =====================================================================
-- API USERS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS api_users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  api_key text UNIQUE NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT NOW() NOT NULL,
  last_used timestamp,
  last_used_ip text,
  request_count integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS api_users_api_key_idx ON api_users(api_key);


-- =====================================================================
-- CONNECTION LOG TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS connection_log (
  id serial PRIMARY KEY,
  timestamp timestamp DEFAULT NOW() NOT NULL,
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  method text,
  status_code integer,
  user_agent text,
  api_key text,
  hostname text,
  request_body jsonb
);

CREATE INDEX IF NOT EXISTS connection_log_timestamp_idx ON connection_log(timestamp);
-- Production uses client_ip instead of ip_address, and api_key_used instead of api_key
CREATE INDEX IF NOT EXISTS connection_log_client_ip_idx ON connection_log(client_ip);
CREATE INDEX IF NOT EXISTS connection_log_api_key_used_idx ON connection_log(api_key_used);


-- =====================================================================
-- IP BLOCKLIST TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id serial PRIMARY KEY,
  ip_address text UNIQUE NOT NULL,
  reason text,
  blocked_at timestamp DEFAULT NOW() NOT NULL,
  blocked_by text,
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS ip_blocklist_ip_address_idx ON ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS ip_blocklist_is_active_idx ON ip_blocklist(is_active);


-- =====================================================================
-- HOST APPROVALS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS host_approvals (
  id serial PRIMARY KEY,
  hostname text NOT NULL,
  api_key text NOT NULL,
  approval_status text DEFAULT 'pending',
  approved_at timestamp,
  approved_by text,
  created_at timestamp DEFAULT NOW() NOT NULL,
  last_request_at timestamp,
  request_count integer DEFAULT 0,
  UNIQUE(hostname, api_key)
);

CREATE INDEX IF NOT EXISTS host_approvals_hostname_idx ON host_approvals(hostname);
-- Production uses api_key_prefix instead of api_key, and status instead of approval_status
CREATE INDEX IF NOT EXISTS host_approvals_api_key_prefix_idx ON host_approvals(api_key_prefix);
CREATE INDEX IF NOT EXISTS host_approvals_status_idx ON host_approvals(status);


-- =====================================================================
-- AUDIT LOGS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id serial PRIMARY KEY,
  entity_type text DEFAULT 'unknown',
  entity_id text DEFAULT '',
  action text DEFAULT 'unknown',
  user_id integer,
  username text DEFAULT 'system',
  timestamp timestamp DEFAULT NOW() NOT NULL,
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  ip_address text,
  user_agent text,
  notes text,
  -- Legacy columns for backward compatibility
  resource_type text,
  resource_id text,
  details jsonb
);

CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS audit_logs_entity_id_idx ON audit_logs(entity_id);

-- Add missing columns to existing audit_logs table (safe to run on existing tables)
DO $$
BEGIN
  -- Add entity_type column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_type') THEN
    ALTER TABLE audit_logs ADD COLUMN entity_type text DEFAULT 'unknown';
    RAISE NOTICE 'Added entity_type column to audit_logs';
  END IF;
  
  -- Add entity_id column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'entity_id') THEN
    ALTER TABLE audit_logs ADD COLUMN entity_id text DEFAULT '';
    RAISE NOTICE 'Added entity_id column to audit_logs';
  END IF;
  
  -- Add username column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'username') THEN
    ALTER TABLE audit_logs ADD COLUMN username text DEFAULT 'system';
    RAISE NOTICE 'Added username column to audit_logs';
  END IF;
  
  -- Add old_values column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'old_values') THEN
    ALTER TABLE audit_logs ADD COLUMN old_values jsonb;
    RAISE NOTICE 'Added old_values column to audit_logs';
  END IF;
  
  -- Add new_values column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'new_values') THEN
    ALTER TABLE audit_logs ADD COLUMN new_values jsonb;
    RAISE NOTICE 'Added new_values column to audit_logs';
  END IF;
  
  -- Add changed_fields column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'changed_fields') THEN
    ALTER TABLE audit_logs ADD COLUMN changed_fields text[];
    RAISE NOTICE 'Added changed_fields column to audit_logs';
  END IF;
  
  -- Add notes column if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'notes') THEN
    ALTER TABLE audit_logs ADD COLUMN notes text;
    RAISE NOTICE 'Added notes column to audit_logs';
  END IF;
END
$$;


-- =====================================================================
-- UPLOADER UPLOADS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS uploader_uploads (
  id text PRIMARY KEY,
  filename text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL,
  upload_datetime timestamp DEFAULT NOW() NOT NULL,
  pipeline_status text DEFAULT 'pending',
  current_step integer DEFAULT 1,
  total_steps integer DEFAULT 6,
  error_message text,
  completed_at timestamp,
  metadata jsonb,
  storage_key text,
  duplicate_of text,
  is_duplicate boolean DEFAULT false
);

-- Production uses uploaded_at instead of upload_datetime, status instead of pipeline_status
CREATE INDEX IF NOT EXISTS uploader_uploads_uploaded_at_idx ON uploader_uploads(uploaded_at);
CREATE INDEX IF NOT EXISTS uploader_uploads_status_idx ON uploader_uploads(status);
CREATE INDEX IF NOT EXISTS uploader_uploads_file_type_idx ON uploader_uploads(file_type);


-- =====================================================================
-- CACHE CONFIGURATION TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS cache_configuration (
  id serial PRIMARY KEY,
  cache_name text NOT NULL UNIQUE,
  cache_type text NOT NULL,
  page_name text,
  table_name text,
  default_expiration_minutes integer NOT NULL DEFAULT 240,
  expiration_policy text DEFAULT 'fixed',
  current_expiration_minutes integer,
  auto_refresh_enabled boolean DEFAULT true,
  refresh_interval_minutes integer DEFAULT 60,
  refresh_on_startup boolean DEFAULT false,
  cache_update_policy text DEFAULT 'manual',
  priority_level integer DEFAULT 5,
  max_records integer,
  enable_compression boolean DEFAULT false,
  description text,
  environment_specific boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_by text DEFAULT 'system',
  last_modified_by text,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS cache_config_cache_name_idx ON cache_configuration(cache_name);
CREATE INDEX IF NOT EXISTS cache_config_cache_type_idx ON cache_configuration(cache_type);
CREATE INDEX IF NOT EXISTS cache_config_page_name_idx ON cache_configuration(page_name);
CREATE INDEX IF NOT EXISTS cache_config_active_idx ON cache_configuration(is_active);


-- =====================================================================
-- PRE-CACHE TABLES
-- =====================================================================

-- TDDF Records All Pre-Cache
CREATE TABLE IF NOT EXISTS tddf_records_all_pre_cache (
  id serial PRIMARY KEY,
  year integer NOT NULL,
  cache_key text NOT NULL UNIQUE,
  cached_data jsonb NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  total_pages integer NOT NULL DEFAULT 0,
  dt_count integer DEFAULT 0,
  bh_count integer DEFAULT 0,
  p1_count integer DEFAULT 0,
  p2_count integer DEFAULT 0,
  e1_count integer DEFAULT 0,
  g2_count integer DEFAULT 0,
  other_count integer DEFAULT 0,
  total_amount numeric(15, 2) DEFAULT 0,
  unique_files integer DEFAULT 0,
  processing_time_ms integer NOT NULL DEFAULT 0,
  last_refresh_datetime timestamp DEFAULT NOW() NOT NULL,
  never_expires boolean DEFAULT true NOT NULL,
  refresh_requested_by text,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

-- Production table has different columns (upload_id, record_type, line_number, etc.)
CREATE INDEX IF NOT EXISTS tddf_all_cache_upload_id_idx ON tddf_records_all_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_all_cache_record_type_idx ON tddf_records_all_pre_cache(record_type);

-- TDDF Records DT Pre-Cache
CREATE TABLE IF NOT EXISTS tddf_records_dt_pre_cache (
  id serial PRIMARY KEY,
  year integer NOT NULL,
  cache_key text NOT NULL UNIQUE,
  cached_data jsonb NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  total_pages integer NOT NULL DEFAULT 0,
  total_transaction_amount numeric(15, 2) DEFAULT 0,
  unique_merchants integer DEFAULT 0,
  unique_terminals integer DEFAULT 0,
  avg_transaction_amount numeric(10, 2) DEFAULT 0,
  visa_count integer DEFAULT 0,
  mastercard_count integer DEFAULT 0,
  amex_count integer DEFAULT 0,
  discover_count integer DEFAULT 0,
  processing_time_ms integer NOT NULL DEFAULT 0,
  last_refresh_datetime timestamp DEFAULT NOW() NOT NULL,
  never_expires boolean DEFAULT true NOT NULL,
  refresh_requested_by text,
  created_at timestamp DEFAULT NOW() NOT NULL,
  updated_at timestamp DEFAULT NOW() NOT NULL
);

-- Production table has different columns (upload_id, transaction_amount, merchant_account, etc.)
CREATE INDEX IF NOT EXISTS tddf_dt_cache_upload_id_idx ON tddf_records_dt_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS tddf_dt_cache_merchant_account_idx ON tddf_records_dt_pre_cache(merchant_account);


-- =====================================================================
-- SYSTEM TABLES
-- =====================================================================

-- Schema Versions
CREATE TABLE IF NOT EXISTS schema_versions (
  version text PRIMARY KEY,
  applied_at timestamp DEFAULT NOW() NOT NULL,
  description text
);

-- System Logs
CREATE TABLE IF NOT EXISTS system_logs (
  id serial PRIMARY KEY,
  timestamp timestamp DEFAULT NOW() NOT NULL,
  level text NOT NULL,
  module text,
  message text NOT NULL,
  details jsonb,
  error_stack text
);

CREATE INDEX IF NOT EXISTS system_logs_timestamp_idx ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS system_logs_level_idx ON system_logs(level);


-- =====================================================================
-- MERCHANT ALIASES TABLE (v2.0.5 - Duplicate Prevention System)
-- =====================================================================

CREATE TABLE IF NOT EXISTS merchant_aliases (
  id serial PRIMARY KEY,
  merchant_id text NOT NULL,
  alias_type text NOT NULL,
  alias_value text NOT NULL,
  normalized_value text,
  source text,
  merged_from_id text,
  created_at timestamp DEFAULT NOW() NOT NULL,
  created_by text,
  notes text
);

CREATE INDEX IF NOT EXISTS merchant_aliases_merchant_id_idx ON merchant_aliases(merchant_id);
CREATE INDEX IF NOT EXISTS merchant_aliases_alias_type_idx ON merchant_aliases(alias_type);
CREATE INDEX IF NOT EXISTS merchant_aliases_alias_value_idx ON merchant_aliases(alias_value);
CREATE INDEX IF NOT EXISTS merchant_aliases_normalized_value_idx ON merchant_aliases(normalized_value);
CREATE INDEX IF NOT EXISTS merchant_aliases_type_value_idx ON merchant_aliases(alias_type, alias_value);


COMMIT;

-- =====================================================================
-- SCHEMA CREATION COMPLETE
-- =====================================================================
-- Version: 2.8.0
-- Tables Created: See sections above
-- Next Steps:
--   1. Verify all tables exist: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
--   2. Check indexes: SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public';
-- =====================================================================

-- Email Outbox table for queuing and tracking outgoing emails
CREATE TABLE IF NOT EXISTS email_outbox (
    id SERIAL PRIMARY KEY,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    body_html TEXT,
    report_type TEXT,
    report_date TEXT,
    attachment_path TEXT,
    attachment_name TEXT,
    attachment_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    scheduled_for TIMESTAMP,
    sent_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_by TEXT,
    provider TEXT DEFAULT 'graph',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox(status);
CREATE INDEX IF NOT EXISTS email_outbox_created_at_idx ON email_outbox(created_at);
CREATE INDEX IF NOT EXISTS email_outbox_provider_idx ON email_outbox(provider);
