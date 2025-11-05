# Production Database Management SQL Scripts

## Overview
This directory contains SQL scripts for monitoring and maintaining the production database after deployment. These scripts help identify issues, verify integrity, and apply fixes when needed.

## Files

### 1. `production-health-checks.sql`
**Purpose:** Comprehensive database health monitoring queries  
**When to use:** Run these regularly to check database health  
**Safety:** Read-only queries - safe to run anytime  

**Key Checks:**
- Missing critical tables
- Stuck files in processing phases
- Orphaned records
- Cache integrity
- Duplicate files
- API key usage
- Host approvals
- Connection logs
- Processing errors
- Overall system statistics

### 2. `production-fixes.sql`
**Purpose:** Fix common database issues  
**When to use:** When health checks identify problems  
**Safety:** ⚠️ Contains write operations - review before running  

**Available Fixes:**
- Recover stuck files in encoding phase
- Rebuild missing cache entries
- Clean up orphaned master records
- Reset stuck files in processing phase
- Update API key statistics
- Clean up old connection logs
- Reactivate API keys
- Update host approval status
- Rebuild missing indexes
- Verify database integrity

## Usage

### Accessing Production Database

#### Option 1: Via Replit Database Pane
1. Go to Tools → Database
2. Select "Production" environment
3. Use the SQL query editor

#### Option 2: Via psql CLI (if available)
```bash
psql $DATABASE_URL
```

### Running Health Checks

1. Open `production-health-checks.sql`
2. Copy the specific check you want to run
3. Paste into the database query editor
4. Execute and review results

**Example - Check for stuck files:**
```sql
SELECT 
  id,
  filename,
  final_file_type,
  current_phase,
  upload_status,
  last_updated,
  EXTRACT(EPOCH FROM (NOW() - last_updated))/60 as minutes_stuck
FROM uploader_uploads
WHERE current_phase IN ('processing', 'encoding', 'validating')
  AND last_updated < NOW() - INTERVAL '30 minutes'
  AND deleted_at IS NULL
  AND is_archived = false
ORDER BY last_updated;
```

### Applying Fixes

⚠️ **IMPORTANT:** Always review what will be affected before running fixes

1. Run the corresponding health check first
2. Review the data that will be affected
3. If a fix has a "preview" step, run that first
4. Apply the fix
5. Verify the fix worked

**Example - Fix stuck files:**
```sql
-- STEP 1: Preview
SELECT id, filename, current_phase, last_updated
FROM uploader_uploads
WHERE current_phase = 'encoding'
  AND last_updated < NOW() - INTERVAL '30 minutes'
  AND deleted_at IS NULL;

-- STEP 2: Apply fix (only if preview looks correct)
-- Copy and run the appropriate fix from production-fixes.sql
```

## Using the Health Check API

The application also provides HTTP endpoints for health monitoring:

### Quick Ping
```bash
curl https://your-app.replit.dev/api/database/ping
```

Returns:
```json
{
  "status": "ok",
  "latency_ms": 45,
  "timestamp": "2025-11-05T21:00:00.000Z"
}
```

### Comprehensive Health Check
```bash
curl https://your-app.replit.dev/api/database/health
```

Returns detailed health status including:
- Database connection status
- Table existence verification
- Index validation
- Orphaned records count
- Stuck files count
- Cache integrity status
- System statistics

**Example Response:**
```json
{
  "timestamp": "2025-11-05T21:00:00.000Z",
  "environment": "production",
  "status": "healthy",
  "checks": {
    "connection": { "status": "pass", "message": "..." },
    "tables": { "status": "pass", "message": "..." },
    "indexes": { "status": "pass", "message": "..." },
    "orphanedRecords": { "status": "pass", "message": "...", "count": 0 },
    "stuckFiles": { "status": "pass", "message": "...", "count": 0 },
    "cacheIntegrity": { "status": "pass", "message": "...", "issues": [] }
  },
  "stats": {
    "totalUploads": 150,
    "activeUploads": 120,
    "tddfFiles": 80,
    "terminalFiles": 30,
    "merchantFiles": 10,
    "archivedFiles": 30
  }
}
```

## Common Issues and Solutions

### Issue 1: Files Stuck in "encoding" Phase
**Symptoms:** Files show "encoding" status for > 30 minutes  
**Diagnosis:** Run health check #2  
**Solution:** Run Fix #1 (Recover stuck files)

### Issue 2: Missing Cache Entries
**Symptoms:** Dashboard not showing file data  
**Diagnosis:** Run health check #4  
**Solution:** Run Fix #2 (Rebuild missing cache)

### Issue 3: Orphaned Records
**Symptoms:** Large tddf_master table, memory issues  
**Diagnosis:** Run health check #3  
**Solution:** Run Fix #3 (Clean up orphaned records) - ⚠️ Use caution

### Issue 4: Performance Degradation
**Symptoms:** Slow queries, timeouts  
**Diagnosis:** Run health check #10 (overall statistics)  
**Solution:** Run Fix #9 (Rebuild missing indexes)

### Issue 5: Pending Host Approvals
**Symptoms:** Batch uploaders can't upload files  
**Diagnosis:** Run health check #7  
**Solution:** Run Fix #8 (Update host approval status)

## Best Practices

1. **Regular Monitoring**
   - Run health checks daily
   - Set up alerts using the `/api/database/health` endpoint
   - Monitor the overall statistics weekly

2. **Before Applying Fixes**
   - Always run the diagnostic query first
   - Review what will be affected
   - Test on development if possible
   - Have a rollback plan

3. **After Applying Fixes**
   - Run the health check again
   - Verify the issue is resolved
   - Document what was done
   - Monitor for any side effects

4. **Emergency Procedures**
   - If database is unresponsive, check `/api/database/ping`
   - If many tables missing, contact admin (don't run fixes)
   - If orphaned records > 10,000, investigate before deleting
   - If stuck files > 50, investigate root cause first

## Automation

These scripts can be automated using cron jobs or monitoring tools:

```bash
# Example: Daily health check via API
0 2 * * * curl -s https://your-app.replit.dev/api/database/health | jq .status

# Example: Weekly cleanup of old connection logs
0 3 * * 0 psql $DATABASE_URL -f /path/to/fix6-cleanup-logs.sql
```

## Support

If you encounter issues not covered by these scripts:
1. Check the application logs
2. Review the health check API response
3. Document the issue with specific error messages
4. Contact the development team with health check results
