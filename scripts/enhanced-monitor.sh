#!/bin/bash

echo "📊 Enhanced Processing Monitor - Every 60 seconds"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="

LAST_QUEUED=0
STUCK_COUNT=0

while true; do
    # Get comprehensive stats
    STATS=$(curl -s "http://localhost:5000/api/processing/real-time-stats" 2>/dev/null)
    STATUS=$(curl -s "http://localhost:5000/api/file-processor/status" 2>/dev/null)
    CONCURRENCY=$(curl -s "http://localhost:5000/api/processing/concurrency-stats" 2>/dev/null)
    
    if [ $? -eq 0 ] && [ "$STATS" != "" ]; then
        QUEUED=$(echo "$STATS" | jq -r '.queuedFiles // 0')
        PROCESSED=$(echo "$STATS" | jq -r '.processedFiles // 0')
        PROCESSING=$(echo "$STATS" | jq -r '.currentlyProcessing // 0')
        
        IS_RUNNING=$(echo "$STATUS" | jq -r '.isRunning // false')
        CURRENT_FILE=$(echo "$STATUS" | jq -r '.currentlyProcessingFile.filename // "none"')
        
        SERVERS_PROCESSING=$(echo "$CONCURRENCY" | jq -r '.processingByServer | length')
        STALE_FILES=$(echo "$CONCURRENCY" | jq -r '.staleProcessingFiles // 0')
        
        TIMESTAMP=$(date '+%H:%M:%S')
        
        # Check for progress
        if [ "$QUEUED" -eq "$LAST_QUEUED" ] && [ "$QUEUED" -gt 0 ]; then
            STUCK_COUNT=$((STUCK_COUNT + 1))
        else
            STUCK_COUNT=0
        fi
        
        # Display status
        echo "[$TIMESTAMP] Q:$QUEUED P:$PROCESSED Run:$IS_RUNNING File:$(basename "$CURRENT_FILE") Servers:$SERVERS_PROCESSING Stale:$STALE_FILES"
        
        # Alert conditions
        if [ "$STUCK_COUNT" -ge 2 ]; then
            echo "⚠️  ALERT: Queue stuck at $QUEUED for ${STUCK_COUNT} minutes - may need intervention"
        fi
        
        if [ "$STALE_FILES" -gt 0 ]; then
            echo "🚨 STALE FILES DETECTED: $STALE_FILES files stuck in processing"
        fi
        
        if [ "$IS_RUNNING" = "false" ] && [ "$QUEUED" -gt 0 ]; then
            echo "⚠️  WARNING: Processor idle with $QUEUED files queued"
        fi
        
        # Check completion
        if [ "$QUEUED" -eq 0 ] && [ "$IS_RUNNING" = "false" ]; then
            echo "🎉 PROCESSING COMPLETE! Total files processed: $PROCESSED"
            echo "Final completion time: $(date '+%Y-%m-%d %H:%M:%S')"
            break
        fi
        
        LAST_QUEUED=$QUEUED
        
    else
        echo "[$TIMESTAMP] ERROR: Unable to fetch processing stats"
    fi
    
    sleep 60
done