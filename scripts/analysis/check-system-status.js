import fetch from 'node-fetch';

async function checkSystemStatus() {
  try {
    // Check Scanly-Watcher status and processing metrics
    const realTimeStats = await fetch('http://localhost:5000/api/processing/real-time-stats');
    const statsData = await realTimeStats.json();
    
    console.log('=== PROCESSING BACKLOG & WORKER SERVICE IMPACT ===');
    console.log(`📊 Total Files: ${statsData.totalFiles}`);
    console.log(`⏳ Queued Files: ${statsData.queuedFiles}`);
    console.log(`🔄 Currently Processing: ${statsData.currentlyProcessing}`);
    console.log(`❌ Files with Errors: ${statsData.filesWithErrors}`);
    console.log('');
    
    console.log('=== TDDF PROCESSING METRICS ===');
    const tddf = statsData.tddfOperations;
    console.log(`📈 Total TDDF Records: ${tddf.totalTddfRecords.toLocaleString()}`);
    console.log(`💰 Total Amount: $${tddf.totalTddfAmount.toLocaleString()}`);
    console.log(`🆕 Records Today: ${tddf.tddfRecordsToday.toLocaleString()}`);
    console.log(`⏰ Records Last Hour: ${tddf.tddfRecordsLastHour.toLocaleString()}`);
    console.log(`🔵 DT Records: ${tddf.dtRecordsProcessed.toLocaleString()}`);
    console.log(`🟢 BH Records: ${tddf.bhRecordsProcessed.toLocaleString()}`);
    console.log(`🟠 P1 Records: ${tddf.p1RecordsProcessed.toLocaleString()}`);
    console.log(`⚫ Other Records: ${tddf.otherRecordsProcessed.toLocaleString()}`);
    console.log('');
    
    console.log('=== PROCESSING RATES ===');
    console.log(`⚡ TDDF Records/Second: ${statsData.tddfRecordsPerSecond}`);
    console.log(`🚀 Peak Rate: ${statsData.peakTransactionsPerSecond}/sec`);
    console.log(`📝 Raw Lines Processed: ${tddf.totalRawLines.toLocaleString()}`);
    
    // Check connection pool info if available
    try {
      const poolInfo = await fetch('http://localhost:5000/api/pools/info');
      if (poolInfo.status === 200) {
        const poolData = await poolInfo.json();
        console.log('\n=== DATABASE CONNECTION POOLS ===');
        console.log(`🔗 Pool Status: ${JSON.stringify(poolData, null, 2)}`);
      }
    } catch (e) {
      console.log('\n=== DATABASE CONNECTION POOLS ===');
      console.log('⚠️  Pool info requires authentication or not available');
    }
    
    // System timestamp
    console.log(`\n🕐 Last Updated: ${new Date(statsData.timestamp).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST`);
    
  } catch (error) {
    console.error('❌ Error checking system status:', error.message);
  }
}

checkSystemStatus();