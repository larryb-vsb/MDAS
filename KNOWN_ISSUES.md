
# Known Issues and Bug Reports

## Active Issues

### Issue #001: Merchant Display Not Loading
**Status**: Open  
**Priority**: High  
**Date Reported**: 2025-01-27  
**Reported By**: Larry  

**Description**: 
Merchant table/list is not displaying data in the MMS interface, despite API calls returning successful responses.

**Technical Details**:
- API endpoint `/api/merchants` returns 304 status with 679ms response time
- Data is being fetched successfully from the backend
- Issue appears to be in React component rendering
- No compilation errors in Problems tab
- Runtime issue not caught by static analysis

**Environment**:
- Development environment
- React/TypeScript frontend
- Working API backend

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
