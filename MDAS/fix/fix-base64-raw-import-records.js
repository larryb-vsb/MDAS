// Script to fix existing Base64-encoded raw import records
import { pool } from './server/db.ts';

console.log('🔧 Starting Base64 Raw Import Records Fix...');

async function fixBase64RawImportRecords() {
  try {
    // Get all raw import records that appear to be Base64 encoded
    const result = await pool.query(`
      SELECT id, source_file_id, line_number, raw_line, record_type
      FROM dev_tddf_raw_import
      WHERE raw_line ~ '^[A-Za-z0-9+/=]+$' 
      AND LENGTH(raw_line) % 4 = 0
      AND LENGTH(raw_line) > 50
      ORDER BY source_file_id, line_number
    `);

    const base64Records = result.rows;
    console.log(`Found ${base64Records.length} Base64-encoded raw import records to fix`);

    let fixed = 0;
    let errors = 0;
    let recordTypeChanges = {};

    for (const record of base64Records) {
      try {
        // Decode the Base64 content
        const decodedContent = Buffer.from(record.raw_line, 'base64').toString('utf8');
        
        // Extract correct record type from decoded content
        const correctRecordType = decodedContent.length >= 19 ? decodedContent.substring(17, 19).trim() : 'UNK';
        
        // Track record type changes
        const changeKey = `${record.record_type} → ${correctRecordType}`;
        recordTypeChanges[changeKey] = (recordTypeChanges[changeKey] || 0) + 1;

        // Update the record with decoded content and correct record type
        await pool.query(`
          UPDATE dev_tddf_raw_import 
          SET raw_line = $1, record_type = $2, updated_at = NOW()
          WHERE id = $3
        `, [decodedContent, correctRecordType, record.id]);

        fixed++;

        if (fixed % 100 === 0) {
          console.log(`Fixed ${fixed} records so far...`);
        }

      } catch (error) {
        console.error(`Error fixing record ${record.id}:`, error);
        errors++;
      }
    }

    console.log(`\n✅ Base64 Raw Import Records Fix Complete:`);
    console.log(`  Fixed: ${fixed} records`);
    console.log(`  Errors: ${errors} records`);
    console.log(`\n📊 Record Type Changes:`);
    Object.entries(recordTypeChanges).forEach(([change, count]) => {
      console.log(`  ${change}: ${count} records`);
    });

    return { fixed, errors, recordTypeChanges };

  } catch (error) {
    console.error('❌ Error in fix script:', error);
    throw error;
  }
}

// Run the fix
fixBase64RawImportRecords()
  .then(result => {
    console.log('\n🎉 Fix completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Fix failed:', error);
    process.exit(1);
  });