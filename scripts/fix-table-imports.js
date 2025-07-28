#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Table mapping for environment-aware fixes
const tableMappings = {
  'usersTable': 'users',
  'merchantsTable': 'merchants', 
  'transactionsTable': 'transactions',
  'uploadedFilesTable': 'uploaded_files',
  'auditLogsTable': 'audit_logs',
  'systemLogsTable': 'system_logs',
  'tddfRecordsTable': 'tddf_records',
  'terminalsTable': 'terminals',
  'tddfRawImportTable': 'tddf_raw_import'
};

function fixTableImports(filePath) {
  console.log(`🔧 Fixing table imports in ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Replace direct table usage with getTableName() calls
  for (const [tableVar, tableName] of Object.entries(tableMappings)) {
    // Pattern: db.select().from(tableVar)
    const fromPattern = new RegExp(`db\\.select\\(\\)\\.from\\(${tableVar}\\)`, 'g');
    if (fromPattern.test(content)) {
      content = content.replace(fromPattern, `db.execute(sql\`SELECT * FROM \${sql.identifier(getTableName('${tableName}'))}\`)`);
      changes++;
    }
    
    // Pattern: .insert(tableVar)
    const insertPattern = new RegExp(`\\.insert\\(${tableVar}\\)`, 'g');
    if (insertPattern.test(content)) {
      content = content.replace(insertPattern, `.execute(sql\`INSERT INTO \${sql.identifier(getTableName('${tableName}'))}\`)`);
      changes++;
    }
    
    // Pattern: .update(tableVar) 
    const updatePattern = new RegExp(`\\.update\\(${tableVar}\\)`, 'g');
    if (updatePattern.test(content)) {
      content = content.replace(updatePattern, `.execute(sql\`UPDATE \${sql.identifier(getTableName('${tableName}'))}\`)`);
      changes++;
    }
    
    // Pattern: .delete().from(tableVar)
    const deletePattern = new RegExp(`\\.delete\\(\\)\\.from\\(${tableVar}\\)`, 'g');
    if (deletePattern.test(content)) {
      content = content.replace(deletePattern, `.execute(sql\`DELETE FROM \${sql.identifier(getTableName('${tableName}'))}\`)`);
      changes++;
    }
  }
  
  if (changes > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed ${changes} table import issues in ${filePath}`);
  } else {
    console.log(`ℹ️  No table import fixes needed in ${filePath}`);
  }
  
  return changes;
}

// Fix the main storage file
const storageFile = path.join(process.cwd(), 'server/storage.ts');
const totalChanges = fixTableImports(storageFile);

console.log(`\n📊 Summary: Fixed ${totalChanges} table import issues total`);

if (totalChanges > 0) {
  console.log('\n⚠️  Note: These fixes convert Drizzle ORM calls to raw SQL for environment awareness');
  console.log('🔄 Consider restarting the server to apply changes');
}