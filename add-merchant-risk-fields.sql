-- MMS Merchant Risk Report Schema Expansion (v2.7.0)
-- Add comprehensive TSYS merchant risk assessment fields to merchants table
-- Supports both development (dev_merchants) and production (merchants) environments

-- Development environment table updates
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS bank TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS associate_merchant_number TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS dba_name_cwob TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS cwob_debit_risk TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS vwob_ebt_return TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS bypass_ea TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS bypass_co TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS merchant_record_st TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS board_dt TIMESTAMP;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS sale_amt NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS credit_amt NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS negative_amount NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS number_o TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS bypass_force TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS fee_visa NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS visa_mcc TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS daily_auth_limit NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS bypass_ex TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS excessive_deposit_amount NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS threshold NUMERIC(15,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2);
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS last_risk_assessment TIMESTAMP;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS risk_flags TEXT[];
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS compliance_status TEXT;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS review_required BOOLEAN DEFAULT false;
ALTER TABLE dev_merchants ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- Production environment table updates
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bank TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS associate_merchant_number TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS dba_name_cwob TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS cwob_debit_risk TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS vwob_ebt_return TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bypass_ea TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bypass_co TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS merchant_record_st TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS board_dt TIMESTAMP;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS sale_amt NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS credit_amt NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS negative_amount NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS number_o TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bypass_force TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS fee_visa NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS visa_mcc TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS daily_auth_limit NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS bypass_ex TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS excessive_deposit_amount NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS threshold NUMERIC(15,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS risk_score NUMERIC(5,2);
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS risk_level TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS last_risk_assessment TIMESTAMP;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS risk_flags TEXT[];
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS compliance_status TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS review_required BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- Create indexes for risk assessment queries (development)
CREATE INDEX IF NOT EXISTS idx_dev_merchants_risk_level ON dev_merchants(risk_level);
CREATE INDEX IF NOT EXISTS idx_dev_merchants_risk_score ON dev_merchants(risk_score);
CREATE INDEX IF NOT EXISTS idx_dev_merchants_review_required ON dev_merchants(review_required);
CREATE INDEX IF NOT EXISTS idx_dev_merchants_compliance_status ON dev_merchants(compliance_status);
CREATE INDEX IF NOT EXISTS idx_dev_merchants_associate_merchant_number ON dev_merchants(associate_merchant_number);
CREATE INDEX IF NOT EXISTS idx_dev_merchants_bank ON dev_merchants(bank);

-- Create indexes for risk assessment queries (production)
CREATE INDEX IF NOT EXISTS idx_merchants_risk_level ON merchants(risk_level);
CREATE INDEX IF NOT EXISTS idx_merchants_risk_score ON merchants(risk_score);
CREATE INDEX IF NOT EXISTS idx_merchants_review_required ON merchants(review_required);
CREATE INDEX IF NOT EXISTS idx_merchants_compliance_status ON merchants(compliance_status);
CREATE INDEX IF NOT EXISTS idx_merchants_associate_merchant_number ON merchants(associate_merchant_number);
CREATE INDEX IF NOT EXISTS idx_merchants_bank ON merchants(bank);

-- Update database performance for risk assessment reporting
ANALYZE dev_merchants;
ANALYZE merchants;

-- Migration complete
COMMENT ON TABLE dev_merchants IS 'Enhanced with TSYS merchant risk report fields (v2.7.0)';
COMMENT ON TABLE merchants IS 'Enhanced with TSYS merchant risk report fields (v2.7.0)';