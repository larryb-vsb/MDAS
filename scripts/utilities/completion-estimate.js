import fetch from 'node-fetch';

async function calculateCompletion() {
  try {
    const response = await fetch('http://localhost:5000/api/processing/real-time-stats');
    const data = await response.json();
    
    const currentRate = data.tddfRecordsPerSecond * 60; // records per minute
    const estimatedBacklog = 19800; // From recent logs
    
    console.log('=== TDDF PROCESSING COMPLETION ESTIMATE ===\n');
    
    console.log('📊 CURRENT METRICS:');
    console.log(`• Processing Rate: ${currentRate} records/minute`);
    console.log(`• Total Processed: ${data.tddfOperations.totalTddfRecords.toLocaleString()}`);
    console.log(`• Estimated Remaining: ${estimatedBacklog.toLocaleString()} records`);
    console.log(`• Current Value: $${data.tddfOperations.totalTddfAmount.toLocaleString()}\n`);
    
    console.log('⏱️ COMPLETION SCENARIOS:');
    
    // Baseline calculation
    const baselineMinutes = Math.round(estimatedBacklog / currentRate);
    console.log(`• At Current Rate (${currentRate}/min): ${baselineMinutes} minutes`);
    
    // Bulk processing rate (observed from logs)
    const bulkRate = 600; // records/minute during active bulk processing
    const bulkMinutes = Math.round(estimatedBacklog / bulkRate);
    console.log(`• During Bulk Processing (${bulkRate}/min): ${bulkMinutes} minutes`);
    
    // With page focus optimization
    const optimizedRate = bulkRate * 2.5;
    const optimizedMinutes = Math.round(estimatedBacklog / optimizedRate);
    console.log(`• With Page Focus Optimization (${optimizedRate}/min): ${optimizedMinutes} minutes`);
    
    console.log('\n🎯 BEST CASE SCENARIO:');
    console.log(`• Scanly-Watcher bulk processing + page optimization`);
    console.log(`• Estimated completion: ${optimizedMinutes}-${bulkMinutes} minutes`);
    console.log(`• Expected finish time: ${new Date(Date.now() + optimizedMinutes * 60000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} CST`);
    
    console.log('\n📈 PROGRESS INDICATORS:');
    console.log('• Bulk processing cycles every 30 seconds');
    console.log('• 2000 records processed per successful cycle');
    console.log('• System automatically optimizes when monitoring pages inactive');
    console.log(`• Current progress: ${((32952 / (32952 + estimatedBacklog)) * 100).toFixed(1)}% complete`);
    
  } catch (error) {
    console.error('Error calculating completion estimate:', error.message);
  }
}

calculateCompletion();