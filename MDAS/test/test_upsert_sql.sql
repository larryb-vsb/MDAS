-- Test the new upsert logic with filename+line uniqueness
-- This tests the same logic implemented in storage.ts

-- Test 1: First INSERT (should insert 3 new rows)
INSERT INTO dev_transactions (id, merchant_id, transaction_id, amount, date, type, source_filename, source_row_number, source_file_hash, updated_at)
VALUES 
  (1, 'MERCH001', 'TXN001', '150.50', '2025-01-15 00:00:00', 'Credit', 'test_ach_file.csv', 1, NULL, NOW()),
  (2, 'MERCH001', 'TXN002', '75.25', '2025-01-15 00:00:00', 'Debit', 'test_ach_file.csv', 2, NULL, NOW()),
  (3, 'MERCH002', 'TXN003', '200.00', '2025-01-16 00:00:00', 'Credit', 'test_ach_file.csv', 3, NULL, NOW())
ON CONFLICT (source_filename, source_row_number) 
DO UPDATE SET 
  merchant_id = EXCLUDED.merchant_id,
  transaction_id = EXCLUDED.transaction_id, 
  amount = EXCLUDED.amount,
  date = EXCLUDED.date,
  type = EXCLUDED.type,
  source_file_hash = EXCLUDED.source_file_hash,
  updated_at = EXCLUDED.updated_at
RETURNING id, (xmax = 0) AS inserted, source_filename, source_row_number, amount, updated_at;

-- Show current state
SELECT 'After First Upsert:' as status;
SELECT COUNT(*) as total_rows FROM dev_transactions;
SELECT id, merchant_id, amount, source_filename, source_row_number, updated_at FROM dev_transactions ORDER BY source_row_number;

-- Wait a moment for timestamp difference
SELECT pg_sleep(1);

-- Test 2: Second UPSERT (same filename+line numbers - should UPDATE existing rows)
INSERT INTO dev_transactions (id, merchant_id, transaction_id, amount, date, type, source_filename, source_row_number, source_file_hash, updated_at)
VALUES 
  (4, 'MERCH001', 'TXN001_UPDATED', '155.75', '2025-01-15 00:00:00', 'Credit', 'test_ach_file.csv', 1, 'hash123', NOW()),
  (5, 'MERCH001', 'TXN002_UPDATED', '80.50', '2025-01-15 00:00:00', 'Debit', 'test_ach_file.csv', 2, 'hash123', NOW()),
  (6, 'MERCH002', 'TXN003_UPDATED', '225.25', '2025-01-16 00:00:00', 'Credit', 'test_ach_file.csv', 3, 'hash123', NOW())
ON CONFLICT (source_filename, source_row_number) 
DO UPDATE SET 
  merchant_id = EXCLUDED.merchant_id,
  transaction_id = EXCLUDED.transaction_id, 
  amount = EXCLUDED.amount,
  date = EXCLUDED.date,
  type = EXCLUDED.type,
  source_file_hash = EXCLUDED.source_file_hash,
  updated_at = EXCLUDED.updated_at
RETURNING id, (xmax = 0) AS inserted, source_filename, source_row_number, amount, updated_at;

-- Show final state
SELECT 'After Second Upsert (Should be Updates):' as status;
SELECT COUNT(*) as total_rows FROM dev_transactions;
SELECT id, merchant_id, transaction_id, amount, source_filename, source_row_number, source_file_hash, updated_at FROM dev_transactions ORDER BY source_row_number;