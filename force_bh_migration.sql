-- Drop existing table and recreate with new schema
DROP TABLE IF EXISTS dev_tddf_batch_headers CASCADE;

-- Create new BH table with updated schema
CREATE TABLE dev_tddf_batch_headers (
  id SERIAL PRIMARY KEY,
  record_identifier TEXT,
  net_deposit NUMERIC(15,2),
  transaction_code TEXT,
  batch_date TEXT,
  batch_julian_date TEXT,
  reject_reason TEXT,
  merchant_account_number TEXT,
  source_file_id TEXT REFERENCES dev_uploaded_files(id),
  source_row_number INTEGER,
  recorded_at TIMESTAMP DEFAULT NOW() NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS tddf_bh_merchant_account_idx ON dev_tddf_batch_headers(merchant_account_number);
CREATE INDEX IF NOT EXISTS tddf_bh_batch_date_idx ON dev_tddf_batch_headers(batch_date);
CREATE INDEX IF NOT EXISTS tddf_bh_transaction_code_idx ON dev_tddf_batch_headers(transaction_code);

-- Verify table creation
SELECT 'BH table created successfully' as status;
