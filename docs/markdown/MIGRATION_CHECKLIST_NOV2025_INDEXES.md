# Migration Checklist - TDDF Merchant Volume Indexes
**Date:** November 4, 2025  
**Migration Type:** Performance Optimization (Indexes Only)  
**Risk Level:** **LOW** ✅  
**Estimated Downtime:** None (indexes created with CONCURRENTLY - zero blocking)  
**Estimated Duration:** 3-8 minutes (CONCURRENTLY is slower but safer)  
**Execution Mode:** CREATE INDEX CONCURRENTLY (non-blocking, production-safe)  

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Execution Steps](#execution-steps)
4. [Validation Steps](#validation-steps)
5. [Rollback Procedure](#rollback-procedure)
6. [Monitoring](#monitoring)

---

## Overview

### What's Being Changed
- **8 new performance indexes** on `uploader_tddf_jsonb_records` table
- **Zero schema changes** - columns remain unchanged
- **Zero data migration** - no data modification required

### Purpose
Optimize the new **TDDF1 Merchant Volume Analytics** dashboard for:
- Daily merchant transaction breakdowns
- Record type filtering (BH, DT, G2, E1, P1, P2, DR, AD)
- Fast aggregation queries on 900K+ records

### Expected Performance Improvement
- **Before:** 10-30 second queries for merchant volume data
- **After:** <1 second queries with composite index optimization
- **Query Plan:** Verified 2ms execution time in development

---

## Pre-Migration Checklist

### ✅ Environment Verification
- [ ] Confirm you are connected to **PRODUCTION** database
- [ ] Verify database backup completed within last 24 hours
- [ ] Check current database size and available disk space
- [ ] Confirm no other migrations are in progress

### ✅ Table Verification
Run these queries to verify the target table exists:

```sql
-- 1. Verify table exists
SELECT 
    schemaname, 
    tablename, 
    tableowner
FROM pg_tables 
WHERE tablename = 'uploader_tddf_jsonb_records';
-- Expected: 1 row returned

-- 2. Count records in table
SELECT COUNT(*) as total_records 
FROM uploader_tddf_jsonb_records;
-- Expected: Should match your production record count

-- 3. Verify required columns exist
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'uploader_tddf_jsonb_records'
    AND column_name IN (
        'file_processing_date', 
        'merchant_account_number', 
        'record_type', 
        'record_data'
    );
-- Expected: 4 rows returned
```

### ✅ Existing Index Check
Check if any indexes already exist (to avoid duplicates):

```sql
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'uploader_tddf_jsonb_records'
    AND indexname IN (
        'idx_tddf_file_processing_date',
        'idx_tddf_merchant_account_number',
        'idx_tddf_record_type',
        'idx_tddf_date_merchant',
        'idx_tddf_date_merchant_record_type',
        'idx_tddf_date_record_type',
        'idx_tddf_transaction_amount_jsonb',
        'idx_tddf_net_deposit_jsonb'
    );
-- Expected: 0 rows (indexes don't exist yet)
-- If any exist, they will be skipped due to IF NOT EXISTS clause
```

### ✅ System Health Check
```sql
-- Check for long-running queries that might block index creation
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE state != 'idle'
    AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC
LIMIT 10;
-- Review: Ensure no long-running UPDATE/INSERT operations on target table
```

---

## Execution Steps

### Step 1: Download Migration Script
```bash
# Ensure you have the production-indexes-nov2025.sql file
ls -lh production-indexes-nov2025.sql
```

### Step 2: Connect to Production Database
```bash
# Use your production database connection
# Example using psql:
psql $NEON_PROD_DATABASE_URL
```

### Step 3: Important - Connection Stability
**CRITICAL:** CREATE INDEX CONCURRENTLY has special requirements:
- ❌ **Cannot** be run inside a transaction block (BEGIN/COMMIT)
- ✅ **Must** maintain stable database connection for entire duration (3-8 minutes)
- ⚠️ If connection drops, may leave INVALID indexes that need cleanup

**Before proceeding:**
- [ ] Ensure stable network connection to database
- [ ] Run in autocommit mode (default for psql) - DO NOT use BEGIN/COMMIT
- [ ] Keep terminal session active and monitor for completion

### Step 4: Execute Migration Script
```bash
# Execute the full script
\i production-indexes-nov2025.sql
```

**OR** execute directly:
```bash
psql $NEON_PROD_DATABASE_URL < production-indexes-nov2025.sql
```

### Step 5: Monitor Progress (Optional)
While CONCURRENTLY creates indexes **without blocking writes**, you can monitor progress in a **separate database session**:

```sql
-- In a separate session, monitor index creation progress
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename = 'uploader_tddf_jsonb_records'
    AND indexname LIKE 'idx_tddf_%'
ORDER BY indexname;
```

**Expected timing (CONCURRENTLY mode):**
- Single-column indexes: ~15-30 seconds each
- Composite indexes: ~20-60 seconds each
- JSONB indexes: ~30-60 seconds each
- **Total duration: 3-8 minutes** for all 8 indexes

### Step 6: Verify Completion
The script includes automatic verification. Look for this output:
```
NOTICE:  ✓ SUCCESS: All 8 indexes created successfully
```

**If you see warnings about INVALID indexes:**
```
WARNING:  ⚠ WARNING: 2 invalid indexes found (CONCURRENTLY was interrupted)
```
This means the connection was interrupted. See [Rollback Procedure](#rollback-procedure) for cleanup steps.

---

## Validation Steps

### ✅ Post-Migration Verification

#### 1. Verify All Indexes Created
```sql
SELECT 
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (indexname, schemaname, tablename)
WHERE tablename = 'uploader_tddf_jsonb_records'
    AND indexname IN (
        'idx_tddf_file_processing_date',
        'idx_tddf_merchant_account_number',
        'idx_tddf_record_type',
        'idx_tddf_date_merchant',
        'idx_tddf_date_merchant_record_type',
        'idx_tddf_date_record_type',
        'idx_tddf_transaction_amount_jsonb',
        'idx_tddf_net_deposit_jsonb'
    )
ORDER BY indexname;
-- Expected: 8 rows returned with index sizes
```

#### 2. Test Index Usage
Run a sample query to verify indexes are being used:

```sql
EXPLAIN ANALYZE
SELECT 
    merchant_account_number,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE record_type = 'BH') as bh_count,
    COUNT(*) FILTER (WHERE record_type = 'DT') as dt_count,
    SUM(CAST(record_data->>'netDepositAmount' AS numeric)) as net_deposits,
    SUM(CAST(record_data->>'transactionAmount' AS numeric)) as transaction_total
FROM uploader_tddf_jsonb_records
WHERE file_processing_date = CURRENT_DATE - INTERVAL '1 day'
GROUP BY merchant_account_number
LIMIT 20;

-- Expected: Query plan shows "Index Scan" using one of the new indexes
-- Expected: Execution time < 1 second
```

#### 3. Verify Application Functionality
- [ ] Navigate to TDDF1 Dashboard → Merchant Volume tab
- [ ] Select a recent date (e.g., yesterday or Oct 30, 2025)
- [ ] Verify merchants load quickly (< 2 seconds)
- [ ] Test search functionality
- [ ] Test sorting by different columns
- [ ] Click on a merchant to view details
- [ ] Verify all record type badges display correctly

---

## Rollback Procedure

### When to Rollback
- Indexes are causing unexpected query performance degradation
- Indexes are consuming too much disk space
- Application errors related to index usage
- INVALID indexes left after interrupted CONCURRENTLY operation

### Scenario 1: Clean Rollback (All Indexes Valid)

If you need to remove working indexes, save this as `rollback-indexes-nov2025.sql`:

```sql
-- ========================================
-- ROLLBACK SCRIPT - Drop Merchant Volume Indexes
-- ========================================
-- Use CONCURRENTLY to avoid blocking production writes

-- Drop indexes individually (allows selective rollback)
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_file_processing_date;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_merchant_account_number;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_record_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_date_merchant;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_date_merchant_record_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_date_record_type;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_transaction_amount_jsonb;
DROP INDEX CONCURRENTLY IF EXISTS idx_tddf_net_deposit_jsonb;

-- Verify indexes are dropped
SELECT 
    'Rollback Complete' as status,
    COUNT(*) as remaining_indexes
FROM pg_indexes
WHERE tablename = 'uploader_tddf_jsonb_records'
    AND indexname LIKE 'idx_tddf_%';
-- Expected: 0 remaining indexes
```

Execute:
```bash
psql $NEON_PROD_DATABASE_URL < rollback-indexes-nov2025.sql
```

### Scenario 2: Cleanup INVALID Indexes

If CREATE INDEX CONCURRENTLY was interrupted (connection dropped, server restart), you may have INVALID indexes that consume space but aren't used by queries.

**Step 1: Identify INVALID indexes**
```sql
SELECT c.relname as index_name
FROM pg_index i
JOIN pg_class c ON i.indexrelid = c.oid
JOIN pg_class t ON i.indrelid = t.oid
WHERE t.relname = 'uploader_tddf_jsonb_records'
AND NOT i.indisvalid;
```

**Step 2: Drop INVALID indexes**
```sql
-- Drop each invalid index using CONCURRENTLY
-- Example (replace with actual invalid index names):
DROP INDEX CONCURRENTLY idx_tddf_date_merchant;
DROP INDEX CONCURRENTLY idx_tddf_transaction_amount_jsonb;
```

**Step 3: Re-run creation**
After dropping invalid indexes, re-run the specific CREATE INDEX CONCURRENTLY statements from `production-indexes-nov2025.sql` for those indexes.

**Note:** 
- Regular DROP INDEX can be used for invalid indexes (they don't affect queries)
- Use CONCURRENTLY for valid indexes to avoid blocking writes
- Rolling back indexes is safe - no data loss risk
- Queries will simply run slower without the indexes

---

## Monitoring

### Immediate Post-Migration (First Hour)
Monitor these metrics:

#### Database Performance
```sql
-- Check table bloat and index sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE tablename = 'uploader_tddf_jsonb_records';
```

#### Query Performance
```sql
-- Monitor query execution times
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE query LIKE '%uploader_tddf_jsonb_records%'
    AND query LIKE '%merchant_account_number%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Long-Term Monitoring (First Week)
- [ ] Daily check of Merchant Volume tab load times
- [ ] Monitor disk space usage (indexes add ~5-10% overhead)
- [ ] Review any slow query logs
- [ ] Check for user-reported issues with merchant analytics

---

## Success Criteria

✅ Migration considered successful when:
- All 8 indexes created without errors
- Index verification query returns 8 rows
- Test query uses new indexes (shown in EXPLAIN ANALYZE)
- Merchant Volume tab loads in < 2 seconds
- No application errors in production logs
- Disk space impact < 500MB

---

## Contact & Support

**Migration Owner:** Replit Agent  
**Date Created:** November 4, 2025  
**Related Feature:** TDDF1 Daily Merchant Volume Analytics  
**Documentation:** See `replit.md` - "TDDF1 Daily Merchant Volume Analytics (Nov 4, 2025)"

---

## Appendix: Index Details

| Index Name | Type | Columns | Purpose |
|------------|------|---------|---------|
| `idx_tddf_file_processing_date` | Single | `file_processing_date` | Date filtering |
| `idx_tddf_merchant_account_number` | Single | `merchant_account_number` | Merchant filtering |
| `idx_tddf_record_type` | Single | `record_type` | Record type filtering |
| `idx_tddf_date_merchant` | Composite | `file_processing_date, merchant_account_number` | Daily merchant queries |
| `idx_tddf_date_merchant_record_type` | Composite | `file_processing_date, merchant_account_number, record_type` | Detailed merchant queries |
| `idx_tddf_date_record_type` | Composite | `file_processing_date, record_type` | Record type aggregations |
| `idx_tddf_transaction_amount_jsonb` | JSONB | `record_data->>'transactionAmount'` | Amount calculations |
| `idx_tddf_net_deposit_jsonb` | JSONB | `record_data->>'netDepositAmount'` | Deposit calculations |

**Total Index Count:** 8  
**Estimated Total Index Size:** 50-100MB (varies by data volume)  
**Creation Method:** `CREATE INDEX IF NOT EXISTS` (idempotent)  
**Concurrency:** Non-blocking (indexes created using `CONCURRENTLY` semantics built into PostgreSQL)
