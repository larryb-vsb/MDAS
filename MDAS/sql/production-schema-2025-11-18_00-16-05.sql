-- =====================================================================
-- PRODUCTION DATABASE SCHEMA
-- =====================================================================
-- Version: 1006 (Auto-tracked by SchemaWatch)
-- Generated: 2025-11-18 00:16:05
--
-- 72 tables total
-- Safe to run on EMPTY or EXISTING database (uses IF NOT EXISTS)
-- Creates missing tables/indexes, skips existing ones, preserves data
-- Note: No transaction wrapper - each statement runs independently
-- =====================================================================


-- api_achtransactions
CREATE SEQUENCE IF NOT EXISTS api_achtransactions_id_seq;
CREATE TABLE IF NOT EXISTS api_achtransactions (
  id text NOT NULL DEFAULT nextval('api_achtransactions_id_seq'::regclass),
  merchant_name varchar(255),
  merchant_id varchar(50),
  account_number varchar(50),
  amount numeric(12, 2),
  transaction_date date,
  code varchar(10),
  description varchar(255),
  company varchar(50),
  trace_number varchar(50),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  file_source varchar(255)
);
COMMENT ON TABLE api_achtransactions IS 'ACH transaction imports from file uploads';
CREATE INDEX IF NOT EXISTS api_achtransactions_merchant_name_idx ON public.api_achtransactions USING btree (merchant_name);
CREATE INDEX IF NOT EXISTS api_achtransactions_merchant_id_idx ON public.api_achtransactions USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS api_achtransactions_transaction_date_idx ON public.api_achtransactions USING btree (transaction_date);
CREATE INDEX IF NOT EXISTS api_achtransactions_amount_idx ON public.api_achtransactions USING btree (amount);
CREATE INDEX IF NOT EXISTS api_achtransactions_created_at_idx ON public.api_achtransactions USING btree (created_at);

-- api_merchants
CREATE TABLE IF NOT EXISTS api_merchants (
  id text NOT NULL,
  name text,
  status text,
  address text,
  city text,
  state text,
  zip text,
  country text,
  phone text,
  email text,
  website text,
  client_mid text,
  merchant_type text,
  bank text,
  risk_level text,
  compliance_status text,
  review_required boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_upload_date timestamp with time zone,
  client_since_date timestamp with time zone,
  as_of_date timestamp with time zone,
  dba_name text,
  legal_name text,
  contact_person text,
  account_manager text,
  sale_amt numeric(15, 2) DEFAULT 0,
  credit_amt numeric(15, 2) DEFAULT 0,
  monthly_volume numeric(15, 2) DEFAULT 0,
  fee_structure text,
  pricing_tier text,
  notes text,
  tags text[],
  metadata jsonb,
  search_index text
);
COMMENT ON TABLE api_merchants IS 'ACH merchant imports from file uploads';

-- api_terminals
CREATE SEQUENCE IF NOT EXISTS api_terminals_id_seq;
CREATE TABLE IF NOT EXISTS api_terminals (
  id integer NOT NULL DEFAULT nextval('api_terminals_id_seq'::regclass),
  v_number text NOT NULL,
  pos_merchant_number text,
  bin text,
  dba_name text,
  daily_auth text,
  dial_pay text,
  encryption text,
  prr text,
  mcc text,
  ssl text,
  tokenization text,
  agent text,
  chain text,
  store text,
  terminal_info text,
  record_status text,
  board_date timestamp,
  terminal_visa text,
  bank_number text,
  association_number_1 text,
  transaction_code text,
  auth_source text,
  network_identifier_debit text,
  pos_entry_mode text,
  auth_response_code text,
  validation_code text,
  cat_indicator text,
  online_entry text,
  ach_flag text,
  cardholder_id_method text,
  terminal_id text,
  discover_pos_entry_mode text,
  purchase_id text,
  pos_data_code text,
  terminal_type text,
  status text NOT NULL DEFAULT 'Active'::text,
  location text,
  m_type text,
  m_location text,
  installation_date timestamp,
  hardware_model text,
  manufacturer text,
  firmware_version text,
  network_type text,
  ip_address text,
  term_number text,
  generic_field_2 text,
  description text,
  notes text,
  internal_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text,
  updated_by text,
  last_activity timestamp,
  last_update timestamp,
  update_source text,
  last_sync_date timestamp,
  sync_status text DEFAULT 'Pending'::text,
  last_activity_date timestamp
);
COMMENT ON TABLE api_terminals IS 'Terminal data from API imports';
CREATE UNIQUE INDEX IF NOT EXISTS api_terminals_v_number_key ON public.api_terminals USING btree (v_number);
CREATE INDEX IF NOT EXISTS idx_api_terminals_v_number ON public.api_terminals USING btree (v_number);
CREATE INDEX IF NOT EXISTS idx_api_terminals_pos_merchant_number ON public.api_terminals USING btree (pos_merchant_number);
CREATE INDEX IF NOT EXISTS idx_api_terminals_status ON public.api_terminals USING btree (status);
CREATE INDEX IF NOT EXISTS idx_api_terminals_terminal_type ON public.api_terminals USING btree (terminal_type);
CREATE UNIQUE INDEX IF NOT EXISTS api_terminals_v_number_unique ON public.api_terminals USING btree (v_number);

-- api_users
CREATE SEQUENCE IF NOT EXISTS api_users_id_seq;
CREATE TABLE IF NOT EXISTS api_users (
  id integer NOT NULL DEFAULT nextval('api_users_id_seq'::regclass),
  username text NOT NULL,
  api_key text NOT NULL,
  permissions jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_used timestamp with time zone,
  description text,
  request_count integer DEFAULT 0,
  last_used_ip text
);
COMMENT ON TABLE api_users IS 'API key authentication for batch uploaders';
CREATE UNIQUE INDEX IF NOT EXISTS api_users_username_key ON public.api_users USING btree (username);
CREATE UNIQUE INDEX IF NOT EXISTS api_users_api_key_key ON public.api_users USING btree (api_key);

-- audit_logs
CREATE SEQUENCE IF NOT EXISTS audit_logs_id_seq;
CREATE TABLE IF NOT EXISTS audit_logs (
  id integer NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  user_id integer,
  username text NOT NULL,
  timestamp timestamp NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  ip_address text,
  user_agent text,
  notes text,
  file_metadata jsonb
);
COMMENT ON TABLE audit_logs IS 'System audit trail';
CREATE INDEX IF NOT EXISTS audit_logs_entity_type_idx ON public.audit_logs USING btree (entity_type);
CREATE INDEX IF NOT EXISTS audit_logs_entity_id_idx ON public.audit_logs USING btree (entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON public.audit_logs USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs USING btree (action);

-- cache_configuration
CREATE SEQUENCE IF NOT EXISTS cache_configuration_id_seq;
CREATE TABLE IF NOT EXISTS cache_configuration (
  id integer NOT NULL DEFAULT nextval('cache_configuration_id_seq'::regclass),
  cache_name text NOT NULL,
  cache_type text NOT NULL,
  page_name text,
  table_name text,
  default_expiration_minutes integer NOT NULL DEFAULT 240,
  expiration_policy text DEFAULT 'fixed'::text,
  current_expiration_minutes integer,
  auto_refresh_enabled boolean DEFAULT true,
  last_refresh_at timestamp,
  next_refresh_at timestamp,
  refresh_interval_minutes integer,
  is_active boolean DEFAULT true,
  description text,
  notes text,
  metadata jsonb,
  created_by text DEFAULT 'system'::text,
  last_modified_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
COMMENT ON TABLE cache_configuration IS 'Cache settings and expiration policies';
CREATE UNIQUE INDEX IF NOT EXISTS cache_configuration_cache_name_key ON public.cache_configuration USING btree (cache_name);
CREATE INDEX IF NOT EXISTS cache_config_cache_name_idx ON public.cache_configuration USING btree (cache_name);
CREATE INDEX IF NOT EXISTS cache_config_cache_type_idx ON public.cache_configuration USING btree (cache_type);
CREATE INDEX IF NOT EXISTS cache_config_page_name_idx ON public.cache_configuration USING btree (page_name);
CREATE INDEX IF NOT EXISTS cache_config_active_idx ON public.cache_configuration USING btree (is_active);
CREATE INDEX IF NOT EXISTS cache_config_expiration_idx ON public.cache_configuration USING btree (current_expiration_minutes);

-- charts_pre_cache
CREATE TABLE IF NOT EXISTS charts_pre_cache (
  processing_date date,
  files_processed bigint,
  total_bytes bigint,
  successful_files bigint,
  failed_files bigint,
  avg_processing_time_seconds numeric
);
COMMENT ON TABLE charts_pre_cache IS 'Pre-cached chart data';

-- connection_log
CREATE SEQUENCE IF NOT EXISTS connection_log_id_seq;
CREATE TABLE IF NOT EXISTS connection_log (
  id integer NOT NULL DEFAULT nextval('connection_log_id_seq'::regclass),
  timestamp timestamp NOT NULL DEFAULT now(),
  client_ip text NOT NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  user_agent text,
  api_key_used text,
  api_user_id integer,
  authenticated boolean NOT NULL DEFAULT false,
  status_code integer,
  response_time integer
);
COMMENT ON TABLE connection_log IS 'API request logging for security monitoring';
CREATE INDEX IF NOT EXISTS connection_log_ip_idx ON public.connection_log USING btree (client_ip);
CREATE INDEX IF NOT EXISTS connection_log_timestamp_idx ON public.connection_log USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS connection_log_endpoint_idx ON public.connection_log USING btree (endpoint);
CREATE INDEX IF NOT EXISTS connection_log_api_user_id_idx ON public.connection_log USING btree (api_user_id);

-- dashboard_cache
CREATE SEQUENCE IF NOT EXISTS dashboard_cache_id_seq;
CREATE TABLE IF NOT EXISTS dashboard_cache (
  id integer NOT NULL DEFAULT nextval('dashboard_cache_id_seq'::regclass),
  cache_key varchar(255) NOT NULL,
  cache_data jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  build_time_ms integer NOT NULL DEFAULT 0,
  record_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
COMMENT ON TABLE dashboard_cache IS 'Dashboard data cache';
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_cache_cache_key_key ON public.dashboard_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_cache_key ON public.dashboard_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_expires_at ON public.dashboard_cache USING btree (expires_at);

-- dev_uploads
CREATE TABLE IF NOT EXISTS dev_uploads (
  id text NOT NULL,
  filename text NOT NULL,
  compressed_payload jsonb NOT NULL,
  schema_info jsonb NOT NULL,
  upload_date timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status text NOT NULL DEFAULT 'uploaded'::text,
  processed_at timestamp with time zone,
  record_count integer,
  processing_time_ms integer,
  notes text
);

-- duplicate_finder_cache
CREATE TABLE IF NOT EXISTS duplicate_finder_cache (
  id text NOT NULL DEFAULT md5(((random())::text || (clock_timestamp())::text)),
  created_at timestamp DEFAULT now(),
  status text DEFAULT 'active'::text,
  scan_status text DEFAULT 'pending'::text,
  duplicate_count integer DEFAULT 0,
  scan_completed boolean DEFAULT false,
  last_scan_date timestamp DEFAULT now(),
  total_scanned integer DEFAULT 0,
  scan_in_progress boolean DEFAULT false,
  cooldown_until timestamp,
  scan_history jsonb,
  cache_key text DEFAULT 'duplicate_scan_status'::text
);
COMMENT ON TABLE duplicate_finder_cache IS 'Duplicate detection cache';

-- host_approvals
CREATE SEQUENCE IF NOT EXISTS host_approvals_id_seq;
CREATE TABLE IF NOT EXISTS host_approvals (
  id integer NOT NULL DEFAULT nextval('host_approvals_id_seq'::regclass),
  hostname text NOT NULL,
  api_key_prefix text NOT NULL,
  api_user_id integer,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'pending'::text,
  requested_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by text,
  reviewed_at timestamp,
  notes text,
  last_seen_at timestamp,
  last_seen_ip text
);
COMMENT ON TABLE host_approvals IS 'Host + API key approval system for uploads';
CREATE UNIQUE INDEX IF NOT EXISTS host_approvals_hostname_key_unique ON public.host_approvals USING btree (hostname, api_key_prefix);
CREATE INDEX IF NOT EXISTS host_approvals_status_idx ON public.host_approvals USING btree (status);
CREATE INDEX IF NOT EXISTS host_approvals_hostname_idx ON public.host_approvals USING btree (hostname);

-- ip_blocklist
CREATE SEQUENCE IF NOT EXISTS ip_blocklist_id_seq;
CREATE TABLE IF NOT EXISTS ip_blocklist (
  id integer NOT NULL DEFAULT nextval('ip_blocklist_id_seq'::regclass),
  ip_address text NOT NULL,
  reason text,
  blocked_by text,
  blocked_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp,
  is_active boolean NOT NULL DEFAULT true,
  notes text
);
COMMENT ON TABLE ip_blocklist IS 'Blocked IP addresses';
CREATE UNIQUE INDEX IF NOT EXISTS ip_blocklist_ip_address_key ON public.ip_blocklist USING btree (ip_address);
CREATE INDEX IF NOT EXISTS ip_blocklist_ip_idx ON public.ip_blocklist USING btree (ip_address);
CREATE INDEX IF NOT EXISTS ip_blocklist_active_idx ON public.ip_blocklist USING btree (is_active);

-- master_object_keys
CREATE SEQUENCE IF NOT EXISTS master_object_keys_id_seq;
CREATE TABLE IF NOT EXISTS master_object_keys (
  id integer NOT NULL DEFAULT nextval('master_object_keys_id_seq'::regclass),
  object_key text NOT NULL,
  file_size_bytes integer NOT NULL,
  line_count integer,
  status text NOT NULL DEFAULT 'active'::text,
  upload_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  mark_for_purge boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE master_object_keys IS 'Object storage key tracking and management';
CREATE UNIQUE INDEX IF NOT EXISTS master_object_keys_object_key_key ON public.master_object_keys USING btree (object_key);
CREATE INDEX IF NOT EXISTS master_object_keys_object_key_idx ON public.master_object_keys USING btree (object_key);
CREATE INDEX IF NOT EXISTS master_object_keys_status_idx ON public.master_object_keys USING btree (status);
CREATE INDEX IF NOT EXISTS master_object_keys_upload_id_idx ON public.master_object_keys USING btree (upload_id);
CREATE INDEX IF NOT EXISTS master_object_keys_created_at_idx ON public.master_object_keys USING btree (created_at);
CREATE INDEX IF NOT EXISTS master_object_keys_mark_for_purge_idx ON public.master_object_keys USING btree (mark_for_purge);

-- merchant_mcc_schema
CREATE SEQUENCE IF NOT EXISTS merchant_mcc_schema_id_seq;
CREATE TABLE IF NOT EXISTS merchant_mcc_schema (
  position text NOT NULL,
  field_name text NOT NULL,
  field_length integer NOT NULL,
  format text NOT NULL,
  description text,
  mms_enabled integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  id integer NOT NULL DEFAULT nextval('merchant_mcc_schema_id_seq'::regclass),
  key text,
  tab_position text
);
COMMENT ON TABLE merchant_mcc_schema IS 'Dynamic MCC schema configuration for merchant fields';
CREATE UNIQUE INDEX IF NOT EXISTS merchant_mcc_schema_position_unique ON public.merchant_mcc_schema USING btree ("position");

-- merchants
CREATE TABLE IF NOT EXISTS merchants (
  id text NOT NULL,
  name text,
  status text,
  category text,
  address text,
  city text,
  state text,
  zip text,
  country text,
  phone text,
  email text,
  website text,
  client_mid text,
  merchant_type text,
  bank text,
  risk_level text,
  compliance_status text,
  review_required boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  last_upload_date timestamp with time zone,
  client_since_date timestamp with time zone,
  as_of_date timestamp with time zone,
  dba_name text,
  legal_name text,
  contact_person text,
  account_manager text,
  sale_amt numeric(15, 2) DEFAULT 0,
  credit_amt numeric(15, 2) DEFAULT 0,
  monthly_volume numeric(15, 2) DEFAULT 0,
  fee_structure text,
  pricing_tier text,
  notes text,
  tags text[],
  metadata jsonb,
  search_index text,
  other_client_number1 text,
  other_client_number2 text,
  other_client_number3 text,
  processor_name text,
  agent_bank_number text,
  chain_number text,
  store_number text,
  terminal_number text,
  merchant_category_code text,
  settlement_agent text,
  agent_chain_number text,
  sales_channel text,
  zip_code text,
  edit_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_by text DEFAULT 'System'::text,
  association text,
  mcc text,
  master_mid text,
  associate_merchant_number text,
  dba_name_cwob text,
  cwob_debit_risk text,
  vwob_ebt_return text,
  bypass_ea text,
  bypass_co text,
  merchant_record_st text,
  board_dt timestamp,
  negative_amount numeric(15, 2),
  number_o text,
  bypass_force text,
  fee_visa numeric(15, 2),
  visa_mcc text,
  daily_auth_limit numeric(15, 2),
  bypass_ex text,
  excessive_deposit_amount numeric(15, 2),
  threshold numeric(15, 2),
  risk_score numeric(5, 2),
  last_risk_assessment timestamp,
  risk_flags text[],
  risk_notes text,
  bank_number text,
  group_level_1 text,
  association_number text,
  account_number text,
  association_name text,
  group_level_1_name text,
  sic text,
  class text,
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
  ach_flag text,
  visa_cps2 text,
  visa_cps1 text,
  visa_supermarket text,
  visa_psrf text,
  visa_eirf text,
  mc_merit_3 text,
  mc_merit_1 text,
  mc_supermarket text,
  mc_pt_cat text,
  mc_warehouse text,
  mc_prm text,
  discover_eligibility text,
  amex_description_code text,
  amex_id text,
  amex_submitter_id text,
  discover_reference_number text,
  discover_acct_id text,
  interchange_dollar text,
  interchange_count text,
  multicurrency_flag text,
  reclear_flag text,
  merchant_convenience_fee_flag text,
  user_bank_number text,
  user_branch_number text,
  user_flag_1 text,
  user_data_1 text,
  user_data_2 text,
  user_data_3 text,
  user_data_4 text,
  user_data_5 text,
  user_account_1 text,
  user_account_2 text,
  edc_flag text,
  rep_code text,
  storage_flag text,
  member_id text,
  inc_status text,
  grs_flag text,
  merchant_status text,
  asst_manager_name text,
  other_name text,
  ssn_number text,
  owner_license_number text,
  last_statement_date timestamp,
  open_date timestamp,
  last_credit_check_date timestamp,
  last_call_date timestamp,
  next_call_date timestamp,
  fin_statement_due_date timestamp,
  fin_statement_req_date timestamp,
  statement_count integer,
  post_date_debits text,
  post_date_credits text,
  address_discount_indicator text,
  address_rcl_list text,
  address_crb_list text,
  address_card_mailer text,
  address_irs text,
  address_imprinters_rentals text,
  address_member_fees text,
  address_pos_terminals text,
  address_mis text,
  address_adjustments text,
  address_chargebacks text,
  address_unique_message text,
  address_bet1 text,
  address_bet2 text,
  address_bet3 text,
  dest_overall text,
  dest_deposits text,
  dest_adjustments text,
  dest_chargebacks text,
  dest_reversals text,
  dest_chargeback_reversals text,
  dest_dda_adjustments text,
  dest_batch_adjustments text,
  dest_tran_option_1 text,
  dest_tran_option_2 text,
  convenience_fee_account_name text,
  convenience_fee_account_number text,
  convenience_fee_type text,
  convenience_fee_routing_number text,
  convenience_fee_per_item numeric,
  convenience_fee_net_separate_indicator text,
  convenience_fee_transaction_type_indicator text,
  split_funding_account_name_1 text,
  split_funding_account_number_1 text,
  split_funding_type_1 text,
  split_funding_routing_number_1 text,
  split_funding_percent_1 numeric,
  split_funding_per_item_1 numeric,
  split_funding_account_name_2 text,
  split_funding_account_number_2 text,
  split_funding_type_2 text,
  split_funding_routing_number_2 text,
  split_funding_percent_2 numeric,
  split_funding_per_item_2 numeric,
  split_funding_account_name_3 text,
  split_funding_account_number_3 text,
  split_funding_type_3 text,
  split_funding_routing_number_3 text,
  split_funding_percent_3 numeric,
  split_funding_per_item_3 numeric,
  split_funding_account_name_4 text,
  split_funding_account_number_4 text,
  split_funding_type_4 text,
  split_funding_routing_number_4 text,
  split_funding_percent_4 numeric,
  split_funding_per_item_4 numeric,
  split_funding_merchant_split_funding_flag text,
  split_funding_net_separate_indicator text,
  split_funding_include_credits text,
  split_funding_include_chargebacks text,
  split_funding_include_volume_adjustments text,
  split_funding_include_reversals text,
  dba_country_code text,
  delimiter text,
  reserved_for_future_use text,
  filler text,
  last_batch_filename text,
  last_batch_date timestamp,
  last_transaction_amount numeric(15, 2),
  last_transaction_date timestamp
);
COMMENT ON TABLE merchants IS 'Core merchant data with TSYS MCC fields, risk assessment, and pre-cached TDDF tracking';
CREATE INDEX IF NOT EXISTS idx_merchants_account_number ON public.merchants USING btree (account_number);
CREATE INDEX IF NOT EXISTS merchants_created_at_idx ON public.merchants USING btree (created_at);
CREATE INDEX IF NOT EXISTS merchants_last_upload_date_idx ON public.merchants USING btree (last_upload_date);
CREATE INDEX IF NOT EXISTS merchants_client_since_date_idx ON public.merchants USING btree (client_since_date);
CREATE INDEX IF NOT EXISTS merchants_last_activity_date_idx ON public.merchants USING btree (last_activity_date);
CREATE INDEX IF NOT EXISTS merchants_merchant_activation_date_idx ON public.merchants USING btree (merchant_activation_date);
CREATE INDEX IF NOT EXISTS merchants_date_of_first_deposit_idx ON public.merchants USING btree (date_of_first_deposit);
CREATE INDEX IF NOT EXISTS merchants_date_of_last_deposit_idx ON public.merchants USING btree (date_of_last_deposit);
CREATE INDEX IF NOT EXISTS merchants_status_created_at_idx ON public.merchants USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS merchants_type_last_upload_idx ON public.merchants USING btree (merchant_type, last_upload_date);
CREATE INDEX IF NOT EXISTS merchants_last_batch_date_idx ON public.merchants USING btree (last_batch_date);
CREATE INDEX IF NOT EXISTS merchants_last_transaction_date_idx ON public.merchants USING btree (last_transaction_date);

-- mms-app-DatabaseInfo
CREATE SEQUENCE IF NOT EXISTS mms-app-DatabaseInfo_id_seq;
CREATE TABLE IF NOT EXISTS mms-app-DatabaseInfo (
  id integer NOT NULL DEFAULT nextval('"dev_mms-app-DatabaseInfo_id_seq"'::regclass),
  environment_name text NOT NULL DEFAULT 'development'::text,
  schema_version bigint,
  last_updated timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- pre_cache_runs
CREATE SEQUENCE IF NOT EXISTS pre_cache_runs_id_seq;
CREATE TABLE IF NOT EXISTS pre_cache_runs (
  id integer NOT NULL DEFAULT nextval('pre_cache_runs_id_seq'::regclass),
  job_id text NOT NULL,
  cache_name text NOT NULL,
  cache_type text NOT NULL,
  year integer,
  month integer,
  date_range_start date,
  date_range_end date,
  status text NOT NULL DEFAULT 'pending'::text,
  trigger_type text,
  triggered_by text,
  started_at timestamp,
  completed_at timestamp,
  duration_ms integer,
  records_processed integer,
  records_created integer,
  records_updated integer,
  records_deleted integer,
  error_message text,
  error_details text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  triggered_by_user text,
  trigger_reason text,
  records_cached integer
);
COMMENT ON TABLE pre_cache_runs IS 'Pre-cache build job tracking';
CREATE UNIQUE INDEX IF NOT EXISTS pre_cache_runs_job_id_key ON public.pre_cache_runs USING btree (job_id);
CREATE INDEX IF NOT EXISTS pre_cache_runs_job_id_idx ON public.pre_cache_runs USING btree (job_id);
CREATE INDEX IF NOT EXISTS pre_cache_runs_cache_name_idx ON public.pre_cache_runs USING btree (cache_name);
CREATE INDEX IF NOT EXISTS pre_cache_runs_status_idx ON public.pre_cache_runs USING btree (status);
CREATE INDEX IF NOT EXISTS pre_cache_runs_year_month_idx ON public.pre_cache_runs USING btree (year, month);
CREATE INDEX IF NOT EXISTS pre_cache_runs_created_at_idx ON public.pre_cache_runs USING btree (created_at);

-- processing_metrics
CREATE SEQUENCE IF NOT EXISTS processing_metrics_id_seq;
CREATE TABLE IF NOT EXISTS processing_metrics (
  id integer NOT NULL DEFAULT nextval('processing_metrics_id_seq'::regclass),
  timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  files_processed integer DEFAULT 0,
  records_processed integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  processing_time_ms integer DEFAULT 0,
  metric_type text DEFAULT 'snapshot'::text,
  dt_records_processed integer DEFAULT 0,
  bh_records_processed integer DEFAULT 0,
  p1_records_processed integer DEFAULT 0,
  other_records_processed integer DEFAULT 0,
  non_dt_records_skipped integer DEFAULT 0,
  other_skipped integer DEFAULT 0,
  system_status text DEFAULT 'operational'::text,
  tddf_processing_datetime timestamp,
  dt_processed integer DEFAULT 0,
  dt_pending integer DEFAULT 0,
  dt_skipped integer DEFAULT 0,
  bh_processed integer DEFAULT 0,
  bh_pending integer DEFAULT 0,
  bh_skipped integer DEFAULT 0,
  p1_processed integer DEFAULT 0,
  p1_pending integer DEFAULT 0,
  p1_skipped integer DEFAULT 0,
  e1_processed integer DEFAULT 0,
  e1_pending integer DEFAULT 0,
  e1_skipped integer DEFAULT 0,
  g2_processed integer DEFAULT 0,
  g2_pending integer DEFAULT 0,
  g2_skipped integer DEFAULT 0,
  ad_processed integer DEFAULT 0,
  ad_skipped integer DEFAULT 0,
  dr_processed integer DEFAULT 0,
  dr_skipped integer DEFAULT 0,
  p2_processed integer DEFAULT 0,
  p2_skipped integer DEFAULT 0,
  transactions_per_second numeric,
  peak_transactions_per_second numeric,
  records_per_minute numeric,
  peak_records_per_minute numeric,
  total_files integer,
  queued_files integer,
  processed_files integer,
  files_with_errors integer,
  currently_processing integer,
  average_processing_time_ms integer,
  notes text,
  raw_lines_processed integer,
  raw_lines_skipped integer,
  raw_lines_total integer,
  tddf_files integer,
  tddf_records integer,
  tddf_raw_lines integer,
  tddf_total_value numeric,
  tddf_pending_lines integer,
  other_processed integer
);
COMMENT ON TABLE processing_metrics IS 'File processing performance metrics';
CREATE INDEX IF NOT EXISTS processing_metrics_timestamp_idx ON public.processing_metrics USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS processing_metrics_dt_processed_idx ON public.processing_metrics USING btree (dt_processed);

-- processing_timing_logs
CREATE SEQUENCE IF NOT EXISTS processing_timing_logs_id_seq;
CREATE TABLE IF NOT EXISTS processing_timing_logs (
  id integer NOT NULL DEFAULT nextval('processing_timing_logs_id_seq'::regclass),
  upload_id text NOT NULL,
  operation_type text NOT NULL,
  start_time timestamp NOT NULL,
  end_time timestamp,
  duration_seconds integer,
  total_records integer,
  records_per_second numeric(10, 2),
  status text NOT NULL DEFAULT 'in_progress'::text,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);
COMMENT ON TABLE processing_timing_logs IS 'Detailed processing timing data';

-- schema_dump_tracking
CREATE SEQUENCE IF NOT EXISTS schema_dump_tracking_id_seq;
CREATE TABLE IF NOT EXISTS schema_dump_tracking (
  id integer NOT NULL DEFAULT nextval('schema_dump_tracking_id_seq'::regclass),
  version varchar(50) NOT NULL,
  environment varchar(20) NOT NULL,
  action varchar(50) NOT NULL,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  performed_by varchar(100),
  notes text
);

-- security_logs
CREATE SEQUENCE IF NOT EXISTS security_logs_id_seq;
CREATE TABLE IF NOT EXISTS security_logs (
  id integer NOT NULL DEFAULT nextval('security_logs_id_seq'::regclass),
  event_type text NOT NULL,
  user_id integer,
  username text,
  timestamp timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address text,
  user_agent text,
  resource_type text,
  resource_id text,
  action text,
  result text NOT NULL,
  details jsonb,
  session_id text,
  reason text,
  severity text DEFAULT 'info'::text,
  message text,
  source text DEFAULT 'authentication'::text
);
COMMENT ON TABLE security_logs IS 'Security event logging';
CREATE INDEX IF NOT EXISTS security_logs_event_type_idx ON public.security_logs USING btree (event_type);
CREATE INDEX IF NOT EXISTS security_logs_username_idx ON public.security_logs USING btree (username);
CREATE INDEX IF NOT EXISTS security_logs_timestamp_idx ON public.security_logs USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS security_logs_result_idx ON public.security_logs USING btree (result);

-- session
CREATE TABLE IF NOT EXISTS session (
  sid text NOT NULL,
  sess json NOT NULL,
  expire timestamp NOT NULL
);
COMMENT ON TABLE session IS 'User session storage';
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.session USING btree (expire);

-- sub_merchant_terminals
CREATE SEQUENCE IF NOT EXISTS sub_merchant_terminals_id_seq;
CREATE TABLE IF NOT EXISTS sub_merchant_terminals (
  id integer NOT NULL DEFAULT nextval('sub_merchant_terminals_id_seq'::regclass),
  device_name text NOT NULL,
  d_number text NOT NULL,
  merchant_id text,
  terminal_id integer,
  match_type text,
  match_confidence numeric(5, 2),
  is_active boolean DEFAULT true,
  matched_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  created_by text,
  notes text
);
COMMENT ON TABLE sub_merchant_terminals IS 'Sub-merchant terminal mappings';
CREATE INDEX IF NOT EXISTS sub_merchant_terminals_device_name_idx ON public.sub_merchant_terminals USING btree (device_name);
CREATE INDEX IF NOT EXISTS sub_merchant_terminals_d_number_idx ON public.sub_merchant_terminals USING btree (d_number);
CREATE INDEX IF NOT EXISTS sub_merchant_terminals_merchant_id_idx ON public.sub_merchant_terminals USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS sub_merchant_terminals_terminal_id_idx ON public.sub_merchant_terminals USING btree (terminal_id);
CREATE INDEX IF NOT EXISTS sub_merchant_terminals_match_type_idx ON public.sub_merchant_terminals USING btree (match_type);
CREATE INDEX IF NOT EXISTS sub_merchant_terminals_active_idx ON public.sub_merchant_terminals USING btree (is_active);

-- system_logs
CREATE SEQUENCE IF NOT EXISTS system_logs_id_seq;
CREATE TABLE IF NOT EXISTS system_logs (
  id integer NOT NULL DEFAULT nextval('system_logs_id_seq'::regclass),
  timestamp timestamp DEFAULT CURRENT_TIMESTAMP,
  level varchar(10) NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  server_id varchar(50),
  category varchar(50),
  source text,
  details jsonb,
  tddf_processing_datetime timestamp
);
COMMENT ON TABLE system_logs IS 'System-wide logging';
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON public.system_logs USING btree ("timestamp");

-- system_settings
CREATE SEQUENCE IF NOT EXISTS system_settings_id_seq;
CREATE TABLE IF NOT EXISTS system_settings (
  id integer NOT NULL DEFAULT nextval('system_settings_id_seq'::regclass),
  setting_key text NOT NULL,
  setting_value text NOT NULL,
  setting_type text DEFAULT 'boolean'::text,
  description text,
  last_updated_by text DEFAULT 'system'::text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  category varchar(100),
  is_active boolean DEFAULT true,
  created_by varchar(100),
  updated_by varchar(100)
);
COMMENT ON TABLE system_settings IS 'Application configuration settings';
CREATE UNIQUE INDEX IF NOT EXISTS system_settings_setting_key_key ON public.system_settings USING btree (setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings USING btree (setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings USING btree (category);
CREATE INDEX IF NOT EXISTS idx_system_settings_active ON public.system_settings USING btree (is_active);

-- tddf1_activity_cache
CREATE SEQUENCE IF NOT EXISTS tddf1_activity_cache_id_seq;
CREATE TABLE IF NOT EXISTS tddf1_activity_cache (
  id integer NOT NULL DEFAULT nextval('tddf1_activity_cache_id_seq'::regclass),
  file_name text,
  processing_date date,
  record_count integer DEFAULT 0,
  status text DEFAULT 'processed'::text,
  created_at timestamp DEFAULT now()
);
COMMENT ON TABLE tddf1_activity_cache IS 'TDDF1 activity data cache';

-- tddf1_merchants
CREATE SEQUENCE IF NOT EXISTS tddf1_merchants_id_seq;
CREATE TABLE IF NOT EXISTS tddf1_merchants (
  id integer NOT NULL DEFAULT nextval('tddf1_merchants_id_seq'::regclass),
  merchant_id varchar(255) NOT NULL,
  merchant_name varchar(255),
  total_transactions integer DEFAULT 0,
  total_amount numeric(15, 2) DEFAULT 0.00,
  total_net_deposits numeric(15, 2) DEFAULT 0.00,
  batch_count integer DEFAULT 0,
  first_seen date,
  last_seen date,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
  amex_merchant_seller_name text,
  dba_name text,
  legal_name text,
  contact_person text,
  account_manager text,
  unique_terminals integer DEFAULT 0
);
COMMENT ON TABLE tddf1_merchants IS 'TDDF1 merchant summary data';
CREATE UNIQUE INDEX IF NOT EXISTS tddf1_merchants_merchant_id_key ON public.tddf1_merchants USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS tddf1_merchants_merchant_id_idx ON public.tddf1_merchants USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS tddf1_merchants_merchant_name_idx ON public.tddf1_merchants USING btree (merchant_name);
CREATE INDEX IF NOT EXISTS tddf1_merchants_first_seen_idx ON public.tddf1_merchants USING btree (first_seen);
CREATE INDEX IF NOT EXISTS tddf1_merchants_last_seen_idx ON public.tddf1_merchants USING btree (last_seen);
CREATE INDEX IF NOT EXISTS tddf1_merchants_total_amount_idx ON public.tddf1_merchants USING btree (total_amount);
CREATE INDEX IF NOT EXISTS tddf1_merchants_total_transactions_idx ON public.tddf1_merchants USING btree (total_transactions);

-- tddf1_monthly_cache
CREATE SEQUENCE IF NOT EXISTS tddf1_monthly_cache_id_seq;
CREATE TABLE IF NOT EXISTS tddf1_monthly_cache (
  id integer NOT NULL DEFAULT nextval('tddf1_monthly_cache_id_seq'::regclass),
  year integer NOT NULL,
  month integer NOT NULL,
  totals_json jsonb NOT NULL,
  daily_breakdown_json jsonb,
  comparison_json jsonb,
  metadata jsonb,
  last_refresh_datetime timestamp DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  cache_key text,
  total_transaction_amount numeric(20, 2) DEFAULT 0,
  total_net_deposits numeric(20, 2) DEFAULT 0,
  total_files integer DEFAULT 0,
  total_records integer DEFAULT 0,
  bh_records integer DEFAULT 0,
  dt_records integer DEFAULT 0,
  build_time_ms integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  refresh_requested_by text,
  triggered_by text
);
COMMENT ON TABLE tddf1_monthly_cache IS 'Monthly pre-cached TDDF1 data for instant dashboard loading';
CREATE UNIQUE INDEX IF NOT EXISTS tddf1_monthly_cache_year_month_key ON public.tddf1_monthly_cache USING btree (year, month);
CREATE INDEX IF NOT EXISTS idx_tddf1_monthly_cache_year_month ON public.tddf1_monthly_cache USING btree (year, month);
CREATE INDEX IF NOT EXISTS idx_tddf1_monthly_cache_last_refresh ON public.tddf1_monthly_cache USING btree (last_refresh_datetime);
CREATE UNIQUE INDEX IF NOT EXISTS tddf1_monthly_cache_cache_key_key ON public.tddf1_monthly_cache USING btree (cache_key);

-- tddf1_totals
CREATE SEQUENCE IF NOT EXISTS tddf1_totals_id_seq;
CREATE TABLE IF NOT EXISTS tddf1_totals (
  id integer NOT NULL DEFAULT nextval('tddf1_totals_cache_id_seq'::regclass),
  file_date date,
  total_files integer DEFAULT 0,
  total_records integer DEFAULT 0,
  total_transaction_amounts numeric(20, 2) DEFAULT 0,
  total_net_deposits numeric(20, 2) DEFAULT 0,
  bh_records integer DEFAULT 0,
  dt_records integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
COMMENT ON TABLE tddf1_totals IS 'TDDF1 aggregated totals';
CREATE UNIQUE INDEX IF NOT EXISTS tddf1_totals_cache_file_date_key ON public.tddf1_totals USING btree (file_date);

-- tddf_api_files
CREATE SEQUENCE IF NOT EXISTS tddf_api_files_id_seq;
CREATE TABLE IF NOT EXISTS tddf_api_files (
  id integer NOT NULL DEFAULT nextval('tddf_api_files_id_seq'::regclass),
  filename varchar(255) NOT NULL,
  original_name varchar(255) NOT NULL,
  file_size bigint NOT NULL,
  file_hash varchar(64) NOT NULL,
  storage_path varchar(500) NOT NULL,
  schema_id integer,
  status varchar(50) DEFAULT 'uploaded'::character varying,
  record_count integer DEFAULT 0,
  processed_records integer DEFAULT 0,
  error_records integer DEFAULT 0,
  processing_started timestamp with time zone,
  processing_completed timestamp with time zone,
  error_details jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  uploaded_at timestamp with time zone DEFAULT now(),
  uploaded_by varchar(100),
  business_day date,
  file_date text
);
COMMENT ON TABLE tddf_api_files IS 'TDDF API file metadata';

-- tddf_api_keys
CREATE SEQUENCE IF NOT EXISTS tddf_api_keys_id_seq;
CREATE TABLE IF NOT EXISTS tddf_api_keys (
  id integer NOT NULL DEFAULT nextval('tddf_api_keys_id_seq'::regclass),
  key_name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  permissions jsonb NOT NULL,
  is_active boolean DEFAULT true,
  last_used timestamp,
  request_count integer DEFAULT 0,
  rate_limit_per_minute integer DEFAULT 100,
  created_at timestamp NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  expires_at timestamp,
  last_used_ip text
);
COMMENT ON TABLE tddf_api_keys IS 'TDDF API authentication keys';
CREATE INDEX IF NOT EXISTS tddf_api_keys_hash_idx ON public.tddf_api_keys USING btree (key_hash);
CREATE INDEX IF NOT EXISTS tddf_api_keys_prefix_idx ON public.tddf_api_keys USING btree (key_prefix);

-- tddf_api_queue
CREATE SEQUENCE IF NOT EXISTS tddf_api_queue_id_seq;
CREATE TABLE IF NOT EXISTS tddf_api_queue (
  id integer NOT NULL DEFAULT nextval('tddf_api_queue_id_seq'::regclass),
  file_id integer,
  status varchar(50) DEFAULT 'pending'::character varying,
  priority integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_details jsonb
);
COMMENT ON TABLE tddf_api_queue IS 'TDDF API processing queue';

-- tddf_api_records
CREATE SEQUENCE IF NOT EXISTS tddf_api_records_id_seq;
CREATE TABLE IF NOT EXISTS tddf_api_records (
  id integer NOT NULL DEFAULT nextval('tddf_api_records_id_seq'::regclass),
  file_id integer,
  record_number integer NOT NULL,
  raw_line text NOT NULL,
  parsed_data jsonb,
  validation_errors jsonb DEFAULT '[]'::jsonb,
  status varchar(50) DEFAULT 'pending'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  upload_id text,
  filename text,
  record_type text,
  line_number integer,
  extracted_fields jsonb,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  tddf_processing_datetime timestamp,
  tddf_processing_date date,
  parsed_datetime timestamp,
  record_time_source text,
  is_valid boolean DEFAULT true,
  processed_at timestamp
);
COMMENT ON TABLE tddf_api_records IS 'TDDF API record storage';
CREATE INDEX IF NOT EXISTS tddf_api_records_upload_id_idx ON public.tddf_api_records USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_api_records_record_type_idx ON public.tddf_api_records USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_api_records_record_identifier_idx ON public.tddf_api_records USING btree (record_identifier);
CREATE INDEX IF NOT EXISTS tddf_api_records_processing_datetime_idx ON public.tddf_api_records USING btree (tddf_processing_datetime);
CREATE INDEX IF NOT EXISTS tddf_api_records_processing_date_idx ON public.tddf_api_records USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_api_records_parsed_datetime_idx ON public.tddf_api_records USING btree (parsed_datetime);
CREATE INDEX IF NOT EXISTS tddf_api_records_record_time_source_idx ON public.tddf_api_records USING btree (record_time_source);

-- tddf_api_request_logs
CREATE SEQUENCE IF NOT EXISTS tddf_api_request_logs_id_seq;
CREATE TABLE IF NOT EXISTS tddf_api_request_logs (
  id integer NOT NULL DEFAULT nextval('tddf_api_request_logs_id_seq'::regclass),
  api_key_id integer,
  endpoint text NOT NULL,
  method text NOT NULL,
  request_params jsonb,
  response_status integer NOT NULL,
  response_time integer,
  request_size integer,
  response_size integer,
  user_agent text,
  ip_address text,
  requested_at timestamp NOT NULL DEFAULT now()
);
COMMENT ON TABLE tddf_api_request_logs IS 'TDDF API request logging';
CREATE INDEX IF NOT EXISTS tddf_api_requests_key_time_idx ON public.tddf_api_request_logs USING btree (api_key_id, requested_at);
CREATE INDEX IF NOT EXISTS tddf_api_requests_endpoint_time_idx ON public.tddf_api_request_logs USING btree (endpoint, requested_at);

-- tddf_api_schemas
CREATE SEQUENCE IF NOT EXISTS tddf_api_schemas_id_seq;
CREATE TABLE IF NOT EXISTS tddf_api_schemas (
  id integer NOT NULL DEFAULT nextval('tddf_api_schemas_id_seq'::regclass),
  name varchar(255) NOT NULL,
  version varchar(50) NOT NULL,
  description text,
  schema_data jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by varchar(100) NOT NULL
);
COMMENT ON TABLE tddf_api_schemas IS 'TDDF API schema definitions';

-- tddf_archive
CREATE SEQUENCE IF NOT EXISTS tddf_archive_id_seq;
CREATE TABLE IF NOT EXISTS tddf_archive (
  id integer NOT NULL DEFAULT nextval('tddf_archive_id_seq'::regclass),
  archive_filename text NOT NULL,
  original_filename text NOT NULL,
  archive_path text NOT NULL,
  original_upload_path text,
  file_size integer NOT NULL,
  file_hash text NOT NULL,
  content_type text DEFAULT 'text/plain'::text,
  archive_status text NOT NULL DEFAULT 'pending'::text,
  step6_status text DEFAULT 'pending'::text,
  total_records integer DEFAULT 0,
  processed_records integer DEFAULT 0,
  error_records integer DEFAULT 0,
  business_day date,
  file_date text,
  original_upload_id text,
  api_file_id integer,
  archived_at timestamp,
  step6_processed_at timestamp,
  metadata jsonb,
  processing_errors jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
COMMENT ON TABLE tddf_archive IS 'Archived TDDF files';
CREATE INDEX IF NOT EXISTS tddf_archive_filename_idx ON public.tddf_archive USING btree (archive_filename);
CREATE INDEX IF NOT EXISTS tddf_archive_path_idx ON public.tddf_archive USING btree (archive_path);
CREATE INDEX IF NOT EXISTS tddf_archive_hash_idx ON public.tddf_archive USING btree (file_hash);
CREATE INDEX IF NOT EXISTS tddf_archive_status_idx ON public.tddf_archive USING btree (archive_status);
CREATE INDEX IF NOT EXISTS tddf_archive_step6_status_idx ON public.tddf_archive USING btree (step6_status);
CREATE INDEX IF NOT EXISTS tddf_archive_business_day_idx ON public.tddf_archive USING btree (business_day);
CREATE INDEX IF NOT EXISTS tddf_archive_archived_at_idx ON public.tddf_archive USING btree (archived_at);
CREATE INDEX IF NOT EXISTS tddf_archive_upload_id_idx ON public.tddf_archive USING btree (original_upload_id);
CREATE INDEX IF NOT EXISTS tddf_archive_api_file_id_idx ON public.tddf_archive USING btree (api_file_id);

-- tddf_archive_records
CREATE SEQUENCE IF NOT EXISTS tddf_archive_records_id_seq;
CREATE TABLE IF NOT EXISTS tddf_archive_records (
  id integer NOT NULL DEFAULT nextval('tddf_archive_records_id_seq'::regclass),
  upload_id text,
  record_type text NOT NULL,
  record_data jsonb NOT NULL,
  processing_status text DEFAULT 'pending'::text,
  created_at timestamp NOT NULL DEFAULT now(),
  record_identifier text,
  line_number integer,
  raw_line text,
  field_count integer,
  original_filename text,
  file_processing_date date,
  file_sequence_number text,
  file_processing_time text,
  file_system_id text,
  mainframe_process_data jsonb,
  merchant_account_number text,
  raw_line_hash text,
  is_archived boolean NOT NULL DEFAULT true,
  archived_at timestamp NOT NULL,
  archive_file_id integer NOT NULL,
  processed_at timestamp
);
COMMENT ON TABLE tddf_archive_records IS 'Archived TDDF record details';
CREATE INDEX IF NOT EXISTS tddf_archive_records_record_type_idx ON public.tddf_archive_records USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_archive_records_archive_file_id_idx ON public.tddf_archive_records USING btree (archive_file_id);
CREATE INDEX IF NOT EXISTS tddf_archive_records_merchant_account_idx ON public.tddf_archive_records USING btree (merchant_account_number);
CREATE INDEX IF NOT EXISTS tddf_archive_records_raw_line_hash_idx ON public.tddf_archive_records USING btree (raw_line_hash);
CREATE INDEX IF NOT EXISTS tddf_archive_records_archived_at_idx ON public.tddf_archive_records USING btree (archived_at);

-- tddf_batch_headers
CREATE SEQUENCE IF NOT EXISTS tddf_batch_headers_id_seq;
CREATE TABLE IF NOT EXISTS tddf_batch_headers (
  id integer NOT NULL DEFAULT nextval('tddf_batch_headers_id_seq'::regclass),
  bh_record_number text,
  record_identifier text DEFAULT 'BH'::text,
  transaction_code text,
  batch_date text,
  batch_julian_date text,
  net_deposit numeric(15, 2),
  reject_reason text,
  merchant_account_number text,
  source_file_id text,
  source_row_number integer,
  recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE tddf_batch_headers IS 'TDDF batch header records';

-- tddf_datamaster
CREATE SEQUENCE IF NOT EXISTS tddf_datamaster_id_seq;
CREATE TABLE IF NOT EXISTS tddf_datamaster (
  id integer NOT NULL DEFAULT nextval('tddf_datamaster_id_seq'::regclass),
  record_id varchar(50),
  raw_line text,
  record_type varchar(10),
  batch_date date,
  transaction_date date,
  authorization_datetime timestamp,
  merchant_account_number varchar(50),
  batch_net_amount numeric(15, 2),
  transaction_auth_amount numeric(15, 2),
  card_number_masked varchar(20),
  processing_timestamp timestamp DEFAULT CURRENT_TIMESTAMP,
  import_session_id varchar(100),
  original_filename varchar(255),
  line_number integer,
  tddf_api_file_id integer,
  record_data jsonb,
  extracted_fields jsonb
);
COMMENT ON TABLE tddf_datamaster IS 'TDDF master data reference';

-- tddf_import_log
CREATE SEQUENCE IF NOT EXISTS tddf_import_log_id_seq;
CREATE TABLE IF NOT EXISTS tddf_import_log (
  id integer NOT NULL DEFAULT nextval('tddf_import_log_id_seq'::regclass),
  source_filename varchar(255) NOT NULL,
  import_start_time timestamp DEFAULT CURRENT_TIMESTAMP,
  import_end_time timestamp,
  records_imported integer DEFAULT 0,
  import_status varchar(50) DEFAULT 'pending'::character varying,
  error_message text,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE tddf_import_log IS 'TDDF import processing log';

-- tddf_json_record_type_counts_pre_cache
CREATE SEQUENCE IF NOT EXISTS tddf_json_record_type_counts_pre_cache_id_seq;
CREATE TABLE IF NOT EXISTS tddf_json_record_type_counts_pre_cache (
  id integer NOT NULL DEFAULT nextval('tddf_json_record_type_counts_pre_cache_id_seq'::regclass),
  cache_key varchar(255) NOT NULL DEFAULT 'tddf_json_record_type_counts'::character varying,
  page_name varchar(255) DEFAULT 'settings'::character varying,
  total_records integer DEFAULT 0,
  dt_count integer DEFAULT 0,
  bh_count integer DEFAULT 0,
  p1_count integer DEFAULT 0,
  p2_count integer DEFAULT 0,
  e1_count integer DEFAULT 0,
  g2_count integer DEFAULT 0,
  ad_count integer DEFAULT 0,
  dr_count integer DEFAULT 0,
  other_count integer DEFAULT 0,
  cache_data jsonb,
  data_sources jsonb,
  processing_time_ms integer DEFAULT 0,
  last_update_datetime timestamp DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp,
  metadata jsonb,
  created_by varchar(255) DEFAULT 'system'::character varying,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE tddf_json_record_type_counts_pre_cache IS 'Pre-cached record type counts for TDDF JSON';
CREATE UNIQUE INDEX IF NOT EXISTS tddf_json_record_type_counts_pre_cache_cache_key_key ON public.tddf_json_record_type_counts_pre_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS tddf_json_record_type_counts_pre_cache_cache_key_idx ON public.tddf_json_record_type_counts_pre_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS tddf_json_record_type_counts_pre_cache_last_update_idx ON public.tddf_json_record_type_counts_pre_cache USING btree (last_update_datetime);

-- tddf_jsonb
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb IS 'Partitioned TDDF JSONB storage (parent table)';
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_record_type_transaction_date ON ONLY public.tddf_jsonb USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_bh_batch_date ON ONLY public.tddf_jsonb USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_record_type ON ONLY public.tddf_jsonb USING btree (record_type);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_upload_id ON ONLY public.tddf_jsonb USING btree (upload_id);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_dt_transaction_date ON ONLY public.tddf_jsonb USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_created_at ON ONLY public.tddf_jsonb USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_batch_date ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_transaction_date ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_record_type_batch_date ON ONLY public.tddf_jsonb USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_id ON ONLY public.tddf_jsonb USING btree (id);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_processing_date ON ONLY public.tddf_jsonb USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_association_number ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_card_type ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_group_number ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_merchant_account ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_terminal_id ON ONLY public.tddf_jsonb USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_extracted_fields ON ONLY public.tddf_jsonb USING gin (extracted_fields);

-- tddf_jsonb_2022_q4
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2022_q4_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2022_q4 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2022_q4 IS 'TDDF JSONB partition: Q4 2022';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_record_type_expr_idx1 ON public.tddf_jsonb_2022_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_record_type_expr_idx2 ON public.tddf_jsonb_2022_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_record_type_idx ON public.tddf_jsonb_2022_q4 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_upload_id_idx ON public.tddf_jsonb_2022_q4 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_record_type_expr_idx3 ON public.tddf_jsonb_2022_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_created_at_idx ON public.tddf_jsonb_2022_q4 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx1 ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_record_type_expr_idx ON public.tddf_jsonb_2022_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_id_idx ON public.tddf_jsonb_2022_q4 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_tddf_processing_date_idx ON public.tddf_jsonb_2022_q4 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx2 ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx3 ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx4 ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx5 ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_expr_idx6 ON public.tddf_jsonb_2022_q4 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2022_q4_extracted_fields_idx ON public.tddf_jsonb_2022_q4 USING gin (extracted_fields);

-- tddf_jsonb_2023_q1
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2023_q1_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2023_q1 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2023_q1 IS 'TDDF JSONB partition: Q1 2023';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_record_type_expr_idx1 ON public.tddf_jsonb_2023_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_record_type_expr_idx2 ON public.tddf_jsonb_2023_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_record_type_idx ON public.tddf_jsonb_2023_q1 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_upload_id_idx ON public.tddf_jsonb_2023_q1 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx1 ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_record_type_expr_idx ON public.tddf_jsonb_2023_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_record_type_expr_idx3 ON public.tddf_jsonb_2023_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_id_idx ON public.tddf_jsonb_2023_q1 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_created_at_idx ON public.tddf_jsonb_2023_q1 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_tddf_processing_date_idx ON public.tddf_jsonb_2023_q1 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx2 ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx3 ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx4 ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx5 ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_expr_idx6 ON public.tddf_jsonb_2023_q1 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q1_extracted_fields_idx ON public.tddf_jsonb_2023_q1 USING gin (extracted_fields);

-- tddf_jsonb_2023_q2
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2023_q2_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2023_q2 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2023_q2 IS 'TDDF JSONB partition: Q2 2023';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_record_type_expr_idx1 ON public.tddf_jsonb_2023_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_record_type_expr_idx2 ON public.tddf_jsonb_2023_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_record_type_idx ON public.tddf_jsonb_2023_q2 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_upload_id_idx ON public.tddf_jsonb_2023_q2 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx1 ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_record_type_expr_idx ON public.tddf_jsonb_2023_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_record_type_expr_idx3 ON public.tddf_jsonb_2023_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_id_idx ON public.tddf_jsonb_2023_q2 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_created_at_idx ON public.tddf_jsonb_2023_q2 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_tddf_processing_date_idx ON public.tddf_jsonb_2023_q2 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx2 ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx3 ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx4 ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx5 ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_expr_idx6 ON public.tddf_jsonb_2023_q2 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q2_extracted_fields_idx ON public.tddf_jsonb_2023_q2 USING gin (extracted_fields);

-- tddf_jsonb_2023_q3
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2023_q3_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2023_q3 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2023_q3 IS 'TDDF JSONB partition: Q3 2023';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_record_type_expr_idx1 ON public.tddf_jsonb_2023_q3 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_record_type_expr_idx2 ON public.tddf_jsonb_2023_q3 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_record_type_idx ON public.tddf_jsonb_2023_q3 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_upload_id_idx ON public.tddf_jsonb_2023_q3 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx1 ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_id_idx ON public.tddf_jsonb_2023_q3 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_record_type_expr_idx ON public.tddf_jsonb_2023_q3 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_record_type_expr_idx3 ON public.tddf_jsonb_2023_q3 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_created_at_idx ON public.tddf_jsonb_2023_q3 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_tddf_processing_date_idx ON public.tddf_jsonb_2023_q3 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx2 ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx3 ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx4 ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx5 ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_expr_idx6 ON public.tddf_jsonb_2023_q3 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q3_extracted_fields_idx ON public.tddf_jsonb_2023_q3 USING gin (extracted_fields);

-- tddf_jsonb_2023_q4
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2023_q4_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2023_q4 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2023_q4 IS 'TDDF JSONB partition: Q4 2023';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_record_type_expr_idx1 ON public.tddf_jsonb_2023_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_record_type_idx ON public.tddf_jsonb_2023_q4 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_upload_id_idx ON public.tddf_jsonb_2023_q4 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_record_type_expr_idx2 ON public.tddf_jsonb_2023_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx1 ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_id_idx ON public.tddf_jsonb_2023_q4 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_record_type_expr_idx ON public.tddf_jsonb_2023_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_record_type_expr_idx3 ON public.tddf_jsonb_2023_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_created_at_idx ON public.tddf_jsonb_2023_q4 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_tddf_processing_date_idx ON public.tddf_jsonb_2023_q4 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx2 ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx3 ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx4 ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx5 ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_expr_idx6 ON public.tddf_jsonb_2023_q4 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2023_q4_extracted_fields_idx ON public.tddf_jsonb_2023_q4 USING gin (extracted_fields);

-- tddf_jsonb_2024_q1
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2024_q1_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2024_q1 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2024_q1 IS 'TDDF JSONB partition: Q1 2024';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_record_type_expr_idx1 ON public.tddf_jsonb_2024_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_record_type_idx ON public.tddf_jsonb_2024_q1 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_upload_id_idx ON public.tddf_jsonb_2024_q1 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_record_type_expr_idx2 ON public.tddf_jsonb_2024_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx1 ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_record_type_expr_idx ON public.tddf_jsonb_2024_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_id_idx ON public.tddf_jsonb_2024_q1 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_record_type_expr_idx3 ON public.tddf_jsonb_2024_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_created_at_idx ON public.tddf_jsonb_2024_q1 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_tddf_processing_date_idx ON public.tddf_jsonb_2024_q1 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx2 ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx3 ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx4 ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx5 ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_expr_idx6 ON public.tddf_jsonb_2024_q1 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q1_extracted_fields_idx ON public.tddf_jsonb_2024_q1 USING gin (extracted_fields);

-- tddf_jsonb_2024_q2
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2024_q2_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2024_q2 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2024_q2 IS 'TDDF JSONB partition: Q2 2024';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_record_type_expr_idx1 ON public.tddf_jsonb_2024_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_record_type_idx ON public.tddf_jsonb_2024_q2 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_upload_id_idx ON public.tddf_jsonb_2024_q2 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_record_type_expr_idx2 ON public.tddf_jsonb_2024_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx1 ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_record_type_expr_idx ON public.tddf_jsonb_2024_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_record_type_expr_idx3 ON public.tddf_jsonb_2024_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_id_idx ON public.tddf_jsonb_2024_q2 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_created_at_idx ON public.tddf_jsonb_2024_q2 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_tddf_processing_date_idx ON public.tddf_jsonb_2024_q2 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx2 ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx3 ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx4 ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx5 ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_expr_idx6 ON public.tddf_jsonb_2024_q2 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q2_extracted_fields_idx ON public.tddf_jsonb_2024_q2 USING gin (extracted_fields);

-- tddf_jsonb_2024_q3
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2024_q3_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2024_q3 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2024_q3 IS 'TDDF JSONB partition: Q3 2024';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_record_type_expr_idx ON public.tddf_jsonb_2024_q3 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_record_type_expr_idx1 ON public.tddf_jsonb_2024_q3 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_record_type_idx ON public.tddf_jsonb_2024_q3 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_upload_id_idx ON public.tddf_jsonb_2024_q3 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_record_type_expr_idx2 ON public.tddf_jsonb_2024_q3 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx1 ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_record_type_expr_idx3 ON public.tddf_jsonb_2024_q3 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_id_idx ON public.tddf_jsonb_2024_q3 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_created_at_idx ON public.tddf_jsonb_2024_q3 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_tddf_processing_date_idx ON public.tddf_jsonb_2024_q3 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx2 ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx3 ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx4 ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx5 ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_expr_idx6 ON public.tddf_jsonb_2024_q3 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q3_extracted_fields_idx ON public.tddf_jsonb_2024_q3 USING gin (extracted_fields);

-- tddf_jsonb_2024_q4
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2024_q4_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2024_q4 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2024_q4 IS 'TDDF JSONB partition: Q4 2024';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_record_type_expr_idx ON public.tddf_jsonb_2024_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_record_type_expr_idx1 ON public.tddf_jsonb_2024_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_record_type_idx ON public.tddf_jsonb_2024_q4 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_upload_id_idx ON public.tddf_jsonb_2024_q4 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_record_type_expr_idx2 ON public.tddf_jsonb_2024_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx1 ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_id_idx ON public.tddf_jsonb_2024_q4 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_record_type_expr_idx3 ON public.tddf_jsonb_2024_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_created_at_idx ON public.tddf_jsonb_2024_q4 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_tddf_processing_date_idx ON public.tddf_jsonb_2024_q4 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx2 ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx3 ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx4 ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx5 ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_expr_idx6 ON public.tddf_jsonb_2024_q4 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2024_q4_extracted_fields_idx ON public.tddf_jsonb_2024_q4 USING gin (extracted_fields);

-- tddf_jsonb_2025_q1
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2025_q1_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2025_q1 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2025_q1 IS 'TDDF JSONB partition: Q1 2025';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_record_type_expr_idx ON public.tddf_jsonb_2025_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_record_type_expr_idx1 ON public.tddf_jsonb_2025_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_record_type_idx ON public.tddf_jsonb_2025_q1 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_upload_id_idx ON public.tddf_jsonb_2025_q1 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_record_type_expr_idx2 ON public.tddf_jsonb_2025_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx1 ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_id_idx ON public.tddf_jsonb_2025_q1 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_record_type_expr_idx3 ON public.tddf_jsonb_2025_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_created_at_idx ON public.tddf_jsonb_2025_q1 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_tddf_processing_date_idx ON public.tddf_jsonb_2025_q1 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx2 ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx3 ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx4 ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx5 ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_expr_idx6 ON public.tddf_jsonb_2025_q1 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q1_extracted_fields_idx ON public.tddf_jsonb_2025_q1 USING gin (extracted_fields);

-- tddf_jsonb_2025_q2
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2025_q2_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2025_q2 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2025_q2 IS 'TDDF JSONB partition: Q2 2025';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_record_type_expr_idx ON public.tddf_jsonb_2025_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_id_idx ON public.tddf_jsonb_2025_q2 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_record_type_expr_idx1 ON public.tddf_jsonb_2025_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_record_type_idx ON public.tddf_jsonb_2025_q2 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_upload_id_idx ON public.tddf_jsonb_2025_q2 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_record_type_expr_idx2 ON public.tddf_jsonb_2025_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx1 ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_record_type_expr_idx3 ON public.tddf_jsonb_2025_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_created_at_idx ON public.tddf_jsonb_2025_q2 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_tddf_processing_date_idx ON public.tddf_jsonb_2025_q2 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx2 ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx3 ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx4 ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx5 ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_expr_idx6 ON public.tddf_jsonb_2025_q2 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q2_extracted_fields_idx ON public.tddf_jsonb_2025_q2 USING gin (extracted_fields);

-- tddf_jsonb_2025_q3
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2025_q3_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2025_q3 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2025_q3 IS 'TDDF JSONB partition: Q3 2025';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_record_type_expr_idx ON public.tddf_jsonb_2025_q3 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_id_idx ON public.tddf_jsonb_2025_q3 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_record_type_expr_idx1 ON public.tddf_jsonb_2025_q3 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_record_type_idx ON public.tddf_jsonb_2025_q3 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_upload_id_idx ON public.tddf_jsonb_2025_q3 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_record_type_expr_idx2 ON public.tddf_jsonb_2025_q3 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx1 ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_record_type_expr_idx3 ON public.tddf_jsonb_2025_q3 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_created_at_idx ON public.tddf_jsonb_2025_q3 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_tddf_processing_date_idx ON public.tddf_jsonb_2025_q3 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx2 ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx3 ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx4 ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx5 ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_expr_idx6 ON public.tddf_jsonb_2025_q3 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q3_extracted_fields_idx ON public.tddf_jsonb_2025_q3 USING gin (extracted_fields);

-- tddf_jsonb_2025_q4
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2025_q4_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2025_q4 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2025_q4 IS 'TDDF JSONB partition: Q4 2025';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_record_type_expr_idx ON public.tddf_jsonb_2025_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_id_idx ON public.tddf_jsonb_2025_q4 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_record_type_expr_idx1 ON public.tddf_jsonb_2025_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_record_type_idx ON public.tddf_jsonb_2025_q4 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_upload_id_idx ON public.tddf_jsonb_2025_q4 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_record_type_expr_idx2 ON public.tddf_jsonb_2025_q4 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx1 ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_record_type_expr_idx3 ON public.tddf_jsonb_2025_q4 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_created_at_idx ON public.tddf_jsonb_2025_q4 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_tddf_processing_date_idx ON public.tddf_jsonb_2025_q4 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx2 ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx3 ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx4 ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx5 ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_expr_idx6 ON public.tddf_jsonb_2025_q4 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2025_q4_extracted_fields_idx ON public.tddf_jsonb_2025_q4 USING gin (extracted_fields);

-- tddf_jsonb_2026_q1
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2026_q1_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2026_q1 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2026_q1 IS 'TDDF JSONB partition: Q1 2026';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_record_type_expr_idx ON public.tddf_jsonb_2026_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_record_type_expr_idx1 ON public.tddf_jsonb_2026_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_id_idx ON public.tddf_jsonb_2026_q1 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_record_type_idx ON public.tddf_jsonb_2026_q1 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_upload_id_idx ON public.tddf_jsonb_2026_q1 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_record_type_expr_idx2 ON public.tddf_jsonb_2026_q1 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx1 ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_record_type_expr_idx3 ON public.tddf_jsonb_2026_q1 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_created_at_idx ON public.tddf_jsonb_2026_q1 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_tddf_processing_date_idx ON public.tddf_jsonb_2026_q1 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx2 ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx3 ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx4 ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx5 ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_expr_idx6 ON public.tddf_jsonb_2026_q1 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q1_extracted_fields_idx ON public.tddf_jsonb_2026_q1 USING gin (extracted_fields);

-- tddf_jsonb_2026_q2
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_2026_q2_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_2026_q2 (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_2026_q2 IS 'TDDF JSONB partition: Q2 2026';
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx1 ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_record_type_expr_idx ON public.tddf_jsonb_2026_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_record_type_expr_idx1 ON public.tddf_jsonb_2026_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_record_type_expr_idx2 ON public.tddf_jsonb_2026_q2 USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_record_type_expr_idx3 ON public.tddf_jsonb_2026_q2 USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_id_idx ON public.tddf_jsonb_2026_q2 USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_record_type_idx ON public.tddf_jsonb_2026_q2 USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_upload_id_idx ON public.tddf_jsonb_2026_q2 USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_created_at_idx ON public.tddf_jsonb_2026_q2 USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_tddf_processing_date_idx ON public.tddf_jsonb_2026_q2 USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx2 ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx3 ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx4 ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx5 ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_expr_idx6 ON public.tddf_jsonb_2026_q2 USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_2026_q2_extracted_fields_idx ON public.tddf_jsonb_2026_q2 USING gin (extracted_fields);

-- tddf_jsonb_default
CREATE SEQUENCE IF NOT EXISTS tddf_jsonb_default_id_seq;
CREATE TABLE IF NOT EXISTS tddf_jsonb_default (
  id integer NOT NULL DEFAULT nextval('tddf_jsonb_id_seq'::regclass),
  upload_id text NOT NULL,
  filename text NOT NULL,
  record_type text NOT NULL,
  line_number integer NOT NULL,
  raw_line text NOT NULL,
  extracted_fields jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  tddf_processing_datetime timestamp,
  tddf_processing_date date NOT NULL DEFAULT CURRENT_DATE,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  details jsonb,
  parsed_datetime timestamp with time zone,
  record_time_source text,
  record_identifier text,
  processing_time_ms integer DEFAULT 0,
  raw_line_hash text
);
COMMENT ON TABLE tddf_jsonb_default IS 'TDDF JSONB partition: Default (catch-all)';
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_record_type_expr_idx ON public.tddf_jsonb_default USING btree (record_type, ((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_id_idx ON public.tddf_jsonb_default USING btree (id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_record_type_expr_idx1 ON public.tddf_jsonb_default USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_record_type_idx ON public.tddf_jsonb_default USING btree (record_type);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_upload_id_idx ON public.tddf_jsonb_default USING btree (upload_id);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_record_type_expr_idx2 ON public.tddf_jsonb_default USING btree (record_type, ((extracted_fields ->> 'batchDate'::text))) WHERE (record_type = 'BH'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx1 ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'transactionDate'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_record_type_expr_idx3 ON public.tddf_jsonb_default USING btree (record_type, ((extracted_fields ->> 'transactionDate'::text))) WHERE (record_type = 'DT'::text);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_created_at_idx ON public.tddf_jsonb_default USING btree (created_at);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_tddf_processing_date_idx ON public.tddf_jsonb_default USING btree (tddf_processing_date);
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx2 ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'associationNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx3 ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'cardType'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx4 ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'groupNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx5 ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_expr_idx6 ON public.tddf_jsonb_default USING btree (((extracted_fields ->> 'terminalId'::text)));
CREATE INDEX IF NOT EXISTS tddf_jsonb_default_extracted_fields_idx ON public.tddf_jsonb_default USING gin (extracted_fields);

-- tddf_object_totals_cache_2025
CREATE SEQUENCE IF NOT EXISTS tddf_object_totals_cache_2025_id_seq;
CREATE TABLE IF NOT EXISTS tddf_object_totals_cache_2025 (
  id integer NOT NULL DEFAULT nextval('tddf_object_totals_cache_2025_id_seq'::regclass),
  scan_date timestamp NOT NULL,
  scan_completion_time timestamp,
  scan_status varchar(50) NOT NULL,
  total_objects bigint DEFAULT 0,
  analyzed_objects bigint DEFAULT 0,
  total_records bigint DEFAULT 0,
  total_file_size bigint DEFAULT 0,
  record_type_breakdown jsonb,
  scan_duration_seconds integer,
  average_records_per_file numeric(10, 2),
  largest_file_records bigint,
  largest_file_name varchar(500),
  cache_expires_at timestamp,
  created_at timestamp DEFAULT now()
);
COMMENT ON TABLE tddf_object_totals_cache_2025 IS 'TDDF object totals cache for 2025';

-- tddf_other_records
CREATE SEQUENCE IF NOT EXISTS tddf_other_records_id_seq;
CREATE TABLE IF NOT EXISTS tddf_other_records (
  id integer NOT NULL DEFAULT nextval('tddf_other_records_id_seq'::regclass),
  record_type text NOT NULL,
  reference_number text,
  merchant_account text,
  transaction_date date,
  amount numeric(15, 2),
  description text,
  source_file_id text,
  source_row_number integer,
  recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE tddf_other_records IS 'TDDF other record types (E1, G2, etc.)';

-- tddf_purchasing_extensions
CREATE SEQUENCE IF NOT EXISTS tddf_purchasing_extensions_id_seq;
CREATE TABLE IF NOT EXISTS tddf_purchasing_extensions (
  id integer NOT NULL DEFAULT nextval('tddf_purchasing_extensions_id_seq'::regclass),
  record_identifier text DEFAULT 'P1'::text,
  parent_dt_reference text,
  tax_amount numeric(15, 2),
  discount_amount numeric(15, 2),
  freight_amount numeric(15, 2),
  duty_amount numeric(15, 2),
  purchase_identifier text,
  source_file_id text,
  source_row_number integer,
  recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE tddf_purchasing_extensions IS 'TDDF P1 purchasing extension records';

-- tddf_raw_import
CREATE SEQUENCE IF NOT EXISTS tddf_raw_import_id_seq;
CREATE TABLE IF NOT EXISTS tddf_raw_import (
  id integer NOT NULL DEFAULT nextval('tddf_raw_import_id_seq'::regclass),
  source_file_id text NOT NULL,
  line_number integer NOT NULL,
  record_type text,
  raw_line text NOT NULL,
  processing_status text DEFAULT 'pending'::text,
  processed_at timestamp with time zone,
  skip_reason text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  target_table text,
  error_message text
);
COMMENT ON TABLE tddf_raw_import IS 'Raw TDDF import data preservation';
CREATE INDEX IF NOT EXISTS idx_tddf_raw_import_processing_status ON public.tddf_raw_import USING btree (processing_status);
CREATE INDEX IF NOT EXISTS idx_tddf_raw_import_source_file ON public.tddf_raw_import USING btree (source_file_id);

-- tddf_records
CREATE SEQUENCE IF NOT EXISTS tddf_records_id_seq;
CREATE TABLE IF NOT EXISTS tddf_records (
  id integer NOT NULL DEFAULT nextval('tddf_records_id_seq'::regclass),
  sequence_number text,
  reference_number text,
  merchant_name text,
  transaction_amount numeric(15, 2),
  transaction_date date,
  terminal_id text,
  card_type text,
  authorization_number text,
  merchant_account_number text,
  mcc_code text,
  transaction_type_identifier text,
  association_number_1 text,
  association_number_2 text,
  transaction_code text,
  cardholder_account_number text,
  group_number text,
  batch_julian_date text,
  debit_credit_indicator text,
  recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  source_row_number integer,
  raw_data text,
  mms_raw_line text
);
COMMENT ON TABLE tddf_records IS 'Unified TDDF records storage';
CREATE INDEX IF NOT EXISTS idx_tddf_records_reference_number ON public.tddf_records USING btree (reference_number);

-- terminals
CREATE SEQUENCE IF NOT EXISTS terminals_id_seq;
CREATE TABLE IF NOT EXISTS terminals (
  id integer NOT NULL DEFAULT nextval('terminals_id_seq'::regclass),
  v_number text NOT NULL,
  pos_merchant_number text,
  bin text,
  dba_name text,
  daily_auth text,
  dial_pay text,
  encryption text,
  prr text,
  mcc text,
  ssl text,
  tokenization text,
  agent text,
  chain text,
  store text,
  terminal_info text,
  record_status text,
  board_date date,
  terminal_visa text,
  terminal_type text DEFAULT 'unknown'::text,
  status text DEFAULT 'Active'::text,
  location text,
  m_type text,
  m_location text,
  installation_date date,
  hardware_model text,
  manufacturer text,
  firmware_version text,
  network_type text,
  ip_address text,
  generic_field1 text,
  generic_field2 text,
  description text,
  notes text,
  internal_notes text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_by text DEFAULT 'System Import'::text,
  updated_by text DEFAULT 'System Import'::text,
  last_activity timestamp with time zone,
  last_update timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  update_source text DEFAULT 'System Import'::text,
  last_sync_date timestamp with time zone,
  sync_status text DEFAULT 'Pending'::text
);
COMMENT ON TABLE terminals IS 'Terminal configuration and tracking';
CREATE UNIQUE INDEX IF NOT EXISTS terminals_v_number_key ON public.terminals USING btree (v_number);

-- transactions
CREATE SEQUENCE IF NOT EXISTS transactions_id_seq;
CREATE TABLE IF NOT EXISTS transactions (
  id integer NOT NULL DEFAULT nextval('transactions_id_seq'::regclass),
  merchant_id text NOT NULL,
  transaction_id text,
  amount text NOT NULL,
  date timestamp with time zone NOT NULL,
  type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  trace_number text,
  company text,
  code text,
  source_filename text,
  source_row_number integer,
  source_file_hash text,
  updated_at timestamp DEFAULT now()
);
COMMENT ON TABLE transactions IS 'VSB API transaction records';
CREATE UNIQUE INDEX IF NOT EXISTS transactions_unique_filename_line ON public.transactions USING btree (source_filename, source_row_number);

-- uploaded_files
CREATE SEQUENCE IF NOT EXISTS uploaded_files_id_seq;
CREATE TABLE IF NOT EXISTS uploaded_files (
  id integer NOT NULL DEFAULT nextval('uploaded_files_id_seq'::regclass),
  filename varchar(255) NOT NULL,
  original_filename varchar(255) NOT NULL,
  file_path varchar(500) NOT NULL,
  file_size integer NOT NULL,
  status varchar(50) DEFAULT 'uploaded'::character varying,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  uploaded_at timestamp DEFAULT CURRENT_TIMESTAMP,
  file_type varchar(50),
  metadata jsonb,
  business_day date,
  file_date date,
  processing_status text DEFAULT 'pending'::text,
  processing_server_id text,
  processing_started_at timestamp,
  storage_path text,
  file_content text,
  mime_type text,
  processed_at timestamp,
  processing_completed_at timestamp,
  records_processed integer DEFAULT 0,
  records_skipped integer DEFAULT 0,
  processed boolean DEFAULT false,
  deleted boolean DEFAULT false,
  processing_errors text
);
COMMENT ON TABLE uploaded_files IS 'File upload tracking and metadata';
CREATE INDEX IF NOT EXISTS idx_uploaded_files_status ON public.uploaded_files USING btree (status);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_business_day ON public.uploaded_files USING btree (business_day);

-- uploader_json
CREATE SEQUENCE IF NOT EXISTS uploader_json_id_seq;
CREATE TABLE IF NOT EXISTS uploader_json (
  id integer NOT NULL DEFAULT nextval('uploader_json_id_seq'::regclass),
  upload_id text NOT NULL,
  raw_line_data text,
  processed_json jsonb,
  field_separation_data jsonb,
  processing_time_ms integer,
  errors jsonb,
  source_file_name text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE uploader_json IS 'JSON file upload processing';
CREATE INDEX IF NOT EXISTS idx_uploader_json_upload_id ON public.uploader_json USING btree (upload_id);

-- uploader_mastercard_di_edit_records
CREATE SEQUENCE IF NOT EXISTS uploader_mastercard_di_edit_records_id_seq;
CREATE TABLE IF NOT EXISTS uploader_mastercard_di_edit_records (
  id integer NOT NULL DEFAULT nextval('uploader_mastercard_di_edit_records_id_seq'::regclass),
  upload_id text NOT NULL,
  record_data jsonb NOT NULL,
  processing_status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE uploader_mastercard_di_edit_records IS 'Mastercard DI edit record processing';
CREATE INDEX IF NOT EXISTS idx_uploader_mastercard_di_edit_records_upload_id ON public.uploader_mastercard_di_edit_records USING btree (upload_id);

-- uploader_tddf_jsonb_records
CREATE SEQUENCE IF NOT EXISTS uploader_tddf_jsonb_records_id_seq;
CREATE TABLE IF NOT EXISTS uploader_tddf_jsonb_records (
  id integer NOT NULL DEFAULT nextval('uploader_tddf_jsonb_records_id_seq'::regclass),
  upload_id text NOT NULL,
  record_type text NOT NULL,
  record_data jsonb NOT NULL,
  processing_status text DEFAULT 'completed'::text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  record_identifier text,
  line_number integer,
  raw_line text,
  field_count integer,
  original_filename text,
  file_processing_date date,
  file_sequence_number text,
  file_processing_time text,
  file_system_id text,
  mainframe_process_data jsonb,
  column_2_test text,
  merchant_account_number varchar(16),
  raw_line_hash text
);
COMMENT ON TABLE uploader_tddf_jsonb_records IS 'TDDF JSONB record processing queue';
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_merchant_account ON public.uploader_tddf_jsonb_records USING btree (((record_data ->> 'merchantAccountNumber'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_jsonb_batch_date ON public.uploader_tddf_jsonb_records USING btree (((record_data ->> 'batchDate'::text)));
CREATE INDEX IF NOT EXISTS idx_uploader_tddf_upload_hash ON public.uploader_tddf_jsonb_records USING btree (upload_id, raw_line_hash) WHERE (raw_line_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_created_at_idx ON public.uploader_tddf_jsonb_records USING btree (created_at);
CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_record_type_created_at_idx ON public.uploader_tddf_jsonb_records USING btree (record_type, created_at);
CREATE INDEX IF NOT EXISTS idx_tddf_file_processing_date ON public.uploader_tddf_jsonb_records USING btree (file_processing_date);
CREATE INDEX IF NOT EXISTS idx_tddf_record_type ON public.uploader_tddf_jsonb_records USING btree (record_type);
CREATE INDEX IF NOT EXISTS idx_tddf_merchant_account_number ON public.uploader_tddf_jsonb_records USING btree (merchant_account_number);
CREATE INDEX IF NOT EXISTS idx_tddf_date_merchant ON public.uploader_tddf_jsonb_records USING btree (file_processing_date, merchant_account_number);
CREATE INDEX IF NOT EXISTS idx_tddf_date_record_type ON public.uploader_tddf_jsonb_records USING btree (file_processing_date, record_type);
CREATE INDEX IF NOT EXISTS idx_tddf_date_merchant_record_type ON public.uploader_tddf_jsonb_records USING btree (file_processing_date, merchant_account_number, record_type);
CREATE INDEX IF NOT EXISTS idx_tddf_transaction_amount_jsonb ON public.uploader_tddf_jsonb_records USING btree (((record_data ->> 'transactionAmount'::text)));
CREATE INDEX IF NOT EXISTS idx_tddf_net_deposit_jsonb ON public.uploader_tddf_jsonb_records USING btree (((record_data ->> 'netDepositAmount'::text)));

-- uploader_uploads
CREATE TABLE IF NOT EXISTS uploader_uploads (
  id text NOT NULL,
  filename text NOT NULL,
  file_size integer,
  start_time timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  upload_started_at timestamp with time zone,
  upload_progress integer DEFAULT 0,
  chunked_upload boolean DEFAULT false,
  chunk_count integer,
  chunks_uploaded integer DEFAULT 0,
  uploaded_at timestamp with time zone,
  storage_path text,
  upload_status text NOT NULL DEFAULT 'started'::text,
  identified_at timestamp with time zone,
  detected_file_type text,
  user_classified_type text,
  final_file_type text,
  line_count integer,
  data_size integer,
  has_headers boolean,
  file_format text,
  compression_used text,
  encoding_detected text,
  validation_errors jsonb,
  processing_notes text,
  created_by text,
  server_id text,
  session_id text,
  current_phase text NOT NULL DEFAULT 'started'::text,
  last_updated timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  file_content text,
  s3_bucket text,
  s3_key text,
  s3_url text,
  s3_etag text,
  failed_at timestamp,
  completed_at timestamp with time zone,
  keep_for_review boolean DEFAULT false,
  encoding_status text,
  encoding_time_ms integer,
  json_records_created integer,
  tddf_records_created integer,
  encoding_complete timestamp,
  identification_results text,
  phase integer DEFAULT 1,
  encoding_completion_time timestamp with time zone,
  file_type text NOT NULL DEFAULT 'tddf'::text,
  status text NOT NULL DEFAULT 'started'::text,
  started_at timestamp with time zone,
  encoding_at timestamp with time zone,
  processing_at timestamp with time zone,
  storage_key text,
  bucket_name text,
  processing_errors text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  encoding_notes text,
  retry_count integer DEFAULT 0,
  last_retry_at timestamp with time zone,
  processing_warnings text,
  last_warning_at timestamp with time zone,
  warning_count integer DEFAULT 0,
  can_retry boolean DEFAULT false,
  last_failure_reason text,
  processing_server_id text,
  processing_status text DEFAULT 'pending'::text,
  parsed_scheduled_datetime timestamp,
  parsed_actual_datetime timestamp,
  filename_parse_status text DEFAULT 'pending'::text,
  is_archived boolean NOT NULL DEFAULT false,
  archived_at timestamp,
  archived_by text,
  status_message text,
  business_day date,
  bh_record_count integer,
  dt_record_count integer,
  other_record_count integer,
  file_sequence_number text,
  file_processing_time text,
  deleted_at timestamp,
  deleted_by text,
  processing_log_path text
);
COMMENT ON TABLE uploader_uploads IS 'File uploader processing pipeline tracking';
CREATE INDEX IF NOT EXISTS uploader_uploads_is_archived_idx ON public.uploader_uploads USING btree (is_archived);
CREATE INDEX IF NOT EXISTS uploader_uploads_uploaded_at_idx ON public.uploader_uploads USING btree (uploaded_at);
CREATE INDEX IF NOT EXISTS uploader_uploads_encoding_at_idx ON public.uploader_uploads USING btree (encoding_at);
CREATE INDEX IF NOT EXISTS uploader_uploads_encoding_complete_idx ON public.uploader_uploads USING btree (encoding_complete);
CREATE INDEX IF NOT EXISTS uploader_uploads_identified_at_idx ON public.uploader_uploads USING btree (identified_at);
CREATE INDEX IF NOT EXISTS uploader_uploads_last_updated_idx ON public.uploader_uploads USING btree (last_updated);
CREATE INDEX IF NOT EXISTS uploader_uploads_phase_start_time_idx ON public.uploader_uploads USING btree (current_phase, start_time);
CREATE INDEX IF NOT EXISTS uploader_uploads_status_uploaded_at_idx ON public.uploader_uploads USING btree (upload_status, uploaded_at);

-- users
CREATE SEQUENCE IF NOT EXISTS users_id_seq;
CREATE TABLE IF NOT EXISTS users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  username varchar(255) NOT NULL,
  password varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  first_name varchar(255),
  last_name varchar(255),
  role varchar(50) DEFAULT 'user'::character varying,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  last_login timestamp,
  developer_flag boolean DEFAULT false,
  dark_mode boolean DEFAULT false,
  can_create_users boolean DEFAULT false,
  default_dashboard varchar(255) DEFAULT 'merchants'::character varying,
  theme_preference varchar(50) DEFAULT 'system'::character varying
);
COMMENT ON TABLE users IS 'System user accounts with authentication';
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON public.users USING btree (username);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users USING btree (email);

-- Schema complete
