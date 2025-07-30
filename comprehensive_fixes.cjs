#!/usr/bin/env node

const fs = require('fs');

const filePath = 'client/src/pages/TddfJsonPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

console.log('Applying comprehensive fixes...');

// Step 1: Add the merchant name lookup function after the other helper functions
const merchantLookupFunction = `
  // Function to get merchant name from DT records based on merchant account number
  const getMerchantNameFromDT = (merchantAccountNumber: string) => {
    if (!merchantAccountNumber || !recordsData?.records) return null;
    
    // Find a DT record with matching merchant account number that has merchant name
    const dtRecord = recordsData.records.find(r => 
      r.record_type === 'DT' && 
      r.extracted_fields?.merchantAccountNumber === merchantAccountNumber &&
      r.extracted_fields?.merchantName &&
      r.extracted_fields?.merchantName !== '-'
    );
    
    return dtRecord?.extracted_fields?.merchantName || null;
  };
`;

// Insert the merchant lookup function before the getRecordTypeBadgeClass function
const functionInsertPoint = 'const getRecordTypeBadgeClass = (recordType: string) => {';
if (content.includes(functionInsertPoint) && !content.includes('getMerchantNameFromDT')) {
  content = content.replace(functionInsertPoint, merchantLookupFunction + '\n  ' + functionInsertPoint);
  console.log('✓ Added merchant name lookup function');
}

// Step 2: Fix merchant name display - DT records section (lines around 1147)
content = content.replace(
  /(\s+)<div className="truncate">\s+\{record\.extracted_fields\?\.merchantName \|\| '-'\}\s+<\/div>/g,
  '$1<div className="truncate">\n$1  {getMerchantNameFromDT(record.extracted_fields?.merchantAccountNumber) || record.extracted_fields?.merchantName || \'-\'}\n$1</div>'
);

// Step 3: Fix card type formatting - replace both occurrences with field position info
const oldCardTypePattern = /\{record\.extracted_fields\?\.cardType \? \(\s+\(\(\) => \{\s+const cardBadge = getCardTypeBadge\(record\.extracted_fields\.cardType as string\);\s+return cardBadge \? \(\s+<Badge variant="outline" className=\{`text-xs \${cardBadge\.className}`\}>\s+\{cardBadge\.label\}\s+<\/Badge>\s+\) : \(\s+<Badge variant="outline" className="text-xs">\s+\{record\.extracted_fields\.cardType\}\s+<\/Badge>\s+\);\s+\}\)\(\)\s+\) : <span className="text-gray-400 text-xs">-<\/span>\}/g;

const newCardTypeFormat = `{record.extracted_fields?.cardType ? (
                                <div className="flex flex-col">
                                  {(() => {
                                    const cardBadge = getCardTypeBadge(record.extracted_fields.cardType as string);
                                    return cardBadge ? (
                                      <Badge variant="outline" className={\`text-xs \${cardBadge.className}\`}>
                                        {cardBadge.label}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">
                                        {record.extracted_fields.cardType}
                                      </Badge>
                                    );
                                  })()}
                                  <span className="text-[10px] text-gray-500 mt-1">(253-254) AN 2</span>
                                </div>
                              ) : <span className="text-gray-400 text-xs">-</span>}`;

// Apply card type replacements
const cardTypeMatches = content.match(oldCardTypePattern);
console.log(`Found ${cardTypeMatches ? cardTypeMatches.length : 0} card type patterns to update`);
content = content.replace(oldCardTypePattern, newCardTypeFormat);

// Write the updated content back to file
fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ Applied all comprehensive fixes');
console.log('✓ Fixed merchant name lookup');
console.log('✓ Fixed card type formatting with field positions');
console.log('✓ Terminal ID display already showing "-" instead of "N/A"');