// Test script to verify merchant type validation is working
const { normalizeMerchantType, merchantTypeMapping } = require('./shared/field-mappings.js');

console.log('=== MERCHANT TYPE VALIDATION TEST ===');

// Test cases based on the CSV schema you showed
const testCases = [
  { input: '1', expected: '1', description: 'Online (numeric 1)' },
  { input: '2', expected: '2', description: 'Retail (numeric 2)' },
  { input: '3', expected: '3', description: 'Mixed (numeric 3)' },
  { input: '4', expected: '4', description: 'B2B (numeric 4)' },
  { input: '5', expected: '5', description: 'Wholesale (numeric 5)' },
  { input: '6', expected: '6', description: 'Service (numeric 6)' },
  { input: 'online', expected: '1', description: 'Text "online" -> 1' },
  { input: 'retail', expected: '2', description: 'Text "retail" -> 2' },
  { input: 'mixed', expected: '3', description: 'Text "mixed" -> 3' },
  { input: 'wholesale', expected: '5', description: 'Text "wholesale" -> 5' },
  { input: '99', expected: '99', description: 'Custom numeric (99)' },
  { input: '', expected: null, description: 'Empty string -> null' },
  { input: null, expected: null, description: 'Null -> null' },
  { input: 'invalid', expected: null, description: 'Invalid text -> null' }
];

console.log('\n=== Testing normalizeMerchantType Function ===');
testCases.forEach((testCase, index) => {
  const result = normalizeMerchantType(testCase.input);
  const status = result === testCase.expected ? '✅ PASS' : '❌ FAIL';
  console.log(`${index + 1}. ${status} Input: "${testCase.input}" -> Output: "${result}" (Expected: "${testCase.expected}") - ${testCase.description}`);
});

console.log('\n=== Testing merchantTypeMapping ===');
Object.entries(merchantTypeMapping).forEach(([key, value]) => {
  console.log(`Numeric "${key}" -> "${value}"`);
});

console.log('\n=== Merchant Type Validation Ready ===');
console.log('The system can now handle:');
console.log('- Numeric values (1-10) from CSV files');
console.log('- Text values (online, retail, mixed, etc.) converted to numeric');
console.log('- Custom numeric values (stored as-is)');
console.log('- Invalid values (ignored/null)');