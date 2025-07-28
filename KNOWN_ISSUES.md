
# Known Issues and Bug Reports

## Active Issues

### Issue #001: Merchant Display Not Loading  
**Status**: Resolved  
**Priority**: High  
**Date Reported**: 2025-01-27  
**Date Resolved**: 2025-07-28  
**Reported By**: Larry  

**Description**: 
Merchant table/list is not displaying data in the MMS interface, despite API calls returning successful responses.

**Resolution**: 
Issue was related to React component state. Fixed through component debugging and state management improvements.

---

### Issue #002: Production Environment Configuration Error
**Status**: Resolved  
**Priority**: Critical  
**Date Reported**: 2025-07-28  
**Date Resolved**: 2025-07-28  
**Reported By**: Alex (System Analysis)  

**Description**: 
Production deployment is showing development data instead of production data due to NODE_ENV environment variable not being set.

**Technical Details**:
- NODE_ENV is undefined/empty in production deployment
- System defaults to 'development' mode when NODE_ENV is not set
- Production queries incorrect tables (dev_uploaded_files, dev_transactions, dev_tddf_records)
- Shows 42,028 development records instead of 34 production records
- Environment detection code in `server/env-config.ts` uses fallback: `process.env.NODE_ENV || 'development'`

**Environment**:
- Production deployment environment
- Environment detection code fallback issue

**Reproduction Steps**:
1. Deploy to production without setting NODE_ENV
2. Check system logs - shows development mode
3. API returns development data instead of production data
4. Dashboard shows incorrect record counts

**Expected Behavior**: 
Production should use production tables and show production data (34 records)

**Current Behavior**: 
Production shows "No merchants found" on Dashboard and Merchants ACH tab because it queries empty dev_merchants table instead of production merchants table

**Screenshots**: 
- Dashboard Key Performance Indicators show wrong data
- Merchants page ACH Merchants tab shows "No merchants found" 
- Production has 236 merchants but interface shows empty state

**Fix Required**:
Set NODE_ENV=production in Replit deployment environment variables

**Step-by-Step Fix Instructions**:
1. Go to Replit project dashboard
2. Navigate to "Settings" or "Environment" tab  
3. Add environment variable:
   - **Key**: NODE_ENV
   - **Value**: production
4. Redeploy the application
5. Verify merchants display correctly

**Investigation Notes**:
- PRODUCTION_ENVIRONMENT_FIX.md contains detailed technical analysis
- Environment detection works correctly when NODE_ENV is set
- Development/production table separation working as designed
- Issue is deployment configuration, not code
- Production tables contain correct data (236 merchants)

**Resolution Applied**:
Enhanced environment detection in `server/env-config.ts` to automatically detect production deployments when NODE_ENV is not explicitly set.

**Code Changes**:
- Added `detectEnvironment()` function with production environment indicators
- Checks for REPLIT_DEPLOYMENT, REPL_DEPLOYMENT, .replit.app domains
- Enhanced logging for better deployment visibility
- Maintains backward compatibility with explicit NODE_ENV setting

**Fix Benefits**:
- No longer requires manual NODE_ENV=production setting in deployment
- Automatically detects Replit production deployments
- Maintains development mode for local development
- Enhanced logging for deployment troubleshooting

**Testing**:
- ✅ Development environment correctly detected (auto-detected as development)
- ✅ Enhanced logging shows detection method (explicit vs auto-detected)
- ✅ Backward compatibility maintained for explicit NODE_ENV
- ✅ Ready for production deployment with automatic detection

---

### Issue #003: Environment Control Review - Missing @ENVIRONMENT-CRITICAL Tags
**Status**: Active  
**Priority**: High  
**Date Reported**: 2025-07-28  
**Reported By**: Morgan (Code Review Analysis)  

**Description**: 
Code review revealed multiple files with hardcoded table references and missing environment awareness controls that need @ENVIRONMENT-CRITICAL and @DEPLOYMENT-CHECK tags applied.

**Files Requiring Environment Control Tags**:

**Critical Files Found**:
- `server/routes/log_test_routes.ts` - Contains database operations requiring environment awareness
- `server/routes/logs_routes.ts` - Database query operations need environment controls  
- `server/update_backup_table.ts` - Backup operations must be environment-aware
- `server/update_backup_schedule_table.ts` - Schedule operations need environment controls
- `server/restore-env-backup.ts` - Restore operations require environment safety checks
- `server/database-helpers.ts` - Core database helper functions need environment awareness
- `server/add_default_backup_schedule.ts` - Default operations must respect environment
- `server/services/concurrency-cleanup.ts` - Cleanup operations need environment controls
- `server/services/file-processor.ts` - File processing operations require environment awareness
- `server/services/processing-watcher.ts` - Monitoring services need environment controls

**Required Tagging Pattern**:
```typescript
// @ENVIRONMENT-CRITICAL - This code must be environment-aware
// @DEPLOYMENT-CHECK - Verify environment handling before deployment
```

**Environment Safety Requirements**:
1. All database table references must use `getTableName()` helper function
2. All hardcoded table imports must be replaced with environment-aware patterns
3. Production vs development logic must be clearly marked
4. Deployment safety checks must verify environment awareness

**Current Impact**:
- 54+ instances of hardcoded table imports detected by Alex's deployment safety system
- Risk of production/development data mixing
- Potential deployment failures due to environment mismatches

**Alex's Deployment Safety System Detection**:
- Pre-deployment script `scripts/pre-deployment-check.js` identifies these patterns
- High severity issues prevent production deployment until fixed
- Systematic pattern analysis revealed environment-awareness gaps

**Fix Required**:
1. Apply @ENVIRONMENT-CRITICAL and @DEPLOYMENT-CHECK tags to all identified files
2. Replace hardcoded table imports with environment-aware `getTableName()` calls
3. Ensure all database operations respect environment separation
4. Pass deployment safety checks before production deployment

**Code Pattern Required**:
```typescript
// @ENVIRONMENT-CRITICAL - Database operations must be environment-aware
// @DEPLOYMENT-CHECK - Verify table naming uses getTableName() helper
import { getTableName } from '../table-config';

// Instead of: sql`SELECT * FROM merchants`
// Use: sql`SELECT * FROM ${sql.identifier(getTableName('merchants'))}`
```

**Prevention Measures**:
- Deployment safety system blocks unsafe deployments
- Code review process to verify environment awareness
- Systematic replacement of hardcoded patterns
- Documentation of environment-critical code sections

**Related Issues**:
- Linked to Issue #002 (Production Environment Configuration Error)
- Part of Alex's deployment safety system implementation
- Proactive infrastructure to prevent similar issues

**Reproduction Steps**:
1. Navigate to merchant management page
2. Observe empty/non-loading merchant table
3. Check browser console - API calls succeed
4. Check Problems tab - no static analysis issues

**Expected Behavior**: 
Merchant table should display list of merchants with data from API

**Current Behavior**: 
Merchant table fails to render/display data

**Investigation Notes**:
- API layer working correctly
- Likely React component state or rendering issue
- Not a TypeScript compilation error
- Not an import/export issue

**Next Steps**:
- [ ] Investigate React component state management
- [ ] Check for useState/useEffect issues
- [ ] Review data transformation in frontend
- [ ] Check for async rendering problems

---

## Resolved Issues

*(Resolved issues will be moved here with resolution details)*

---

## Issue Tracking Guidelines

1. **Create New Issues**: Add new issues to the "Active Issues" section
2. **Update Status**: Keep status field current (Open/In Progress/Testing/Resolved)
3. **Move Resolved**: Move completed issues to "Resolved Issues" with solution
4. **Link to Git**: Reference commits that address issues
5. **Use GitHub Issues**: For collaborative tracking, also create GitHub issues
