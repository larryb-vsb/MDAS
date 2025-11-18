-- =====================================================================
-- PRODUCTION DATABASE SCHEMA
-- =====================================================================
-- Version: 2.9.0 (Auto-tracked by SchemaWatch)
-- Generated: 2025-11-18 00:15:55
--
-- 3 tables total
-- Safe to run on EMPTY or EXISTING database (uses IF NOT EXISTS)
-- Creates missing tables/indexes, skips existing ones, preserves data
-- Note: No transaction wrapper - each statement runs independently
-- =====================================================================


-- automation_settings
CREATE SEQUENCE IF NOT EXISTS automation_settings_id_seq;
CREATE TABLE IF NOT EXISTS automation_settings (
  id integer NOT NULL DEFAULT nextval('automation_settings_id_seq'::regclass),
  setting_key varchar(255) NOT NULL,
  setting_value boolean NOT NULL DEFAULT false,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_by varchar(255),
  username varchar(255)
);
CREATE UNIQUE INDEX IF NOT EXISTS automation_settings_setting_key_key ON public.automation_settings USING btree (setting_key);
CREATE INDEX IF NOT EXISTS idx_automation_settings_key ON public.automation_settings USING btree (setting_key);

-- connection_log
CREATE SEQUENCE IF NOT EXISTS connection_log_id_seq;
CREATE TABLE IF NOT EXISTS connection_log (
  id integer NOT NULL DEFAULT nextval('connection_log_id_seq'::regclass),
  timestamp timestamp DEFAULT CURRENT_TIMESTAMP,
  client_ip varchar(45),
  endpoint text,
  method varchar(10),
  user_agent text,
  api_key_used varchar(255),
  authenticated boolean DEFAULT false,
  status_code integer,
  response_time integer,
  api_user_id integer
);
COMMENT ON TABLE connection_log IS 'API request logging for security monitoring';
CREATE INDEX IF NOT EXISTS idx_connection_log_timestamp ON public.connection_log USING btree ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_connection_log_client_ip ON public.connection_log USING btree (client_ip);
CREATE INDEX IF NOT EXISTS idx_connection_log_endpoint ON public.connection_log USING btree (endpoint);
CREATE INDEX IF NOT EXISTS idx_connection_log_api_user ON public.connection_log USING btree (api_user_id);

-- uploads
CREATE TABLE IF NOT EXISTS uploads (
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
CREATE UNIQUE INDEX IF NOT EXISTS uploads_pkey1 ON public.uploads USING btree (id);

-- Schema complete
