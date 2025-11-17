#!/usr/bin/env node

// Check duplicate statistics in the database
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDuplicates() {
  try {
    // Check total records in dev_tddf_jsonb
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM dev_tddf_jsonb');
    console.log('Total JSONB records:', totalResult.rows[0]?.total || 0);
    
    // Check for duplicates by record_identifier (JSON extraction)
    const dupResult = await pool.query(`
      SELECT 
        extracted_fields->>'referenceNumber' as ref_num,
        COUNT(*) as count
      FROM dev_tddf_jsonb 
      WHERE extracted_fields->>'referenceNumber' IS NOT NULL
      GROUP BY extracted_fields->>'referenceNumber'
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('Duplicate reference numbers found:', dupResult.rows.length);
    if (dupResult.rows.length > 0) {
      console.log('Top duplicates by reference number:');
      dupResult.rows.forEach(row => {
        console.log(`  ${row.ref_num}: ${row.count} duplicates`);
      });
    }
    
    // Check for duplicates by raw_line
    const rawDupResult = await pool.query(`
      SELECT 
        raw_line,
        COUNT(*) as count
      FROM dev_tddf_jsonb 
      GROUP BY raw_line 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 5
    `);
    
    console.log('Duplicate raw lines found:', rawDupResult.rows.length);
    if (rawDupResult.rows.length > 0) {
      console.log('Top duplicates by raw line:');
      rawDupResult.rows.forEach(row => {
        console.log(`  Line (${row.raw_line.substring(0, 30)}...): ${row.count} duplicates`);
      });
    }
    
    // Summary stats
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT raw_line) as unique_raw_lines,
        COUNT(*) - COUNT(DISTINCT raw_line) as duplicate_raw_count
      FROM dev_tddf_jsonb
    `);
    
    const summary = summaryResult.rows[0];
    console.log('\n=== DUPLICATE SUMMARY ===');
    console.log('Total records:', summary.total_records);
    console.log('Unique raw lines:', summary.unique_raw_lines);
    console.log('Duplicate records (by raw line):', summary.duplicate_raw_count);
    
  } catch (error) {
    console.error('Error checking duplicates:', error.message);
  } finally {
    await pool.end();
  }
}

checkDuplicates();