
const { Client } = require('@replit/object-storage');

async function countDTRecordsFromStorage() {
  try {
    console.log('🔍 Starting DT record count from Object Storage...');
    
    // Initialize Replit Object Storage client
    const client = new Client();
    
    // First, let's check the database for available files
    const { Pool } = require('pg');
    
    // Database connection
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mms_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });
    
    console.log('📊 Checking database for uploaded files...');
    
    // Get files from the uploader table
    const tableQuery = `
      SELECT 
        id,
        filename,
        s3_key,
        s3_bucket,
        file_size,
        current_phase,
        uploaded_at
      FROM dev_uploaded_files 
      WHERE s3_key IS NOT NULL 
        AND current_phase IN ('uploaded', 'identified', 'encoding', 'processing', 'completed')
      ORDER BY uploaded_at DESC 
      LIMIT 10
    `;
    
    const dbResult = await pool.query(tableQuery);
    const availableFiles = dbResult.rows;
    
    console.log(`📁 Found ${availableFiles.length} uploaded files in database:`);
    availableFiles.forEach((file, idx) => {
      console.log(`   ${idx + 1}. ${file.filename} (${file.id})`);
      console.log(`      Key: ${file.s3_key}`);
      console.log(`      Phase: ${file.current_phase}`);
      console.log(`      Size: ${(file.file_size / 1024 / 1024).toFixed(1)}MB`);
      console.log(`      Uploaded: ${file.uploaded_at}`);
      console.log();
    });
    
    if (availableFiles.length === 0) {
      throw new Error('No uploaded files found in database');
    }
    
    // Use the most recent file
    const selectedFile = availableFiles[0];
    const fileKey = selectedFile.s3_key;
    
    console.log(`🎯 Selected file: ${selectedFile.filename}`);
    console.log(`🔑 Object key: ${fileKey}`);
    
    console.log(`📁 Retrieving file: ${fileKey}`);
    
    // Download file content from Object Storage
    const fileContent = await client.downloadAsText(fileKey);
    
    console.log(`📄 File size: ${fileContent.length} characters`);
    
    // Split into lines and filter for DT records
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
    console.log(`📊 Total lines in file: ${lines.length}`);
    
    // Count DT records (positions 18-19 should be "DT")
    let dtCount = 0;
    let recordTypeCounts = {};
    let sampleDTRecords = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.length >= 19) {
        const recordType = line.substring(17, 19); // Positions 18-19
        
        // Count by record type
        recordTypeCounts[recordType] = (recordTypeCounts[recordType] || 0) + 1;
        
        // Track DT records specifically
        if (recordType === 'DT') {
          dtCount++;
          
          // Collect first 3 DT records as samples
          if (sampleDTRecords.length < 3) {
            // Extract key fields from DT record
            const merchantAccount = line.substring(23, 39).trim();
            const referenceNumber = line.substring(55, 84).trim();
            const transactionAmount = line.substring(100, 112).trim();
            const merchantName = line.length > 242 ? line.substring(217, 242).trim() : 'N/A';
            
            sampleDTRecords.push({
              lineNumber: i + 1,
              merchantAccount,
              referenceNumber,
              transactionAmount: transactionAmount ? (parseInt(transactionAmount) / 100).toFixed(2) : '0.00',
              merchantName,
              rawLine: line.substring(0, 50) + '...' // First 50 chars for preview
            });
          }
        }
      }
    }
    
    console.log('\n📈 RECORD TYPE BREAKDOWN:');
    Object.entries(recordTypeCounts)
      .sort(([,a], [,b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count.toLocaleString()} records`);
      });
    
    console.log(`\n🎯 DT RECORD COUNT: ${dtCount.toLocaleString()} records`);
    console.log(`📊 DT records represent ${((dtCount / lines.length) * 100).toFixed(1)}% of total records`);
    
    if (sampleDTRecords.length > 0) {
      console.log('\n💳 SAMPLE DT RECORDS:');
      sampleDTRecords.forEach((record, idx) => {
        console.log(`\n   Sample ${idx + 1} (Line ${record.lineNumber}):`);
        console.log(`     Merchant Account: ${record.merchantAccount}`);
        console.log(`     Reference Number: ${record.referenceNumber}`);
        console.log(`     Transaction Amount: $${record.transactionAmount}`);
        console.log(`     Merchant Name: ${record.merchantName}`);
        console.log(`     Raw Preview: ${record.rawLine}`);
      });
    }
    
    // Calculate file statistics
    const totalTransactionAmount = sampleDTRecords.reduce((sum, record) => 
      sum + parseFloat(record.transactionAmount), 0
    );
    
    console.log(`\n📋 FILE SUMMARY:`);
    console.log(`   File: ${fileKey.split('/').pop()}`);
    console.log(`   Total Lines: ${lines.length.toLocaleString()}`);
    console.log(`   DT Records: ${dtCount.toLocaleString()}`);
    console.log(`   Sample Transaction Total: $${totalTransactionAmount.toFixed(2)}`);
    console.log(`   Record Types Found: ${Object.keys(recordTypeCounts).length}`);
    
    // Close database connection
    await pool.end();
    
    return {
      fileName: fileKey.split('/').pop(),
      totalLines: lines.length,
      dtRecordCount: dtCount,
      recordTypeCounts,
      sampleRecords: sampleDTRecords
    };
    
  } catch (error) {
    console.error('❌ Error counting DT records:', error);
    
    if (error.message.includes('not found')) {
      console.log('\n🔍 File not found. Let me try to list available files...');
      
      try {
        const client = new Client();
        const objects = await client.list('dev-uploader/2025-07-29/');
        console.log('\n📁 Available files in Object Storage:');
        objects.forEach((obj, idx) => {
          console.log(`   ${idx + 1}. ${obj.key}`);
        });
      } catch (listError) {
        console.error('❌ Error listing files:', listError);
      }
    }
    
    throw error;
  }
}

// Run the script
if (require.main === module) {
  countDTRecordsFromStorage()
    .then(result => {
      console.log('\n✅ DT record count completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { countDTRecordsFromStorage };
