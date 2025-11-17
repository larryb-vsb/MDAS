#!/bin/bash

echo "🧪 Starting TDDF Encoding Test Process"
echo "📋 Target: 29-line file encoding to JSONB with JSON viewer verification"

UPLOAD_ID="uploader_1753770043406_rxjr75vpv"
echo "📁 Testing file: $UPLOAD_ID"

# Function to check current status
check_status() {
  echo "📊 Checking current status..."
  psql $DATABASE_URL -c "SELECT current_phase, encoding_status, json_records_created FROM dev_uploader_uploads WHERE id = '$UPLOAD_ID';"
}

# Function to check JSONB records
check_jsonb_records() {
  echo "🔍 Checking JSONB records..."
  psql $DATABASE_URL -c "SELECT COUNT(*) as record_count FROM dev_uploader_tddf_jsonb_records WHERE upload_id = '$UPLOAD_ID';"
}

# Function to cancel encoding if needed
cancel_encoding() {
  echo "🛑 Canceling encoding..."
  psql $DATABASE_URL -c "UPDATE dev_uploader_uploads SET current_phase = 'identified', encoding_status = NULL, processing_notes = COALESCE(processing_notes, '') || ' | Encoding canceled for testing' WHERE id = '$UPLOAD_ID';"
}

# Function to start encoding
start_encoding() {
  echo "🚀 Starting encoding process..."
  psql $DATABASE_URL -c "UPDATE dev_uploader_uploads SET current_phase = 'encoding', encoding_status = 'starting', last_updated = NOW() WHERE id = '$UPLOAD_ID';"
}

# Initial status check
echo "1️⃣ Initial Status Check"
check_status

# Reset to identified phase
echo ""
echo "2️⃣ Resetting to Identified Phase"
cancel_encoding

# Start encoding
echo ""
echo "3️⃣ Starting Encoding Process"
start_encoding

# Check status after starting
echo ""
echo "4️⃣ Status After Starting Encoding"
check_status

# Wait and check progress
echo ""
echo "5️⃣ Waiting 10 seconds for encoding to progress..."
sleep 10
check_status

# Check JSONB records
echo ""
echo "6️⃣ Checking JSONB Records Created"
check_jsonb_records

# Test JSON viewer endpoint
echo ""
echo "7️⃣ Testing JSON Viewer Data Availability"
echo "Making API call to check JSON data endpoint..."

# Try to make authenticated API call
curl -s "http://localhost:5000/api/uploader/$UPLOAD_ID/jsonb-data" | head -c 200
echo ""

echo ""
echo "✅ Encoding test process completed!"
echo "📋 Please check the results above to verify:"
echo "   - File moved through encoding phases correctly"
echo "   - 29 JSONB records were created"
echo "   - JSON viewer data is accessible"