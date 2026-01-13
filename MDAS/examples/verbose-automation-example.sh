#!/bin/bash

# Example: Automation script that adjusts logging based on system state
# This demonstrates how an AI monitoring system might dynamically control verbose logging

BASE_URL="${MMS_URL:-http://localhost:5000}"
COOKIE_JAR="/tmp/mms-verbose-control.txt"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to login
login() {
  echo -e "${YELLOW}[AUTH]${NC} Authenticating..."
  RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$MMS_USERNAME\",\"password\":\"$MMS_PASSWORD\"}" \
    -c "$COOKIE_JAR")
  
  if echo "$RESPONSE" | grep -q "username"; then
    echo -e "${GREEN}[AUTH]${NC} Login successful"
    return 0
  else
    echo -e "${RED}[AUTH]${NC} Login failed"
    return 1
  fi
}

# Function to set verbose config
set_verbose() {
  local config="$1"
  echo -e "${YELLOW}[CONFIG]${NC} Updating verbose logging: $config"
  
  RESPONSE=$(curl -s -X PUT "$BASE_URL/api/system/verbose-config" \
    -H "Content-Type: application/json" \
    -d "$config" \
    -b "$COOKIE_JAR")
  
  if echo "$RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}[CONFIG]${NC} Verbose logging updated successfully"
    return 0
  else
    echo -e "${RED}[CONFIG]${NC} Failed to update config: $RESPONSE"
    return 1
  fi
}

# Function to get current config
get_config() {
  curl -s -X GET "$BASE_URL/api/system/verbose-config" \
    -b "$COOKIE_JAR" | jq -r '.config'
}

# Main automation logic
main() {
  echo "========================================="
  echo "MMS Verbose Logging Automation Example"
  echo "========================================="
  echo
  
  # Login
  if ! login; then
    echo -e "${RED}[ERROR]${NC} Cannot proceed without authentication"
    exit 1
  fi
  echo
  
  # Example 1: Enable detailed logging when monitoring system health
  echo -e "${YELLOW}[SCENARIO 1]${NC} System Health Check - Enable detailed logging"
  set_verbose '{"tddfProcessing":true,"database":true,"uploader":true}'
  sleep 2
  echo
  
  # Example 2: Reduce noise during normal operation
  echo -e "${YELLOW}[SCENARIO 2]${NC} Normal Operation - Reduce logging noise"
  set_verbose '{"tddfProcessing":false,"database":false,"uploader":false}'
  sleep 2
  echo
  
  # Example 3: Debug authentication issues
  echo -e "${YELLOW}[SCENARIO 3]${NC} Debugging Auth Issues - Enable auth logging"
  set_verbose '{"auth":true,"navigation":true}'
  sleep 2
  echo
  
  # Example 4: Monitor file upload pipeline
  echo -e "${YELLOW}[SCENARIO 4]${NC} Upload Monitoring - Track file processing"
  set_verbose '{"uploader":true,"tddfProcessing":true}'
  sleep 2
  echo
  
  # Example 5: Emergency - Enable all logging
  echo -e "${YELLOW}[SCENARIO 5]${NC} Emergency Mode - Enable ALL logging"
  set_verbose '{"all":true}'
  sleep 2
  echo
  
  # Show current config
  echo -e "${YELLOW}[STATUS]${NC} Current verbose configuration:"
  get_config | jq '.'
  echo
  
  # Reset to defaults
  echo -e "${YELLOW}[CLEANUP]${NC} Resetting to default configuration"
  curl -s -X POST "$BASE_URL/api/system/verbose-config/reset" \
    -b "$COOKIE_JAR" > /dev/null
  echo -e "${GREEN}[CLEANUP]${NC} Reset complete"
  echo
  
  # Cleanup
  rm -f "$COOKIE_JAR"
  
  echo "========================================="
  echo -e "${GREEN}✅ Automation example complete!${NC}"
  echo "========================================="
}

# Check required environment variables
if [ -z "$MMS_USERNAME" ] || [ -z "$MMS_PASSWORD" ]; then
  echo -e "${RED}ERROR:${NC} Required environment variables not set"
  echo
  echo "Please set:"
  echo "  export MMS_USERNAME='your-username'"
  echo "  export MMS_PASSWORD='your-password'"
  echo "  export MMS_URL='http://your-server:5000'  # Optional, defaults to localhost"
  echo
  exit 1
fi

main
