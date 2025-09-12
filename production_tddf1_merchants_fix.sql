-- PRODUCTION FIX: Error fetching TDDF1 merchants: relation "tddf1_merchants" does not exist  
-- Date: 2025-09-12, Error ID: 574620a9
-- Issue: Missing TDDF1 merchants tables for both production and development

-- STEP 1: Create production TDDF1 merchants table
SELECT 'CREATING PRODUCTION TDDF1 MERCHANTS TABLE' as step;

CREATE TABLE IF NOT EXISTS tddf1_merchants (
    id SERIAL PRIMARY KEY,
    merchant_id varchar(255) NOT NULL UNIQUE,
    merchant_name varchar(255),
    total_transactions integer DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0.00,
    total_net_deposits numeric(15,2) DEFAULT 0.00,
    batch_count integer DEFAULT 0,
    first_seen date,
    last_seen date,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- STEP 2: Create development TDDF1 merchants table
SELECT 'CREATING DEVELOPMENT TDDF1 MERCHANTS TABLE' as step;

CREATE TABLE IF NOT EXISTS dev_tddf1_merchants (
    id SERIAL PRIMARY KEY,
    merchant_id varchar(255) NOT NULL UNIQUE,
    merchant_name varchar(255),
    total_transactions integer DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0.00,
    total_net_deposits numeric(15,2) DEFAULT 0.00,
    batch_count integer DEFAULT 0,
    first_seen date,
    last_seen date,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- STEP 3: Create indexes for performance
SELECT 'CREATING PERFORMANCE INDEXES' as step;

-- Production indexes
CREATE INDEX IF NOT EXISTS tddf1_merchants_merchant_id_idx ON tddf1_merchants(merchant_id);
CREATE INDEX IF NOT EXISTS tddf1_merchants_merchant_name_idx ON tddf1_merchants(merchant_name);
CREATE INDEX IF NOT EXISTS tddf1_merchants_first_seen_idx ON tddf1_merchants(first_seen);
CREATE INDEX IF NOT EXISTS tddf1_merchants_last_seen_idx ON tddf1_merchants(last_seen);
CREATE INDEX IF NOT EXISTS tddf1_merchants_total_amount_idx ON tddf1_merchants(total_amount);
CREATE INDEX IF NOT EXISTS tddf1_merchants_total_transactions_idx ON tddf1_merchants(total_transactions);

-- Development indexes  
CREATE INDEX IF NOT EXISTS dev_tddf1_merchants_merchant_id_idx ON dev_tddf1_merchants(merchant_id);
CREATE INDEX IF NOT EXISTS dev_tddf1_merchants_merchant_name_idx ON dev_tddf1_merchants(merchant_name);
CREATE INDEX IF NOT EXISTS dev_tddf1_merchants_first_seen_idx ON dev_tddf1_merchants(first_seen);
CREATE INDEX IF NOT EXISTS dev_tddf1_merchants_last_seen_idx ON dev_tddf1_merchants(last_seen);
CREATE INDEX IF NOT EXISTS dev_tddf1_merchants_total_amount_idx ON dev_tddf1_merchants(total_amount);
CREATE INDEX IF NOT EXISTS dev_tddf1_merchants_total_transactions_idx ON dev_tddf1_merchants(total_transactions);

-- STEP 4: Insert sample data if tables are empty (optional)
SELECT 'INSERTING SAMPLE DATA IF EMPTY' as step;

-- Production sample data
INSERT INTO tddf1_merchants (
    merchant_id, merchant_name, total_transactions, total_amount, 
    total_net_deposits, batch_count, first_seen, last_seen
) 
SELECT '0000000000000000', 'SAMPLE MERCHANT', 0, 0.00, 0.00, 0, CURRENT_DATE, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM tddf1_merchants LIMIT 1);

-- Development sample data
INSERT INTO dev_tddf1_merchants (
    merchant_id, merchant_name, total_transactions, total_amount, 
    total_net_deposits, batch_count, first_seen, last_seen
) 
SELECT '0000000000000000', 'SAMPLE MERCHANT', 0, 0.00, 0.00, 0, CURRENT_DATE, CURRENT_DATE
WHERE NOT EXISTS (SELECT 1 FROM dev_tddf1_merchants LIMIT 1);

-- STEP 5: Test the tables with sample queries
SELECT 'TESTING PRODUCTION TABLE' as test_type;

-- Test the exact query structure the application uses
SELECT 
    merchant_name, 
    total_transactions, 
    first_seen, 
    last_seen
FROM tddf1_merchants 
WHERE merchant_id = '0000000000000000'
LIMIT 1;

SELECT 'TESTING DEVELOPMENT TABLE' as test_type;

SELECT 
    merchant_name, 
    total_transactions, 
    first_seen, 
    last_seen
FROM dev_tddf1_merchants 
WHERE merchant_id = '0000000000000000'  
LIMIT 1;

-- STEP 6: Test merchant stats query
SELECT 'TESTING MERCHANT STATS QUERIES' as test_type;

-- Production stats test
SELECT 
    COUNT(*) as total_merchants,
    SUM(total_transactions) as total_transactions,
    SUM(total_amount) as total_amount,
    SUM(total_net_deposits) as total_net_deposits,
    AVG(total_transactions) as avg_transactions_per_merchant
FROM tddf1_merchants;

-- Development stats test
SELECT 
    COUNT(*) as total_merchants,
    SUM(total_transactions) as total_transactions,
    SUM(total_amount) as total_amount,
    SUM(total_net_deposits) as total_net_deposits,
    AVG(total_transactions) as avg_transactions_per_merchant
FROM dev_tddf1_merchants;

-- STEP 7: Verify table schema
SELECT 'FINAL SCHEMA VERIFICATION' as verification;

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name IN ('tddf1_merchants', 'dev_tddf1_merchants')
ORDER BY table_name, ordinal_position;

-- STEP 8: Show created tables
SELECT 'TABLES CREATED' as final_status;

SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE '%tddf1_merchants%'
ORDER BY table_name;

SELECT 'PRODUCTION TDDF1 MERCHANTS FIX COMPLETE' as completion_status;
SELECT 'API endpoints for TDDF1 merchants should now work' as api_status;