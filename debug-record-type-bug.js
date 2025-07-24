#!/usr/bin/env node

// Debug script to identify the exact cause of record type detection bug

const testContent = `01696290624670002BH6759067590000000215480088880000090171128202233222000000000853920    0000090001484509N8008886759C11292022
01696290624670002DT6759067590000000215480088880000090171128202233222000000000853920377972XXXXX1024                          NY 4 07N003321356909322N840000000853920          01DNDRIP DROP DISTRO LLC     266851    AM84000000853920 N  519971004114
01696290624670002P16759067590000000215480088880000090171128202233222000000000853920377972XXXXX1024                          NY 4 07N003321356909322N840000000853920          01DNDRIP DROP DISTRO LLC     266851    AM84000000853920 N  519971004114`;

console.log('=== DEBUGGING RECORD TYPE DETECTION ===\n');

console.log('1. Original content:');
console.log(`   Length: ${testContent.length} characters`);
console.log(`   Lines: ${testContent.split('\n').length}`);

console.log('\n2. Base64 encoding/decoding test:');
const base64Content = Buffer.from(testContent).toString('base64');
console.log(`   Base64 length: ${base64Content.length}`);
console.log(`   First 50 chars of Base64: ${base64Content.substring(0, 50)}...`);

const decodedContent = Buffer.from(base64Content, 'base64').toString('utf8');
console.log(`   Decoded length: ${decodedContent.length}`);
console.log(`   Decoded matches original: ${decodedContent === testContent}`);

console.log('\n3. Record type extraction on different data sources:');

const lines = testContent.split('\n').filter(line => line.trim());
console.log(`   Lines after split/filter: ${lines.length}`);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  console.log(`\n   Line ${i + 1}:`);
  console.log(`     Length: ${line.length}`);
  console.log(`     First 20 chars: "${line.substring(0, 20)}"`);
  console.log(`     Positions 17-18: "${line.substring(17, 19)}"`);
  console.log(`     Positions 18-19: "${line.substring(18, 20)}"`);
}

console.log('\n4. Testing extraction on Base64 data (WRONG):');
const base64Lines = base64Content.split('\n').filter(line => line.trim());
console.log(`   Base64 lines count: ${base64Lines.length}`);
if (base64Lines.length > 0) {
  const base64Line = base64Lines[0];
  console.log(`   Base64 first line length: ${base64Line.length}`);
  console.log(`   Base64 positions 17-18: "${base64Line.substring(17, 19)}"`);
  console.log(`   Base64 positions 18-19: "${base64Line.substring(18, 20)}"`);
}

console.log('\n5. Testing extraction on decoded Base64 data (CORRECT):');
const decodedLines = decodedContent.split('\n').filter(line => line.trim());
console.log(`   Decoded lines count: ${decodedLines.length}`);
for (let i = 0; i < decodedLines.length; i++) {
  const line = decodedLines[i];
  console.log(`   Line ${i + 1} positions 17-18: "${line.substring(17, 19)}"`);
}

console.log('\n=== DIAGNOSIS ===');
console.log('The record type should be extracted from the DECODED content, not Base64!');
console.log('If database shows "zA" it means extraction is happening on Base64 data.');
console.log('The fix: Ensure storeTddfFileAsRawImport decodes Base64 BEFORE extracting record types.');