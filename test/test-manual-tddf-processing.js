#!/usr/bin/env node

// Manual TDDF processing test with corrected field positions
import fs from 'fs';

console.log('🧪 Testing Manual TDDF Processing with Corrected Field Positions');

// Read the TDDF file
const tddfContent = fs.readFileSync('test-real-tddf.TSYSO', 'utf-8');
const lines = tddfContent.split('\n');

console.log(`📄 Found ${lines.length} lines in TDDF file`);

let transactionCount = 0;

lines.forEach((line, index) => {
  if (line.length < 20) return; // Skip empty/short lines
  
  const recordType = line.substring(17, 19); // Positions 18-19
  if (recordType === 'DT') {
    transactionCount++;
    console.log(`\n📊 DT Record ${transactionCount} (Line ${index + 1}):`);
    console.log(`  Line length: ${line.length}`);
    
    // Test field extractions based on TDDF specification
    const merchantAccount = line.substring(23, 39).trim(); // Positions 24-39
    const associationNumber = line.substring(39, 45).trim(); // Positions 40-45  
    const groupNumber = line.substring(45, 51).trim(); // Positions 46-51
    const referenceNumber = line.substring(61, 84).trim(); // Positions 62-84
    const transactionDate = line.substring(84, 92).trim(); // Positions 85-92
    const transactionAmount = line.substring(92, 103).trim(); // Positions 93-103
    const cardholderAccount = line.length >= 142 ? line.substring(123, 142).trim() : 'LINE TOO SHORT';
    
    // The critical merchant name field
    const merchantName = line.length >= 242 ? line.substring(217, 242).trim() : 'LINE TOO SHORT';
    
    console.log(`  Merchant Account (24-39): "${merchantAccount}"`);
    console.log(`  Association (40-45): "${associationNumber}"`);
    console.log(`  Group (46-51): "${groupNumber}"`);
    console.log(`  Reference Number (62-84): "${referenceNumber}"`);
    console.log(`  Transaction Date (85-92): "${transactionDate}"`);
    console.log(`  Transaction Amount (93-103): "${transactionAmount}"`);
    console.log(`  Cardholder Account (124-142): "${cardholderAccount}"`);
    console.log(`  ✨ MERCHANT NAME (218-242): "${merchantName}"`);
    
    // Visual confirmation of line content around merchant name position
    if (line.length >= 250) {
      console.log(`  Context around merchant name (210-250): "${line.substring(209, 250)}"`);
    }
  }
});

console.log(`\n📈 Total DT transaction records found: ${transactionCount}`);