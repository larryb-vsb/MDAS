// Quick test to verify production TDDF processing status
import https from 'https';

const prodUrl = 'https://merchant-management-system--vermont-state-bank.replit.app/api/processing/real-time-stats';

console.log('Testing production TDDF processing status...');

https.get(prodUrl, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const stats = JSON.parse(data);
      console.log('\n=== PRODUCTION TDDF STATUS ===');
      console.log('Total TDDF Records:', stats.tddfOperations?.totalTddfRecords || 0);
      console.log('TDDF Files Processed:', stats.tddfFilesProcessed || 0);
      console.log('TDDF Files Queued:', stats.tddfFilesQueued || 0);
      console.log('DT Records Processed:', stats.tddfOperations?.dtRecordsProcessed || 0);
      console.log('Raw Lines Total:', stats.tddfOperations?.totalRawLines || 0);
      console.log('Non-DT Records Skipped:', stats.tddfOperations?.nonDtRecordsSkipped || 0);
      console.log('\n=== PRODUCTION STATUS ===');
      console.log('Total Files:', stats.totalFiles || 0);
      console.log('Processed Files:', stats.processedFiles || 0);
      console.log('Queued Files:', stats.queuedFiles || 0);
    } catch (error) {
      console.error('Error parsing response:', error);
      console.log('Raw response:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error making request:', err);
});