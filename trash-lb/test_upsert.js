#!/usr/bin/env node

// Simple test script to verify upsert behavior
import { DatabaseStorage } from './server/storage.js';

async function testUpsert() {
  console.log('=== UPSERT TEST STARTING ===');
  
  const storage = new DatabaseStorage();
  const testFileName = 'test_ach_file.csv';
  const base64Content = 'VHJhbnNhY3Rpb25JRCxNZXJjaGFudElELEFtb3VudCxEYXRlLFR5cGUKVFhOMDAxLE1FUkNIMDAxLDE1MC41MCwyMDI1LTAxLTE1LENyZWRpdApUWE4wMDIsTUVSQ0gwMDEsNzUuMjUsMjAyNS0wMS0xNSxEZWJpdApUWE4wMDMsTUVSQ0gwMDIsMjAwLjAwLDIwMjUtMDEtMTYsQ3JlZGl0';
  
  try {
    // First upload - should INSERT all rows
    console.log('\n=== FIRST UPLOAD (INSERT) ===');
    const result1 = await storage.processTransactionFileFromContent(base64Content, testFileName);
    console.log('Result 1:', result1);
    
    // Check database state after first upload
    console.log('\n=== DATABASE STATE AFTER FIRST UPLOAD ===');
    const transactions1 = await storage.pool.query('SELECT * FROM dev_transactions ORDER BY source_row_number');
    console.log(`Found ${transactions1.rows.length} transactions:`);
    transactions1.rows.forEach((row, idx) => {
      console.log(`${idx+1}. ID: ${row.id}, Source: ${row.source_filename}:${row.source_row_number}, Amount: ${row.amount}, Updated: ${row.updated_at}`);
    });
    
    // Wait a moment to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Second upload - should UPDATE all rows (same filename+line numbers)
    console.log('\n=== SECOND UPLOAD (UPDATE) ===');
    const result2 = await storage.processTransactionFileFromContent(base64Content, testFileName);
    console.log('Result 2:', result2);
    
    // Check database state after second upload
    console.log('\n=== DATABASE STATE AFTER SECOND UPLOAD ===');
    const transactions2 = await storage.pool.query('SELECT * FROM dev_transactions ORDER BY source_row_number');
    console.log(`Found ${transactions2.rows.length} transactions (should still be 3):`);
    transactions2.rows.forEach((row, idx) => {
      console.log(`${idx+1}. ID: ${row.id}, Source: ${row.source_filename}:${row.source_row_number}, Amount: ${row.amount}, Updated: ${row.updated_at}`);
    });
    
    // Verify upsert behavior
    console.log('\n=== UPSERT VERIFICATION ===');
    if (transactions1.rows.length === transactions2.rows.length) {
      console.log('✅ Row count unchanged - upserts working correctly');
      
      // Check if updated_at timestamps changed
      let updatedCount = 0;
      for (let i = 0; i < transactions1.rows.length; i++) {
        const oldTime = new Date(transactions1.rows[i].updated_at);
        const newTime = new Date(transactions2.rows[i].updated_at);
        if (newTime > oldTime) {
          updatedCount++;
          console.log(`✅ Transaction ${transactions2.rows[i].id} was updated (${oldTime.toISOString()} -> ${newTime.toISOString()})`);
        }
      }
      
      if (updatedCount === transactions1.rows.length) {
        console.log('✅ ALL TRANSACTIONS UPDATED - Upsert logic working perfectly!');
      } else {
        console.log(`⚠️ Only ${updatedCount}/${transactions1.rows.length} transactions were updated`);
      }
    } else {
      console.log('❌ Row count changed - upserts not working correctly');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  console.log('\n=== UPSERT TEST COMPLETE ===');
  process.exit(0);
}

testUpsert();