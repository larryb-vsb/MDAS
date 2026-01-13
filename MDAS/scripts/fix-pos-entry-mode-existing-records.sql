-- Fix POS Entry Mode for existing TDDF records
-- Re-extracts from correct position 214-215 instead of wrong 230-231
-- Adds zero-padding to ensure 2-digit format
-- 
-- IMPORTANT: Run this in batches by upload_id to avoid timeouts

-- Step 1: Preview - Check how many records need fixing
SELECT 
  COUNT(*) as total_dt_records,
  COUNT(DISTINCT upload_id) as affected_files
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND length(raw_line) >= 215
  AND extracted_fields IS NOT NULL;

-- Step 2: List affected files
SELECT DISTINCT upload_id
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND length(raw_line) >= 215
  AND extracted_fields IS NOT NULL
ORDER BY upload_id
LIMIT 20;

-- Step 3: Fix ONE file at a time (replace UPLOAD_ID with actual ID from Step 2)
-- Example: 'uploader_1763482260876_ngrmrkbmu'
UPDATE dev_tddf_jsonb
SET extracted_fields = jsonb_set(
  extracted_fields,
  '{posEntryMode}',
  CASE 
    WHEN trim(substring(raw_line from 214 for 2)) = '' THEN 'null'::jsonb
    ELSE to_jsonb(lpad(trim(substring(raw_line from 214 for 2)), 2, '0'))
  END,
  true
)
WHERE upload_id = 'UPLOAD_ID_HERE'
  AND record_type = 'DT'
  AND length(raw_line) >= 215
  AND extracted_fields IS NOT NULL;

-- Step 4: Verify the fix for one file
SELECT 
  extracted_fields->>'posEntryMode' as pos_entry_mode_fixed,
  COUNT(*) as count
FROM dev_tddf_jsonb 
WHERE upload_id = 'UPLOAD_ID_HERE'
  AND record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
GROUP BY extracted_fields->>'posEntryMode'
ORDER BY count DESC;

-- Step 5: Compare before/after for verification
-- Should show values like '05', '07', '01' instead of '5-', 'SP', 'BA'
