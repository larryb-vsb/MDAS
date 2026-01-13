#!/bin/bash

# Test script for verbose logging API endpoints
# Handles authentication and tests all endpoints

BASE_URL="http://localhost:5000"
COOKIE_JAR="/tmp/mms-test-cookies.txt"

echo "🧪 Testing Verbose Logging API Endpoints"
echo "========================================="
echo

# Step 1: Login to get session
echo "1️⃣  Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"radmin","password":"bP:cZk4\"cu>zZ3,%TaIJi|wbhqpoF~"}' \
  -c "$COOKIE_JAR")

if echo "$LOGIN_RESPONSE" | grep -q "username"; then
  echo "   ✅ Login successful"
else
  echo "   ❌ Login failed: $LOGIN_RESPONSE"
  exit 1
fi
echo

# Step 2: Get current config
echo "2️⃣  Getting current verbose config..."
GET_RESPONSE=$(curl -s -X GET "$BASE_URL/api/system/verbose-config" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR")

echo "   Current config:"
echo "$GET_RESPONSE" | jq -r '.config | to_entries | .[] | "   - \(.key): \(.value)"' 2>/dev/null || echo "   $GET_RESPONSE"
echo

# Step 3: Update config (turn off tddfProcessing)
echo "3️⃣  Updating config (turning OFF tddfProcessing)..."
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/api/system/verbose-config" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"tddfProcessing":false}')

if echo "$UPDATE_RESPONSE" | grep -q "success"; then
  echo "   ✅ Config updated successfully"
  echo "   Updated config:"
  echo "$UPDATE_RESPONSE" | jq -r '.config | to_entries | .[] | "   - \(.key): \(.value)"' 2>/dev/null
else
  echo "   ❌ Update failed: $UPDATE_RESPONSE"
fi
echo

# Step 4: Verify the change
echo "4️⃣  Verifying config change..."
VERIFY_RESPONSE=$(curl -s -X GET "$BASE_URL/api/system/verbose-config" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR")

TDDF_VALUE=$(echo "$VERIFY_RESPONSE" | jq -r '.config.tddfProcessing' 2>/dev/null)
if [ "$TDDF_VALUE" = "false" ]; then
  echo "   ✅ Verified: tddfProcessing is now false"
else
  echo "   ⚠️  Expected false, got: $TDDF_VALUE"
fi
echo

# Step 5: Test setting multiple values
echo "5️⃣  Testing multiple value updates..."
MULTI_RESPONSE=$(curl -s -X PUT "$BASE_URL/api/system/verbose-config" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"uploader":true,"database":true,"tddfProcessing":false}')

if echo "$MULTI_RESPONSE" | grep -q "success"; then
  echo "   ✅ Multiple updates successful"
  echo "   New config:"
  echo "$MULTI_RESPONSE" | jq -r '.config | to_entries | .[] | "   - \(.key): \(.value)"' 2>/dev/null
else
  echo "   ❌ Multi-update failed: $MULTI_RESPONSE"
fi
echo

# Step 6: Reset to defaults
echo "6️⃣  Resetting to default config..."
RESET_RESPONSE=$(curl -s -X POST "$BASE_URL/api/system/verbose-config/reset" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR")

if echo "$RESET_RESPONSE" | grep -q "success"; then
  echo "   ✅ Reset successful"
  echo "   Default config:"
  echo "$RESET_RESPONSE" | jq -r '.config | to_entries | .[] | "   - \(.key): \(.value)"' 2>/dev/null
else
  echo "   ❌ Reset failed: $RESET_RESPONSE"
fi
echo

# Step 7: Test invalid key (should fail)
echo "7️⃣  Testing invalid key (should fail)..."
INVALID_RESPONSE=$(curl -s -X PUT "$BASE_URL/api/system/verbose-config" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  -d '{"invalidKey":true}')

if echo "$INVALID_RESPONSE" | grep -q "Invalid configuration keys"; then
  echo "   ✅ Invalid key properly rejected"
else
  echo "   ⚠️  Expected validation error, got: $INVALID_RESPONSE"
fi
echo

# Cleanup
rm -f "$COOKIE_JAR"

echo "========================================="
echo "✅ All tests completed!"
echo
echo "💡 API Usage Examples:"
echo
echo "   Get config:"
echo "   curl -X GET $BASE_URL/api/system/verbose-config -b cookies.txt"
echo
echo "   Update config:"
echo "   curl -X PUT $BASE_URL/api/system/verbose-config \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"tddfProcessing\":false,\"uploader\":true}' -b cookies.txt"
echo
echo "   Reset config:"
echo "   curl -X POST $BASE_URL/api/system/verbose-config/reset -b cookies.txt"
echo
