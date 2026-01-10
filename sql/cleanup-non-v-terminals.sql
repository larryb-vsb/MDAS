-- Production SQL Script: Remove terminals where VAR number does NOT start with 'V'
-- Run against PRODUCTION database only
-- 
-- IMPORTANT: Review counts before running DELETE

BEGIN;

-- Step 1: Count terminals to be deleted (non-V prefixed)
SELECT 'Terminals to DELETE (non-V prefixed):' as action, COUNT(*) as count
FROM terminals
WHERE var_number IS NOT NULL 
  AND var_number NOT LIKE 'V%';

-- Step 2: Count terminals to KEEP (V-prefixed)
SELECT 'Terminals to KEEP (V-prefixed):' as action, COUNT(*) as count
FROM terminals
WHERE var_number IS NOT NULL 
  AND var_number LIKE 'V%';

-- Step 3: Preview sample of terminals to be deleted (first 20)
SELECT 'SAMPLE TO DELETE' as action, id, var_number, merchant_dba_name, term_number, created_at
FROM terminals
WHERE var_number IS NOT NULL 
  AND var_number NOT LIKE 'V%'
ORDER BY created_at DESC
LIMIT 20;

-- Step 4: DELETE non-V prefixed terminals
-- UNCOMMENT THE LINES BELOW AFTER REVIEWING THE COUNTS ABOVE
-- DELETE FROM terminals
-- WHERE var_number IS NOT NULL 
--   AND var_number NOT LIKE 'V%';

-- Step 5: Verify remaining count
SELECT 'Remaining terminals after cleanup:' as action, COUNT(*) as count
FROM terminals;

COMMIT;
