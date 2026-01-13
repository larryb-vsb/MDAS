#!/usr/bin/env node
// Pre-deployment environment validation script
// Checks for hardcoded table references that could break production deployment

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🔍 Pre-Deployment Environment Check');
console.log('=====================================');

// Patterns that indicate environment-unsafe code
const DANGER_PATTERNS = [
  {
    name: 'Drizzle ORM Hardcoded Tables',
    pattern: /\.from\((merchantsTable|transactionsTable|terminalsTable|uploadedFilesTable|usersTable|auditLogsTable|systemLogsTable|securityLogsTable|tddfRecordsTable|tddfRawImportTable)/g,
    severity: 'HIGH',
    description: 'Direct table imports from schema used in queries'
  },
  {
    name: 'Raw SQL Without Template Variables',
    pattern: /FROM\s+(merchants|transactions|terminals|uploaded_files|users|audit_logs|system_logs|security_logs|tddf_records|tddf_raw_import)\s/g,
    severity: 'HIGH', 
    description: 'Raw SQL queries without environment-aware table names'
  },
  {
    name: 'Table Import Usage',
    pattern: /(merchantsTable|transactionsTable|terminalsTable|uploadedFilesTable|usersTable|auditLogsTable|systemLogsTable|securityLogsTable|tddfRecordsTable|tddfRawImportTable)(?!\s*[,=:])/g,
    severity: 'MEDIUM',
    description: 'Direct usage of imported table constants'
  },
  {
    name: 'Missing getTableName Usage',
    pattern: /db\.(select|insert|update|delete)\([^)]*\)\.(?:from|into|table)\(/g,
    severity: 'MEDIUM',
    description: 'Database operations that might need environment awareness'
  }
];

// Patterns that indicate safe environment-aware code
const SAFE_PATTERNS = [
  /getTableName\(/g,
  /tableName\s*=/g,
  /@ENVIRONMENT-CRITICAL/g
];

function checkFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { issues: [], safePatterns: 0 };
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  let safePatternCount = 0;
  
  // Check for danger patterns
  DANGER_PATTERNS.forEach(dangerPattern => {
    const matches = [...content.matchAll(dangerPattern.pattern)];
    if (matches.length > 0) {
      issues.push({
        severity: dangerPattern.severity,
        name: dangerPattern.name,
        description: dangerPattern.description,
        matches: matches.map(m => ({
          text: m[0],
          line: content.substring(0, m.index).split('\n').length
        })),
        file: filePath
      });
    }
  });
  
  // Count safe patterns
  SAFE_PATTERNS.forEach(safePattern => {
    const matches = content.match(safePattern);
    if (matches) {
      safePatternCount += matches.length;
    }
  });
  
  return { issues, safePatterns: safePatternCount };
}

// Files to check
const filesToCheck = [
  path.join(__dirname, '../server/storage.ts'),
  path.join(__dirname, '../server/routes.ts'),
  path.join(__dirname, '../server/database-migrate.ts'),
  path.join(__dirname, '../server/index.ts')
];

let totalIssues = 0;
let highSeverityIssues = 0;
let totalSafePatterns = 0;

filesToCheck.forEach(file => {
  const result = checkFile(file);
  totalSafePatterns += result.safePatterns;
  
  if (result.issues.length > 0) {
    console.log(`\n⚠️  ${file}:`);
    result.issues.forEach(issue => {
      const severityIcon = issue.severity === 'HIGH' ? '🚨' : '⚠️';
      console.log(`   ${severityIcon} ${issue.severity}: ${issue.name}`);
      console.log(`      Description: ${issue.description}`);
      issue.matches.forEach(match => {
        console.log(`      Line ${match.line}: ${match.text}`);
      });
      
      if (issue.severity === 'HIGH') {
        highSeverityIssues++;
      }
      totalIssues++;
    });
  }
});

console.log('\n📊 Summary');
console.log('===========');
console.log(`Total issues found: ${totalIssues}`);
console.log(`High severity issues: ${highSeverityIssues}`);
console.log(`Safe environment patterns: ${totalSafePatterns}`);

if (highSeverityIssues > 0) {
  console.log('\n🚨 DEPLOYMENT BLOCKED');
  console.log('High severity environment issues must be fixed before deployment');
  console.log('\nFix checklist:');
  console.log('1. Replace hardcoded table imports with getTableName() calls');
  console.log('2. Add @ENVIRONMENT-CRITICAL tags to environment-sensitive code');
  console.log('3. Add environment logging to database operations');
  console.log('4. Test in both development and production environments');
  process.exit(1);
} else if (totalIssues > 0) {
  console.log('\n⚠️  DEPLOYMENT WITH CAUTION');
  console.log('Medium severity issues detected - review before deployment');
  process.exit(0);
} else {
  console.log('\n✅ DEPLOYMENT APPROVED');
  console.log('No environment-risk patterns detected');
  if (totalSafePatterns > 0) {
    console.log(`Found ${totalSafePatterns} safe environment-aware patterns`);
  }
  process.exit(0);
}