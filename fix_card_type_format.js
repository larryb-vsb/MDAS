#!/usr/bin/env node

const fs = require('fs');

// Read the file
const filePath = 'client/src/pages/TddfJsonPage.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the card type formatting with the new format
const oldPattern = /\{record\.extracted_fields\?\.cardType \? \(\s*\(\(\) => \{\s*const cardBadge = getCardTypeBadge\(record\.extracted_fields\.cardType as string\);\s*return cardBadge \? \(\s*<Badge variant="outline" className=\{`text-xs \${cardBadge\.className}`\}>\s*\{cardBadge\.label\}\s*<\/Badge>\s*\) : \(\s*<Badge variant="outline" className="text-xs">\s*\{record\.extracted_fields\.cardType\}\s*<\/Badge>\s*\);\s*\}\)\(\)\s*\) : '-'\}/g;

const newFormat = `{record.extracted_fields?.cardType ? (
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

// Count matches before replacement
const matches = content.match(oldPattern);
console.log(`Found ${matches ? matches.length : 0} card type patterns to replace`);

// Apply the replacement
content = content.replace(oldPattern, newFormat);

// Write back to file
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated card type formatting');