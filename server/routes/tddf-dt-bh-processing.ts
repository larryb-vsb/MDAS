// Enhanced TDDF API routes for both DT and BH processing
import express from 'express';
import { storage } from '../storage';

const router = express.Router();

// Process both DT and BH records with unified endpoint
router.post('/process-dt-and-bh', async (req, res) => {
  try {
    const { batchSize = 100, recordTypes = ['DT', 'BH'] } = req.body;
    
    console.log(`[TDDF DT+BH] Starting processing for record types: ${recordTypes.join(', ')}`);
    
    let totalProcessed = 0;
    let totalErrors = 0;
    const results = [];
    
    // Process BH records first (batch headers before transaction details)
    if (recordTypes.includes('BH')) {
      try {
        const bhResult = await storage.processPendingTddfBhRecords(batchSize);
        results.push({
          recordType: 'BH',
          processed: bhResult.processed,
          errors: bhResult.errors,
          skipped: bhResult.skipped || 0
        });
        totalProcessed += bhResult.processed;
        totalErrors += bhResult.errors;
        console.log(`[TDDF BH] Processed ${bhResult.processed} BH records, ${bhResult.errors} errors`);
      } catch (error) {
        console.error('[TDDF BH] Error processing BH records:', error);
        results.push({
          recordType: 'BH',
          processed: 0,
          errors: 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        totalErrors += 1;
      }
    }
    
    // Process DT records
    if (recordTypes.includes('DT')) {
      try {
        const dtResult = await storage.processPendingTddfDtRecords(batchSize);
        results.push({
          recordType: 'DT',
          processed: dtResult.processed,
          errors: dtResult.errors,
          skipped: dtResult.skipped || 0
        });
        totalProcessed += dtResult.processed;
        totalErrors += dtResult.errors;
        console.log(`[TDDF DT] Processed ${dtResult.processed} DT records, ${dtResult.errors} errors`);
      } catch (error) {
        console.error('[TDDF DT] Error processing DT records:', error);
        results.push({
          recordType: 'DT',
          processed: 0,
          errors: 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        totalErrors += 1;
      }
    }
    
    // Get remaining backlog counts
    const backlogCounts = await storage.getTddfBacklogCounts(['DT', 'BH']);
    
    res.json({
      success: true,
      summary: {
        totalProcessed,
        totalErrors,
        recordTypesProcessed: recordTypes
      },
      results,
      remainingBacklog: backlogCounts
    });
    
  } catch (error) {
    console.error('[TDDF DT+BH] Processing error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown processing error'
    });
  }
});

// Get processing status for both DT and BH records
router.get('/processing-status', async (req, res) => {
  try {
    const backlogCounts = await storage.getTddfBacklogCounts(['DT', 'BH', 'P1', 'AD', 'DR', 'G2', 'E1']);
    const processedCounts = await storage.getTddfProcessedCounts(['DT', 'BH']);
    
    res.json({
      success: true,
      backlog: backlogCounts,
      processed: processedCounts,
      systemStatus: 'operational'
    });
    
  } catch (error) {
    console.error('[TDDF STATUS] Error getting processing status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown status error'
    });
  }
});

// Reset specific record types back to pending for reprocessing
router.post('/reset-to-pending', async (req, res) => {
  try {
    const { recordTypes = ['BH'], limit = 100 } = req.body;
    
    console.log(`[TDDF RESET] Resetting ${limit} records of types: ${recordTypes.join(', ')} to pending`);
    
    const resetResults = await storage.resetTddfRecordsToPending(recordTypes, limit);
    
    res.json({
      success: true,
      message: `Reset ${resetResults.totalReset} records to pending status`,
      details: resetResults.byRecordType
    });
    
  } catch (error) {
    console.error('[TDDF RESET] Error resetting records:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown reset error'
    });
  }
});

export default router;