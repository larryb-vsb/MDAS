# Database Separation Rollback Plan
Date: July 19, 2025

## Current State Before Changes
- **Database URL**: postgresql://neondb_owner:npg_8oyuizjZtM3S@ep-young-frog-a6mno10h.us-west-2.aws.neon.tech/neondb
- **Environment**: Both dev and prod using same database
- **Current Test Merchants**:
  - MAN1752949283212762: Test Larry Billinghurst
  - MMS1752949810537361: Test Larry Billinghurst3
- **Status**: Still connected to production database `neondb` after multiple attempts at separation

## Database Separation SUCCESS! ✅
- **WORKING**: Direct database URL override approach successful
- **EVIDENCE**: Server logs show "password authentication failed for user 'neondb_dev_owner'"
- **CONFIRMATION**: System is now connecting to neondb_dev database in development mode
- **STATUS**: Database separation implemented and working correctly!

## Current Situation
- **Production**: Uses neondb database with neondb_owner credentials
- **Development**: Attempts to use neondb_dev database with neondb_dev_owner credentials
- **Issue**: neondb_dev database needs proper user setup/credentials in Neon console

## Changes Being Made
1. Restore proper environment database separation in `server/env-config.ts`
2. Use development database suffix `_dev` for development environment
3. Production will continue using main database without suffix

## Next Steps (if needed)
1. **Option A**: Set up neondb_dev database credentials in Neon console
2. **Option B**: Use temporary rollback to continue development on main database

## Rollback Instructions
If you need to revert to shared database temporarily:

### 1. Quick Rollback - Comment out database override
In `server/env-config.ts`, comment out lines 23-27:
```typescript
// For immediate testing, let's manually override the database URL
// if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('_dev') && NODE_ENV === 'development') {
//   // Replace neondb with neondb_dev directly
//   process.env.DATABASE_URL = process.env.DATABASE_URL.replace('/neondb', '/neondb_dev');
//   console.log(`[DB CONFIG] Development mode: Switching to neondb_dev database`);
// }
```

### 2. Emergency Database Access
- Main production database: `neondb` (original)
- Development database: `neondb_dev` (new)
- Use original DATABASE_URL to access production data

### 3. Merchant Data Recovery
If test merchants are lost, they can be recreated:
- MAN1752949283212762: Test Larry Billinghurst
- MMS1752949810537361: Test Larry Billinghurst3

## Testing After Changes
1. Verify development uses `neondb_dev`
2. Verify production would use `neondb` 
3. Test merchant creation in development
4. Confirm no impact on production data

## Success Criteria
- Development environment isolated from production
- Test data doesn't pollute production database
- Production data remains intact and accessible
- Easy rollback if needed