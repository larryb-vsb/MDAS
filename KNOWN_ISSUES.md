
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
**Status**: Open  
**Priority**: Critical  
**Date Reported**: 2025-07-28  
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

**Next Steps**:
- [ ] Set NODE_ENV=production in deployment
- [ ] Redeploy application  
- [ ] Verify Dashboard shows 236 merchants
- [ ] Verify ACH Merchants tab displays merchant list
- [ ] Move to resolved issues when fixed

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
