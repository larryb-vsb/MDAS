# Deployment Environment Checklist

## Critical Environment-Aware Code Patterns

### 🚨 HARDCODED TABLE REFERENCES (High Risk)
**What to Check:** Look for imports from `@shared/schema` being used directly in queries instead of `getTableName()`

**Risk Areas:**
```typescript
// ❌ DANGEROUS - Hardcoded table reference
import { merchants as merchantsTable } from "@shared/schema";
let query = db.select().from(merchantsTable);

// ✅ SAFE - Environment-aware table naming  
const merchantsTableName = getTableName('merchants');
const query = `SELECT * FROM ${merchantsTableName}`;
```

**Files to Audit:**
- `server/storage.ts` (Lines 8-48: All table imports)
- `server/routes.ts` (Search for `.from(` patterns)
- Any new database query methods

### 🔍 Pre-Deployment Search Patterns

**Search for these danger patterns:**
```bash
# Find hardcoded table usage
grep -r "\.from(" server/
grep -r "merchantsTable\|transactionsTable\|terminalsTable" server/
grep -r "db\.select\(\)\.from\(" server/

# Find non-environment-aware queries
grep -r "SELECT.*FROM [a-z_]*[^$]" server/ | grep -v getTableName
```

**Safe patterns to verify:**
```bash
# These should be present in all database operations
grep -r "getTableName(" server/
grep -r "tableName.*=" server/
```

### 📋 Environment Detection Verification

**Required Environment Behaviors:**

| Environment | Table Prefix | getMerchants Query | Dashboard Stats |
|-------------|--------------|-------------------|-----------------|
| Development | `dev_` | `FROM dev_merchants` | dev_* tables |
| Production | _(none)_ | `FROM merchants` | main tables |

**Console Log Patterns:**
```javascript
// Must see these logs in deployment
[GET MERCHANTS] Using table: dev_merchants for environment: development
[GET MERCHANTS] Using table: merchants for environment: production
```

### 🏷️ Code Tagging Strategy

**Add these comments to environment-sensitive areas:**

```typescript
// @ENVIRONMENT-CRITICAL: Uses getTableName() for dev/prod separation
const merchantsTableName = getTableName('merchants');

// @DEPLOYMENT-CHECK: Verify table prefix in logs
console.log(`[GET MERCHANTS] Using table: ${merchantsTableName}`);

// @PRODUCTION-IMPACT: Changes here affect production data access
const result = await db.execute(sql.raw(query, params));
```

### 🔧 Automated Check Script

Create `scripts/pre-deployment-check.js`:
```javascript
// Pre-deployment environment validation script
const fs = require('fs');
const path = require('path');

const DANGER_PATTERNS = [
  /\.from\(.*Table\)/g,           // Drizzle ORM hardcoded tables
  /FROM \w+[^$\{]/g,              // Raw SQL without template variables
  /merchantsTable|transactionsTable/g // Imported table constants
];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  DANGER_PATTERNS.forEach((pattern, index) => {
    const matches = content.match(pattern);
    if (matches) {
      issues.push({
        pattern: pattern.toString(),
        matches: matches,
        file: filePath
      });
    }
  });
  
  return issues;
}

// Check all server files
const serverFiles = fs.readdirSync('./server')
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join('./server', f));

console.log('🔍 Pre-Deployment Environment Check');
console.log('=====================================');

let totalIssues = 0;
serverFiles.forEach(file => {
  const issues = checkFile(file);
  if (issues.length > 0) {
    console.log(`⚠️  ${file}:`);
    issues.forEach(issue => {
      console.log(`   - Pattern: ${issue.pattern}`);
      console.log(`   - Found: ${issue.matches.join(', ')}`);
    });
    totalIssues += issues.length;
  }
});

if (totalIssues === 0) {
  console.log('✅ No environment-risk patterns detected');
} else {
  console.log(`🚨 Found ${totalIssues} potential environment issues`);
  process.exit(1);
}
```

### 📝 Developer Guidelines

**When writing new database queries:**

1. **Always use `getTableName()`:**
   ```typescript
   const tableName = getTableName('merchants');
   ```

2. **Add environment logging:**
   ```typescript
   console.log(`[METHOD_NAME] Using table: ${tableName} for environment: ${process.env.NODE_ENV}`);
   ```

3. **Tag environment-critical code:**
   ```typescript
   // @ENVIRONMENT-CRITICAL: Dev/prod table separation
   ```

4. **Test in both environments before deployment:**
   - Development: Verify `dev_*` table usage
   - Production: Verify main table usage

### 🚀 Deployment Verification Steps

**Before deploying:**
1. Run pre-deployment check script
2. Verify console logs show correct table names
3. Test API endpoints return expected data counts
4. Check that dashboard stats match environment

**After deploying:**
1. Monitor console logs for environment detection
2. Verify API responses use production tables  
3. Confirm data counts match production database
4. Test all affected functionality

### 🎯 This Issue Analysis

**What went wrong:**
- `getMerchants()` method used `merchantsTable` import (hardcoded)
- Should have used `getTableName('merchants')` (environment-aware)
- No pre-deployment environment pattern checking
- Missing environment-critical code tagging

**Impact:**
- Development: Working (164 merchants)
- Production: Broken ("No merchants found")
- Dashboard stats: Working (uses different method)

**Prevention:**
- Add `@ENVIRONMENT-CRITICAL` tags to all table operations
- Run automated pre-deployment checks
- Verify environment logs before deployment
- Test both development and production table access patterns