-- Force database migration for file storage changes
-- Add new columns for database storage
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_content TEXT;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'text/csv';
ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
ALTER TABLE uploaded_files ALTER COLUMN storage_path DROP NOT NULL;