# Known Issues and Bug Reports

## Active Issues

### Issue #005: MMS Uploader Pagination Navigation Not Working
**Status**: Active (Backlog)  
**Priority**: Medium  
**Date Reported**: 2025-07-31  
**Reported By**: Larry  

**Description**: 
MMS Uploader pagination system partially working - user cannot navigate beyond first 100 files despite 1,269 total files available.

**Technical Details**:
- Frontend correctly sends pagination parameters (limit: '10', offset: '0')
- Backend receives and parses parameters correctly
- Debug logs show "Found 10 uploads for session all, total: 1269"
- Pagination controls display but navigation not functioning
- API returns correct data structure with totalCount

**Current Status**: 
Added to backlog for future investigation. System infrastructure is correct but user interaction not working as expected.

---

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

### Issue #004: Production Large File Upload Failure (413 Request Entity Too Large)
**Status**: Active  
**Priority**: High  
**Date Reported**: 2025-07-28  
**Reported By**: Larry (Production Testing)  

**Description**: 
40MB file uploads fail in production environment with "413 Request Entity Too Large" error, while the same files upload successfully in development.

**Environment**:
- **Production**: Fails with 413 error for 40MB+ files
- **Development**: Works perfectly for same files
- **Small Files**: Work fine in both environments (<10MB)

**Technical Analysis**:
Application code is correctly configured for 100MB uploads:
- Express.js: `app.use(express.json({ limit: '100mb' }))`
- Multer: `limits: { fileSize: 100 * 1024 * 1024 }`
- Both development and production use identical code

**Root Cause**: 
Production infrastructure layers (reverse proxy, load balancer, or CDN) have body size limits that override application settings.

**Error Details**:
```html
<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Error 413 Request Entity Too Large</title>
</head><body>
<h1>Error 413</h1>
<p>Request Entity Too Large</p>
</body></html>
```

**Infrastructure vs Application**:
- **Application Level**: ✅ Configured for 100MB (Express.js + multer)
- **Infrastructure Level**: ❌ Production environment has lower limits

**Common Production Infrastructure Limits**:
- Reverse Proxy (nginx): Default 1MB body size limit
- Load Balancer: May have request size restrictions
- CDN/Edge: Often have upload size limitations
- Container Platform: May impose resource limits

**Fix Options**:
1. **Infrastructure Config** (Recommended): Configure production infrastructure for larger uploads
2. **Chunked Upload** (Alternative): Implement client-side file chunking for large files
3. **External Storage** (Advanced): Use S3/cloud storage with signed upload URLs

**Workaround Available**:
ChunkedFileUploader component exists but needs integration with main upload flow.

**Investigation Required**:
- Check Replit deployment configuration for body size limits
- Review reverse proxy settings in production environment
- Verify CDN/edge configuration for large file handling

**Expected Resolution**:
Configure production infrastructure to match development capabilities (100MB+ uploads).

**Business Impact**:
- Large TDDF files cannot be processed in production
- Manual workarounds required for 40MB+ files
- Production feature parity issue

---

## Future Enhancements

### Enhanced Database Safety Strategy - Dual Environment Protection
**Priority**: Medium  
**Type**: Infrastructure Enhancement  
**Complexity**: Medium  

**Description**:
Implement comprehensive database-level and table-level environment separation to provide maximum protection against production/development data mixing and human error.

**Current Implementation**:
- **Table-Level Separation**: Development uses `dev_*` prefixed tables, production uses clean table names
- **Single Database**: Both environments use same Neon database (`neondb`)
- **Environment Detection**: Automatic via `getTableName()` helper function

**Proposed Enhancement**:
- **Database-Level Separation**: `neondb_PROD` for production, `neondb_DEV` for development
- **Dual Visual Safety**: Database names + table prefixes provide multiple environment indicators
- **Enhanced Safety**: Impossible to accidentally query wrong environment data

**Implementation Strategy**:
```
Production Environment:
  Database: neondb_PROD 🚨
  Tables: merchants, transactions, uploaded_files

Development Environment:  
  Database: neondb_DEV 🛠️
  Tables: dev_merchants, dev_transactions, dev_uploaded_files
```

**Benefits**:
- **Developer Safety**: Database browser shows clear environment at both database and table levels
- **Agent Protection**: AI agents get dual-level environment warnings in all contexts
- **Human Error Prevention**: Multiple visual warnings prevent "stupid human" mistakes
- **Query Safety**: SQL queries show environment context at both connection and table levels
- **Backward Compatibility**: Maintains current table-level approach as fallback

**Technical Requirements**:
- Create `neondb_DEV` database with proper credentials
- Configure separate `DEV_DATABASE_URL` environment variable
- Enhance `getDatabaseUrl()` function to support dual-database strategy
- Maintain table-level separation as emergency fallback
- Update deployment documentation

**Business Value**:
- **Zero Risk**: Eliminates all possibility of production/development data accidents
- **Developer Confidence**: Clear environment awareness at all interaction levels
- **Operational Safety**: Multiple layers of protection against data mixing
- **Audit Compliance**: Enhanced environment separation for regulatory requirements

**Current Workaround**:
Existing table-level separation provides complete data isolation and proven reliability. Enhancement would add additional safety layer without disrupting current operations.

---

## Resolved Issues

*(Resolved issues will be moved here with resolution details)*

---

### Issue #006: Terminal Data Property Access Inconsistency
**Status**: Active  
**Priority**: High  
**Date Reported**: 2025-01-28  
**Reported By**: Morgan (Console Log Analysis)  

**Description**: 
Terminal detail pages experiencing inconsistent property access where some terminals load with camelCase properties and others with snake_case properties, causing undefined values and failed data displays.

**Console Evidence**:
```javascript
// Working terminal (ID: 1738) - camelCase properties available:
"vNumber":"V8422634","posMerchantNumber":"000000138461","dbaName":"verifyvend855-5539974"

// Failing terminal (ID: 91) - snake_case properties only:
"v_number":"V5076893","pos_merchant_number":"000000052266","dba_name":"Yoga Smokes"

// Mixed state terminal (ID: 1744) - some properties missing:
"v_number":"V0400119","pos_merchant_number":"000000000151","dba_name":"Vermont State B"
```

**Technical Analysis**:
- **Pattern**: Different terminals return different property naming conventions
- **Impact**: JavaScript expects camelCase but receives snake_case in some cases
- **Root Cause**: Database query results not consistently transformed
- **Frontend Code**: `terminal.vNumber`, `terminal.posMerchantNumber`, `terminal.dbaName`
- **Database Schema**: `v_number`, `pos_merchant_number`, `dba_name`

**Observable Symptoms**:
- Terminal VAR numbers showing as `null` when data exists
- Missing merchant information in terminal detail views
- Inconsistent data loading across different terminal records
- Frontend components rendering empty states despite backend data

**Debug Logs Show**:
```
[TERMINAL DEBUG] VAR Number from data: null (should be V5076893)
[TERMINAL DEBUG] VAR Number from data: "V8422634" (working correctly)
```

**Files Affected**:
- `client/src/pages/TerminalViewPage.tsx` - Property access patterns
- `server/routes/*` - Terminal data queries and transformations
- Database queries returning inconsistent column naming

**Immediate Impact**:
- Users cannot view complete terminal information
- Terminal transaction lookups failing
- Data integrity appears compromised to end users

**Related to Issue #005**: This is a specific manifestation of the broader camelCase/snake_case inconsistency problem affecting the terminal management system.

**Priority Justification**: Core functionality failure affecting user experience and data accessibility.

**Urgency**: High - affects core data display functionality

**Estimated Fix Time**: 4-6 hours for comprehensive resolution

**Testing Requirements**:
- Verify all terminal data displays correctly
- Test merchant information rendering  
- Validate API response field mappings
- Confirm database query result consistency

---

## Issue Tracking Guidelines

1. **Create New Issues**: Add new issues to the "Active Issues" section
2. **Update Status**: Keep status field current (Open/In Progress/Testing/Resolved)
3. **Move Resolved**: Move completed issues to "Resolved Issues" with solution
4. **Link to Git**: Reference commits that address issues
5. **Use GitHub Issues**: For collaborative tracking, also create GitHub issues