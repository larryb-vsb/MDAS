# Production Environment Configuration Fix

## Critical Issue Identified
The production deployment is showing development data (42,028 records) instead of production data (34 records) because the `NODE_ENV` environment variable is not set.

## Root Cause
- `NODE_ENV` is undefined/empty in production deployment
- System defaults to 'development' mode when `NODE_ENV` is not set
- Environment detection code in `server/env-config.ts` uses fallback: `process.env.NODE_ENV || 'development'`
- Production queries incorrect tables (dev_uploaded_files, dev_transactions, dev_tddf_records)

## Fix Required: Set NODE_ENV=production

### Method 1: Replit Dashboard (Recommended)
1. Go to Replit project dashboard
2. Navigate to "Settings" or "Environment" tab
3. Add environment variable:
   - **Key**: `NODE_ENV`
   - **Value**: `production`
4. Redeploy the application

### Method 2: Deployment Configuration
If deployment environment variables are supported, add to deployment config:
```
NODE_ENV=production
```

## Environment Detection Verification

### Current Behavior (Development Mode)
```
[ENV CONFIG] NODE_ENV from process.env: undefined
[ENV CONFIG] Final NODE_ENV: development, isProd: false, isDev: true
[TABLE CONFIG] development mode - Table prefix: "dev_"
[REAL-TIME STATS] Using tables: dev_uploaded_files, dev_transactions, dev_tddf_records
```

### Expected Behavior (Production Mode)
```
[ENV CONFIG] NODE_ENV from process.env: production
[ENV CONFIG] Final NODE_ENV: production, isProd: true, isDev: false
[TABLE CONFIG] production mode - Table prefix: ""
[REAL-TIME STATS] Using tables: uploaded_files, transactions, tddf_records
```

## Data Impact
- **Development Tables**: 42,028 TDDF records (extensive test data)
- **Production Tables**: 34 TDDF records (actual production data)
- **Current Display**: Shows development data in production frontend

## After Fix Verification
1. Check console logs for environment detection:
   ```
   [ENV CONFIG] Final NODE_ENV: production, isProd: true
   ```

2. Verify API responses use production tables:
   ```
   [REAL-TIME STATS] Using tables: uploaded_files, transactions, tddf_records
   ```

3. Dashboard should display 34 processed records instead of 42,028

## Table Mapping Reference
| Environment | Merchants | Transactions | TDDF Records | Uploads |
|-------------|-----------|--------------|--------------|---------|
| Development | dev_merchants | dev_transactions | dev_tddf_records | dev_uploaded_files |
| Production | merchants | transactions | tddf_records | uploaded_files |

## Technical Details
- Environment detection: `server/env-config.ts`
- Table routing: `server/table-config.ts`
- API queries: All endpoints use `getTableName()` function for environment-aware table selection
- Frontend: No changes needed - environment detection is server-side only