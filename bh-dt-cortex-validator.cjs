/**
 * BH-DT-Cortex-Validator
 * Comprehensive validation of TDDF BH and DT calculations
 * Matches PowerShell script logic exactly
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function validateBHDTCalculations() {
  console.log('🔍 BH-DT-Cortex-Validator Starting...\n');
  
  try {
    // Environment detection
    const environment = process.env.NODE_ENV || 'development';
    const isDevelopment = environment === 'development';
    const envPrefix = isDevelopment ? 'dev_' : '';
    
    console.log(`Environment: ${environment}`);
    console.log(`Table Prefix: ${envPrefix}\n`);
    
    // Find TDDF1 file tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE $1
        AND table_name NOT LIKE '%totals%'
      ORDER BY table_name
    `, [`${envPrefix}tddf1_file_%`]);
    
    console.log(`Found ${tablesResult.rows.length} TDDF1 file tables\n`);
    
    let totalValidation = {
      files: 0,
      bhRecords: 0,
      dtRecords: 0,
      totalRecords: 0,
      bhNetDeposits: 0,
      dtTransactionAmounts: 0,
      validBH: 0,
      validDT: 0,
      invalidBH: 0,
      invalidDT: 0
    };
    
    // Validate each file table
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      console.log(`\n=== Validating ${tableName} ===`);
      
      // PowerShell-equivalent validation query
      const validationResult = await pool.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN record_type = 'BH' THEN 1 END) as bh_count,
          COUNT(CASE WHEN record_type = 'DT' THEN 1 END) as dt_count,
          
          -- BH Net Deposits (PowerShell positions 69-83, substring 68,15)
          COUNT(CASE 
            WHEN record_type = 'BH' 
              AND LENGTH(raw_line) >= 83 
              AND SUBSTRING(raw_line, 69, 15) ~ '^[0-9]+$' 
            THEN 1 
          END) as valid_bh_records,
          
          SUM(CASE 
            WHEN record_type = 'BH' 
              AND LENGTH(raw_line) >= 83 
              AND SUBSTRING(raw_line, 69, 15) ~ '^[0-9]+$' 
            THEN CAST(SUBSTRING(raw_line, 69, 15) AS DECIMAL) / 100.0 
            ELSE 0 
          END) as bh_net_deposits,
          
          -- DT Transaction Amounts (PowerShell positions 93-103, substring 92,11)
          COUNT(CASE 
            WHEN record_type = 'DT' 
              AND LENGTH(raw_line) >= 103 
              AND SUBSTRING(raw_line, 93, 11) ~ '^[0-9]+$' 
            THEN 1 
          END) as valid_dt_records,
          
          SUM(CASE 
            WHEN record_type = 'DT' 
              AND LENGTH(raw_line) >= 103 
              AND SUBSTRING(raw_line, 93, 11) ~ '^[0-9]+$' 
            THEN CAST(SUBSTRING(raw_line, 93, 11) AS DECIMAL) / 100.0 
            ELSE 0 
          END) as dt_transaction_amounts,
          
          -- Invalid record counts
          COUNT(CASE 
            WHEN record_type = 'BH' 
              AND (LENGTH(raw_line) < 83 OR SUBSTRING(raw_line, 69, 15) !~ '^[0-9]+$')
            THEN 1 
          END) as invalid_bh_records,
          
          COUNT(CASE 
            WHEN record_type = 'DT' 
              AND (LENGTH(raw_line) < 103 OR SUBSTRING(raw_line, 93, 11) !~ '^[0-9]+$')
            THEN 1 
          END) as invalid_dt_records
          
        FROM ${tableName}
      `);
      
      const result = validationResult.rows[0];
      
      // Display file results
      console.log(`Total Records: ${result.total_records}`);
      console.log(`BH Records: ${result.bh_count} (Valid: ${result.valid_bh_records}, Invalid: ${result.invalid_bh_records})`);
      console.log(`DT Records: ${result.dt_count} (Valid: ${result.valid_dt_records}, Invalid: ${result.invalid_dt_records})`);
      console.log(`BH Net Deposits: $${parseFloat(result.bh_net_deposits || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      console.log(`DT Transaction Amounts: $${parseFloat(result.dt_transaction_amounts || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      
      // Accumulate totals
      totalValidation.files++;
      totalValidation.bhRecords += parseInt(result.bh_count);
      totalValidation.dtRecords += parseInt(result.dt_count);
      totalValidation.totalRecords += parseInt(result.total_records);
      totalValidation.bhNetDeposits += parseFloat(result.bh_net_deposits || 0);
      totalValidation.dtTransactionAmounts += parseFloat(result.dt_transaction_amounts || 0);
      totalValidation.validBH += parseInt(result.valid_bh_records);
      totalValidation.validDT += parseInt(result.valid_dt_records);
      totalValidation.invalidBH += parseInt(result.invalid_bh_records);
      totalValidation.invalidDT += parseInt(result.invalid_dt_records);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 BH-DT-CORTEX-VALIDATOR SUMMARY');
    console.log('='.repeat(60));
    console.log(`Files Processed: ${totalValidation.files}`);
    console.log(`Total Records: ${totalValidation.totalRecords.toLocaleString()}`);
    console.log(`BH Records: ${totalValidation.bhRecords.toLocaleString()} (Valid: ${totalValidation.validBH}, Invalid: ${totalValidation.invalidBH})`);
    console.log(`DT Records: ${totalValidation.dtRecords.toLocaleString()} (Valid: ${totalValidation.validDT}, Invalid: ${totalValidation.invalidDT})`);
    console.log(`\n💰 FINANCIAL TOTALS (PowerShell Logic):`);
    console.log(`BH Net Deposits:       $${totalValidation.bhNetDeposits.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    console.log(`DT Transaction Amounts: $${totalValidation.dtTransactionAmounts.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    
    // Validation checks
    console.log(`\n✅ VALIDATION CHECKS:`);
    console.log(`BH Validation Rate: ${((totalValidation.validBH / totalValidation.bhRecords) * 100).toFixed(2)}%`);
    console.log(`DT Validation Rate: ${((totalValidation.validDT / totalValidation.dtRecords) * 100).toFixed(2)}%`);
    
    // Check cached values
    const cachedResult = await pool.query(`
      SELECT 
        SUM(bh_net_deposits) as cached_bh,
        SUM(dt_transaction_amounts) as cached_dt
      FROM ${envPrefix}tddf1_totals 
      WHERE processing_date >= '2025-08-01' AND processing_date <= '2025-08-31'
    `);
    
    if (cachedResult.rows[0]) {
      const cached = cachedResult.rows[0];
      console.log(`\n📊 CACHED VALUES COMPARISON:`);
      console.log(`Cached BH:    $${parseFloat(cached.cached_bh || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      console.log(`Cached DT:    $${parseFloat(cached.cached_dt || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      console.log(`Direct BH:    $${totalValidation.bhNetDeposits.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      console.log(`Direct DT:    $${totalValidation.dtTransactionAmounts.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
      
      const bhMatch = Math.abs(parseFloat(cached.cached_bh || 0) - totalValidation.bhNetDeposits) < 0.01;
      const dtMatch = Math.abs(parseFloat(cached.cached_dt || 0) - totalValidation.dtTransactionAmounts) < 0.01;
      
      console.log(`BH Match: ${bhMatch ? '✅' : '❌'}`);
      console.log(`DT Match: ${dtMatch ? '✅' : '❌'}`);
      
      if (!bhMatch || !dtMatch) {
        console.log(`\n⚠️  CACHE MISMATCH DETECTED - Run 'Rebuild Cache' to fix`);
      }
    }
    
    console.log(`\n🔍 CORTEX VALIDATION COMPLETE`);
    
  } catch (error) {
    console.error('❌ BH-DT-Cortex-Validator Error:', error);
  } finally {
    await pool.end();
  }
}

// Run validation
validateBHDTCalculations();