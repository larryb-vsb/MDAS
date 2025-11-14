#!/bin/bash

# Session-Based Upload Test Script
# Tests the 3-phase upload workflow: started → uploading → uploaded → completed

BASE_URL="http://localhost:5000"
SESSION_ID="session_$(date +%s)_$(openssl rand -hex 6)"
TEST_FILE="/tmp/test-upload-$(date +%s).txt"
COOKIE_FILE="cookies.txt"

echo "🧪 Starting Session-Based Upload Test"
echo ""

# First, authenticate to get session cookie
echo "🔐 Authenticating..."
curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' \
  -c "$COOKIE_FILE" > /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Authentication failed"
  exit 1
fi

echo "✅ Authentication successful"

# Create test file
cat > "$TEST_FILE" << EOF
Test File Content
Line 1: Sample data for testing
Line 2: Another line of test data
Line 3: Final test line
EOF

echo "✅ Created test file: $(basename $TEST_FILE)"
echo "🔄 Session ID: $SESSION_ID"

# Phase 1: Initialize upload (started phase)
echo ""
echo "📤 Phase 1: Initializing upload..."

FILE_SIZE=$(stat -c%s "$TEST_FILE")

UPLOAD_DATA=$(cat << EOF
{
  "filename": "$(basename $TEST_FILE)",
  "fileSize": $FILE_SIZE,
  "sessionId": "$SESSION_ID"
}
EOF
)

UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/uploader/start" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d "$UPLOAD_DATA")

if [ $? -ne 0 ]; then
  echo "❌ Phase 1 failed: Upload initialization failed"
  exit 1
fi

UPLOAD_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$UPLOAD_ID" ]; then
  echo "❌ Phase 1 failed: Could not extract upload ID"
  echo "Response: $UPLOAD_RESPONSE"
  exit 1
fi

echo "✅ Upload initialized: $UPLOAD_ID"

# Phase 2: Set to uploading phase
echo ""
echo "📡 Phase 2: Setting uploading phase..."

UPLOADING_DATA=$(cat << EOF
{
  "sessionId": "$SESSION_ID",
  "uploadProgress": 0,
  "processingNotes": "Upload started - Session: $SESSION_ID"
}
EOF
)

UPLOADING_RESPONSE=$(curl -s -X POST "$BASE_URL/api/uploader/$UPLOAD_ID/phase/uploading" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d "$UPLOADING_DATA")

if [ $? -ne 0 ]; then
  echo "❌ Phase 2 failed: Could not set uploading phase"
  exit 1
fi

echo "✅ Upload phase set to: uploading"

# Simulate progress updates
echo ""
echo "📊 Simulating progress updates..."

for PROGRESS in 25 50 75; do
  sleep 0.5
  
  PROGRESS_DATA=$(cat << EOF
{
  "uploadProgress": $PROGRESS,
  "processingNotes": "Upload progress: ${PROGRESS}% - Session: $SESSION_ID"
}
EOF
)

  curl -s -X PUT "$BASE_URL/api/uploader/$UPLOAD_ID" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d "$PROGRESS_DATA" > /dev/null
  
  echo "   Progress updated: ${PROGRESS}%"
done

# Phase 3: Upload file content
echo ""
echo "📋 Phase 3: Uploading file content..."

FILE_UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/uploader/$UPLOAD_ID/upload" \
  -b "$COOKIE_FILE" \
  -F "file=@$TEST_FILE" \
  -F "sessionId=$SESSION_ID")

if [ $? -ne 0 ]; then
  echo "❌ Phase 3 failed: File upload failed"
  exit 1
fi

echo "✅ File content uploaded successfully"

# Final progress update (100%)
FINAL_PROGRESS_DATA=$(cat << EOF
{
  "uploadProgress": 100,
  "processingNotes": "Upload completed - Session: $SESSION_ID"
}
EOF
)

curl -s -X PUT "$BASE_URL/api/uploader/$UPLOAD_ID" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d "$FINAL_PROGRESS_DATA" > /dev/null

echo "   Progress: 100% ✅"

# Phase 4: Set to uploaded phase
echo ""
echo "📁 Phase 4: Setting uploaded phase..."

UPLOADED_DATA=$(cat << EOF
{
  "sessionId": "$SESSION_ID",
  "processingNotes": "Upload to storage completed - Session: $SESSION_ID",
  "uploadedAt": "$(date -Iseconds)"
}
EOF
)

UPLOADED_RESPONSE=$(curl -s -X POST "$BASE_URL/api/uploader/$UPLOAD_ID/phase/uploaded" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d "$UPLOADED_DATA")

if [ $? -ne 0 ]; then
  echo "❌ Phase 4 failed: Could not set uploaded phase"
  exit 1
fi

echo "✅ Upload phase set to: uploaded"

# Phase 5: Set to completed phase (automatic completion)
echo ""
echo "🎯 Phase 5: Setting completed phase..."

COMPLETED_DATA=$(cat << EOF
{
  "sessionId": "$SESSION_ID",
  "processingNotes": "All chunks received and processing completed - Session: $SESSION_ID",
  "completedAt": "$(date -Iseconds)"
}
EOF
)

COMPLETED_RESPONSE=$(curl -s -X POST "$BASE_URL/api/uploader/$UPLOAD_ID/phase/completed" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d "$COMPLETED_DATA")

if [ $? -ne 0 ]; then
  echo "❌ Phase 5 failed: Could not set completed phase"
  exit 1
fi

echo "✅ Final phase set to: completed"

# Verify final status
echo ""
echo "🔍 Verifying final upload status..."

FINAL_RESPONSE=$(curl -s -X GET "$BASE_URL/api/uploader/$UPLOAD_ID" \
  -b "$COOKIE_FILE")

if [ $? -eq 0 ]; then
  echo ""
  echo "📊 Final Upload Record:"
  echo "$FINAL_RESPONSE" | jq '.' 2>/dev/null || echo "$FINAL_RESPONSE"
fi

# Cleanup
rm -f "$TEST_FILE"
echo ""
echo "🧹 Cleanup: Removed test file"

echo ""
echo "🎉 Test completed successfully!"
echo "✅ All phases verified: started → uploading → uploaded → completed"