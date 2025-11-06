# Production Database Deployment Guide

## Overview
This guide walks you through deploying the Storage Management System updates to your production database.

## Prerequisites
- [ ] Access to production database (NEON_PROD_DATABASE_URL)
- [ ] Database admin credentials
- [ ] Backup of production database (recommended)
- [ ] Review of migration script (`production-storage-management-migration.sql`)

## Migration Script Details

### What This Script Does
1. **Creates `master_object_keys` table** - Central registry for all Replit Object Storage objects
2. **Adds 4 performance indexes** - Optimizes queries for status, object keys, uploads, and timestamps
3. **Verifies existing schema** - Checks that `uploader_uploads.storage_path` column exists
4. **Validates migration** - Confirms successful table and index creation

### What This Script DOES NOT Do
- No data deletion
- No existing table modifications
- No destructive operations
- Safe to run multiple times (idempotent)

## Deployment Steps

### Step 1: Review the Migration Script
```bash
# Review the SQL script
cat server/sql-scripts/production-storage-management-migration.sql
```

### Step 2: Connect to Production Database
Using your preferred PostgreSQL client:

**Option A: psql Command Line**
```bash
psql $NEON_PROD_DATABASE_URL
```

**Option B: Replit Database Pane**
1. Click on "Database" in left sidebar
2. Switch to "Production" environment
3. Open SQL editor

**Option C: Database Management Tool**
- DBeaver
- pgAdmin
- TablePlus
- Any PostgreSQL-compatible tool

### Step 3: Run the Migration Script

**Option A: From psql**
```sql
\i server/sql-scripts/production-storage-management-migration.sql
```

**Option B: Copy and Paste**
1. Open `production-storage-management-migration.sql`
2. Copy entire contents
3. Paste into SQL editor
4. Execute

### Step 4: Verify Migration Success
You should see output like:
```
NOTICE: ✓ master_object_keys table created successfully
NOTICE: ✓ All indexes created successfully (4 indexes found)
NOTICE: 
NOTICE: ═══════════════════════════════════════════════════════
NOTICE: MIGRATION COMPLETED SUCCESSFULLY
NOTICE: ═══════════════════════════════════════════════════════
```

### Step 5: Verify Table Structure
Run this query to confirm the table exists:
```sql
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'master_object_keys'
ORDER BY ordinal_position;
```

Expected output:
```
table_name         | column_name      | data_type                   | is_nullable
-------------------+------------------+-----------------------------+-------------
master_object_keys | id               | integer                     | NO
master_object_keys | object_key       | text                        | NO
master_object_keys | file_size_bytes  | integer                     | NO
master_object_keys | line_count       | integer                     | YES
master_object_keys | status           | text                        | NO
master_object_keys | upload_id        | text                        | YES
master_object_keys | created_at       | timestamp without time zone | NO
master_object_keys | updated_at       | timestamp without time zone | NO
```

### Step 6: Verify Indexes
```sql
SELECT 
    indexname, 
    indexdef
FROM pg_indexes
WHERE tablename = 'master_object_keys';
```

Expected output (4 indexes):
- `master_object_keys_pkey` (primary key)
- `master_object_keys_object_key_idx`
- `master_object_keys_status_idx`
- `master_object_keys_upload_id_idx`
- `master_object_keys_created_at_idx`

## Post-Migration Verification

### Test Storage Management API Endpoints

**1. Test Replit Storage Info**
```bash
curl -X GET https://your-app.replit.app/api/storage/replit-storage-info \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**2. Test Master Keys List**
```bash
curl -X GET https://your-app.replit.app/api/storage/master-keys/list \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**3. Test Storage Statistics**
```bash
curl -X GET https://your-app.replit.app/api/storage/master-keys/stats \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

### Test Storage Management Page
1. Navigate to `/storage-management` in your production app
2. Verify the following tabs load without errors:
   - **Overview** - Shows Replit Storage card with metrics
   - **Objects** - Lists storage objects (may be empty initially)
   - **Duplicates** - Shows duplicate detection (may be empty initially)
   - **Purge Queue** - Shows objects marked for deletion
   - **Operations** - Shows scan and purge controls

### Initial Storage Scan (Optional)
To populate the `master_object_keys` table with existing storage objects:

```bash
curl -X POST https://your-app.replit.app/api/storage/master-keys/scan-orphaned \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json"
```

This will scan your Replit Object Storage and create entries for all existing objects.

## Rollback Plan

If you need to rollback this migration:

```sql
-- Drop indexes
DROP INDEX IF EXISTS master_object_keys_object_key_idx;
DROP INDEX IF EXISTS master_object_keys_status_idx;
DROP INDEX IF EXISTS master_object_keys_upload_id_idx;
DROP INDEX IF EXISTS master_object_keys_created_at_idx;

-- Drop table
DROP TABLE IF EXISTS master_object_keys;
```

**Warning:** This will delete all storage tracking data. Only rollback if absolutely necessary.

## Troubleshooting

### Error: "relation 'uploader_uploads' does not exist"
**Cause:** The foreign key reference to `uploader_uploads` table can't be created because the table doesn't exist.

**Solution:** Ensure you're running this script on the production database that has the `uploader_uploads` table. Check your connection string.

### Error: "column 'storage_path' does not exist"
**Cause:** The `uploader_uploads` table is missing the `storage_path` column.

**Solution:** You need to run a previous migration to add this column first. Contact support for the complete migration history.

### Warning: "Expected at least 4 indexes, found X"
**Cause:** Some indexes may already exist or failed to create.

**Solution:** This is usually harmless if the table and primary indexes exist. Verify with:
```sql
\d master_object_keys
```

## Support
If you encounter any issues during deployment:

1. Check server logs for detailed error messages
2. Verify database connection and credentials
3. Ensure you have sufficient database permissions (CREATE TABLE, CREATE INDEX)
4. Review the migration script for compatibility with your PostgreSQL version

## Summary Checklist
- [ ] Production database backup created
- [ ] Migration script reviewed and understood
- [ ] Connected to production database
- [ ] Migration script executed successfully
- [ ] Table structure verified
- [ ] Indexes verified
- [ ] API endpoints tested
- [ ] Storage Management page tested
- [ ] Initial storage scan completed (optional)
- [ ] Deployment documented

---
**Migration Version:** 1.0.0  
**Date:** November 6, 2025  
**Component:** Storage Management System
