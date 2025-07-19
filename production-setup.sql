-- Production Environment Setup SQL
-- Run this script after deployment to create missing tables

-- Create processing_metrics table for real-time processing statistics
CREATE TABLE IF NOT EXISTS processing_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    transactions_per_second NUMERIC(10,2) DEFAULT 0,
    peak_transactions_per_second NUMERIC(10,2) DEFAULT 0,
    window_start TIMESTAMP WITH TIME ZONE,
    window_end TIMESTAMP WITH TIME ZONE,
    sample_count INTEGER DEFAULT 0
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_processing_metrics_timestamp ON processing_metrics(timestamp);

-- Insert initial record to prevent empty table errors
INSERT INTO processing_metrics (transactions_per_second, peak_transactions_per_second, sample_count) 
VALUES (0.0, 0.0, 0)
ON CONFLICT DO NOTHING;

-- Verify table creation
SELECT 'processing_metrics table created successfully' AS status;