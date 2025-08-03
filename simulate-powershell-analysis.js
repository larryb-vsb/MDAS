#!/usr/bin/env node
/**
 * Simulate PowerShell BH_DT_Summary script for August 2025 data
 * This replicates the exact logic from the PowerShell script
 */

const fs = require('fs');
const path = require('path');

// Get TDDF file from attached assets
const tddfFiles = [
  'attached_assets/VERMNTSB.6759_TDDF_2400_05122025_001356_1753750013800.TSYSO'
];

function analyzeTDDFFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }

  console.log(`\n=== Analyzing ${path.basename(filePath)} ===`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  
  let bhCount = 0;
  let dtCount = 0;
  let totalLines = 0;
  let netDepositTotal = 0.0;
  let authorizationTotal = 0.0;
  
  let currentBatchKey = "";
  const batchGroups = {};
  
  lines.forEach(line => {
    totalLines++;
    
    if (line.length < 103) return;
    
    // Extract record type from positions 18-19 (substring 17, 2)
    const recordType = line.substring(17, 2);
    
    if (recordType === "BH") {
      bhCount++;
      
      // Extract Entry/Run from positions 8-13 (substring 7, 6)
      const entryRun = line.substring(7, 6).trim();
      // Extract Merchant from positions 25-40 (substring 24, 16)  
      const merchant = line.substring(24, 16).trim();
      const batchKey = `${entryRun}-${merchant}`;
      currentBatchKey = batchKey;
      
      // Extract Net Deposit from positions 69-83 (substring 68, 15)
      const netDepositRaw = line.substring(68, 15).trim();
      const cleanAmount = netDepositRaw.replace(/[^0-9]/g, '');
      const netDeposit = /^\d+$/.test(cleanAmount) ? parseFloat(cleanAmount) / 100 : 0.0;
      
      netDepositTotal += netDeposit;
      
      batchGroups[batchKey] = {
        NetDeposit: netDeposit,
        DTTotal: 0.0,
        BatchCount: 1,
        AuthorizationCount: 0
      };
    }
    else if (recordType === "DT" && currentBatchKey !== "") {
      dtCount++;
      
      // Extract Transaction Amount from positions 93-103 (substring 92, 11)
      const txnRaw = line.substring(92, 11).trim();
      const txnClean = txnRaw.replace(/[^0-9]/g, '');
      const txnAmount = /^\d+$/.test(txnClean) ? parseFloat(txnClean) / 100 : 0.0;
      
      authorizationTotal += txnAmount;
      
      if (batchGroups[currentBatchKey]) {
        batchGroups[currentBatchKey].DTTotal += txnAmount;
        batchGroups[currentBatchKey].AuthorizationCount++;
      }
    }
  });
  
  return {
    fileName: path.basename(filePath),
    bhCount,
    dtCount,
    totalLines,
    netDepositTotal: Math.round(netDepositTotal * 100) / 100,
    authorizationTotal: Math.round(authorizationTotal * 100) / 100,
    batchGroups
  };
}

// Analyze all files
let grandTotals = {
  files: 0,
  bhCount: 0,
  dtCount: 0,
  totalLines: 0,
  netDepositTotal: 0.0,
  authorizationTotal: 0.0
};

const results = [];

tddfFiles.forEach(filePath => {
  const result = analyzeTDDFFile(filePath);
  if (result) {
    results.push(result);
    grandTotals.files++;
    grandTotals.bhCount += result.bhCount;
    grandTotals.dtCount += result.dtCount;
    grandTotals.totalLines += result.totalLines;
    grandTotals.netDepositTotal += result.netDepositTotal;
    grandTotals.authorizationTotal += result.authorizationTotal;
  }
});

// Display results
console.log('\n==================== File Summary Table ====================');
results.forEach(result => {
  console.log(`File: ${result.fileName}`);
  console.log(`  Net Deposit Total:    ${result.netDepositTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`  Authorization Total:  ${result.authorizationTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`  BH Lines: ${result.bhCount}, DT Lines: ${result.dtCount}, Total: ${result.totalLines}`);
});

console.log('\n==================== Folder Summary ====================');
console.log(`Files Processed:     ${grandTotals.files}`);
console.log(`Total Authorizations:  ${grandTotals.authorizationTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
console.log(`Total Batch Deposit:   ${grandTotals.netDepositTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
console.log(`Total DT Lines:      ${grandTotals.dtCount}`);
console.log(`Total BH Lines:      ${grandTotals.bhCount}`);
console.log(`Total Lines:         ${grandTotals.totalLines}`);

console.log('\n==================== System Comparison ====================');
console.log('PowerShell Logic Results vs Our System:');
console.log(`PowerShell Net Deposits:     $${grandTotals.netDepositTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
console.log(`PowerShell Authorizations:   $${grandTotals.authorizationTotal.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
console.log(`System Should Show (Fixed):  Net Deposits: $868,489.79, Authorizations: $879,638.53`);