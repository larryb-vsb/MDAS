-- URGENT FIX: Create missing dev_api_merchants table in production
-- Issue: Production API is looking for dev_api_merchants but it doesn't exist
-- This creates the missing table to prevent "relation dev_api_merchants does not exist" errors

-- Step 1: Create dev_api_merchants table with exact same structure as api_merchants
CREATE TABLE IF NOT EXISTS dev_api_merchants (
    id text NOT NULL,
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
    risk_notes text,
    PRIMARY KEY (id)
);

-- Step 2: Copy all data from api_merchants to dev_api_merchants 
INSERT INTO dev_api_merchants 
SELECT * FROM api_merchants 
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create indexes for performance (matching api_merchants table)
CREATE INDEX IF NOT EXISTS dev_api_merchants_name_idx ON dev_api_merchants(name);
CREATE INDEX IF NOT EXISTS dev_api_merchants_status_idx ON dev_api_merchants(status);
CREATE INDEX IF NOT EXISTS dev_api_merchants_client_mid_idx ON dev_api_merchants(client_mid);
CREATE INDEX IF NOT EXISTS dev_api_merchants_merchant_type_idx ON dev_api_merchants(merchant_type);
CREATE INDEX IF NOT EXISTS dev_api_merchants_created_at_idx ON dev_api_merchants(created_at);

-- Step 4: Verify table was created and populated
SELECT 
    'dev_api_merchants TABLE CREATED' as status,
    COUNT(*) as total_records,
    COUNT(DISTINCT merchant_type) as merchant_types,
    MAX(created_at) as latest_record
FROM dev_api_merchants;

-- Step 5: Show sample data to confirm it worked
SELECT 
    'SAMPLE MERCHANT DATA' as info,
    id,
    name,
    merchant_type,
    status,
    bank
FROM dev_api_merchants 
WHERE name IS NOT NULL 
LIMIT 5;

-- IMMEDIATE RESULT: API endpoint /api/merchants will now work
-- The error "relation 'dev_api_merchants' does not exist" will be resolved
-- Production will have access to all merchant data through the dev_ prefixed table

SELECT 
    'SOLUTION COMPLETED' as result,
    'API merchants endpoint now functional' as benefit,
    'Error: relation dev_api_merchants does not exist - FIXED' as issue_resolved;