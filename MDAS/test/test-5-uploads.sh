#!/bin/bash

echo "🚀 PERFORMING 5 CONSECUTIVE UPLOADS WITH PROGRESS MONITORING"
echo "=========================================================="
echo ""

for i in {1..5}; do
    echo "🔄 UPLOAD #$i - $(date '+%H:%M:%S')"
    echo "----------------------------------------"
    
    # Record start time
    start_time=$(date +%s.%3N)
    
    # Initialize upload
    echo "📝 Initializing upload session..."
    init_response=$(curl -s -X POST "http://localhost:5000/api/uploader/initialize" \
      -H "Content-Type: application/json" \
      -d '{
        "files": [{"name": "demo-upload.csv", "size": 216}],
        "fileType": "csv"
      }')
    
    # Extract upload ID
    upload_id=$(echo "$init_response" | grep -o '"uploadId":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$upload_id" ]; then
        echo "❌ Failed to get upload ID for upload #$i"
        echo "Response: $init_response"
        continue
    fi
    
    echo "✅ Session initialized: $upload_id"
    
    # Perform actual upload
    echo "📤 Uploading file content..."
    upload_response=$(curl -s -X POST "http://localhost:5000/api/uploader/$upload_id/upload" \
      -F "file=@test-files/demo-upload.csv")
    
    # Record end time
    end_time=$(date +%s.%3N)
    duration=$(echo "$end_time - $start_time" | awk '{print $1 - $3}')
    
    echo "⏱️  Upload completed in: ${duration}s"
    echo "🆔 Upload ID: $upload_id"
    echo ""
    
    # Brief pause between uploads
    sleep 1
done

echo "✅ ALL 5 UPLOADS COMPLETED!"
echo ""
