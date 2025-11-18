#!/bin/bash

# Run production schema against production database
# Logs to file AND displays on screen

# Change to project root directory
cd "$(dirname "$0")/.." || exit 1

# Ensure logs directory exists
mkdir -p logs

LOG_FILE="logs/production-schema-run-$(date +%Y-%m-%d_%H-%M-%S).log"

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
else
    echo ""
    echo "Recording production sync event..."
    
    # Get current dev SchemaWatch version
    DEV_VERSION=$(psql "$DATABASE_URL" -t -c "SELECT version FROM schema_watch.current_version_mat" 2>/dev/null | xargs)
    
    if [ -z "$DEV_VERSION" ]; then
        DEV_VERSION="2.9.0"
        echo "⚠️  Could not fetch SchemaWatch version, using fallback: $DEV_VERSION"
    else
        echo "📌 Current dev schema version: v$DEV_VERSION"
    fi
    
    # Record production sync timestamp in BOTH databases (so both can see it)
    # Record in production database
    psql "$NEON_PROD_DATABASE_URL" -c "INSERT INTO schema_dump_tracking (version, environment, action, timestamp, performed_by, notes) VALUES ('$DEV_VERSION', 'production', 'production_synced', NOW(), 'run-production-schema.sh', 'Production database synced with dev schema v$DEV_VERSION');" 2>&1 | grep -v "INSERT 0 1" || true
    
    # Also record in dev database so dev environment can see prod sync status
    psql "$DATABASE_URL" -c "INSERT INTO schema_dump_tracking (version, environment, action, timestamp, performed_by, notes) VALUES ('$DEV_VERSION', 'production', 'production_synced', NOW(), 'run-production-schema.sh', 'Production database synced with dev schema v$DEV_VERSION');" 2>&1 | grep -v "INSERT 0 1" || true
    
    echo "✅ Production sync tracked in both databases (version $DEV_VERSION)"
fi
