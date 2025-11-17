import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🔄 DIRECT AUGUST HYBRID PROCESSING');
console.log('=================================');

async function processAugustFile() {
    try {
        console.log('\n📁 Processing VERMNTSB_6759_TDDF_2400_08032025_001500.TSYSO...');
        
        // Use the existing optimized TDDF encoder directly
        const command = `cd /home/runner/workspace && node server/services/optimized-tddf-encoder.js tmp_uploads/VERMNTSB_6759_TDDF_2400_08032025_001500.TSYSO development`;
        
        console.log('🚀 Executing hybrid processing...');
        console.log('Command:', command);
        
        const { stdout, stderr } = await execAsync(command);
        
        if (stdout) {
            console.log('\n✅ Processing Output:');
            console.log(stdout);
        }
        
        if (stderr) {
            console.log('\n⚠️ Processing Errors:');  
            console.log(stderr);
        }
        
        console.log('\n🎯 Next steps:');
        console.log('- Check for created TDDF1 table');
        console.log('- Verify hybrid storage usage');
        console.log('- Build monthly precache aggregation');
        
    } catch (error) {
        console.error('❌ Processing failed:', error.message);
        
        // Try alternative approach with tsx
        console.log('\n🔄 Trying with tsx...');
        try {
            const tsxCommand = `cd /home/runner/workspace && npx tsx server/services/optimized-tddf-encoder.ts tmp_uploads/VERMNTSB_6759_TDDF_2400_08032025_001500.TSYSO development`;
            const { stdout: tsxStdout, stderr: tsxStderr } = await execAsync(tsxCommand);
            
            if (tsxStdout) {
                console.log('✅ TSX Output:', tsxStdout);
            }
            if (tsxStderr) {
                console.log('⚠️ TSX Errors:', tsxStderr);
            }
        } catch (tsxError) {
            console.error('❌ TSX also failed:', tsxError.message);
        }
    }
}

processAugustFile();