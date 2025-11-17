#!/bin/bash

# Object Storage Cleanup Script
echo "=== Object Storage Cleanup Tool ==="
echo "Date: $(date)"
echo ""

# Configuration
BUCKET_ID="${DEFAULT_OBJECT_STORAGE_BUCKET_ID}"
SIDECAR_ENDPOINT="http://127.0.0.1:1106"

if [ -z "$BUCKET_ID" ]; then
    echo "❌ No bucket ID configured"
    exit 1
fi

echo "🪣 Bucket ID: $BUCKET_ID"
echo ""

# List all objects in bucket
echo "📋 Listing all objects in bucket..."
LIST_RESPONSE=$(curl -s -X POST "$SIDECAR_ENDPOINT/object-storage/list-objects" \
    -H "Content-Type: application/json" \
    -d '{
        "bucket_name": "'$BUCKET_ID'",
        "prefix": "",
        "max_results": 5000
    }')

if [ $? -ne 0 ]; then
    echo "❌ Failed to list objects"
    exit 1
fi

# Count total objects
TOTAL_OBJECTS=$(echo "$LIST_RESPONSE" | jq '.objects | length')
echo "📊 Found $TOTAL_OBJECTS objects in bucket"

# Show objects by prefix
echo ""
echo "📂 Objects by prefix:"
echo "$LIST_RESPONSE" | jq -r '.objects[].name' | cut -d'/' -f1 | sort | uniq -c | sort -nr

echo ""
echo "📋 Sample object names:"
echo "$LIST_RESPONSE" | jq -r '.objects[0:10][].name'

# Get linked files from database
echo ""
echo "🔗 Checking database for linked files..."
LINKED_FILES=$(curl -s "http://localhost:5000/api/uploader" -H "Cookie: $(cat auth_cookies.txt)" | jq -r '.uploads[].storage_path // empty' | grep -v '^$' | sort | uniq)

LINKED_COUNT=$(echo "$LINKED_FILES" | wc -l)
echo "📂 Found $LINKED_COUNT files linked in database"

# Check if dry run or execute
DRY_RUN=true
if [ "$1" = "--execute" ]; then
    DRY_RUN=false
    echo "⚠️  EXECUTE MODE - Will actually delete orphaned files"
else
    echo "🔍 DRY RUN MODE - No files will be deleted"
fi

echo ""
echo "🗑️  Analyzing orphaned objects..."

# Create temporary files
TEMP_ALL_OBJECTS="/tmp/all_objects.txt"
TEMP_LINKED_FILES="/tmp/linked_files.txt"
TEMP_ORPHANED="/tmp/orphaned_objects.txt"

# Extract all object names
echo "$LIST_RESPONSE" | jq -r '.objects[].name' > "$TEMP_ALL_OBJECTS"

# Create linked files list (removing bucket prefix if present)
echo "$LINKED_FILES" | sed "s|^/$BUCKET_ID/||" | sed 's|^/||' > "$TEMP_LINKED_FILES"

# Find orphaned objects (objects not in linked files)
comm -23 <(sort "$TEMP_ALL_OBJECTS") <(sort "$TEMP_LINKED_FILES") > "$TEMP_ORPHANED"

ORPHANED_COUNT=$(wc -l < "$TEMP_ORPHANED")
echo "🗑️  Found $ORPHANED_COUNT orphaned objects"

if [ "$ORPHANED_COUNT" -eq 0 ]; then
    echo "✅ No orphaned objects found - cleanup not needed"
    rm -f "$TEMP_ALL_OBJECTS" "$TEMP_LINKED_FILES" "$TEMP_ORPHANED"
    exit 0
fi

# Show sample orphaned files
echo ""
echo "📋 Sample orphaned objects:"
head -10 "$TEMP_ORPHANED"
if [ "$ORPHANED_COUNT" -gt 10 ]; then
    echo "   ... and $(($ORPHANED_COUNT - 10)) more"
fi

# Calculate total size of orphaned objects
TOTAL_SIZE=0
while IFS= read -r object_name; do
    OBJECT_SIZE=$(echo "$LIST_RESPONSE" | jq -r --arg name "$object_name" '.objects[] | select(.name == $name) | .size // 0')
    TOTAL_SIZE=$((TOTAL_SIZE + OBJECT_SIZE))
done < "$TEMP_ORPHANED"

TOTAL_SIZE_MB=$((TOTAL_SIZE / 1024 / 1024))
echo ""
echo "💾 Total space to be freed: ${TOTAL_SIZE_MB} MB"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "⚠️  DRY RUN COMPLETE - No objects were deleted"
    echo "   Run with --execute to perform actual cleanup:"
    echo "   bash object-storage-cleanup.sh --execute"
    rm -f "$TEMP_ALL_OBJECTS" "$TEMP_LINKED_FILES" "$TEMP_ORPHANED"
    exit 0
fi

# Execute cleanup
echo ""
echo "🗑️  EXECUTING CLEANUP..."
DELETED_COUNT=0
ERROR_COUNT=0

while IFS= read -r object_name; do
    DELETE_RESPONSE=$(curl -s -X POST "$SIDECAR_ENDPOINT/object-storage/delete-object" \
        -H "Content-Type: application/json" \
        -d '{
            "bucket_name": "'$BUCKET_ID'",
            "object_name": "'$object_name'"
        }')
    
    if [ $? -eq 0 ]; then
        DELETED_COUNT=$((DELETED_COUNT + 1))
        if [ $((DELETED_COUNT % 50)) -eq 0 ]; then
            echo "   Progress: $DELETED_COUNT/$ORPHANED_COUNT deleted..."
        fi
    else
        ERROR_COUNT=$((ERROR_COUNT + 1))
        echo "   ❌ Failed to delete: $object_name"
    fi
done < "$TEMP_ORPHANED"

echo ""
echo "✅ CLEANUP COMPLETE!"
echo "   📊 Results:"
echo "      Deleted: $DELETED_COUNT objects"
echo "      Errors: $ERROR_COUNT objects"
echo "      Freed space: ${TOTAL_SIZE_MB} MB"
echo "      Success rate: $(($DELETED_COUNT * 100 / $ORPHANED_COUNT))%"

# Cleanup temp files
rm -f "$TEMP_ALL_OBJECTS" "$TEMP_LINKED_FILES" "$TEMP_ORPHANED"