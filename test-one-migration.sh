#!/bin/bash

# Test migration of one large June table to demonstrate the process
# We'll use the largest table: dev_tddf1_file_vermntsb_6759_tddf_2400_06022025_001424 (1197 MB)

echo "🎯 Testing migration of largest June table (1197 MB)"
echo "📊 This should recover approximately 500-600 MB of database space"
echo ""

# Check current table size
echo "📏 Current table size:"
psql $DATABASE_URL -c "
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.'||tablename)) as current_size,
  pg_total_relation_size('public.'||tablename) as bytes
FROM pg_tables 
WHERE tablename = 'dev_tddf1_file_vermntsb_6759_tddf_2400_06022025_001424';"

echo ""
echo "🔍 Checking raw_line column content:"
psql $DATABASE_URL -c "
SELECT 
  COUNT(*) as total_records,
  COUNT(CASE WHEN raw_line IS NOT NULL AND raw_line != '' THEN 1 END) as records_with_raw_line,
  AVG(LENGTH(raw_line)) as avg_raw_line_length
FROM dev_tddf1_file_vermntsb_6759_tddf_2400_06022025_001424 
WHERE raw_line IS NOT NULL 
LIMIT 5000;" # Sample to avoid long query

echo ""
echo "✅ Pre-migration verification complete"
echo "📝 Ready to test migration through the UI at /hybrid-migration"
echo ""
echo "Expected results:"
echo "- Raw line data moved to object storage"
echo "- Database raw_line column set to NULL"
echo "- ~50% space reduction for this table"
echo "- All structured data remains in database for fast queries"