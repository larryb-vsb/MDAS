# Production Database Deployment Guide

## Overview
This guide walks you through deploying the complete MMS system updates to your production database, including security monitoring, storage management, and API key tracking features added on November 5-6, 2025.

## Prerequisites
- [ ] Access to production database (NEON_PROD_DATABASE_URL)
- [ ] Database admin credentials
- [ ] Backup of production database (recommended)
- [ ] Review of migration script (`production-complete-migration.sql`)

## Migration Script Details

### What This Script Does
Creates **4 new tables** with comprehensive security and storage management features:

#### 1. **connection_log** - Security Monitoring
- Tracks ALL API connections (authenticated or not)
- Records IP address, endpoint, method, API key usage
- Performance metrics (response time, status codes)
- Used by Monitoring tab for threat detection

#### 2. **ip_blocklist** - IP Blocking System
- Block malicious IP addresses globally
- Supports temporary blocks with expiration dates
- Permanent blocks for repeat offenders
- Admin audit trail (who blocked, when, why)

#### 3. **host_approvals** - Host Approval Workflow
- Security control for hostname + API key combinations
- Three-state approval: pending → approved/denied
- Only approved host+key combinations can upload files
- Tracks last seen timestamp and IP for monitoring

#### 4. **master_object_keys** - Storage Management
- Central registry for all Replit Object Storage objects
- Status tracking (active, archived, deleted, mark_for_purge)
- Orphaned object detection and cleanup
- Duplicate file detection with storage savings

### Additional Updates
- Adds 3 columns to **api_users** table:
  - `last_used` - Last API key usage timestamp
  - `last_used_ip` - Client IP that last used the key
  - `request_count` - Total API requests with this key

### What This Script DOES NOT Do
- ✅ No data deletion
- ✅ No existing table modifications (except api_users column additions)
- ✅ No destructive operations
- ✅ Safe to run multiple times (idempotent)

## Deployment Steps

### Step 1: Review the Migration Script
```bash
# Review the complete SQL script
cat server/sql-scripts/production-complete-migration.sql
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
\i server/sql-scripts/production-complete-migration.sql
```

**Option B: Copy and Paste**
1. Open `production-complete-migration.sql`
2. Copy entire contents
3. Paste into SQL editor
4. Execute

### Step 4: Verify Migration Success
You should see output like:
```
NOTICE: ✓ Added last_used column to api_users table
NOTICE: ✓ Added last_used_ip column to api_users table
NOTICE: ✓ Added request_count column to api_users table
NOTICE: ✓ Column storage_path exists in uploader_uploads table
NOTICE: ✓ All 4 tables created successfully
NOTICE: ✓ All indexes created successfully (12+ indexes found)
NOTICE: 
NOTICE: ═══════════════════════════════════════════════════════
NOTICE: MIGRATION COMPLETED SUCCESSFULLY
NOTICE: ═══════════════════════════════════════════════════════
NOTICE: Database: PRODUCTION
NOTICE: Tables Added: 4
NOTICE:   • connection_log (Security monitoring)
NOTICE:   • ip_blocklist (IP blocking system)
NOTICE:   • host_approvals (Host approval workflow)
NOTICE:   • master_object_keys (Storage management)
NOTICE: Indexes Added: 12+
NOTICE: Ready for production deployment!
```

### Step 5: Verify Table Structure

**Check all new tables exist:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN (
    'connection_log', 
    'ip_blocklist', 
    'host_approvals', 
    'master_object_keys'
)
ORDER BY table_name;
```

Expected output:
```
table_name
-----------------
connection_log
host_approvals
ip_blocklist
master_object_keys
```

**Verify connection_log structure:**
```sql
\d connection_log
```

**Verify ip_blocklist structure:**
```sql
\d ip_blocklist
```

**Verify host_approvals structure:**
```sql
\d host_approvals
```

**Verify master_object_keys structure:**
```sql
\d master_object_keys
```

**Verify api_users new columns:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'api_users' 
AND column_name IN ('last_used', 'last_used_ip', 'request_count');
```

### Step 6: Verify Indexes
```sql
SELECT 
    tablename,
    indexname
FROM pg_indexes
WHERE tablename IN (
    'connection_log', 
    'ip_blocklist', 
    'host_approvals', 
    'master_object_keys'
)
ORDER BY tablename, indexname;
```

Expected: At least 12 indexes across all 4 tables

## Post-Migration Configuration

### Update Environment Variables
Set your environment to production mode:

**Option 1: Set NODE_ENV**
```bash
export NODE_ENV=production
```

**Option 2: Set TABLE_PREFIX** (if not using NODE_ENV)
```bash
export TABLE_PREFIX=""
```

This ensures the application uses production table names (without `dev_` prefix).

### Restart Application
After migration and environment variable updates:
```bash
# Restart your application
npm run dev
# Or restart the Replit deployment
```

## Post-Migration Verification

### Test Security Monitoring Endpoints

**1. Test Connection Log**
```bash
curl -X GET https://your-app.replit.app/api/monitoring/connections \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**2. Test IP Blocklist**
```bash
curl -X GET https://your-app.replit.app/api/monitoring/blocked-ips \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**3. Test Host Approvals**
```bash
curl -X GET https://your-app.replit.app/api/monitoring/host-approvals \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

**4. Test API Key Monitoring**
```bash
curl -X GET https://your-app.replit.app/api/tddf-api/monitoring/last-connection \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

### Test Storage Management Endpoints

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

### Test Frontend Pages

**1. Monitoring Tab**
Navigate to `/tddf-api-data` and verify:
- ✅ Monitoring tab loads without errors
- ✅ "Last API Connection" card displays
- ✅ "Host List" table shows host approvals
- ✅ "Connection Log" table shows recent connections
- ✅ Approve/Deny buttons work for pending hosts

**2. Storage Management Page**
Navigate to `/storage-management` and verify:
- ✅ Overview tab shows Replit Storage card with metrics
- ✅ Objects tab lists storage objects (may be empty initially)
- ✅ Duplicates tab shows duplicate detection
- ✅ Purge Queue tab shows objects marked for deletion
- ✅ Operations tab shows scan and purge controls

### Test Batch Uploader Integration

**1. Test Ping Endpoint** (No authentication required)
```bash
python batch-uploader.py --ping
```

Expected output showing:
- Service status (online/offline)
- API key validation (if provided)
- Host approval status (if API key provided)

**2. Test Upload with Host Approval**
```bash
python batch-uploader.py --upload path/to/file.tddf
```

If hostname+API key is not approved:
- Upload should be blocked
- Error message should direct user to contact admin
- Pending approval should appear in Monitoring tab

## Rollback Plan

If you need to rollback this migration:

```sql
-- Drop all new tables
DROP TABLE IF EXISTS connection_log CASCADE;
DROP TABLE IF EXISTS ip_blocklist CASCADE;
DROP TABLE IF EXISTS host_approvals CASCADE;
DROP TABLE IF EXISTS master_object_keys CASCADE;

-- Remove new columns from api_users
ALTER TABLE api_users DROP COLUMN IF EXISTS last_used;
ALTER TABLE api_users DROP COLUMN IF EXISTS last_used_ip;
ALTER TABLE api_users DROP COLUMN IF EXISTS request_count;
```

**Warning:** This will delete all security monitoring and storage tracking data. Only rollback if absolutely necessary.

## Troubleshooting

### Error: "relation 'connection_log' does not exist"
**Cause:** Migration script not run yet or application still using `dev_` prefix.

**Solution:** 
1. Verify migration script ran successfully
2. Check `NODE_ENV=production` or `TABLE_PREFIX=""` is set
3. Restart application

### Error: "relation 'dev_ip_blocklist' does not exist"
**Cause:** Application is using development table prefix in production.

**Solution:**
1. Set environment variable: `NODE_ENV=production`
2. Or set: `TABLE_PREFIX=""`
3. Restart application

### Error: "column 'last_used' does not exist in api_users"
**Cause:** Migration script failed to add columns to api_users table.

**Solution:** Run the migration script again (it's idempotent and safe to re-run).

### Error: "foreign key constraint violation"
**Cause:** api_users table doesn't exist or has different structure.

**Solution:** 
1. Verify api_users table exists: `SELECT * FROM api_users LIMIT 1;`
2. Check table structure matches expectations
3. May need to run earlier migrations first

### Warning: "Expected at least 12 indexes, found X"
**Cause:** Some indexes may already exist or failed to create.

**Solution:** This is usually harmless if the table and primary indexes exist. Verify with:
```sql
\d connection_log
\d ip_blocklist
\d host_approvals
\d master_object_keys
```

## Feature Validation Checklist

After successful migration, validate these features work:

### Security Monitoring
- [ ] Connection log captures all API requests
- [ ] IP blocking prevents access from blocked IPs
- [ ] Host approval workflow blocks unapproved uploads
- [ ] API key tracking updates last_used, last_used_ip, request_count

### Storage Management
- [ ] Replit Storage card displays live metrics
- [ ] Object list shows storage objects
- [ ] Duplicate detection identifies duplicate files
- [ ] Orphan scan detects unlinked storage objects

### API Endpoints
- [ ] All monitoring endpoints return 200 status
- [ ] All storage management endpoints return 200 status
- [ ] Batch uploader ping works without authentication
- [ ] Batch uploader upload enforces host approval

## Support
If you encounter any issues during deployment:

1. Check server logs for detailed error messages
2. Verify database connection and credentials
3. Ensure you have sufficient database permissions (CREATE TABLE, ALTER TABLE, CREATE INDEX)
4. Review the migration script for compatibility with your PostgreSQL version
5. Confirm environment variables are set correctly (NODE_ENV or TABLE_PREFIX)

## Summary Checklist
- [ ] Production database backup created
- [ ] Migration script reviewed and understood
- [ ] Connected to production database
- [ ] Migration script executed successfully
- [ ] All 4 tables verified
- [ ] All 12+ indexes verified
- [ ] api_users columns added and verified
- [ ] Environment variables updated (NODE_ENV=production)
- [ ] Application restarted
- [ ] Security monitoring endpoints tested
- [ ] Storage management endpoints tested
- [ ] Monitoring tab tested in browser
- [ ] Storage Management page tested in browser
- [ ] Batch uploader tested with host approval
- [ ] Deployment documented

---
**Migration Version:** 2.0.0  
**Date:** November 6, 2025  
**Components:** Security Monitoring + Storage Management  
**Tables Added:** 4 (connection_log, ip_blocklist, host_approvals, master_object_keys)  
**Columns Added:** 3 (api_users: last_used, last_used_ip, request_count)
