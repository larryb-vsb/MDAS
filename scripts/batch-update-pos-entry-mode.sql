-- ============================================================================
-- Batch Update POS Entry Mode for BOTH Dev and Production Databases
-- ============================================================================
-- This script updates the extracted_fields JSONB column with correct
-- POS Entry Mode values extracted from positions 214-215 of raw_line
-- 
-- USAGE IN DATABASE CONSOLE:
-- 1. Switch to the database you want to update (dev or prod)
-- 2. Run batches manually, one at a time
-- 3. Wait 5-10 seconds between batches to avoid timeout
-- 4. Check progress with the verification queries at the bottom
-- 5. Repeat batches until remaining_to_update = 0
-- ============================================================================

-- ============================================================================
-- DEVELOPMENT DATABASE BATCHES (use dev_tddf_jsonb table)
-- ============================================================================

-- DEV BATCH 1: First 5000 records
UPDATE dev_tddf_jsonb
SET extracted_fields = jsonb_set(
  COALESCE(extracted_fields, '{}'::jsonb),
  '{posEntryMode}',
  to_jsonb(
    LPAD(
      TRIM(SUBSTRING(raw_line FROM 215 FOR 2)),
      2,
      '0'
    )
  )
)
WHERE record_type = 'DT'
  AND id IN (
    SELECT id 
    FROM dev_tddf_jsonb 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2)
    ORDER BY id
    LIMIT 5000
  );

-- WAIT 5-10 SECONDS THEN RUN BATCH 2

-- DEV BATCH 2: Next 5000 records
UPDATE dev_tddf_jsonb
SET extracted_fields = jsonb_set(
  COALESCE(extracted_fields, '{}'::jsonb),
  '{posEntryMode}',
  to_jsonb(
    LPAD(
      TRIM(SUBSTRING(raw_line FROM 215 FOR 2)),
      2,
      '0'
    )
  )
)
WHERE record_type = 'DT'
  AND id IN (
    SELECT id 
    FROM dev_tddf_jsonb 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2)
    ORDER BY id
    LIMIT 5000
  );

-- WAIT 5-10 SECONDS THEN RUN BATCH 3

-- DEV BATCH 3: Next 5000 records
UPDATE dev_tddf_jsonb
SET extracted_fields = jsonb_set(
  COALESCE(extracted_fields, '{}'::jsonb),
  '{posEntryMode}',
  to_jsonb(
    LPAD(
      TRIM(SUBSTRING(raw_line FROM 215 FOR 2)),
      2,
      '0'
    )
  )
)
WHERE record_type = 'DT'
  AND id IN (
    SELECT id 
    FROM dev_tddf_jsonb 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2)
    ORDER BY id
    LIMIT 5000
  );

-- ============================================================================
-- REPEAT DEV BATCH 3 AS NEEDED UNTIL ALL RECORDS ARE UPDATED
-- ============================================================================


-- ============================================================================
-- PRODUCTION DATABASE BATCHES (use tddf_jsonb table - NO dev_ prefix)
-- ============================================================================

-- PROD BATCH 1: First 5000 records
UPDATE tddf_jsonb
SET extracted_fields = jsonb_set(
  COALESCE(extracted_fields, '{}'::jsonb),
  '{posEntryMode}',
  to_jsonb(
    LPAD(
      TRIM(SUBSTRING(raw_line FROM 215 FOR 2)),
      2,
      '0'
    )
  )
)
WHERE record_type = 'DT'
  AND id IN (
    SELECT id 
    FROM tddf_jsonb 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2
           OR extracted_fields->>'posEntryMode' LIKE '%-%'
           OR extracted_fields->>'posEntryMode' ~ '[^0-9]')
    ORDER BY id
    LIMIT 5000
  );

-- WAIT 5-10 SECONDS THEN RUN BATCH 2

-- PROD BATCH 2: Next 5000 records
UPDATE tddf_jsonb
SET extracted_fields = jsonb_set(
  COALESCE(extracted_fields, '{}'::jsonb),
  '{posEntryMode}',
  to_jsonb(
    LPAD(
      TRIM(SUBSTRING(raw_line FROM 215 FOR 2)),
      2,
      '0'
    )
  )
)
WHERE record_type = 'DT'
  AND id IN (
    SELECT id 
    FROM tddf_jsonb 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2
           OR extracted_fields->>'posEntryMode' LIKE '%-%'
           OR extracted_fields->>'posEntryMode' ~ '[^0-9]')
    ORDER BY id
    LIMIT 5000
  );

-- WAIT 5-10 SECONDS THEN RUN BATCH 3

-- PROD BATCH 3: Next 5000 records
UPDATE tddf_jsonb
SET extracted_fields = jsonb_set(
  COALESCE(extracted_fields, '{}'::jsonb),
  '{posEntryMode}',
  to_jsonb(
    LPAD(
      TRIM(SUBSTRING(raw_line FROM 215 FOR 2)),
      2,
      '0'
    )
  )
)
WHERE record_type = 'DT'
  AND id IN (
    SELECT id 
    FROM tddf_jsonb 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2
           OR extracted_fields->>'posEntryMode' LIKE '%-%'
           OR extracted_fields->>'posEntryMode' ~ '[^0-9]')
    ORDER BY id
    LIMIT 5000
  );

-- ============================================================================
-- REPEAT PROD BATCH 3 AS NEEDED UNTIL ALL RECORDS ARE UPDATED
-- ============================================================================


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these on DEVELOPMENT database (dev_tddf_jsonb)

-- DEV: Check how many records still need updating
SELECT COUNT(*) as remaining_to_update
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND (extracted_fields->>'posEntryMode' IS NULL 
       OR LENGTH(extracted_fields->>'posEntryMode') < 2
       OR extracted_fields->>'posEntryMode' LIKE '%-%'
       OR extracted_fields->>'posEntryMode' ~ '[^0-9]');

-- DEV: Check distribution of POS Entry Mode values (should show 2-digit codes)
SELECT 
  extracted_fields->>'posEntryMode' as pos_entry_mode,
  COUNT(*) as count
FROM dev_tddf_jsonb 
WHERE record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
GROUP BY extracted_fields->>'posEntryMode'
ORDER BY count DESC
LIMIT 20;

-- ============================================================================
-- Run these on PRODUCTION database (tddf_jsonb - NO dev_ prefix)

-- PROD: Check how many records still need updating
SELECT COUNT(*) as remaining_to_update
FROM tddf_jsonb
WHERE record_type = 'DT'
  AND (extracted_fields->>'posEntryMode' IS NULL 
       OR LENGTH(extracted_fields->>'posEntryMode') < 2
       OR extracted_fields->>'posEntryMode' LIKE '%-%'
       OR extracted_fields->>'posEntryMode' ~ '[^0-9]');

-- PROD: Check distribution of POS Entry Mode values (should show 2-digit codes)
SELECT 
  extracted_fields->>'posEntryMode' as pos_entry_mode,
  COUNT(*) as count
FROM tddf_jsonb 
WHERE record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
GROUP BY extracted_fields->>'posEntryMode'
ORDER BY count DESC
LIMIT 20;

-- 3. Sample some updated records to verify format
SELECT 
  id,
  filename,
  line_number,
  extracted_fields->>'posEntryMode' as pos_entry_mode,
  SUBSTRING(raw_line FROM 215 FOR 2) as raw_value
FROM dev_tddf_jsonb
WHERE record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
LIMIT 10;

-- 4. Get total progress
SELECT 
  COUNT(*) as total_dt_records,
  COUNT(*) FILTER (WHERE extracted_fields->>'posEntryMode' IS NOT NULL) as updated,
  COUNT(*) FILTER (WHERE extracted_fields->>'posEntryMode' IS NULL) as null_values,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE extracted_fields->>'posEntryMode' IS NOT NULL) / COUNT(*),
    2
  ) as percent_complete
FROM dev_tddf_jsonb
WHERE record_type = 'DT';
