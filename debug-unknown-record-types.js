
#!/usr/bin/env node

const { Pool } = require('pg');

async function analyzeUnknownRecordTypes() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  console.log('🔍 Analyzing Unknown Record Types in Current Processing...\n');
  
  try {
    // Check what table environment we're using
    const environment = process.env.NODE_ENV || 'development';
    const tableName = environment === 'development' ? 'dev_tddf_raw_import' : 'tddf_raw_import';
    
    console.log(`📋 Using table: ${tableName} for environment: ${environment}\n`);
    
    // 1. Find all records with UNK or unusual record types
    console.log('=== STEP 1: Finding Unknown Record Types ===');
    const unknownRecordsResult = await pool.query(`
      SELECT 
        record_type,
        COUNT(*) as count,
        MIN(line_number) as first_line,
        MAX(line_number) as last_line,
        source_file_id as filename
      FROM ${tableName}
      WHERE record_type NOT IN ('DT', 'BH', 'P1', 'P2', 'AD', 'DR', 'G2', 'E1', 'FH', 'FF', 'TH', 'TF')
         OR record_type IS NULL
         OR record_type = 'UNK'
         OR LENGTH(record_type) != 2
      GROUP BY record_type, source_file_id
      ORDER BY count DESC, record_type
    `);
    
    if (unknownRecordsResult.rows.length === 0) {
      console.log('✅ No unknown record types found in raw import table');
      return;
    }
    
    console.log(`❗ Found ${unknownRecordsResult.rows.length} groups of unknown record types:`);
    unknownRecordsResult.rows.forEach(row => {
      console.log(`   Type: "${row.record_type}" | Count: ${row.count} | Lines: ${row.first_line}-${row.last_line} | File: ${row.filename}`);
    });
    
    // 2. Get sample raw lines for unknown record types
    console.log('\n=== STEP 2: Sample Raw Lines for Unknown Record Types ===');
    for (const row of unknownRecordsResult.rows.slice(0, 5)) { // Limit to first 5 types
      console.log(`\n--- Record Type: "${row.record_type}" ---`);
      
      const sampleResult = await pool.query(`
        SELECT 
          id,
          line_number,
          raw_line,
          record_type,
          source_file_id,
          processing_status
        FROM ${tableName}
        WHERE record_type = $1 
          AND source_file_id = $2
        ORDER BY line_number
        LIMIT 3
      `, [row.record_type, row.filename]);
      
      sampleResult.rows.forEach(sample => {
        console.log(`   Line ${sample.line_number}: ${sample.raw_line.substring(0, 100)}...`);
        if (sample.raw_line.length >= 19) {
          const extractedType = sample.raw_line.substring(17, 19);
          console.log(`   Extracted from positions 18-19: "${extractedType}"`);
        }
        console.log(`   Record Type in DB: "${sample.record_type}"`);
        console.log(`   Processing Status: ${sample.processing_status}`);
        console.log(`   Raw Line Length: ${sample.raw_line.length}`);
        console.log('');
      });
    }
    
    // 3. Check for common patterns in unknown records
    console.log('\n=== STEP 3: Pattern Analysis ===');
    const patternResult = await pool.query(`
      SELECT 
        record_type,
        COUNT(*) as count,
        AVG(LENGTH(raw_line)) as avg_length,
        MIN(LENGTH(raw_line)) as min_length,
        MAX(LENGTH(raw_line)) as max_length
      FROM ${tableName}
      WHERE record_type NOT IN ('DT', 'BH', 'P1', 'P2', 'AD', 'DR', 'G2', 'E1', 'FH', 'FF', 'TH', 'TF')
         OR record_type IS NULL
         OR record_type = 'UNK'
      GROUP BY record_type
      ORDER BY count DESC
    `);
    
    console.log('Record Type Patterns:');
    patternResult.rows.forEach(row => {
      console.log(`   "${row.record_type}": ${row.count} records, avg length: ${Math.round(row.avg_length)}, range: ${row.min_length}-${row.max_length}`);
    });
    
    // 4. Check what's being extracted at positions 18-19 for these records
    console.log('\n=== STEP 4: Position 18-19 Analysis ===');
    const positionResult = await pool.query(`
      SELECT 
        CASE 
          WHEN LENGTH(raw_line) >= 19 THEN SUBSTRING(raw_line, 18, 2)
          ELSE 'TOO_SHORT'
        END as extracted_type,
        record_type as stored_type,
        COUNT(*) as count,
        source_file_id
      FROM ${tableName}
      WHERE record_type NOT IN ('DT', 'BH', 'P1', 'P2', 'AD', 'DR', 'G2', 'E1', 'FH', 'FF', 'TH', 'TF')
         OR record_type IS NULL
         OR record_type = 'UNK'
      GROUP BY 
        CASE 
          WHEN LENGTH(raw_line) >= 19 THEN SUBSTRING(raw_line, 18, 2)
          ELSE 'TOO_SHORT'
        END,
        record_type,
        source_file_id
      ORDER BY count DESC
    `);
    
    console.log('Extracted vs Stored Record Types:');
    positionResult.rows.forEach(row => {
      console.log(`   Extracted: "${row.extracted_type}" | Stored: "${row.stored_type}" | Count: ${row.count} | File: ${row.source_file_id}`);
    });
    
    // 5. Check recent processing logs for these record types
    console.log('\n=== STEP 5: Recent Processing Summary ===');
    const summaryResult = await pool.query(`
      SELECT 
        processing_status,
        COUNT(*) as count
      FROM ${tableName}
      WHERE record_type NOT IN ('DT', 'BH', 'P1', 'P2', 'AD', 'DR', 'G2', 'E1', 'FH', 'FF', 'TH', 'TF')
         OR record_type IS NULL
         OR record_type = 'UNK'
      GROUP BY processing_status
      ORDER BY count DESC
    `);
    
    console.log('Processing Status for Unknown Types:');
    summaryResult.rows.forEach(row => {
      console.log(`   ${row.processing_status}: ${row.count} records`);
    });
    
    console.log('\n✅ Analysis complete! Check the output above to identify the unknown record types.');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await pool.end();
  }
}

// Run the analysis
analyzeUnknownRecordTypes().catch(console.error);
