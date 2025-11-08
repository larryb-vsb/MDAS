-- ============================================================================
-- Production Database Upgrade Script
-- Version: 7 Nov 2025
-- Purpose: Sync production database with development schema
-- 
-- This script is IDEMPOTENT and can be safely re-run multiple times.
-- It creates missing tables, indexes, and constraints without affecting
-- existing data.
--
-- Known Fixes:
-- - Auto 7 switch functionality (system_settings table)
-- - Monitoring tab data (tddf_api_request_logs and indexes)
-- - All TDDF cache tables
-- - All performance indexes
-- ============================================================================

-- ============================================================================
-- SECTION 1: CORE SYSTEM TABLES
-- ============================================================================

-- System Settings (fixes Auto 7 switch)
CREATE TABLE IF NOT EXISTS dev_system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_dev_system_settings_key ON dev_system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_dev_system_settings_category ON dev_system_settings(category);
CREATE INDEX IF NOT EXISTS idx_dev_system_settings_active ON dev_system_settings(is_active);

-- ============================================================================
-- SECTION 2: MONITORING & LOGGING TABLES (fixes Monitoring tab)
-- ============================================================================

-- TDDF API Request Logs (critical for monitoring tab)
CREATE TABLE IF NOT EXISTS dev_tddf_api_request_logs (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(255),
    api_user_id INTEGER,
    endpoint VARCHAR(500),
    method VARCHAR(10),
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    client_ip VARCHAR(50),
    user_agent TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    error_message TEXT,
    request_headers JSONB,
    response_headers JSONB
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_request_logs_api_user_id ON dev_tddf_api_request_logs(api_user_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_request_logs_endpoint ON dev_tddf_api_request_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_request_logs_created_at ON dev_tddf_api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_request_logs_status ON dev_tddf_api_request_logs(response_status);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_request_logs_client_ip ON dev_tddf_api_request_logs(client_ip);

-- Connection Log (for monitoring tab)
CREATE TABLE IF NOT EXISTS dev_connection_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    client_ip TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    user_agent TEXT,
    api_key_used TEXT,
    api_user_id INTEGER,
    authenticated BOOLEAN DEFAULT false NOT NULL,
    status_code INTEGER,
    response_time INTEGER
);

CREATE INDEX IF NOT EXISTS connection_log_timestamp_idx ON dev_connection_log(timestamp);
CREATE INDEX IF NOT EXISTS connection_log_endpoint_idx ON dev_connection_log(endpoint);
CREATE INDEX IF NOT EXISTS connection_log_ip_idx ON dev_connection_log(client_ip);
CREATE INDEX IF NOT EXISTS connection_log_api_user_id_idx ON dev_connection_log(api_user_id);

-- Security Logs
CREATE TABLE IF NOT EXISTS dev_security_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    event_type VARCHAR(100),
    severity VARCHAR(20),
    user_id INTEGER,
    username VARCHAR(255),
    ip_address VARCHAR(50),
    endpoint VARCHAR(500),
    description TEXT,
    metadata JSONB,
    action_taken VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_dev_security_logs_timestamp ON dev_security_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_dev_security_logs_event_type ON dev_security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_dev_security_logs_severity ON dev_security_logs(severity);
CREATE INDEX IF NOT EXISTS idx_dev_security_logs_ip ON dev_security_logs(ip_address);

-- System Logs
CREATE TABLE IF NOT EXISTS dev_system_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    level VARCHAR(20),
    category VARCHAR(100),
    message TEXT,
    metadata JSONB,
    user_id INTEGER,
    ip_address VARCHAR(50),
    request_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_dev_system_logs_timestamp ON dev_system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_dev_system_logs_level ON dev_system_logs(level);
CREATE INDEX IF NOT EXISTS idx_dev_system_logs_category ON dev_system_logs(category);

-- ============================================================================
-- SECTION 3: API & USER MANAGEMENT TABLES
-- ============================================================================

-- API Users
CREATE TABLE IF NOT EXISTS dev_api_users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL UNIQUE,
    permissions JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP WITH TIME ZONE,
    description TEXT,
    request_count INTEGER DEFAULT 0,
    last_used_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_dev_api_users_api_key ON dev_api_users(api_key);
CREATE INDEX IF NOT EXISTS idx_dev_api_users_username ON dev_api_users(username);
CREATE INDEX IF NOT EXISTS idx_dev_api_users_active ON dev_api_users(is_active);

-- TDDF API Keys
CREATE TABLE IF NOT EXISTS dev_tddf_api_keys (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL UNIQUE,
    user_id INTEGER,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP,
    permissions JSONB DEFAULT '[]'::jsonb,
    rate_limit INTEGER DEFAULT 1000,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_keys_api_key ON dev_tddf_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_keys_active ON dev_tddf_api_keys(is_active);

-- Users Table
CREATE TABLE IF NOT EXISTS dev_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    developer_flag BOOLEAN DEFAULT false,
    dark_mode BOOLEAN DEFAULT false,
    can_create_users BOOLEAN DEFAULT false,
    default_dashboard VARCHAR(50) DEFAULT 'main',
    theme_preference VARCHAR(20) DEFAULT 'light'
);

CREATE INDEX IF NOT EXISTS idx_dev_users_username ON dev_users(username);
CREATE INDEX IF NOT EXISTS idx_dev_users_role ON dev_users(role);

-- ============================================================================
-- SECTION 4: HOST APPROVALS & IP SECURITY
-- ============================================================================

-- Host Approvals
CREATE TABLE IF NOT EXISTS dev_host_approvals (
    id SERIAL PRIMARY KEY,
    hostname TEXT NOT NULL,
    api_key_prefix TEXT NOT NULL,
    api_user_id INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewed_by TEXT,
    reviewed_at TIMESTAMP,
    notes TEXT,
    last_seen_at TIMESTAMP,
    last_seen_ip TEXT,
    UNIQUE(hostname, api_key_prefix)
);

CREATE INDEX IF NOT EXISTS host_approvals_hostname_idx ON dev_host_approvals(hostname);
CREATE INDEX IF NOT EXISTS host_approvals_status_idx ON dev_host_approvals(status);

-- IP Blocklist
CREATE TABLE IF NOT EXISTS dev_ip_blocklist (
    id SERIAL PRIMARY KEY,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT,
    blocked_by TEXT,
    blocked_at TIMESTAMP DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS ip_blocklist_ip_idx ON dev_ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS ip_blocklist_active_idx ON dev_ip_blocklist(is_active);

-- ============================================================================
-- SECTION 5: MERCHANT & TERMINAL TABLES
-- ============================================================================

-- Merchants
CREATE TABLE IF NOT EXISTS dev_merchants (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    category TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    client_mid TEXT,
    merchant_type TEXT,
    bank TEXT,
    risk_level TEXT,
    compliance_status TEXT,
    review_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_upload_date TIMESTAMP WITH TIME ZONE,
    client_since_date TIMESTAMP WITH TIME ZONE,
    as_of_date TIMESTAMP WITH TIME ZONE,
    dba_name TEXT,
    legal_name TEXT,
    contact_person TEXT,
    account_manager TEXT,
    sale_amt NUMERIC DEFAULT 0,
    credit_amt NUMERIC DEFAULT 0,
    monthly_volume NUMERIC DEFAULT 0,
    fee_structure TEXT,
    pricing_tier TEXT,
    notes TEXT,
    tags TEXT[],
    metadata JSONB,
    search_index TEXT,
    sales_channel TEXT,
    date_of_last_deposit DATE,
    last_batch_filename TEXT,
    last_batch_date DATE,
    last_transaction_amount NUMERIC,
    last_transaction_date DATE
);

CREATE INDEX IF NOT EXISTS merchants_name_idx ON dev_merchants(name);
CREATE INDEX IF NOT EXISTS merchants_status_idx ON dev_merchants(status);
CREATE INDEX IF NOT EXISTS merchants_merchant_type_idx ON dev_merchants(merchant_type);
CREATE INDEX IF NOT EXISTS merchants_client_mid_idx ON dev_merchants(client_mid);
CREATE INDEX IF NOT EXISTS merchants_date_of_last_deposit_idx ON dev_merchants(date_of_last_deposit);

-- API Merchants
CREATE TABLE IF NOT EXISTS dev_api_merchants (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    client_mid TEXT,
    merchant_type TEXT,
    bank TEXT,
    risk_level TEXT,
    compliance_status TEXT,
    review_required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_upload_date TIMESTAMP WITH TIME ZONE,
    client_since_date TIMESTAMP WITH TIME ZONE,
    as_of_date TIMESTAMP WITH TIME ZONE,
    dba_name TEXT,
    legal_name TEXT,
    contact_person TEXT,
    account_manager TEXT,
    sale_amt NUMERIC DEFAULT 0,
    credit_amt NUMERIC DEFAULT 0,
    monthly_volume NUMERIC DEFAULT 0,
    fee_structure TEXT,
    pricing_tier TEXT,
    notes TEXT,
    tags TEXT[],
    metadata JSONB,
    search_index TEXT
);

-- Terminals
CREATE TABLE IF NOT EXISTS dev_terminals (
    id SERIAL PRIMARY KEY,
    terminal_id VARCHAR(50) UNIQUE,
    merchant_id VARCHAR(50),
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Active',
    model VARCHAR(100),
    serial_number VARCHAR(100),
    installation_date DATE,
    last_activity TIMESTAMP,
    hardware_model VARCHAR(100),
    firmware_version VARCHAR(50),
    network_type VARCHAR(50),
    ip_address VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dev_terminals_merchant_id ON dev_terminals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_dev_terminals_status ON dev_terminals(status);
CREATE INDEX IF NOT EXISTS idx_dev_terminals_terminal_id ON dev_terminals(terminal_id);

-- API Terminals (comprehensive structure)
CREATE TABLE IF NOT EXISTS dev_api_terminals (
    id SERIAL PRIMARY KEY,
    v_number TEXT NOT NULL UNIQUE,
    pos_merchant_number TEXT,
    bin TEXT,
    dba_name TEXT,
    daily_auth TEXT,
    dial_pay TEXT,
    encryption TEXT,
    prr TEXT,
    mcc TEXT,
    ssl TEXT,
    tokenization TEXT,
    agent TEXT,
    chain TEXT,
    store TEXT,
    terminal_info TEXT,
    record_status TEXT,
    board_date TIMESTAMP,
    terminal_visa TEXT,
    bank_number TEXT,
    association_number_1 TEXT,
    transaction_code TEXT,
    auth_source TEXT,
    network_identifier_debit TEXT,
    pos_entry_mode TEXT,
    auth_response_code TEXT,
    validation_code TEXT,
    cat_indicator TEXT,
    online_entry TEXT,
    ach_flag TEXT,
    cardholder_id_method TEXT,
    terminal_id TEXT,
    discover_pos_entry_mode TEXT,
    purchase_id TEXT,
    pos_data_code TEXT,
    terminal_type TEXT,
    status TEXT DEFAULT 'Active' NOT NULL,
    location TEXT,
    m_type TEXT,
    m_location TEXT,
    installation_date TIMESTAMP,
    hardware_model TEXT,
    manufacturer TEXT,
    firmware_version TEXT,
    network_type TEXT,
    ip_address TEXT,
    term_number TEXT,
    generic_field_2 TEXT,
    description TEXT,
    notes TEXT,
    internal_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    last_activity TIMESTAMP,
    last_update TIMESTAMP,
    update_source TEXT,
    last_sync_date TIMESTAMP,
    sync_status TEXT DEFAULT 'Pending',
    last_activity_date TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dev_api_terminals_v_number ON dev_api_terminals(v_number);
CREATE INDEX IF NOT EXISTS idx_dev_api_terminals_pos_merchant_number ON dev_api_terminals(pos_merchant_number);
CREATE INDEX IF NOT EXISTS idx_dev_api_terminals_status ON dev_api_terminals(status);
CREATE INDEX IF NOT EXISTS idx_dev_api_terminals_terminal_type ON dev_api_terminals(terminal_type);

-- ============================================================================
-- SECTION 6: TDDF PROCESSING TABLES
-- ============================================================================

-- TDDF JSONB (main records table)
CREATE TABLE IF NOT EXISTS dev_tddf_jsonb (
    id TEXT PRIMARY KEY,
    upload_id TEXT,
    record_type TEXT,
    line_number INTEGER,
    raw_line TEXT,
    parsed_data JSONB,
    business_day DATE,
    processing_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    error_message TEXT,
    filename TEXT,
    file_date DATE
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_upload_id ON dev_tddf_jsonb(upload_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_record_type ON dev_tddf_jsonb(record_type);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_business_day ON dev_tddf_jsonb(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_processing_status ON dev_tddf_jsonb(processing_status);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_filename ON dev_tddf_jsonb(filename);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_created_at ON dev_tddf_jsonb(created_at);

-- JSONB Performance Indexes (safe for production data)
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_mcc ON dev_tddf_jsonb USING gin ((parsed_data->'merchantAccountNumber'));
-- Safe numeric index: filters out null/empty values and handles non-numeric gracefully
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_amount ON dev_tddf_jsonb 
USING btree ((NULLIF(parsed_data->>'batchDepositAmount', '')::numeric))
WHERE parsed_data->>'batchDepositAmount' IS NOT NULL 
  AND parsed_data->>'batchDepositAmount' != ''
  AND parsed_data->>'batchDepositAmount' ~ '^[0-9]+\.?[0-9]*$';
CREATE INDEX IF NOT EXISTS idx_dev_tddf_jsonb_merchant_name ON dev_tddf_jsonb USING gin ((parsed_data->'merchantName'));

-- TDDF Records (legacy)
CREATE TABLE IF NOT EXISTS dev_tddf_records (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    record_type VARCHAR(10),
    line_number INTEGER,
    raw_data TEXT,
    parsed_data JSONB,
    business_day DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_records_upload_id ON dev_tddf_records(upload_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_records_record_type ON dev_tddf_records(record_type);

-- TDDF Batch Headers
CREATE TABLE IF NOT EXISTS dev_tddf_batch_headers (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    batch_number TEXT,
    merchant_account TEXT,
    batch_date DATE,
    deposit_amount NUMERIC,
    record_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- TDDF Other Records
CREATE TABLE IF NOT EXISTS dev_tddf_other_records (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    record_type TEXT,
    data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- TDDF Purchasing Extensions
CREATE TABLE IF NOT EXISTS dev_tddf_purchasing_extensions (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- TDDF Raw Import
CREATE TABLE IF NOT EXISTS dev_tddf_raw_import (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    line_number INTEGER,
    raw_line TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- SECTION 7: TDDF API SYSTEM TABLES
-- ============================================================================

-- TDDF API Schemas
CREATE TABLE IF NOT EXISTS dev_tddf_api_schemas (
    id SERIAL PRIMARY KEY,
    schema_name VARCHAR(255) NOT NULL,
    record_type VARCHAR(10) NOT NULL,
    schema_definition JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(schema_name, record_type)
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_schemas_record_type ON dev_tddf_api_schemas(record_type);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_schemas_active ON dev_tddf_api_schemas(is_active);

-- TDDF API Files
CREATE TABLE IF NOT EXISTS dev_tddf_api_files (
    id TEXT PRIMARY KEY,
    filename VARCHAR(500) NOT NULL,
    business_day DATE,
    file_sequence VARCHAR(50),
    upload_status VARCHAR(50) DEFAULT 'pending',
    total_lines INTEGER,
    processed_lines INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_by VARCHAR(255),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_files_business_day ON dev_tddf_api_files(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_files_status ON dev_tddf_api_files(upload_status);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_files_created_at ON dev_tddf_api_files(created_at);

-- TDDF API Queue
CREATE TABLE IF NOT EXISTS dev_tddf_api_queue (
    id SERIAL PRIMARY KEY,
    file_id TEXT,
    record_data JSONB,
    record_type VARCHAR(10),
    processing_status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_queue_status ON dev_tddf_api_queue(processing_status);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_queue_file_id ON dev_tddf_api_queue(file_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_queue_priority ON dev_tddf_api_queue(priority);

-- TDDF API Records
CREATE TABLE IF NOT EXISTS dev_tddf_api_records (
    id TEXT PRIMARY KEY,
    file_id TEXT,
    record_type VARCHAR(10),
    line_number INTEGER,
    parsed_data JSONB,
    business_day DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_records_file_id ON dev_tddf_api_records(file_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_records_record_type ON dev_tddf_api_records(record_type);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_api_records_business_day ON dev_tddf_api_records(business_day);

-- ============================================================================
-- SECTION 8: FILE UPLOAD & PROCESSING TABLES
-- ============================================================================

-- Uploaded Files
CREATE TABLE IF NOT EXISTS dev_uploaded_files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size BIGINT,
    storage_path TEXT,
    uploaded_at TIMESTAMP,
    business_day DATE,
    status VARCHAR(50) DEFAULT 'pending',
    processing_notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    line_count INTEGER,
    record_type_breakdown JSONB,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS uploaded_files_status_idx ON dev_uploaded_files(status);
CREATE INDEX IF NOT EXISTS uploaded_files_business_day_idx ON dev_uploaded_files(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_uploaded_files_created_at ON dev_uploaded_files(created_at);

-- Uploader Uploads
CREATE TABLE IF NOT EXISTS dev_uploader_uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size BIGINT,
    start_time TIMESTAMP,
    upload_started_at TIMESTAMP,
    upload_progress INTEGER DEFAULT 0,
    chunked_upload BOOLEAN DEFAULT false,
    chunk_count INTEGER,
    chunks_uploaded INTEGER DEFAULT 0,
    uploaded_at TIMESTAMP,
    storage_path TEXT,
    upload_status VARCHAR(50) DEFAULT 'pending',
    identified_at TIMESTAMP,
    detected_file_type VARCHAR(50),
    user_classified_type VARCHAR(50),
    final_file_type VARCHAR(50),
    line_count INTEGER,
    data_size BIGINT,
    has_headers BOOLEAN,
    file_format VARCHAR(50),
    compression_used VARCHAR(50),
    encoding_detected VARCHAR(50),
    validation_errors TEXT[],
    processing_notes TEXT,
    created_by VARCHAR(255),
    server_id TEXT,
    session_id TEXT,
    current_phase VARCHAR(50),
    last_updated TIMESTAMP,
    file_content TEXT,
    s3_bucket VARCHAR(255),
    s3_key TEXT,
    s3_url TEXT,
    s3_etag TEXT,
    failed_at TIMESTAMP,
    completed_at TIMESTAMP,
    keep_for_review BOOLEAN DEFAULT false,
    encoding_status VARCHAR(50),
    encoding_time_ms INTEGER,
    json_records_created INTEGER,
    tddf_records_created INTEGER,
    encoding_complete BOOLEAN,
    identification_results JSONB,
    phase INTEGER,
    encoding_completion_time TIMESTAMP,
    file_type VARCHAR(50),
    status VARCHAR(50),
    started_at TIMESTAMP,
    encoding_at TIMESTAMP,
    processing_at TIMESTAMP,
    storage_key TEXT,
    bucket_name VARCHAR(255),
    processing_errors TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    encoding_notes TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    processing_warnings TEXT[],
    last_warning_at TIMESTAMP,
    warning_count INTEGER DEFAULT 0,
    can_retry BOOLEAN DEFAULT false,
    last_failure_reason TEXT,
    processing_server_id TEXT,
    processing_status VARCHAR(50) DEFAULT 'pending',
    parsed_scheduled_datetime TIMESTAMP,
    parsed_actual_datetime TIMESTAMP,
    filename_parse_status VARCHAR(50) DEFAULT 'pending',
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMP,
    archived_by VARCHAR(255),
    status_message TEXT,
    business_day DATE,
    bh_record_count INTEGER,
    dt_record_count INTEGER,
    other_record_count INTEGER,
    file_sequence_number VARCHAR(50),
    file_processing_time VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(255),
    processing_log_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_dev_uploader_uploads_current_phase ON dev_uploader_uploads(current_phase);
CREATE INDEX IF NOT EXISTS idx_dev_uploader_uploads_business_day ON dev_uploader_uploads(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_uploader_uploads_status ON dev_uploader_uploads(upload_status);
CREATE INDEX IF NOT EXISTS idx_dev_uploader_uploads_created_at ON dev_uploader_uploads(created_at);

-- Uploader TDDF JSONB Records
CREATE TABLE IF NOT EXISTS dev_uploader_tddf_jsonb_records (
    id TEXT PRIMARY KEY,
    upload_id TEXT,
    record_type VARCHAR(10),
    line_number INTEGER,
    parsed_data JSONB,
    processing_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_upload_id_idx ON dev_uploader_tddf_jsonb_records(upload_id);
CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_record_type_idx ON dev_uploader_tddf_jsonb_records(record_type);
CREATE INDEX IF NOT EXISTS uploader_tddf_jsonb_processing_status_idx ON dev_uploader_tddf_jsonb_records(processing_status);

-- Uploader JSON
CREATE TABLE IF NOT EXISTS dev_uploader_json (
    id TEXT PRIMARY KEY,
    upload_id TEXT,
    json_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Uploader Mastercard DI Edit Records
CREATE TABLE IF NOT EXISTS dev_uploader_mastercard_di_edit_records (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    record_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- SECTION 9: PROCESSING METRICS & TIMING
-- ============================================================================

-- Processing Metrics
CREATE TABLE IF NOT EXISTS dev_processing_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    metric_type VARCHAR(100),
    system_status VARCHAR(50),
    bh_processed INTEGER DEFAULT 0,
    dt_processed INTEGER DEFAULT 0,
    p1_processed INTEGER DEFAULT 0,
    p2_processed INTEGER DEFAULT 0,
    other_processed INTEGER DEFAULT 0,
    total_processed INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    memory_usage_mb NUMERIC,
    cpu_usage_percent NUMERIC,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS processing_metrics_timestamp_idx ON dev_processing_metrics(timestamp);
CREATE INDEX IF NOT EXISTS processing_metrics_type_idx ON dev_processing_metrics(metric_type);
CREATE INDEX IF NOT EXISTS processing_metrics_status_idx ON dev_processing_metrics(system_status);

-- Processing Timing Logs
CREATE TABLE IF NOT EXISTS dev_processing_timing_logs (
    id SERIAL PRIMARY KEY,
    upload_id TEXT,
    operation_type VARCHAR(100),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration_ms INTEGER,
    records_processed INTEGER,
    status VARCHAR(50),
    error_message TEXT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS processing_timing_logs_upload_id_idx ON dev_processing_timing_logs(upload_id);
CREATE INDEX IF NOT EXISTS processing_timing_logs_operation_type_idx ON dev_processing_timing_logs(operation_type);
CREATE INDEX IF NOT EXISTS processing_timing_logs_start_time_idx ON dev_processing_timing_logs(start_time);
CREATE INDEX IF NOT EXISTS processing_timing_logs_status_idx ON dev_processing_timing_logs(status);

-- ============================================================================
-- SECTION 10: CACHE TABLES
-- ============================================================================

-- Dashboard Cache
CREATE TABLE IF NOT EXISTS dev_dashboard_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    cache_data JSONB NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    build_time_ms INTEGER DEFAULT 0 NOT NULL,
    record_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dev_dashboard_cache_cache_key ON dev_dashboard_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_dev_dashboard_cache_expires_at ON dev_dashboard_cache(expires_at);

-- Cache Configuration
CREATE TABLE IF NOT EXISTS dev_cache_configuration (
    id SERIAL PRIMARY KEY,
    cache_name TEXT NOT NULL UNIQUE,
    cache_type TEXT NOT NULL,
    page_name TEXT,
    table_name TEXT,
    default_expiration_minutes INTEGER DEFAULT 240 NOT NULL,
    expiration_policy TEXT DEFAULT 'fixed',
    current_expiration_minutes INTEGER,
    auto_refresh_enabled BOOLEAN DEFAULT true,
    last_refresh_at TIMESTAMP,
    next_refresh_at TIMESTAMP,
    refresh_interval_minutes INTEGER,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    notes TEXT,
    metadata JSONB,
    created_by TEXT DEFAULT 'system',
    last_modified_by TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS cache_config_cache_name_idx ON dev_cache_configuration(cache_name);
CREATE INDEX IF NOT EXISTS cache_config_cache_type_idx ON dev_cache_configuration(cache_type);
CREATE INDEX IF NOT EXISTS cache_config_page_name_idx ON dev_cache_configuration(page_name);
CREATE INDEX IF NOT EXISTS cache_config_active_idx ON dev_cache_configuration(is_active);

-- Charts Pre-Cache
CREATE TABLE IF NOT EXISTS dev_charts_pre_cache (
    processing_date DATE,
    files_processed BIGINT,
    total_bytes BIGINT,
    successful_files BIGINT,
    failed_files BIGINT,
    avg_processing_time_seconds NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_dev_charts_pre_cache_date ON dev_charts_pre_cache(processing_date);

-- TDDF1 Merchants Cache
CREATE TABLE IF NOT EXISTS dev_tddf1_merchants (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT UNIQUE,
    merchant_name TEXT,
    total_transactions INTEGER DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    first_seen DATE,
    last_seen DATE,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS tddf1_merchants_merchant_id_idx ON dev_tddf1_merchants(merchant_id);
CREATE INDEX IF NOT EXISTS tddf1_merchants_merchant_name_idx ON dev_tddf1_merchants(merchant_name);
CREATE INDEX IF NOT EXISTS tddf1_merchants_total_transactions_idx ON dev_tddf1_merchants(total_transactions);
CREATE INDEX IF NOT EXISTS tddf1_merchants_total_amount_idx ON dev_tddf1_merchants(total_amount);
CREATE INDEX IF NOT EXISTS tddf1_merchants_first_seen_idx ON dev_tddf1_merchants(first_seen);
CREATE INDEX IF NOT EXISTS tddf1_merchants_last_seen_idx ON dev_tddf1_merchants(last_seen);

-- TDDF1 Monthly Cache
CREATE TABLE IF NOT EXISTS dev_tddf1_monthly_cache (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT,
    year INTEGER,
    month INTEGER,
    transaction_count INTEGER DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    cached_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(merchant_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf1_monthly_merchant ON dev_tddf1_monthly_cache(merchant_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf1_monthly_year_month ON dev_tddf1_monthly_cache(year, month);

-- TDDF1 Activity Cache
CREATE TABLE IF NOT EXISTS dev_tddf1_activity_cache (
    id SERIAL PRIMARY KEY,
    date DATE,
    merchant_id TEXT,
    activity_data JSONB,
    cached_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(date, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf1_activity_date ON dev_tddf1_activity_cache(date);
CREATE INDEX IF NOT EXISTS idx_dev_tddf1_activity_merchant ON dev_tddf1_activity_cache(merchant_id);

-- TDDF1 Totals
CREATE TABLE IF NOT EXISTS dev_tddf1_totals (
    id SERIAL PRIMARY KEY,
    business_day DATE NOT NULL,
    filename TEXT,
    bh_count INTEGER DEFAULT 0,
    dt_count INTEGER DEFAULT 0,
    p1_count INTEGER DEFAULT 0,
    p2_count INTEGER DEFAULT 0,
    other_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    batch_amount NUMERIC DEFAULT 0,
    transaction_amount NUMERIC DEFAULT 0,
    cached_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_day, filename)
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf1_totals_business_day ON dev_tddf1_totals(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_tddf1_totals_filename ON dev_tddf1_totals(filename);

-- TDDF JSON Record Type Counts Pre-Cache
CREATE TABLE IF NOT EXISTS dev_tddf_json_record_type_counts_pre_cache (
    upload_id TEXT,
    filename TEXT,
    business_day DATE,
    record_type TEXT,
    count BIGINT,
    total_amount NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_json_counts_upload ON dev_tddf_json_record_type_counts_pre_cache(upload_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_json_counts_business_day ON dev_tddf_json_record_type_counts_pre_cache(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_json_counts_record_type ON dev_tddf_json_record_type_counts_pre_cache(record_type);

-- TDDF Object Totals Cache 2025
CREATE TABLE IF NOT EXISTS dev_tddf_object_totals_cache_2025 (
    business_day DATE,
    upload_id TEXT,
    filename TEXT,
    total_records BIGINT,
    bh_count BIGINT,
    dt_count BIGINT,
    p1_count BIGINT,
    p2_count BIGINT,
    other_count BIGINT
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_object_cache_business_day ON dev_tddf_object_totals_cache_2025(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_object_cache_upload_id ON dev_tddf_object_totals_cache_2025(upload_id);

-- ============================================================================
-- SECTION 11: TRANSACTION & ACH TABLES
-- ============================================================================

-- Transactions
CREATE TABLE IF NOT EXISTS dev_transactions (
    id SERIAL PRIMARY KEY,
    merchant_id TEXT,
    amount NUMERIC,
    transaction_date DATE,
    transaction_type VARCHAR(50),
    status VARCHAR(50),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_transactions_merchant_id ON dev_transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_dev_transactions_date ON dev_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_dev_transactions_type ON dev_transactions(transaction_type);

-- ACH Transactions
CREATE TABLE IF NOT EXISTS dev_api_achtransactions (
    id SERIAL PRIMARY KEY,
    merchant_name VARCHAR(255),
    merchant_id VARCHAR(50),
    account_number VARCHAR(50),
    amount NUMERIC,
    transaction_date DATE,
    code VARCHAR(10),
    description VARCHAR(255),
    company VARCHAR(50),
    trace_number VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    file_source VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS dev_api_achtransactions_merchant_id_idx ON dev_api_achtransactions(merchant_id);
CREATE INDEX IF NOT EXISTS dev_api_achtransactions_merchant_name_idx ON dev_api_achtransactions(merchant_name);
CREATE INDEX IF NOT EXISTS dev_api_achtransactions_transaction_date_idx ON dev_api_achtransactions(transaction_date);
CREATE INDEX IF NOT EXISTS dev_api_achtransactions_amount_idx ON dev_api_achtransactions(amount);
CREATE INDEX IF NOT EXISTS dev_api_achtransactions_created_at_idx ON dev_api_achtransactions(created_at);

-- ============================================================================
-- SECTION 12: ARCHIVE & DATA MANAGEMENT
-- ============================================================================

-- TDDF Archive
CREATE TABLE IF NOT EXISTS dev_tddf_archive (
    id TEXT PRIMARY KEY,
    original_upload_id TEXT,
    filename TEXT,
    business_day DATE,
    archived_at TIMESTAMP DEFAULT NOW(),
    archived_by VARCHAR(255),
    archive_reason TEXT,
    record_count INTEGER,
    file_size BIGINT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_archive_business_day ON dev_tddf_archive(business_day);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_archive_archived_at ON dev_tddf_archive(archived_at);

-- TDDF Archive Records
CREATE TABLE IF NOT EXISTS dev_tddf_archive_records (
    id TEXT PRIMARY KEY,
    archive_id TEXT,
    record_type TEXT,
    parsed_data JSONB,
    business_day DATE,
    archived_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_tddf_archive_records_archive_id ON dev_tddf_archive_records(archive_id);
CREATE INDEX IF NOT EXISTS idx_dev_tddf_archive_records_record_type ON dev_tddf_archive_records(record_type);

-- TDDF Datamaster
CREATE TABLE IF NOT EXISTS dev_tddf_datamaster (
    id SERIAL PRIMARY KEY,
    data_key VARCHAR(255) UNIQUE,
    data_value TEXT,
    data_type VARCHAR(50),
    category VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- TDDF Import Log
CREATE TABLE IF NOT EXISTS dev_tddf_import_log (
    id SERIAL PRIMARY KEY,
    filename TEXT,
    import_date TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50),
    records_imported INTEGER,
    errors TEXT,
    duration_ms INTEGER
);

-- Master Object Keys
CREATE TABLE IF NOT EXISTS dev_master_object_keys (
    id SERIAL PRIMARY KEY,
    object_key TEXT NOT NULL UNIQUE,
    file_size_bytes INTEGER NOT NULL,
    line_count INTEGER,
    status TEXT DEFAULT 'active' NOT NULL,
    upload_id TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    mark_for_purge BOOLEAN DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS master_object_keys_object_key_idx ON dev_master_object_keys(object_key);
CREATE INDEX IF NOT EXISTS master_object_keys_status_idx ON dev_master_object_keys(status);
CREATE INDEX IF NOT EXISTS master_object_keys_upload_id_idx ON dev_master_object_keys(upload_id);
CREATE INDEX IF NOT EXISTS master_object_keys_mark_for_purge_idx ON dev_master_object_keys(mark_for_purge);
CREATE INDEX IF NOT EXISTS master_object_keys_created_at_idx ON dev_master_object_keys(created_at);

-- Duplicate Finder Cache
CREATE TABLE IF NOT EXISTS dev_duplicate_finder_cache (
    id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
    created_at TIMESTAMP DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    scan_status TEXT DEFAULT 'pending',
    duplicate_count INTEGER DEFAULT 0,
    scan_completed BOOLEAN DEFAULT false,
    last_scan_date TIMESTAMP DEFAULT NOW(),
    total_scanned INTEGER DEFAULT 0,
    scan_in_progress BOOLEAN DEFAULT false,
    cooldown_until TIMESTAMP,
    scan_history JSONB,
    cache_key TEXT DEFAULT 'duplicate_scan_status'
);

-- ============================================================================
-- SECTION 13: AUDIT & COMPLIANCE
-- ============================================================================

-- Audit Logs
CREATE TABLE IF NOT EXISTS dev_audit_logs (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id INTEGER,
    username TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    ip_address TEXT,
    user_agent TEXT,
    notes TEXT,
    file_metadata JSONB
);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON dev_audit_logs(action);
CREATE INDEX IF NOT EXISTS dev_audit_logs_entity_type_idx ON dev_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS dev_audit_logs_entity_id_idx ON dev_audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS dev_audit_logs_user_id_idx ON dev_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS dev_audit_logs_timestamp_idx ON dev_audit_logs(timestamp);

-- ============================================================================
-- SECTION 14: MCC SCHEMA & CONFIGURATION
-- ============================================================================

-- Merchant MCC Schema
CREATE TABLE IF NOT EXISTS dev_merchant_mcc_schema (
    id SERIAL PRIMARY KEY,
    position TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_length INTEGER NOT NULL,
    format TEXT NOT NULL,
    description TEXT,
    mms_enabled INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    key TEXT,
    tab_position TEXT
);

-- Sub-Merchant Terminals
CREATE TABLE IF NOT EXISTS dev_sub_merchant_terminals (
    id SERIAL PRIMARY KEY,
    terminal_id VARCHAR(50),
    sub_merchant_id VARCHAR(50),
    parent_merchant_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dev Uploads (development data uploads)
CREATE TABLE IF NOT EXISTS dev_dev_uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    compressed_payload JSONB NOT NULL,
    schema_info JSONB NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'uploaded' NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    record_count INTEGER,
    processing_time_ms INTEGER,
    notes TEXT
);

-- ============================================================================
-- SECTION 15: BACKUP & SYSTEM MANAGEMENT
-- ============================================================================

-- Backup Schedules
CREATE TABLE IF NOT EXISTS backup_schedules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cron_expression VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    backup_type VARCHAR(50) DEFAULT 'full',
    retention_days INTEGER DEFAULT 30,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100),
    enabled BOOLEAN DEFAULT true,
    applied_by VARCHAR(100)
);

-- Backup History
CREATE TABLE IF NOT EXISTS backup_history (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER,
    backup_name VARCHAR(255),
    backup_path TEXT,
    backup_size BIGINT,
    status VARCHAR(50),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    error_message TEXT,
    metadata JSONB
);

-- Schema Versions
CREATE TABLE IF NOT EXISTS schema_versions (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    applied_at TIMESTAMP DEFAULT NOW(),
    applied_by VARCHAR(100),
    changes TEXT,
    script TEXT
);

-- Schema Content
CREATE TABLE IF NOT EXISTS schema_content (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    schema_definition JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- System Settings (production table - no dev_ prefix)
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- Merchant MCC Schema (production table - no dev_ prefix)
CREATE TABLE IF NOT EXISTS merchant_mcc_schema (
    id SERIAL PRIMARY KEY,
    position TEXT NOT NULL,
    field_name TEXT NOT NULL,
    field_length INTEGER NOT NULL,
    format TEXT NOT NULL,
    description TEXT,
    mms_enabled INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    key TEXT,
    tab_position TEXT
);

-- Session Table (for Express sessions)
CREATE TABLE IF NOT EXISTS dev_session (
    sid VARCHAR PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dev_session_expire ON dev_session(expire);

-- Uploader Uploads Table (production - no dev_ prefix)
CREATE TABLE IF NOT EXISTS uploader_uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_size BIGINT,
    start_time TIMESTAMP,
    upload_status VARCHAR(50) DEFAULT 'pending',
    current_phase VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- ============================================================================
-- PRODUCTION TABLE ALIASES (for compatibility)
-- ============================================================================

-- Create production aliases for critical tables (if they don't exist)
CREATE TABLE IF NOT EXISTS tddf_api_files (LIKE dev_tddf_api_files INCLUDING ALL);
CREATE TABLE IF NOT EXISTS tddf_api_queue (LIKE dev_tddf_api_queue INCLUDING ALL);
CREATE TABLE IF NOT EXISTS tddf_api_records (LIKE dev_tddf_api_records INCLUDING ALL);
CREATE TABLE IF NOT EXISTS tddf_api_schemas (LIKE dev_tddf_api_schemas INCLUDING ALL);
CREATE TABLE IF NOT EXISTS tddf_json_record_type_counts_pre_cache (LIKE dev_tddf_json_record_type_counts_pre_cache INCLUDING ALL);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Count all tables
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE 'dev_%';
    
    RAISE NOTICE 'Total dev_ tables created: %', table_count;
END $$;

-- Count all indexes
DO $$
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
        AND tablename LIKE 'dev_%';
    
    RAISE NOTICE 'Total indexes created on dev_ tables: %', index_count;
END $$;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Production Database Upgrade Complete!';
    RAISE NOTICE 'Version: 7 Nov 2025';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Key Tables Added:';
    RAISE NOTICE '  ✓ dev_system_settings (Auto 7 switch fix)';
    RAISE NOTICE '  ✓ dev_tddf_api_request_logs (Monitoring tab fix)';
    RAISE NOTICE '  ✓ All TDDF processing tables';
    RAISE NOTICE '  ✓ All cache tables';
    RAISE NOTICE '  ✓ All monitoring and logging tables';
    RAISE NOTICE '  ✓ All indexes for performance';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'This script is IDEMPOTENT - safe to re-run if needed.';
    RAISE NOTICE '============================================================';
END $$;
