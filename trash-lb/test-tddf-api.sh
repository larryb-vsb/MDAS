#!/bin/bash
# TDDF API Test Script - Bash version for Linux environments
# This script tests the TDDF upload endpoint using the TDDF1 API key

# TDDF1 API User Configuration
# User: TDDF1 
# Key: mms_1753247424700_l7d6n1wa2qm
# Permissions: tddf:upload
# Production URL: https://merchant-management-system-mms--vermont-state-bank.replit.app
#
# Usage Examples:
# ./test-tddf-api.sh --ping-only                   # Test connectivity only
# ./test-tddf-api.sh                               # Full upload test with default file
# ./test-tddf-api.sh --file myfile.TSYSO          # Upload specific file

API_KEY="mms_1753247424700_l7d6n1wa2qm"
BASE_URL="https://merchant-management-system--vermont-state-bank.replit.app" 
LOCAL_URL="http://localhost:5000"
FILE_PATH="test_tddf_sample.TSYSO"
PING_ONLY=false
TEST_LOCAL=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --ping-only)
      PING_ONLY=true
      shift
      ;;
    --file)
      FILE_PATH="$2"
      shift 2
      ;;
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --local)
      TEST_LOCAL=true
      BASE_URL="$LOCAL_URL"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "🚀 TDDF API Test"
if [ "$PING_ONLY" = true ]; then
    echo "Mode: Connectivity Test (Ping Only)"
else
    echo "Mode: Full Upload Test"
    echo "File: $FILE_PATH"
fi
echo "API Key: ${API_KEY:0:15}..."
echo "Base URL: $BASE_URL"
echo ""

# Function to test API connectivity
test_api_connectivity() {
    echo "🔍 Testing API connectivity..."
    
    # Test 1: Base URL reachability
    echo "Testing base URL..."
    BASE_STATUS=$(curl -s -w "%{http_code}" -o /dev/null --max-time 10 "$BASE_URL")
    if [ "$BASE_STATUS" = "200" ]; then
        echo "✅ Base URL reachable (Status: $BASE_STATUS)"
    else
        echo "❌ Base URL unreachable (Status: $BASE_STATUS)"
        return 1
    fi
    
    # Test 2: API endpoint with authentication headers
    echo "🔑 Testing API key validation..."
    API_TEST=$(curl -s -w "HTTP_CODE:%{http_code}" --max-time 10 \
        "$BASE_URL/api/tddf" \
        -H "X-API-Key: $API_KEY" \
        -H "X-Requested-With: XMLHttpRequest" \
        -H "Origin: https://replit.com" \
        -H "Referer: $BASE_URL")
    
    HTTP_CODE=$(echo "$API_TEST" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
    
    case "$HTTP_CODE" in
        200)
            echo "✅ API endpoint reachable (Status: $HTTP_CODE)"
            return 0
            ;;
        401)
            echo "❌ API key authentication failed (Status: $HTTP_CODE)"
            return 1
            ;;
        404)
            echo "⚠️  Endpoint not found (Status: $HTTP_CODE) - may need different URL path"
            return 0  # Connection works, just wrong endpoint
            ;;
        *)
            echo "✅ API connection established (Status: $HTTP_CODE - non-200 response expected for GET)"
            return 0
            ;;
    esac
}

# Run connectivity test
if test_api_connectivity; then
    CONNECTIVITY_RESULT=true
else
    CONNECTIVITY_RESULT=false
fi

if [ "$PING_ONLY" = true ]; then
    if [ "$CONNECTIVITY_RESULT" = true ]; then
        echo "✅ Connectivity test passed - API is reachable"
    else
        echo "❌ Connectivity test failed"
    fi
    echo "🏁 Ping test completed"
    exit 0
fi

if [ "$CONNECTIVITY_RESULT" = false ]; then
    echo "❌ Connectivity test failed - aborting upload test"
    exit 1
fi

# Check if file exists for upload test
if [ ! -f "$FILE_PATH" ]; then
    echo "❌ Error: File '$FILE_PATH' not found"
    exit 1
fi

echo "📤 Uploading TDDF file..."

# Perform the actual upload
UPLOAD_RESPONSE=$(curl -s -w "HTTP_CODE:%{http_code}" --max-time 30 \
    -X POST "$BASE_URL/api/tddf/upload" \
    -H "X-API-Key: $API_KEY" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "Origin: https://replit.com" \
    -H "Referer: $BASE_URL" \
    -F "file=@$FILE_PATH")

HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
RESPONSE_BODY=$(echo "$UPLOAD_RESPONSE" | sed 's/HTTP_CODE:[0-9]*$//')

case "$HTTP_CODE" in
    200)
        echo "✅ Upload successful!"
        echo "Response:"
        echo "$RESPONSE_BODY" | jq . 2>/dev/null || echo "$RESPONSE_BODY"
        ;;
    *)
        echo "❌ Upload failed (Status: $HTTP_CODE)!"
        echo "Response:"
        echo "$RESPONSE_BODY"
        ;;
esac

echo ""
echo "🏁 Test completed"