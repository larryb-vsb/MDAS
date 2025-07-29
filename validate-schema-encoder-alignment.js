#!/usr/bin/env node
/**
 * TDDF Schema-Encoder Alignment Validation Script
 * Validates that extracted JSONB data matches schema field definitions
 * Date: July 29, 2025
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function validateSchemaAlignment() {
  console.log('🔍 TDDF Schema-Encoder Alignment Validation');
  console.log('=========================================');

  try {
    // Test BH Records Field Alignment
    console.log('\n📊 Testing BH Records Field Alignment...');
    const bhQuery = `
      SELECT 
        COUNT(*) as total_bh_records,
        COUNT(CASE WHEN extracted_fields ? 'sequenceNumber' THEN 1 END) as has_sequence_number,
        COUNT(CASE WHEN extracted_fields ? 'entryRunNumber' THEN 1 END) as has_entry_run_number,
        COUNT(CASE WHEN extracted_fields ? 'bankNumber' THEN 1 END) as has_bank_number,
        COUNT(CASE WHEN extracted_fields ? 'associationNumber' THEN 1 END) as has_association_number,
        COUNT(CASE WHEN extracted_fields ? 'groupNumber' THEN 1 END) as has_group_number,
        COUNT(CASE WHEN extracted_fields ? 'batchJulianDate' THEN 1 END) as has_batch_julian_date,
        COUNT(CASE WHEN extracted_fields ? 'netDeposit' THEN 1 END) as has_net_deposit,
        COUNT(CASE WHEN extracted_fields ? 'batchId' THEN 1 END) as has_batch_id
      FROM dev_tddf_jsonb 
      WHERE record_type = 'BH'
    `;
    
    const bhResult = await pool.query(bhQuery);
    const bhData = bhResult.rows[0];
    
    console.log(`✅ BH Records Analysis (${bhData.total_bh_records} total):`);
    console.log(`   - Sequence Number: ${bhData.has_sequence_number}/${bhData.total_bh_records} (${(bhData.has_sequence_number/bhData.total_bh_records*100).toFixed(1)}%)`);
    console.log(`   - Entry Run Number: ${bhData.has_entry_run_number}/${bhData.total_bh_records} (${(bhData.has_entry_run_number/bhData.total_bh_records*100).toFixed(1)}%)`);
    console.log(`   - Bank Number: ${bhData.has_bank_number}/${bhData.total_bh_records} (${(bhData.has_bank_number/bhData.total_bh_records*100).toFixed(1)}%)`);
    console.log(`   - Association Number: ${bhData.has_association_number}/${bhData.total_bh_records} (${(bhData.has_association_number/bhData.total_bh_records*100).toFixed(1)}%)`);
    console.log(`   - Net Deposit: ${bhData.has_net_deposit}/${bhData.total_bh_records} (${(bhData.has_net_deposit/bhData.total_bh_records*100).toFixed(1)}%)`);
    console.log(`   - Batch ID: ${bhData.has_batch_id}/${bhData.total_bh_records} (${(bhData.has_batch_id/bhData.total_bh_records*100).toFixed(1)}%)`);

    // Test P1 Records Field Alignment
    console.log('\n📊 Testing P1 Records Field Alignment...');
    const p1Query = `
      SELECT 
        COUNT(*) as total_p1_records,
        COUNT(CASE WHEN extracted_fields ? 'taxAmount' THEN 1 END) as has_tax_amount,
        COUNT(CASE WHEN extracted_fields ? 'taxRate' THEN 1 END) as has_tax_rate,
        COUNT(CASE WHEN extracted_fields ? 'purchaseIdentifier' THEN 1 END) as has_purchase_identifier,
        COUNT(CASE WHEN extracted_fields ? 'customerCode' THEN 1 END) as has_customer_code,
        COUNT(CASE WHEN extracted_fields ? 'destinationZip' THEN 1 END) as has_destination_zip,
        COUNT(CASE WHEN extracted_fields ? 'merchantType' THEN 1 END) as has_merchant_type,
        COUNT(CASE WHEN extracted_fields ? 'freightAmount' THEN 1 END) as has_freight_amount,
        COUNT(CASE WHEN extracted_fields ? 'discountAmount' THEN 1 END) as has_discount_amount,
        AVG(CAST(extracted_fields->>'taxAmount' AS NUMERIC)) as avg_tax_amount
      FROM dev_tddf_jsonb 
      WHERE record_type = 'P1'
    `;
    
    const p1Result = await pool.query(p1Query);
    const p1Data = p1Result.rows[0];
    
    console.log(`✅ P1 Records Analysis (${p1Data.total_p1_records} total):`);
    console.log(`   - Tax Amount: ${p1Data.has_tax_amount}/${p1Data.total_p1_records} (${(p1Data.has_tax_amount/p1Data.total_p1_records*100).toFixed(1)}%) - Avg: $${parseFloat(p1Data.avg_tax_amount).toFixed(2)}`);
    console.log(`   - Tax Rate: ${p1Data.has_tax_rate}/${p1Data.total_p1_records} (${(p1Data.has_tax_rate/p1Data.total_p1_records*100).toFixed(1)}%)`);
    console.log(`   - Purchase ID: ${p1Data.has_purchase_identifier}/${p1Data.total_p1_records} (${(p1Data.has_purchase_identifier/p1Data.total_p1_records*100).toFixed(1)}%)`);
    console.log(`   - Customer Code: ${p1Data.has_customer_code}/${p1Data.total_p1_records} (${(p1Data.has_customer_code/p1Data.total_p1_records*100).toFixed(1)}%)`);
    console.log(`   - Destination ZIP: ${p1Data.has_destination_zip}/${p1Data.total_p1_records} (${(p1Data.has_destination_zip/p1Data.total_p1_records*100).toFixed(1)}%)`);
    console.log(`   - Merchant Type: ${p1Data.has_merchant_type}/${p1Data.total_p1_records} (${(p1Data.has_merchant_type/p1Data.total_p1_records*100).toFixed(1)}%)`);

    // Test DT Records for Critical Fields
    console.log('\n📊 Testing DT Records Field Alignment...');
    const dtQuery = `
      SELECT 
        COUNT(*) as total_dt_records,
        COUNT(CASE WHEN extracted_fields ? 'transactionAmount' THEN 1 END) as has_transaction_amount,
        COUNT(CASE WHEN extracted_fields ? 'merchantName' THEN 1 END) as has_merchant_name,
        COUNT(CASE WHEN extracted_fields ? 'authorizationNumber' THEN 1 END) as has_auth_number,
        COUNT(CASE WHEN extracted_fields ? 'cardType' THEN 1 END) as has_card_type,
        COUNT(CASE WHEN extracted_fields ? 'terminalId' THEN 1 END) as has_terminal_id,
        AVG(CAST(extracted_fields->>'transactionAmount' AS NUMERIC)) as avg_transaction_amount
      FROM dev_tddf_jsonb 
      WHERE record_type = 'DT'
      LIMIT 1000
    `;
    
    const dtResult = await pool.query(dtQuery);
    const dtData = dtResult.rows[0];
    
    console.log(`✅ DT Records Analysis (${dtData.total_dt_records} sampled):`);
    console.log(`   - Transaction Amount: ${dtData.has_transaction_amount}/${dtData.total_dt_records} (${(dtData.has_transaction_amount/dtData.total_dt_records*100).toFixed(1)}%) - Avg: $${parseFloat(dtData.avg_transaction_amount).toFixed(2)}`);
    console.log(`   - Merchant Name: ${dtData.has_merchant_name}/${dtData.total_dt_records} (${(dtData.has_merchant_name/dtData.total_dt_records*100).toFixed(1)}%)`);
    console.log(`   - Authorization: ${dtData.has_auth_number}/${dtData.total_dt_records} (${(dtData.has_auth_number/dtData.total_dt_records*100).toFixed(1)}%)`);
    console.log(`   - Card Type: ${dtData.has_card_type}/${dtData.total_dt_records} (${(dtData.has_card_type/dtData.total_dt_records*100).toFixed(1)}%)`);
    console.log(`   - Terminal ID: ${dtData.has_terminal_id}/${dtData.total_dt_records} (${(dtData.has_terminal_id/dtData.total_dt_records*100).toFixed(1)}%)`);

    // Field Position Validation Sample
    console.log('\n🔍 Field Position Validation Sample...');
    const sampleQuery = `
      SELECT 
        record_type,
        filename,
        line_number,
        LEFT(raw_line, 50) as raw_line_sample,
        extracted_fields
      FROM dev_tddf_jsonb 
      WHERE record_type IN ('BH', 'P1', 'DT')
      ORDER BY record_type, id
      LIMIT 6
    `;
    
    const sampleResult = await pool.query(sampleQuery);
    console.log('\n📋 Sample Records for Manual Validation:');
    sampleResult.rows.forEach((row, idx) => {
      console.log(`\n${idx + 1}. ${row.record_type} Record (${row.filename}:${row.line_number}):`);
      console.log(`   Raw: ${row.raw_line_sample}...`);
      console.log(`   Fields: ${JSON.stringify(row.extracted_fields, null, 2).substring(0, 200)}...`);
    });

    // Summary
    console.log('\n📈 Schema-Encoder Alignment Summary:');
    console.log('=====================================');
    
    const bhCompleteness = ((bhData.has_sequence_number + bhData.has_entry_run_number + bhData.has_bank_number + bhData.has_net_deposit) / (4 * bhData.total_bh_records)) * 100;
    const p1Completeness = ((p1Data.has_tax_amount + p1Data.has_tax_rate + p1Data.has_purchase_identifier) / (3 * p1Data.total_p1_records)) * 100;
    const dtCompleteness = ((dtData.has_transaction_amount + dtData.has_merchant_name + dtData.has_auth_number) / (3 * dtData.total_dt_records)) * 100;
    
    console.log(`✅ BH Records: ${bhCompleteness.toFixed(1)}% field completeness`);
    console.log(`✅ P1 Records: ${p1Completeness.toFixed(1)}% field completeness`);
    console.log(`✅ DT Records: ${dtCompleteness.toFixed(1)}% field completeness`);
    
    if (bhCompleteness >= 95 && p1Completeness >= 95 && dtCompleteness >= 95) {
      console.log('\n🎉 VALIDATION PASSED: Schema-encoder alignment is excellent!');
    } else if (bhCompleteness >= 80 && p1Completeness >= 80 && dtCompleteness >= 80) {
      console.log('\n⚠️  VALIDATION WARNING: Some field alignment issues detected');
    } else {
      console.log('\n❌ VALIDATION FAILED: Significant schema-encoder misalignment');
    }

    console.log(`\n💾 Database: dev_tddf_jsonb table analyzed`);
    console.log(`📊 Total Records: ${bhData.total_bh_records} BH + ${p1Data.total_p1_records} P1 + ${dtData.total_dt_records} DT (sampled)`);

  } catch (error) {
    console.error('❌ Validation Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run validation
validateSchemaAlignment().catch(console.error);