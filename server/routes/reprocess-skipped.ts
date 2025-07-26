import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../routes";

export function registerReprocessSkippedRoutes(app: Express) {
  
  // Get skipped records summary
  app.get("/api/reprocess-skipped/summary", isAuthenticated, async (req, res) => {
    try {
      const summary = await storage.getSkippedRecordsSummary();
      res.json(summary);
    } catch (error) {
      console.error('Error getting skipped records summary:', error);
      res.status(500).json({ 
        error: "Failed to get skipped records summary",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Reprocess skipped records by type and reason
  app.post("/api/reprocess-skipped/by-reason", isAuthenticated, async (req, res) => {
    try {
      const { skipReason, recordType, maxRecords = 1000 } = req.body;
      
      if (!skipReason) {
        return res.status(400).json({ error: "skipReason is required" });
      }

      console.log(`[REPROCESS] Starting reprocessing for reason: ${skipReason}, type: ${recordType || 'ALL'}, max: ${maxRecords}`);
      
      const result = await storage.reprocessSkippedRecordsByReason(skipReason, recordType, maxRecords);
      
      console.log(`[REPROCESS] Completed: ${result.processed} processed, ${result.errors} errors`);
      res.json(result);
    } catch (error) {
      console.error('Error reprocessing skipped records:', error);
      res.status(500).json({ 
        error: "Failed to reprocess skipped records",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Fix schema issues and reprocess affected records
  app.post("/api/reprocess-skipped/fix-schema", isAuthenticated, async (req, res) => {
    try {
      console.log(`[SCHEMA_FIX] Starting schema fixes and reprocessing`);
      
      const result = await storage.fixSchemaIssuesAndReprocess();
      
      console.log(`[SCHEMA_FIX] Completed: ${result.schemaFixesApplied} fixes, ${result.recordsReprocessed} reprocessed`);
      res.json(result);
    } catch (error) {
      console.error('Error fixing schema and reprocessing:', error);
      res.status(500).json({ 
        error: "Failed to fix schema and reprocess",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Reprocess all emergency/load management skipped records
  app.post("/api/reprocess-skipped/emergency-load", isAuthenticated, async (req, res) => {
    try {
      const { batchSize = 500 } = req.body;
      
      console.log(`[EMERGENCY_REPROCESS] Starting emergency/load management reprocessing (batch: ${batchSize})`);
      
      const result = await storage.reprocessEmergencySkippedRecords(batchSize);
      
      console.log(`[EMERGENCY_REPROCESS] Completed: ${result.totalProcessed} processed, ${result.totalErrors} errors`);
      res.json(result);
    } catch (error) {
      console.error('Error reprocessing emergency skipped records:', error);
      res.status(500).json({ 
        error: "Failed to reprocess emergency skipped records",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get detailed error log for debugging
  app.get("/api/reprocess-skipped/error-log", isAuthenticated, async (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const errorLog = await storage.getSkippedRecordsErrorLog(Number(limit));
      res.json(errorLog);
    } catch (error) {
      console.error('Error getting error log:', error);
      res.status(500).json({ 
        error: "Failed to get error log",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}