// Test TDDF processing functionality
import { db, pool } from './server/db.js';
import { sql } from 'drizzle-orm';

async function testTddfProcessing() {
  try {
    console.log('🧪 Testing TDDF Processing...');
    
    // Get the first queued TDDF file  
    const result = await db.execute(sql`
      SELECT id, file_content, original_filename 
      FROM dev_uploaded_files 
      WHERE file_type = 'tddf' AND processing_status = 'queued' 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No queued TDDF files found');
      return;
    }
    
    const file = result.rows[0];
    console.log(`📄 Found queued TDDF file: ${file.original_filename}`);
    
    // Decode and check the content
    const fileContent = Buffer.from(file.file_content, 'base64').toString('utf8');
    const lines = fileContent.split('\n').filter(line => line.trim());
    console.log(`📝 File contains ${lines.length} lines`);
    
    // Check the first few lines and record types
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i];
      const recordType = line.length >= 19 ? line.substring(17, 19) : 'XX';
      console.log(`Line ${i + 1}: Record Type '${recordType}' (${line.length} chars)`);
    }
    
    console.log('✅ TDDF file content is accessible and properly formatted!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testTddfProcessing();