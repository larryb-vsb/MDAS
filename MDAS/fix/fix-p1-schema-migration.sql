-- Fix P1 Schema Migration for Enhanced TDDF P1 Processing
-- Add missing P1 fields to match detailed TDDF specification

-- Add missing columns to development P1 table
ALTER TABLE dev_tddf_purchasing_extensions 
ADD COLUMN IF NOT EXISTS parent_dt_reference TEXT,
ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(7,4),
ADD COLUMN IF NOT EXISTS tax_type TEXT,
ADD COLUMN IF NOT EXISTS purchase_identifier TEXT,
ADD COLUMN IF NOT EXISTS customer_code TEXT,
ADD COLUMN IF NOT EXISTS sales_tax NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS destination_zip TEXT,
ADD COLUMN IF NOT EXISTS merchant_type TEXT,
ADD COLUMN IF NOT EXISTS merchant_tax_id TEXT,
ADD COLUMN IF NOT EXISTS ship_from_zip_code TEXT,
ADD COLUMN IF NOT EXISTS national_tax_included TEXT,
ADD COLUMN IF NOT EXISTS national_tax_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS other_tax NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS merchant_reference_number TEXT,
ADD COLUMN IF NOT EXISTS merchant_vat_registration TEXT,
ADD COLUMN IF NOT EXISTS customer_vat_registration TEXT,
ADD COLUMN IF NOT EXISTS summary_commodity_code TEXT,
ADD COLUMN IF NOT EXISTS vat_invoice_reference_number TEXT,
ADD COLUMN IF NOT EXISTS order_date TEXT,
ADD COLUMN IF NOT EXISTS detail_record_to_follow TEXT,
ADD COLUMN IF NOT EXISTS reserved_future_use TEXT,
ADD COLUMN IF NOT EXISTS mms_raw_line TEXT;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS tddf_pe_parent_dt_ref_idx ON dev_tddf_purchasing_extensions(parent_dt_reference);
CREATE INDEX IF NOT EXISTS tddf_pe_record_identifier_idx ON dev_tddf_purchasing_extensions(record_identifier);

-- Add missing columns to production P1 table (if exists)
ALTER TABLE tddf_purchasing_extensions 
ADD COLUMN IF NOT EXISTS parent_dt_reference TEXT,
ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(7,4),
ADD COLUMN IF NOT EXISTS tax_type TEXT,
ADD COLUMN IF NOT EXISTS purchase_identifier TEXT,
ADD COLUMN IF NOT EXISTS customer_code TEXT,
ADD COLUMN IF NOT EXISTS sales_tax NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS destination_zip TEXT,
ADD COLUMN IF NOT EXISTS merchant_type TEXT,
ADD COLUMN IF NOT EXISTS merchant_tax_id TEXT,
ADD COLUMN IF NOT EXISTS ship_from_zip_code TEXT,
ADD COLUMN IF NOT EXISTS national_tax_included TEXT,
ADD COLUMN IF NOT EXISTS national_tax_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS other_tax NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS merchant_reference_number TEXT,
ADD COLUMN IF NOT EXISTS merchant_vat_registration TEXT,
ADD COLUMN IF NOT EXISTS customer_vat_registration TEXT,
ADD COLUMN IF NOT EXISTS summary_commodity_code TEXT,
ADD COLUMN IF NOT EXISTS vat_invoice_reference_number TEXT,
ADD COLUMN IF NOT EXISTS order_date TEXT,
ADD COLUMN IF NOT EXISTS detail_record_to_follow TEXT,
ADD COLUMN IF NOT EXISTS reserved_future_use TEXT,
ADD COLUMN IF NOT EXISTS mms_raw_line TEXT;

-- Add indexes for production (if table exists)
CREATE INDEX IF NOT EXISTS tddf_pe_parent_dt_ref_idx ON tddf_purchasing_extensions(parent_dt_reference);
CREATE INDEX IF NOT EXISTS tddf_pe_record_identifier_idx ON tddf_purchasing_extensions(record_identifier);

-- Verify column additions
SELECT 'dev_tddf_purchasing_extensions columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dev_tddf_purchasing_extensions' 
ORDER BY ordinal_position;