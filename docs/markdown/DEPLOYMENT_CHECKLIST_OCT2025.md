# Production Deployment Checklist - October 2025

**Deployment Version:** 2.8.0 → 2.9.0  
**Deployment Date:** ________________  
**Deployment Lead:** ________________  
**Estimated Duration:** 15-30 minutes

---

## Pre-Deployment Phase

### Environment Verification
- [ ] **Confirm database connections:**
  - [ ] Development DB: `ep-shy-king-aasxdlh7` (NEON_DEV_DATABASE_URL) accessible
  - [ ] Production DB: `ep-quiet-unit-aa0eaxhe` (NEON_PROD_DATABASE_URL) accessible
  
- [ ] **Test connection to production database:**
  ```sql
  SELECT current_database(), version();
  ```

- [ ] **Verify current production schema version:**
  ```sql
  -- Check if soft-delete columns already exist
  SELECT column_name 
  FROM information_schema.columns 
  WHERE table_name = 'uploader_uploads' 
    AND column_name IN ('deleted_at', 'deleted_by');
  -- Expected: 0 rows if migration needed
  ```

### Backup and Safety
- [ ] **Create full database backup:**
  - [ ] Via Neon Console: Navigate to ep-quiet-unit-aa0eaxhe → Backups → Create backup
  - [ ] Document backup ID: ________________
  - [ ] Verify backup completed successfully

- [ ] **Export critical tables (optional extra safety):**
  ```bash
  # If using pg_dump access:
  pg_dump -h [host] -U [user] -t uploader_uploads -t audit_logs > backup_oct2025.sql
  ```

- [ ] **Verify no active file uploads in progress:**
  ```sql
  SELECT COUNT(*) as active_uploads
  FROM uploader_uploads
  WHERE upload_status = 'started' 
    AND uploaded_at > NOW() - INTERVAL '5 minutes';
  -- Expected: 0 or very low number
  ```

### Code Preparation
- [ ] **Review code changes requiring deployment:**
  - [ ] `server/storage.ts` - naming convention fixes (deletedAt/deletedBy)
  - [ ] `server/routes.ts` - soft-delete endpoint and filtering
  - [ ] No frontend changes require rebuild

- [ ] **Verify application is in deployable state:**
  - [ ] All tests passing on development
  - [ ] LSP errors resolved
  - [ ] Git repository clean (all changes committed)

### Communication
- [ ] **Notify stakeholders of maintenance window**
- [ ] **Estimated downtime:** 5-10 minutes (application restart only)
- [ ] **Maintenance start time:** ________________
- [ ] **Maintenance end time:** ________________

---

## Deployment Phase

### Step 1: Database Schema Migration (10 minutes)

- [ ] **Connect to production database:**
  ```bash
  # Use Neon SQL Editor or psql
  psql $NEON_PROD_DATABASE_URL
  ```

- [ ] **Run migration script:**
  ```bash
  # Option A: Via psql
  psql $NEON_PROD_DATABASE_URL -f production-migration-oct2025.sql
  
  # Option B: Via SQL Editor (copy/paste script contents)
  ```

- [ ] **Review migration output for errors:**
  - [ ] All columns added successfully
  - [ ] All indexes created successfully
  - [ ] No error messages in output
  - [ ] Verification queries show expected results

- [ ] **Document migration completion time:** ________________

### Step 2: Application Code Deployment (5 minutes)

- [ ] **Deploy updated application code:**
  - [ ] Via Replit: Click "Publish" button
  - [ ] OR via Git: Push to production branch
  - [ ] Verify deployment initiated

- [ ] **Monitor deployment logs:**
  - [ ] No build errors
  - [ ] Dependencies installed successfully
  - [ ] Application compiled without warnings

- [ ] **Wait for deployment to complete**
  - [ ] Status shows "Published" or "Running"

### Step 3: Application Restart (2 minutes)

- [ ] **Restart production application:**
  - [ ] Stop existing process
  - [ ] Start new process with updated code
  - [ ] Verify process started successfully

- [ ] **Monitor startup logs:**
  - [ ] Database connection established
  - [ ] No startup errors
  - [ ] Server listening on expected port

---

## Verification Phase

### Immediate Checks (0-5 minutes)

- [ ] **Application health check:**
  ```bash
  curl https://[production-url]/health
  # Expected: 200 OK
  ```

- [ ] **Database connection verified:**
  - [ ] Check application logs for successful DB connection
  - [ ] No connection errors in logs

- [ ] **Run verification SQL:**
  ```bash
  psql $NEON_PROD_DATABASE_URL -f production-verification-oct2025.sql
  ```

- [ ] **Review verification results:**
  - [ ] Section 1: All schema changes present ✓
  - [ ] Section 2: Data integrity maintained ✓
  - [ ] Section 3: Functional tests passing ✓
  - [ ] Section 6: Migration health = HEALTHY ✓

### Functional Testing (5-10 minutes)

- [ ] **Test file upload functionality:**
  - [ ] Upload a small test TDDF file
  - [ ] Verify file appears in upload list
  - [ ] Check file processing completes successfully

- [ ] **Test soft-delete functionality:**
  ```bash
  # Via API or UI
  DELETE /api/uploader/bulk-delete
  Body: { "ids": ["test-file-id"] }
  ```
  - [ ] File marked as deleted (upload_status='deleted')
  - [ ] File has deleted_at timestamp
  - [ ] File has deleted_by username
  - [ ] File no longer appears in main file list

- [ ] **Test audit log creation:**
  ```sql
  SELECT * FROM audit_logs 
  WHERE action = 'soft_delete' 
  ORDER BY timestamp DESC 
  LIMIT 1;
  ```
  - [ ] Audit entry created
  - [ ] file_metadata field populated
  - [ ] Contains filename, size, record counts

- [ ] **Test normal file list query:**
  - [ ] Deleted files excluded from list
  - [ ] Active files display correctly
  - [ ] No 500 errors in response

### Performance Checks (5-10 minutes)

- [ ] **Monitor query performance:**
  ```sql
  -- Check index usage
  SELECT * FROM pg_stat_user_indexes 
  WHERE tablename IN ('uploader_uploads', 'audit_logs')
    AND indexname IN ('audit_logs_action_idx', 'uploader_uploads_deleted_at_idx');
  ```

- [ ] **Check slow query log:**
  - [ ] No new slow queries related to uploader_uploads
  - [ ] No new slow queries related to audit_logs

- [ ] **Application response times:**
  - [ ] File list endpoint: < 500ms
  - [ ] File upload initiation: < 200ms
  - [ ] Delete operation: < 300ms

### User Acceptance Testing (15 minutes)

- [ ] **Test key user workflows:**
  - [ ] Browse file uploads page
  - [ ] Upload new file
  - [ ] Delete a file
  - [ ] View audit logs
  - [ ] Filter files by status

- [ ] **Test edge cases:**
  - [ ] Delete already-deleted file (should fail gracefully)
  - [ ] Upload file with same name as deleted file
  - [ ] Restore deleted file (if feature implemented)

---

## Post-Deployment Phase

### Monitoring (First 24 hours)

- [ ] **Hour 1: Active monitoring**
  - [ ] Check error logs every 15 minutes
  - [ ] Monitor user activity
  - [ ] Track API response times

- [ ] **Hour 2-4: Regular checks**
  - [ ] Review logs hourly
  - [ ] Check for any user-reported issues
  - [ ] Monitor database performance metrics

- [ ] **Hour 4-24: Passive monitoring**
  - [ ] Set up alerts for errors
  - [ ] Review daily summary of activity
  - [ ] Check for any anomalies

### Success Metrics

- [ ] **Zero critical errors** in first 24 hours
- [ ] **File processing success rate** maintained (>95%)
- [ ] **Soft-delete operations** working as expected
- [ ] **Audit trail completeness** verified
- [ ] **No performance degradation** detected

### Documentation

- [ ] **Update deployment log:**
  - Deployment date/time: ________________
  - Migration duration: ________________
  - Issues encountered: ________________
  - Resolution steps: ________________

- [ ] **Update replit.md:**
  - [ ] Add production deployment date
  - [ ] Document schema version: 2.9.0
  - [ ] Note any deployment-specific details

- [ ] **Archive deployment artifacts:**
  - [ ] Migration script executed
  - [ ] Verification results
  - [ ] Deployment logs
  - [ ] Backup references

---

## Rollback Procedures

### When to Rollback

**Immediate rollback if:**
- [ ] Application fails to start after deployment
- [ ] Critical database errors preventing operations
- [ ] Data corruption detected
- [ ] Complete feature failure

**Consider rollback if:**
- [ ] Performance degradation >50%
- [ ] Multiple user-reported issues
- [ ] Unexpected behavior in core features
- [ ] Audit trail not functioning

### Rollback Steps

**1. Stop application** (if running):
```bash
# Stop production process
```

**2. Revert database schema:**
```bash
psql $NEON_PROD_DATABASE_URL -f production-rollback-oct2025.sql
```

**3. Verify rollback:**
```sql
-- Check columns removed
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'uploader_uploads' 
  AND column_name IN ('deleted_at', 'deleted_by');
-- Expected: 0 rows
```

**4. Revert application code:**
- Deploy previous working version
- OR revert Git commits to previous release

**5. Restart application:**
- Start with previous code version
- Monitor for normal operation

**6. Verify rollback success:**
- [ ] Application starts successfully
- [ ] No database errors
- [ ] Core features working
- [ ] Users can access system

**7. Document rollback:**
- Rollback time: ________________
- Reason: ________________
- Duration: ________________
- Next steps: ________________

---

## Contact Information

**Deployment Support:**
- Primary: ________________
- Secondary: ________________
- Emergency: ________________

**Database Admin:**
- Contact: ________________
- Neon Console: https://console.neon.tech

**Escalation Path:**
1. Check deployment checklist for missed steps
2. Review verification results for specific failure
3. Check rollback procedures if needed
4. Contact database admin if data issues
5. Escalate to development team if code issues

---

## Completion

- [ ] **All verification checks passed**
- [ ] **Monitoring established**
- [ ] **Documentation updated**
- [ ] **Stakeholders notified of completion**
- [ ] **Deployment marked as successful**

**Deployment completed by:** ________________  
**Completion time:** ________________  
**Status:** [ ] Success  [ ] Partial  [ ] Rolled Back

---

**Next Scheduled Deployment:** ________________
