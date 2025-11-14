#!/usr/bin/env node

/**
 * Test encoding workflow for VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO
 * Upload ID: uploader_1753770043406_rxjr75vpv
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add the server directory to the path so we can import server modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import the encoding function
import { encodeTddfToJsonbDirect } from './server/tddf-json-encoder.js';

const uploadId = 'uploader_1753770043406_rxjr75vpv';
const filename = 'VERMNTSB.6759_TDDF_2400_11282022_000826.TSYSO';

console.log(`\n=== TESTING ENCODING WORKFLOW ===`);
console.log(`Upload ID: ${uploadId}`);
console.log(`Filename: ${filename}`);
console.log(`Testing fixes: ReplitStorageService import, error handling, field mapping\n`);

async function testEncodingWorkflow() {
    try {
        // Step 1: Get file content from Replit Object Storage
        console.log('Step 1: Testing file content access...');
        
        // Dynamically import the ReplitStorageService (like our fix)
        const { ReplitStorageService } = await import('./server/replit-storage-service.js');
        const storageService = new ReplitStorageService();
        
        const storageKey = `dev-uploader/${uploadId}/${filename}`;
        console.log(`Attempting to get file content from: ${storageKey}`);
        
        const fileContent = await storageService.getFileContent(storageKey);
        
        if (!fileContent) {
            throw new Error(`File content not found for ${storageKey}`);
        }
        
        const lines = fileContent.trim().split('\n');
        console.log(`✓ File content retrieved: ${lines.length} lines`);
        console.log(`First line preview: "${lines[0].substring(0, 50)}..."`);
        
        // Step 2: Test encoding function
        console.log('\nStep 2: Testing TDDF to JSONB encoding...');
        
        const result = await encodeTddfToJsonbDirect(uploadId, fileContent);
        
        console.log(`✓ Encoding completed successfully`);
        console.log(`Records processed: ${result.totalRecords}`);
        console.log(`Processing time: ${result.processingTime}ms`);
        console.log(`Record type breakdown:`, result.recordTypeBreakdown);
        
        // Step 3: Verify JSONB database records
        console.log('\nStep 3: Verifying JSONB database records...');
        
        const { db } = await import('./server/db.js');
        const { sql } = await import('drizzle-orm');
        
        const jsonbCount = await db.execute(sql`SELECT COUNT(*) as count FROM dev_tddf_jsonb WHERE upload_id = ${uploadId}`);
        const recordCount = jsonbCount[0].count;
        
        console.log(`✓ JSONB records in database: ${recordCount}`);
        
        if (recordCount > 0) {
            // Sample JSONB record
            const sampleRecord = await db.execute(sql`
                SELECT record_type, line_number, extracted_fields 
                FROM dev_tddf_jsonb 
                WHERE upload_id = ${uploadId} 
                LIMIT 1
            `);
            
            console.log(`Sample JSONB record:`, JSON.stringify(sampleRecord[0], null, 2));
        }
        
        // Step 4: Update upload status
        console.log('\nStep 4: Testing upload status update...');
        
        const updateQuery = sql`
            UPDATE dev_uploader_uploads 
            SET current_phase = 'encoded',
                processing_notes = 'Test encoding completed successfully',
                last_updated = NOW()
            WHERE id = ${uploadId}
        `;
        
        await db.execute(updateQuery);
        console.log(`✓ Upload status updated to 'encoded'`);
        
        console.log(`\n🎉 ENCODING WORKFLOW TEST COMPLETED SUCCESSFULLY!`);
        console.log(`✓ File content access: WORKING`);
        console.log(`✓ TDDF encoding: WORKING`);
        console.log(`✓ JSONB storage: WORKING`);
        console.log(`✓ Status updates: WORKING`);
        
        return {
            success: true,
            recordCount,
            processingTime: result.processingTime,
            recordTypes: result.recordTypeBreakdown
        };
        
    } catch (error) {
        console.error(`\n❌ ENCODING WORKFLOW TEST FAILED:`);
        console.error(`Error: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testEncodingWorkflow()
    .then(result => {
        if (result.success) {
            console.log(`\n=== TEST SUMMARY ===`);
            console.log(`Status: SUCCESS ✓`);
            console.log(`Records: ${result.recordCount}`);
            console.log(`Time: ${result.processingTime}ms`);
            process.exit(0);
        } else {
            console.log(`\n=== TEST SUMMARY ===`);
            console.log(`Status: FAILED ❌`);
            console.log(`Error: ${result.error}`);
            process.exit(1);
        }
    })
    .catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });