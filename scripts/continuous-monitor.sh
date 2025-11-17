#!/bin/bash

echo "🔍 Starting continuous processing monitor..."
echo "⏰ Checking every 60 seconds until all files complete"
echo ""

while true; do
    # Get current stats
    STATS=$(curl -s "http://localhost:5000/api/processing/real-time-stats")
    QUEUED=$(echo "$STATS" | jq -r '.queuedFiles')
    PROCESSED=$(echo "$STATS" | jq -r '.processedFiles')
    
    # Get processor status
    STATUS=$(curl -s "http://localhost:5000/api/file-processor/status")
    IS_RUNNING=$(echo "$STATUS" | jq -r '.isRunning')
    CURRENT_FILE=$(echo "$STATUS" | jq -r '.currentlyProcessingFile.filename // "none"')
    
    # Display status
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$TIMESTAMP] Queue: $QUEUED | Processed: $PROCESSED | Running: $IS_RUNNING | Current: $CURRENT_FILE"
    
    # Check if all done
    if [ "$QUEUED" = "0" ] && [ "$IS_RUNNING" = "false" ]; then
        echo "🎉 ALL FILES COMPLETED! Final count: $PROCESSED processed"
        break
    fi
    
    # Check for issues
    if [ "$IS_RUNNING" = "false" ] && [ "$QUEUED" -gt "0" ]; then
        echo "⚠️  WARNING: Processor idle but $QUEUED files still queued"
    fi
    
    sleep 60
done
