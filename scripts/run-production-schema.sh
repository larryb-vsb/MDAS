#!/bin/bash

# Run production schema against production database
# Logs to file AND displays on screen

# Change to project root directory
cd "$(dirname "$0")/.." || exit 1

LOG_FILE="scripts/production-schema-run-$(date +%Y-%m-%d_%H-%M-%S).log"

echo "Running sql/production-schema.sql against production database..."
echo "Logging to: $LOG_FILE"
echo ""

# Run psql and capture both stdout and stderr to log file + screen
psql "$NEON_PROD_DATABASE_URL" -f sql/production-schema.sql 2>&1 | tee "$LOG_FILE"

echo ""
echo "========================================="
echo "Script complete! Log saved to: $LOG_FILE"
echo "========================================="

# Show summary of errors
ERROR_COUNT=$(grep -c "ERROR:" "$LOG_FILE" 2>/dev/null || echo "0")
ERROR_COUNT=$(echo "$ERROR_COUNT" | tr -d '\n\r' | xargs)
echo "Total errors: $ERROR_COUNT"

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo ""
    echo "Errors found:"
    grep "ERROR:" "$LOG_FILE" | head -10
fi
