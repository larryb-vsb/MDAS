/**
 * Hierarchical TDDF Migration API
 * Processes pending DT records from dev_tddf_raw_import into new hierarchical structure
 */
import { Router } from "express";
import { storage } from "../storage";
// Simple authentication check for migration routes
const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.user) {
    next();
  } else {
    res.status(401).json({ error: "Authentication required" });
  }
};

const router = Router();

// Process pending DT records into hierarchical TDDF structure
router.post("/migrate-pending-dt", isAuthenticated, async (req, res) => {
  try {
    const { batchSize = 1000 } = req.body;
    
    console.log(`[HIERARCHICAL MIGRATION] Starting migration of pending DT records...`);
    
    // Get count of pending DT records
    const pendingCount = await storage.getPendingDtCount();
    console.log(`[HIERARCHICAL MIGRATION] Found ${pendingCount} pending DT records`);
    
    if (pendingCount === 0) {
      return res.json({
        success: true,
        message: "No pending DT records to migrate",
        processed: 0,
        errors: 0
      });
    }
    
    // Process in batches
    let totalProcessed = 0;
    let totalErrors = 0;
    const startTime = Date.now();
    
    // Process first batch to test
    const result = await storage.processPendingDtRecordsHierarchical(batchSize);
    totalProcessed += result.processed;
    totalErrors += result.errors;
    
    const duration = Date.now() - startTime;
    
    console.log(`[HIERARCHICAL MIGRATION] Batch completed: ${result.processed} processed, ${result.errors} errors in ${duration}ms`);
    
    res.json({
      success: true,
      message: `Migration batch completed`,
      processed: totalProcessed,
      errors: totalErrors,
      remainingCount: pendingCount - totalProcessed,
      durationMs: duration,
      batchSize
    });
    
  } catch (error: any) {
    console.error("[HIERARCHICAL MIGRATION] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get migration status
router.get("/migration-status", async (req, res) => {
  try {
    const pendingCount = await storage.getPendingDtCount();
    const hierarchicalCount = await storage.getHierarchicalTddfCount();
    const legacyCount = await storage.getLegacyTddfCount();
    
    res.json({
      success: true,
      pendingDtRecords: pendingCount,
      hierarchicalTddfRecords: hierarchicalCount,
      legacyTddfRecords: legacyCount,
      migrationNeeded: pendingCount > 0,
      tablesReady: hierarchicalCount >= 0 // Tables exist if count query succeeds
    });
    
  } catch (error: any) {
    console.error("[MIGRATION STATUS] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test hierarchical processing with single record
router.post("/test-hierarchical", isAuthenticated, async (req, res) => {
  try {
    console.log(`[HIERARCHICAL TEST] Testing single record processing...`);
    
    const result = await storage.processPendingDtRecordsHierarchical(1);
    
    res.json({
      success: true,
      message: "Test completed",
      processed: result.processed,
      errors: result.errors,
      sampleRecord: result.sampleRecord || null
    });
    
  } catch (error: any) {
    console.error("[HIERARCHICAL TEST] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;