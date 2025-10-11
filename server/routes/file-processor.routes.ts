import type { Express } from "express";
import { isAuthenticated, isProcessingPaused, setProcessingPaused } from "./middleware";
import { fileProcessorService } from "../services/file-processor";
import { pool } from "../db";
import { getTableName } from "../table-config";

export function registerFileProcessorRoutes(app: Express) {
  // Get file processor status
  app.get("/api/file-processor/status", isAuthenticated, async (req, res) => {
    try {
      const uploadsTableName = getTableName('uploaded_files');
      
      // Get queued files count
      const queuedResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM ${uploadsTableName}
        WHERE processing_status = 'queued'
      `);
      
      // Get processing files count
      const processingResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM ${uploadsTableName}
        WHERE processing_status = 'processing'
      `);
      
      res.json({
        success: true,
        status: {
          isPaused: isProcessingPaused(),
          queuedFilesCount: parseInt(queuedResult.rows[0]?.count || '0'),
          processingFilesCount: parseInt(processingResult.rows[0]?.count || '0')
        }
      });
    } catch (error) {
      console.error('Error fetching file processor status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch file processor status" 
      });
    }
  });

  // Pause file processor
  app.post("/api/file-processor/pause", isAuthenticated, async (req, res) => {
    try {
      fileProcessorService.pause();
      setProcessingPaused(true);
      
      res.json({
        success: true,
        message: "File processor paused successfully",
        isPaused: true
      });
    } catch (error) {
      console.error('Error pausing file processor:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to pause file processor" 
      });
    }
  });

  // Resume file processor
  app.post("/api/file-processor/resume", isAuthenticated, async (req, res) => {
    try {
      fileProcessorService.resume();
      setProcessingPaused(false);
      
      res.json({
        success: true,
        message: "File processor resumed successfully",
        isPaused: false
      });
    } catch (error) {
      console.error('Error resuming file processor:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to resume file processor" 
      });
    }
  });

  // Force process files immediately
  app.post("/api/file-processor/force-process", isAuthenticated, async (req, res) => {
    try {
      if (isProcessingPaused()) {
        return res.status(400).json({ 
          error: "Cannot force process while file processor is paused. Please resume first." 
        });
      }
      
      // Trigger immediate processing
      await fileProcessorService.forceProcessing();
      
      res.json({
        success: true,
        message: "Force processing initiated"
      });
    } catch (error) {
      console.error('Error force processing files:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to force process files" 
      });
    }
  });
}
