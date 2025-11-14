-- Production TDDF Hierarchical Architecture Setup Script
-- Schema Version: 2.4.0
-- Date: July 23, 2025
-- Purpose: Create hierarchical TDDF tables in production environment

-- ============================================================================
-- PRODUCTION ENVIRONMENT TABLES
-- ============================================================================

-- TDDF Batch Headers (BH) - Contains batch-level information that groups DT records
CREATE TABLE IF NOT EXISTS tddf_batch_headers (
    id SERIAL PRIMARY KEY,
    
    -- Core TDDF header fields (positions 1-23) - shared with all record types
    sequence_number TEXT, -- Positions 1-7: File position identifier
    entry_run_number TEXT, -- Positions 8-13: Entry run number
    sequence_within_run TEXT, -- Positions 14-17: Sequence within entry run
    record_identifier TEXT, -- Positions 18-19: Always "BH"
    bank_number TEXT, -- Positions 20-23: Global Payments bank number
    
    -- Batch-specific fields (positions 24+)
    merchant_account_number TEXT, -- Positions 24-39: GP account number
    batch_date TIMESTAMP, -- Batch processing date
    net_deposit NUMERIC(15,2), -- Net deposit amount
    merchant_reference_number TEXT, -- Merchant batch reference
    
    -- System and audit fields
    source_file_id TEXT REFERENCES uploaded_files(id),
    source_row_number INTEGER,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    raw_data JSONB, -- Store the complete fixed-width record for reference
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for TDDF Batch Headers
CREATE INDEX IF NOT EXISTS tddf_bh_merchant_account_idx ON tddf_batch_headers(merchant_account_number);
CREATE INDEX IF NOT EXISTS tddf_bh_batch_date_idx ON tddf_batch_headers(batch_date);

-- TDDF Transaction Records (DT) - Main transaction records linked to batch headers
CREATE TABLE IF NOT EXISTS tddf_transaction_records (
    id SERIAL PRIMARY KEY,
    
    -- Link to batch header
    batch_header_id INTEGER REFERENCES tddf_batch_headers(id),
    
    -- Core TDDF header fields (positions 1-23) - shared with all record types
    sequence_number TEXT, -- Positions 1-7: File position identifier
    entry_run_number TEXT, -- Positions 8-13: Entry run number
    sequence_within_run TEXT, -- Positions 14-17: Sequence within entry run
    record_identifier TEXT, -- Positions 18-19: Always "DT"
    bank_number TEXT, -- Positions 20-23: Global Payments bank number
    
    -- Account and merchant fields (positions 24-61)
    merchant_account_number TEXT, -- Positions 24-39: GP account number
    association_number_1 TEXT, -- Positions 40-45: Association number
    group_number TEXT, -- Positions 46-51: Group number
    transaction_code TEXT, -- Positions 52-55: GP transaction code
    association_number_2 TEXT, -- Positions 56-61: Second association number
    
    -- Core transaction fields (positions 62-142)
    reference_number TEXT, -- Positions 62-84: Reference number (23 chars)
    transaction_date TIMESTAMP, -- Positions 85-92: MMDDCCYY format
    transaction_amount NUMERIC(15,2), -- Positions 93-103: Transaction amount
    batch_julian_date TEXT, -- Positions 104-108: Batch Julian date
    net_deposit NUMERIC(15,2), -- Positions 109-119: Net deposit amount
    cardholder_account_number TEXT, -- Positions 120-135: Cardholder account
    
    -- Transaction details (positions 143-187)
    best_interchange_eligible TEXT, -- Positions 143-145: Best interchange eligible
    transaction_data_condition_code TEXT, -- Positions 146-148: Transaction data condition
    downgrade_reason_1 TEXT, -- Positions 149-151: First downgrade reason
    downgrade_reason_2 TEXT, -- Positions 152-154: Second downgrade reason
    downgrade_reason_3 TEXT, -- Positions 155-157: Third downgrade reason
    online_entry TEXT, -- Positions 158-160: Online entry indicator
    ach_flag TEXT, -- Positions 161-163: ACH flag
    auth_source TEXT, -- Positions 164-166: Authorization source
    cardholder_id_method TEXT, -- Positions 167-169: Cardholder ID method
    cat_indicator TEXT, -- Positions 170-172: CAT indicator
    reimbursement_attribute TEXT, -- Positions 173-175: Reimbursement attribute
    mail_order_telephone_indicator TEXT, -- Positions 176-178: Mail order telephone indicator
    auth_char_ind TEXT, -- Positions 179-181: Authorization character indicator
    banknet_reference_number TEXT, -- Positions 182-187: Banknet reference number
    
    -- Additional transaction info (positions 188-242)
    draft_a_flag TEXT, -- Positions 188-190: Draft A flag
    auth_currency_code TEXT, -- Positions 191-193: Authorization currency code
    auth_amount NUMERIC(15,2), -- Positions 192-203: Authorization amount
    validation_code TEXT, -- Positions 204-207: Validation code
    auth_response_code TEXT, -- Positions 208-209: Authorization response code
    network_identifier_debit TEXT, -- Positions 210-211: Network identifier debit
    switch_settled_indicator TEXT, -- Positions 212-214: Switch settled indicator
    pos_entry_mode TEXT, -- Positions 215-216: POS entry mode
    debit_credit_indicator TEXT, -- Positions 217-219: Debit/credit indicator
    reversal_flag TEXT, -- Positions 220-222: Reversal flag
    merchant_name TEXT, -- Positions 223-242: Merchant name (20 chars)
    
    -- System and audit fields
    source_file_id TEXT REFERENCES uploaded_files(id),
    source_row_number INTEGER,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    raw_data JSONB, -- Store the complete fixed-width record for reference
    mms_raw_line TEXT, -- Custom MMS-RAW-Line field to store original line before processing
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for TDDF Transaction Records
CREATE INDEX IF NOT EXISTS tddf_dt_reference_number_idx ON tddf_transaction_records(reference_number);
CREATE INDEX IF NOT EXISTS tddf_dt_merchant_account_idx ON tddf_transaction_records(merchant_account_number);
CREATE INDEX IF NOT EXISTS tddf_dt_transaction_date_idx ON tddf_transaction_records(transaction_date);
CREATE INDEX IF NOT EXISTS tddf_dt_merchant_name_idx ON tddf_transaction_records(merchant_name);
CREATE INDEX IF NOT EXISTS tddf_dt_batch_header_idx ON tddf_transaction_records(batch_header_id);

-- TDDF Purchasing Extensions (P1, P2) - Extended purchasing card data linked to transactions
CREATE TABLE IF NOT EXISTS tddf_purchasing_extensions (
    id SERIAL PRIMARY KEY,
    
    -- Link to parent transaction
    transaction_record_id INTEGER REFERENCES tddf_transaction_records(id),
    
    -- Core TDDF header fields (positions 1-23) - shared with all record types
    sequence_number TEXT, -- Positions 1-7: File position identifier
    entry_run_number TEXT, -- Positions 8-13: Entry run number
    sequence_within_run TEXT, -- Positions 14-17: Sequence within entry run
    record_identifier TEXT, -- Positions 18-19: "P1" or "P2"
    bank_number TEXT, -- Positions 20-23: Global Payments bank number
    
    -- Purchasing card specific fields
    vat_tax_amount NUMERIC(15,2), -- VAT tax amount
    product_identifier TEXT, -- Product identifier
    product_description TEXT, -- Product description
    unit_cost NUMERIC(15,2), -- Unit cost
    quantity NUMERIC(12,3), -- Quantity
    unit_of_measure TEXT, -- Unit of measure
    extended_item_amount NUMERIC(15,2), -- Extended item amount
    discount_amount NUMERIC(15,2), -- Discount amount
    freight_amount NUMERIC(15,2), -- Freight amount
    duty_amount NUMERIC(15,2), -- Duty amount
    destination_postal_code TEXT, -- Destination postal code
    ship_from_postal_code TEXT, -- Ship from postal code
    destination_country_code TEXT, -- Destination country code
    
    -- System and audit fields
    source_file_id TEXT REFERENCES uploaded_files(id),
    source_row_number INTEGER,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    raw_data JSONB, -- Store the complete fixed-width record for reference
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for TDDF Purchasing Extensions
CREATE INDEX IF NOT EXISTS tddf_pe_transaction_record_idx ON tddf_purchasing_extensions(transaction_record_id);

-- TDDF Other Records (AD, DR, G2, CT, LG, FT, F2, CK, HD, TR) - Catch-all table for other record types
CREATE TABLE IF NOT EXISTS tddf_other_records (
    id SERIAL PRIMARY KEY,
    
    -- Optional link to transaction (for AD, DR records that relate to specific transactions)
    transaction_record_id INTEGER REFERENCES tddf_transaction_records(id),
    
    -- Core TDDF header fields (positions 1-23) - shared with all record types
    sequence_number TEXT, -- Positions 1-7: File position identifier
    entry_run_number TEXT, -- Positions 8-13: Entry run number
    sequence_within_run TEXT, -- Positions 14-17: Sequence within entry run
    record_identifier TEXT, -- Positions 18-19: "AD", "DR", "G2", etc.
    bank_number TEXT, -- Positions 20-23: Global Payments bank number
    
    -- Record type specific information
    record_type TEXT NOT NULL, -- AD, DR, G2, CT, LG, FT, F2, CK, HD, TR
    record_description TEXT, -- Human-readable description of record type
    
    -- Flexible data storage for different record types
    record_data JSONB, -- Structured data specific to each record type
    
    -- Common fields that might appear across multiple record types
    merchant_account_number TEXT, -- Account number when applicable
    reference_number TEXT, -- Reference number when applicable
    amount NUMERIC(15,2), -- Amount when applicable
    
    -- System and audit fields
    source_file_id TEXT REFERENCES uploaded_files(id),
    source_row_number INTEGER,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    raw_data JSONB, -- Store the complete fixed-width record for reference
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for TDDF Other Records
CREATE INDEX IF NOT EXISTS tddf_or_record_type_idx ON tddf_other_records(record_type);
CREATE INDEX IF NOT EXISTS tddf_or_merchant_account_idx ON tddf_other_records(merchant_account_number);
CREATE INDEX IF NOT EXISTS tddf_or_transaction_record_idx ON tddf_other_records(transaction_record_id);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify production tables were created
SELECT 
    'Production TDDF Tables Created' as status,
    COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
    'tddf_batch_headers',
    'tddf_transaction_records', 
    'tddf_purchasing_extensions',
    'tddf_other_records'
);

-- Show created indexes for production tables
SELECT 
    'Production TDDF Indexes' as category,
    schemaname,
    tablename,
    indexname
FROM pg_indexes 
WHERE tablename IN (
    'tddf_batch_headers',
    'tddf_transaction_records', 
    'tddf_purchasing_extensions',
    'tddf_other_records'
)
ORDER BY tablename, indexname;

-- Show table structure summary
SELECT 
    'Table Structure Summary' as category,
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN (
    'tddf_batch_headers',
    'tddf_transaction_records', 
    'tddf_purchasing_extensions',
    'tddf_other_records'
)
ORDER BY table_name, ordinal_position;