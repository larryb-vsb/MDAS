// Monitor the batch processing of 12 uploaded files
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function monitorBatchProcessing() {
  console.log('=== MONITORING 12 FILE BATCH PROCESSING ===\n');
  
  try {
    let monitoring = true;
    let attempts = 0;
    const maxAttempts = 120; // 4 minutes max
    
    while (monitoring && attempts < maxAttempts) {
      const historyResponse = await fetch(`${BASE_URL}/api/uploads/history`);
      if (historyResponse.ok) {
        const files = await historyResponse.json();
        
        // Get recent files (uploaded in last 5 minutes)
        const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const recentFiles = files.filter(f => f.uploadedAt > recentCutoff);
        
        console.log(`\n--- Status Check ${attempts + 1} ---`);
        console.log(`Recent files found: ${recentFiles.length}`);
        
        let queued = 0;
        let processing = 0;
        let completed = 0;
        let failed = 0;
        let errors = [];
        
        recentFiles.forEach(file => {
          const status = file.processingStatus || 'unknown';
          const name = file.originalFilename;
          
          if (status === 'queued') queued++;
          else if (status === 'processing') processing++;
          else if (status === 'completed' || file.processed) completed++;
          else if (status === 'failed') {
            failed++;
            if (file.processingErrors) {
              errors.push(`${name}: ${file.processingErrors}`);
            }
          }
          
          console.log(`  ${name}: ${status}`);
        });
        
        console.log(`\nSummary: Queued(${queued}) Processing(${processing}) Completed(${completed}) Failed(${failed})`);
        
        if (errors.length > 0) {
          console.log('\n🚨 ERRORS DETECTED:');
          errors.forEach(error => console.log(`  ❌ ${error}`));
        }
        
        // Check if all files are done processing
        if (recentFiles.length > 0 && queued === 0 && processing === 0) {
          console.log('\n✅ All recent files completed processing!');
          monitoring = false;
        }
        
        // Check processor status
        const statusResponse = await fetch(`${BASE_URL}/api/file-processor/status`);
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          console.log(`File processor: ${status.isRunning ? 'RUNNING' : 'IDLE'}`);
        }
      }
      
      if (monitoring) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        attempts++;
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('\n⏱️ Monitoring timeout reached');
    }
    
    console.log('\n=== FINAL SUMMARY ===');
    console.log('Batch processing monitoring complete');
    
  } catch (error) {
    console.error('❌ Monitoring failed:', error.message);
  }
}

monitorBatchProcessing();