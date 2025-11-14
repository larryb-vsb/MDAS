#!/usr/bin/env node

import { storage } from './server/storage.js';

async function testCompleteFixVerification() {
  console.log('🧪 Testing Complete TDDF Processing Fix Verification');
  console.log('===============================================');
  
  try {
    // Get the most recent failed TDDF file
    console.log('📋 Step 1: Finding most recent uploaded TDDF file...');
    const result = await storage.pool.query(`
      SELECT id, original_filename, file_content, raw_lines_count
      FROM dev_uploaded_files 
      WHERE file_type = 'tddf' 
      ORDER BY uploaded_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No TDDF files found in database');
      return;
    }
    
    const file = result.rows[0];
    console.log(`📁 Found file: ${file.original_filename} (ID: ${file.id})`);
    console.log(`📊 Current raw_lines_count: ${file.raw_lines_count}`);
    console.log(`📏 Content length: ${file.file_content.length} chars`);
    
    // Check if content is Base64
    const isBase64 = /^[A-Za-z0-9+/=\s]*$/.test(file.file_content);
    console.log(`🔍 Content appears to be Base64: ${isBase64}`);
    
    if (isBase64) {
      // Test Base64 decoding
      console.log('📋 Step 2: Testing Base64 decoding...');
      const decoded = Buffer.from(file.file_content, 'base64').toString('utf8');
      console.log(`✅ Decoded successfully: ${file.file_content.length} → ${decoded.length} chars`);
      console.log(`📄 First 80 chars: "${decoded.substring(0, 80)}"`);
      
      // Check for null bytes
      const hasNullBytes = decoded.includes('\x00');
      console.log(`🚨 Contains null bytes: ${hasNullBytes}`);
      
      if (hasNullBytes) {
        console.log('⚠️  Removing null bytes from decoded content...');
        const cleanedContent = decoded.replace(/\x00/g, '');
        console.log(`🧹 Cleaned content: ${decoded.length} → ${cleanedContent.length} chars`);
        
        // Test processing with cleaned content
        console.log('📋 Step 3: Testing processing with cleaned content...');
        const lines = cleanedContent.split('\n').filter(line => line.trim() !== '');
        console.log(`📄 Found ${lines.length} non-empty lines`);
        
        // Sample first few lines
        lines.slice(0, 3).forEach((line, i) => {
          console.log(`Line ${i+1}: "${line.substring(0, 80)}..." (${line.length} chars)`);
        });
        
      } else {
        console.log('✅ No null bytes found - content should process correctly');
      }
    } else {
      console.log('📋 Content appears to be raw TDDF - no decoding needed');
    }
    
    console.log('🎉 Fix verification complete');
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

testCompleteFixVerification().catch(console.error);