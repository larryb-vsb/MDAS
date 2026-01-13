#!/bin/bash
# ============================================================================
# Automated POS Entry Mode Batch Update Script
# ============================================================================
# This script automatically runs batch updates with delays to avoid timeouts
# 
# USAGE:
#   chmod +x scripts/auto-update-pos-entry-mode.sh
#   ./scripts/auto-update-pos-entry-mode.sh [dev|prod] [batch_size] [delay_seconds]
#
# EXAMPLES:
#   ./scripts/auto-update-pos-entry-mode.sh dev 5000 10
#   ./scripts/auto-update-pos-entry-mode.sh prod 3000 15
# ============================================================================

# Configuration
DATABASE=${1:-dev}  # dev or prod
BATCH_SIZE=${2:-5000}
DELAY=${3:-10}  # seconds between batches

# Database connection (you need to set these environment variables)
if [ "$DATABASE" = "prod" ]; then
    TABLE_NAME="tddf_jsonb"
    DB_URL="${NEON_PROD_DATABASE_URL}"
    echo "🚀 Running on PRODUCTION database (tddf_jsonb)"
else
    TABLE_NAME="dev_tddf_jsonb"
    DB_URL="${NEON_DEV_DATABASE_URL}"
    echo "🔧 Running on DEVELOPMENT database (dev_tddf_jsonb)"
fi

if [ -z "$DB_URL" ]; then
    echo "❌ ERROR: Database URL not set!"
    echo "   Please set NEON_DEV_DATABASE_URL or NEON_PROD_DATABASE_URL"
    exit 1
fi

echo "⚙️  Configuration:"
echo "   Database: $DATABASE"
echo "   Table: $TABLE_NAME"
echo "   Batch size: $BATCH_SIZE"
echo "   Delay between batches: ${DELAY}s"
echo ""

# Function to run a single batch update
run_batch() {
    local batch_num=$1
    
    echo "📦 Running batch $batch_num..."
    
    # SQL update command
    psql "$DB_URL" << EOF
UPDATE $TABLE_NAME
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
    FROM $TABLE_NAME 
    WHERE record_type = 'DT'
      AND (extracted_fields->>'posEntryMode' IS NULL 
           OR LENGTH(extracted_fields->>'posEntryMode') < 2
           OR extracted_fields->>'posEntryMode' LIKE '%-%'
           OR extracted_fields->>'posEntryMode' ~ '[^0-9]')
    ORDER BY id
    LIMIT $BATCH_SIZE
  );
EOF
    
    if [ $? -eq 0 ]; then
        echo "✅ Batch $batch_num completed successfully"
    else
        echo "❌ Batch $batch_num failed!"
        return 1
    fi
}

# Function to check remaining records
check_remaining() {
    echo ""
    echo "🔍 Checking remaining records..."
    
    psql "$DB_URL" -t << EOF
SELECT COUNT(*) as remaining_to_update
FROM $TABLE_NAME
WHERE record_type = 'DT'
  AND (extracted_fields->>'posEntryMode' IS NULL 
       OR LENGTH(extracted_fields->>'posEntryMode') < 2
       OR extracted_fields->>'posEntryMode' LIKE '%-%'
       OR extracted_fields->>'posEntryMode' ~ '[^0-9]');
EOF
}

# Main loop
echo "🚀 Starting batch updates..."
echo ""

batch_count=0
remaining=$(check_remaining | tr -d ' ')

if [ -z "$remaining" ]; then
    echo "❌ ERROR: Could not query database"
    exit 1
fi

echo "📊 Total records to update: $remaining"
echo ""

while [ "$remaining" -gt 0 ]; do
    batch_count=$((batch_count + 1))
    
    run_batch $batch_count
    
    if [ $? -ne 0 ]; then
        echo "❌ Update failed at batch $batch_count"
        exit 1
    fi
    
    # Check how many are left
    remaining=$(check_remaining | tr -d ' ')
    
    if [ "$remaining" -gt 0 ]; then
        echo "⏳ Waiting ${DELAY} seconds before next batch..."
        echo "   Remaining: $remaining records"
        echo ""
        sleep $DELAY
    fi
done

echo ""
echo "🎉 All batches completed successfully!"
echo ""
echo "📊 Final verification:"

# Show distribution of values
psql "$DB_URL" << EOF
SELECT 
  extracted_fields->>'posEntryMode' as pos_entry_mode,
  COUNT(*) as count
FROM $TABLE_NAME 
WHERE record_type = 'DT'
  AND extracted_fields->>'posEntryMode' IS NOT NULL
GROUP BY extracted_fields->>'posEntryMode'
ORDER BY count DESC
LIMIT 20;
EOF

echo ""
echo "✅ Update complete! All POS Entry Mode values should now be 2-digit codes."
