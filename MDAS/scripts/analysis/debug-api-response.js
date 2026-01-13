import axios from 'axios';
import fs from 'fs';

async function testApiResponse() {
    try {
        console.log('Testing uploads history API response structure...\n');
        
        const response = await axios.get('http://localhost:5000/api/uploads/history?limit=3');
        
        console.log('✅ API Response received');
        console.log('📊 Response Structure:', JSON.stringify(Object.keys(response.data), null, 2));
        
        if (response.data.uploads && response.data.uploads.length > 0) {
            const firstFile = response.data.uploads[0];
            console.log('\n📁 First File Structure:', JSON.stringify(Object.keys(firstFile), null, 2));
            console.log('\n📁 First File Sample Data:');
            console.log('   ID:', firstFile.id);
            console.log('   Processing Status:', firstFile.processing_status || firstFile.processingStatus);
            console.log('   Raw Lines Count:', firstFile.raw_lines_count || firstFile.rawLinesCount);
            console.log('   Processing Notes:', firstFile.processing_notes || firstFile.processingNotes);
            
            // Check if camelCase or snake_case is being used
            const hasSnakeCase = firstFile.hasOwnProperty('processing_status');
            const hasCamelCase = firstFile.hasOwnProperty('processingStatus');
            console.log('\n🐍 Uses snake_case:', hasSnakeCase);
            console.log('🐪 Uses camelCase:', hasCamelCase);
        } else {
            console.log('❌ No uploads found or wrong structure');
            console.log('Response data:', JSON.stringify(response.data, null, 2));
        }
        
    } catch (error) {
        console.error('❌ API Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testApiResponse();