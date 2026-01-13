-- Schema SQL generated for database initialization
-- Will be used to create tables in new environment-specific databases

-- Schema versions table
CREATE TABLE IF NOT EXISTS "schema_versions" (
  "id" SERIAL PRIMARY KEY,
  "version" TEXT NOT NULL,
  "applied_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "description" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "applied_by" TEXT NOT NULL,
  "script" TEXT
);

-- Merchants table
CREATE TABLE IF NOT EXISTS "merchants" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "client_number" TEXT,
  "client_mid" TEXT,
  "status" TEXT DEFAULT 'active',
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zip" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "other_client_number1" TEXT,
  "other_client_number2" TEXT,
  "client_since_date" TEXT,
  "country" TEXT,
  "edit_date" TEXT
);

-- Transactions table
CREATE TABLE IF NOT EXISTS "transactions" (
  "id" TEXT PRIMARY KEY,
  "merchant_id" TEXT NOT NULL REFERENCES "merchants" ("id") ON DELETE CASCADE,
  "amount" NUMERIC(10, 2) NOT NULL,
  "date" TIMESTAMP NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Uploaded files table
CREATE TABLE IF NOT EXISTS "uploaded_files" (
  "id" TEXT PRIMARY KEY,
  "original_name" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "upload_date" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "processed" BOOLEAN DEFAULT FALSE,
  "process_date" TIMESTAMP,
  "status" TEXT DEFAULT 'pending',
  "file_size" INTEGER,
  "records_added" INTEGER DEFAULT 0,
  "records_updated" INTEGER DEFAULT 0,
  "records_skipped" INTEGER DEFAULT 0,
  "processing_time" INTEGER,
  "error_message" TEXT
);

-- Backup history table
CREATE TABLE IF NOT EXISTS "backup_history" (
  "id" TEXT PRIMARY KEY,
  "backup_date" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "file_path" TEXT,
  "size" BIGINT,
  "tables" JSONB,
  "record_counts" JSONB,
  "storage_type" TEXT DEFAULT 'local',
  "s3_bucket" TEXT,
  "s3_key" TEXT,
  "is_scheduled" BOOLEAN DEFAULT FALSE,
  "schedule_id" TEXT,
  "created_by" TEXT DEFAULT 'system'
);

-- Backup schedules table
CREATE TABLE IF NOT EXISTS "backup_schedules" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "cron" TEXT NOT NULL,
  "enabled" BOOLEAN DEFAULT TRUE,
  "storage_type" TEXT DEFAULT 'local',
  "s3_bucket" TEXT,
  "last_run" TIMESTAMP,
  "next_run" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "username" TEXT UNIQUE NOT NULL,
  "password" TEXT NOT NULL,
  "is_admin" BOOLEAN DEFAULT FALSE,
  "email" TEXT,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "last_login" TIMESTAMP
);

-- Default admin user
INSERT INTO "users" ("username", "password", "is_admin")
VALUES ('admin', '$2b$10$i2c5wcbXlCDDDuoOEBhxBejgnl0U6UfaKPzNpM2VGrbQzTGXLMfPW', TRUE)
ON CONFLICT DO NOTHING;

-- Sessions table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");