// Quick test to verify TDDF field mapping is working correctly
const testTddfLine = "0000001000001DT998877ABCDE 54321234567890123456789011252024     50000000000011252024123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345TEST MERCHANT ONE        123456ABCD1234567890";

console.log("Testing TDDF field extraction from test line:");
console.log("Line length:", testTddfLine.length);
console.log("Record identifier (18-19):", testTddfLine.substring(17, 19));
console.log("Merchant Account (24-39):", testTddfLine.substring(23, 39));
console.log("Reference Number (62-84):", testTddfLine.substring(61, 84));
console.log("Transaction Code (52-55):", testTddfLine.substring(51, 55));
console.log("Transaction Amount (93-103):", testTddfLine.substring(92, 103));
console.log("Transaction Date (85-92):", testTddfLine.substring(84, 92));
console.log("Merchant Name (218-242):", testTddfLine.length >= 242 ? testTddfLine.substring(217, 242) : "LINE TOO SHORT");

// Test the parsing logic
function parseAmount(amountStr) {
  if (!amountStr || amountStr.trim() === '') return 0;
  const cleanAmount = amountStr.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleanAmount);
  return isNaN(parsed) ? 0 : Math.abs(parsed) / 100; // Assuming amounts are in cents
}

function parseTddfDate(dateStr) {
  if (!dateStr || dateStr.trim() === '' || dateStr.length !== 8) {
    return new Date();
  }
  
  const month = parseInt(dateStr.substring(0, 2)) - 1;
  const day = parseInt(dateStr.substring(2, 4));
  const century = parseInt(dateStr.substring(4, 6));
  const year2digit = parseInt(dateStr.substring(6, 8));
  
  const fullYear = (century * 100) + year2digit;
  return new Date(fullYear, month, day);
}

console.log("\nParsed values:");
console.log("Amount:", parseAmount(testTddfLine.substring(92, 103)));
console.log("Date:", parseTddfDate(testTddfLine.substring(84, 92)));