#!/usr/bin/env node

const fs = require('fs');

// Read the file
const filePath = 'client/src/pages/TddfJsonPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Manual approach: find and replace Card Type sections
console.log('Updating card type formatting...');

// Replace both instances of card type formatting - DT tab and All tab
const oldCardTypePattern1 = /\{record\.extracted_fields\?\.cardType \? \(\s+\(\(\) => \{\s+const cardBadge = getCardTypeBadge\(record\.extracted_fields\.cardType as string\);\s+return cardBadge \? \(\s+<Badge variant="outline" className=\{`text-xs \${cardBadge\.className}`\}>\s+\{cardBadge\.label\}\s+<\/Badge>\s+\) : \(\s+<Badge variant="outline" className="text-xs">\s+\{record\.extracted_fields\.cardType\}\s+<\/Badge>\s+\);\s+\}\)\(\)\s+\) : '-'\}/g;

// Updated format with field position info
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

// First replace all basic dash replacements with proper span
content = content.replace(/\) : '-'/g, ') : <span className="text-gray-400 text-xs">-</span>');

// Apply the card type replacements
content = content.replace(oldCardTypePattern1, newCardTypeFormat);

// Write back to file
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated card type formatting');