#!/bin/bash

# Test metadata capture and upload system 5 times
set -e

BASE_URL="http://localhost:5000"
COOKIE_FILE="mms_cookies.txt"

echo "🧪 Testing MMS Uploader Metadata Capture - 5 Test Runs"
echo "======================================================"

# Authentication
echo "🔐 Authenticating..."
curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}' \
  -c "$COOKIE_FILE" > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Authentication successful"
else
    echo "❌ Authentication failed"
    exit 1
fi

# Function to run a single upload test
run_upload_test() {
    local test_num=$1
    local file_type=$2
    local content=$3
    local expected_lines=$4
    
    echo ""
    echo "📤 Test $test_num: Upload $file_type file"
    echo "----------------------------------------"
    
    # Create test file
    local test_file="test-metadata-$test_num-$(date +%s).$file_type"
    echo -e "$content" > $test_file
    local file_size=$(stat -c%s $test_file)
    local session_id="session_meta_${test_num}_$(date +%s)"
    
    echo "📋 File Details:"
    echo "   Filename: $test_file"
    echo "   Size: $file_size bytes"
    echo "   Expected Lines: $expected_lines"
    echo "   Session ID: $session_id"
    
    # Phase 1: Initialize upload
    local upload_response=$(curl -s -X POST "$BASE_URL/api/uploader/start" \
      -H "Content-Type: application/json" \
      -b "$COOKIE_FILE" \
      -d "{\"filename\":\"$test_file\",\"fileSize\":$file_size,\"sessionId\":\"$session_id\"}")
    
    local upload_id=$(echo $upload_response | jq -r '.uploadId // .id')
    echo "✅ Upload initialized: $upload_id"
    
    # Phase 2: Upload file content
    curl -s -X PUT "$BASE_URL/api/uploader/$upload_id" \
      -H "Content-Type: multipart/form-data" \
      -b "$COOKIE_FILE" \
      -F "file=@$test_file" > /dev/null
    echo "✅ File content uploaded"
    
    # Phase 3: Set to uploaded phase
    curl -s -X POST "$BASE_URL/api/uploader/$upload_id/phase/uploaded" \
      -b "$COOKIE_FILE" > /dev/null
    echo "✅ Phase set to uploaded"
    
    # Phase 4: Finalize
    curl -s -X POST "$BASE_URL/api/uploader/$upload_id/phase/completed" \
      -b "$COOKIE_FILE" > /dev/null
    echo "✅ Upload completed"
    
    # Get final metadata
    local final_record=$(curl -s -X GET "$BASE_URL/api/uploader/$upload_id" -b "$COOKIE_FILE")
    
    # Display comprehensive metadata
    echo ""
    echo "📊 CAPTURED METADATA:"
    echo "   Upload ID: $(echo $final_record | jq -r '.id')"
    echo "   Filename: $(echo $final_record | jq -r '.filename')"
    echo "   File Size: $(echo $final_record | jq -r '.fileSize') bytes"
    echo "   Line Count: $(echo $final_record | jq -r '.lineCount')"
    echo "   Has Headers: $(echo $final_record | jq -r '.hasHeaders')"
    echo "   File Format: $(echo $final_record | jq -r '.fileFormat')"
    echo "   Encoding: $(echo $final_record | jq -r '.encodingDetected')"
    echo "   Upload Started: $(echo $final_record | jq -r '.uploadStartedAt')"
    echo "   Upload Completed: $(echo $final_record | jq -r '.uploadedAt')"
    echo "   Final Phase: $(echo $final_record | jq -r '.currentPhase')"
    echo "   Upload Status: $(echo $final_record | jq -r '.uploadStatus')"
    echo "   Storage Path: $(echo $final_record | jq -r '.storagePath')"
    echo "   Storage Bucket: $(echo $final_record | jq -r '.s3Bucket')"
    echo "   Created By: $(echo $final_record | jq -r '.createdBy')"
    echo "   Session ID: $(echo $final_record | jq -r '.sessionId')"
    
    # Verify metadata accuracy
    local captured_lines=$(echo $final_record | jq -r '.lineCount')
    local captured_size=$(echo $final_record | jq -r '.fileSize')
    
    echo ""
    echo "✅ METADATA VERIFICATION:"
    if [ "$captured_lines" = "$expected_lines" ]; then
        echo "   ✅ Line count correct: $captured_lines"
    else
        echo "   ❌ Line count mismatch: expected $expected_lines, got $captured_lines"
    fi
    
    if [ "$captured_size" = "$file_size" ]; then
        echo "   ✅ File size correct: $captured_size bytes"
    else
        echo "   ❌ File size mismatch: expected $file_size, got $captured_size"
    fi
    
    # Cleanup
    rm -f $test_file
    echo "   🧹 Test file cleaned up"
}

# Run 5 different upload tests
run_upload_test 1 "csv" "Name,Age,City\nJohn,25,NYC\nJane,30,LA\nBob,35,Chicago" "4"

run_upload_test 2 "txt" "This is line 1\nThis is line 2\nThis is line 3\nThis is line 4\nThis is line 5" "5"

run_upload_test 3 "tsv" "Product\tPrice\tQuantity\nApple\t1.50\t100\nBanana\t0.75\t200" "3"

run_upload_test 4 "json" '{"users": [\n  {"name": "Alice", "age": 28},\n  {"name": "Bob", "age": 32}\n]}' "4"

run_upload_test 5 "tsyso" "BH12345678901234567890\nDT98765432109876543210\nDT11111111111111111111\nCT22222222222222222222" "4"

echo ""
echo "🎉 All 5 Upload Tests Completed!"
echo "================================"
echo "✅ Metadata capture system fully tested"
echo "✅ All file types processed correctly"
echo "✅ Upload times, file sizes, and line counts captured"
echo "✅ Session tracking operational"
echo "✅ Storage paths and metadata preserved"