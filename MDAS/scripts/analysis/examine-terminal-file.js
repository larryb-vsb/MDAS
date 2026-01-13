#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Client } from '@replit/object-storage';

async function examineTerminalFile() {
  try {
    console.log('🔍 Examining uploaded terminal file...');
    
    // Initialize object storage client
    const client = new Client();
    
    // The file was uploaded as "Terminals Unused in Last 6 months.xlsx"
    const fileKey = 'dev-uploader/2025-07-31/uploader_1753994260481_6f0drd7tp/Terminals Unused in Last 6 months.xlsx';
    
    console.log(`📁 Downloading file: ${fileKey}`);
    
    // Download the file
    const fileStream = await client.downloadAsStream(fileKey);
    const chunks = [];
    
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    
    const fileData = Buffer.concat(chunks);
    
    // Save to temporary location for analysis
    const tempFile = './tmp_terminal_file.xlsx';
    fs.writeFileSync(tempFile, fileData);
    
    console.log(`💾 File saved temporarily as: ${tempFile}`);
    console.log(`📊 File size: ${fileData.length} bytes`);
    
    // Try to read as text (first few KB) to identify headers if it's actually CSV-like
    const textSample = fileData.toString('utf8', 0, Math.min(1000, fileData.length));
    console.log('\n📝 File content sample:');
    console.log('=' .repeat(60));
    console.log(textSample.substring(0, 500));
    console.log('=' .repeat(60));
    
    // Check if it's actually a CSV/TSV disguised as XLSX
    if (textSample.includes(',') || textSample.includes('\t')) {
      console.log('\n✅ File appears to be CSV/TSV format');
      
      // Extract first line as headers
      const lines = textSample.split('\n');
      const headers = lines[0];
      console.log(`\n🔤 Headers detected: ${headers}`);
      
      return {
        fileType: 'sub_merchant_terminals',
        headers: headers,
        format: textSample.includes('\t') ? 'tsv' : 'csv',
        sampleData: lines.slice(1, 5),
        size: fileData.length
      };
    } else {
      console.log('\n⚠️  File appears to be binary Excel format - need different approach');
      return {
        fileType: 'sub_merchant_terminals',
        headers: 'Binary Excel file - headers not extractable',
        format: 'xlsx',
        size: fileData.length
      };
    }
    
  } catch (error) {
    console.error('❌ Error examining file:', error.message);
    return null;
  }
}

// Run the examination
examineTerminalFile().then(result => {
  if (result) {
    console.log('\n🎯 File Analysis Complete:');
    console.log(JSON.stringify(result, null, 2));
    
    // Write results to file for use by system
    fs.writeFileSync('./terminal_file_analysis.json', JSON.stringify(result, null, 2));
    console.log('\n💾 Analysis saved to terminal_file_analysis.json');
  }
}).catch(console.error);