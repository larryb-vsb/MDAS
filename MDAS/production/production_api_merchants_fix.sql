-- PRODUCTION FIX: Create missing api_merchants table  
-- Date: 2025-09-12
-- Issue: api_merchants table missing from production database

-- STEP 1: Create production api_merchants table
SELECT 'CREATING PRODUCTION API_MERCHANTS TABLE' as step;

CREATE TABLE IF NOT EXISTS api_merchants (
    id text NOT NULL PRIMARY KEY,
    name text,
    status text,
    address text,
    city text,
    state text,
    zip_code text,
    category text,
    created_at timestamp without time zone DEFAULT now(),
    last_upload_date timestamp without time zone,
    client_mid text,
    other_client_number1 text,
    other_client_number2 text,
    client_since_date timestamp without time zone,
    country text DEFAULT 'USA'::text,
    edit_date timestamp without time zone,
    merchant_type text DEFAULT 'ACH'::text,
    sales_channel text,
    as_of_date timestamp without time zone,
    updated_by text DEFAULT 'VSB_UPLOAD'::text,
    search_index text,
    association text,
    mcc text,
    master_mid text,
    bank text DEFAULT 'Valley State Bank'::text,
    associate_merchant_number text,
    dba_name_cwob text,
    cwob_debit_risk text,
    vwob_ebt_return text,
    bypass_ea text,
    bypass_co text,
    merchant_record_st text DEFAULT 'A'::text,
    board_dt timestamp without time zone,
    sale_amt numeric DEFAULT 0.00,
    credit_amt numeric DEFAULT 0.00,
    negative_amount numeric,
    number_o text,
    bypass_force text,
    fee_visa numeric DEFAULT 0.00,
    visa_mcc text,
    daily_auth_limit numeric,
    bypass_ex text,
    excessive_deposit_amount numeric,
    threshold numeric,
    risk_score numeric DEFAULT 0,
    risk_level text DEFAULT 'LOW'::text,
    last_risk_assessment timestamp without time zone,
    risk_flags text[],
    compliance_status text DEFAULT 'COMPLIANT'::text,
    review_required boolean DEFAULT false,
    risk_notes text
);

-- STEP 2: Create indexes for performance
SELECT 'CREATING PERFORMANCE INDEXES' as step;

-- Primary business indexes
CREATE INDEX IF NOT EXISTS api_merchants_name_idx ON api_merchants(name);
CREATE INDEX IF NOT EXISTS api_merchants_client_mid_idx ON api_merchants(client_mid);
CREATE INDEX IF NOT EXISTS api_merchants_status_idx ON api_merchants(status);
CREATE INDEX IF NOT EXISTS api_merchants_state_idx ON api_merchants(state);
CREATE INDEX IF NOT EXISTS api_merchants_city_idx ON api_merchants(city);

-- Date-based indexes
CREATE INDEX IF NOT EXISTS api_merchants_created_at_idx ON api_merchants(created_at);
CREATE INDEX IF NOT EXISTS api_merchants_last_upload_date_idx ON api_merchants(last_upload_date);
CREATE INDEX IF NOT EXISTS api_merchants_client_since_date_idx ON api_merchants(client_since_date);
CREATE INDEX IF NOT EXISTS api_merchants_as_of_date_idx ON api_merchants(as_of_date);

-- Business logic indexes  
CREATE INDEX IF NOT EXISTS api_merchants_merchant_type_idx ON api_merchants(merchant_type);
CREATE INDEX IF NOT EXISTS api_merchants_bank_idx ON api_merchants(bank);
CREATE INDEX IF NOT EXISTS api_merchants_risk_level_idx ON api_merchants(risk_level);
CREATE INDEX IF NOT EXISTS api_merchants_compliance_status_idx ON api_merchants(compliance_status);
CREATE INDEX IF NOT EXISTS api_merchants_review_required_idx ON api_merchants(review_required);

-- Search index
CREATE INDEX IF NOT EXISTS api_merchants_search_index_idx ON api_merchants(search_index);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS api_merchants_status_type_idx ON api_merchants(status, merchant_type);
CREATE INDEX IF NOT EXISTS api_merchants_state_city_idx ON api_merchants(state, city);

-- STEP 3: Insert sample data for testing (optional)
SELECT 'INSERTING SAMPLE DATA FOR TESTING' as step;

INSERT INTO api_merchants (
    id, name, status, client_mid, merchant_type, 
    bank, risk_level, compliance_status, review_required,
    created_at, country
) 
SELECT 
    'SAMPLE001', 
    'SAMPLE MERCHANT', 
    'Active',
    'SAMPLE_MID_001',
    'ACH',
    'Valley State Bank',
    'LOW',
    'COMPLIANT',
    false,
    CURRENT_TIMESTAMP,
    'USA'
WHERE NOT EXISTS (SELECT 1 FROM api_merchants WHERE id = 'SAMPLE001');

-- STEP 4: Test the table with common API queries
SELECT 'TESTING PRODUCTION TABLE' as test_type;

-- Test basic select
SELECT 
    id,
    name,
    status,
    client_mid,
    merchant_type,
    created_at
FROM api_merchants 
WHERE id = 'SAMPLE001'
LIMIT 1;

-- Test pagination query (common in API)
SELECT 
    id,
    name,
    status,
    client_mid,
    city,
    state,
    created_at
FROM api_merchants
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;

-- Test search functionality
SELECT COUNT(*) as total_merchants
FROM api_merchants
WHERE status = 'Active';

-- STEP 5: Verify table schema
SELECT 'SCHEMA VERIFICATION' as verification;

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'api_merchants'
ORDER BY ordinal_position;

-- STEP 6: Test merchant bulk operations support
SELECT 'TESTING BULK OPERATIONS' as test_type;

-- Test bulk delete structure (used by MMS)
SELECT id, name, status 
FROM api_merchants 
WHERE id = ANY(ARRAY['SAMPLE001']::text[])
LIMIT 5;

-- STEP 7: Final verification
SELECT 'FINAL VERIFICATION' as final_step;

-- Count total merchants
SELECT COUNT(*) as total_merchants FROM api_merchants;

-- Verify all indexes exist
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename = 'api_merchants'
ORDER BY indexname;

SELECT 'PRODUCTION API_MERCHANTS TABLE CREATED SUCCESSFULLY' as completion_status;
SELECT 'MMS merchants API endpoints should now work' as api_status;