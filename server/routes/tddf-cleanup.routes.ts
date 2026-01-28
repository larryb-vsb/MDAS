/**
 * TDDF Duplicate Cleanup API Routes
 */

import type { Express } from 'express';
import { isAuthenticated } from './middleware';
import { tddfDuplicateCleanupService, filenameDuplicateService } from '../services/tddf-duplicate-cleanup';

export function registerTddfCleanupRoutes(app: Express) {
  
  // Get cleanup stats
  app.get('/api/tddf-cleanup/stats', isAuthenticated, async (req, res) => {
    try {
      const stats = await tddfDuplicateCleanupService.getStats();
      res.json(stats);
    } catch (error) {
      console.error('[TDDF-CLEANUP-API] Error getting stats:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get stats' 
      });
    }
  });
  
  // Get cleanup progress
  app.get('/api/tddf-cleanup/progress', isAuthenticated, async (req, res) => {
    try {
      const progress = tddfDuplicateCleanupService.getProgress();
      res.json(progress);
    } catch (error) {
      console.error('[TDDF-CLEANUP-API] Error getting progress:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get progress' 
      });
    }
  });
  
  // Start cleanup
  app.post('/api/tddf-cleanup/start', isAuthenticated, async (req, res) => {
    try {
      const { startDate, endDate, batchSize, recalculateHashes } = req.body;
      
      // Start cleanup in background (don't await)
      tddfDuplicateCleanupService.startCleanup({
        startDate,
        endDate,
        batchSize: batchSize || 10000,
        recalculateHashes: recalculateHashes || false
      }).catch(err => {
        console.error('[TDDF-CLEANUP-API] Background cleanup error:', err);
      });
      
      res.json({ 
        message: 'Cleanup started',
        progress: tddfDuplicateCleanupService.getProgress()
      });
    } catch (error) {
      console.error('[TDDF-CLEANUP-API] Error starting cleanup:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to start cleanup' 
      });
    }
  });
  
  // Stop cleanup
  app.post('/api/tddf-cleanup/stop', isAuthenticated, async (req, res) => {
    try {
      tddfDuplicateCleanupService.stopCleanup();
      res.json({ 
        message: 'Stop requested',
        progress: tddfDuplicateCleanupService.getProgress()
      });
    } catch (error) {
      console.error('[TDDF-CLEANUP-API] Error stopping cleanup:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to stop cleanup' 
      });
    }
  });
  
  // Reset progress
  app.post('/api/tddf-cleanup/reset', isAuthenticated, async (req, res) => {
    try {
      tddfDuplicateCleanupService.resetProgress();
      res.json({ 
        message: 'Progress reset',
        progress: tddfDuplicateCleanupService.getProgress()
      });
    } catch (error) {
      console.error('[TDDF-CLEANUP-API] Error resetting:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to reset' 
      });
    }
  });
  
  // Recalculate hashes only
  app.post('/api/tddf-cleanup/recalculate-hashes', isAuthenticated, async (req, res) => {
    try {
      const { batchSize } = req.body;
      
      // Run in background
      tddfDuplicateCleanupService.recalculateHashes(batchSize || 50000)
        .then(result => {
          console.log('[TDDF-CLEANUP-API] Hash recalculation complete:', result);
        })
        .catch(err => {
          console.error('[TDDF-CLEANUP-API] Hash recalculation error:', err);
        });
      
      res.json({ message: 'Hash recalculation started' });
    } catch (error) {
      console.error('[TDDF-CLEANUP-API] Error starting hash recalculation:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to start hash recalculation' 
      });
    }
  });
  
  // ============================================
  // FILENAME-BASED DUPLICATE SCANNING ROUTES
  // ============================================

  // Scan for duplicate filenames
  app.post('/api/filename-duplicates/scan', isAuthenticated, async (req, res) => {
    try {
      // Start scan in background
      filenameDuplicateService.scanForDuplicateFilenames()
        .then(result => {
          console.log('[FILENAME-DUP-API] Scan complete:', result.duplicateFilenames, 'duplicates found');
        })
        .catch(err => {
          console.error('[FILENAME-DUP-API] Scan error:', err);
        });
      
      res.json({ 
        message: 'Filename duplicate scan started',
        progress: filenameDuplicateService.getProgress()
      });
    } catch (error) {
      console.error('[FILENAME-DUP-API] Error starting scan:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to start scan' 
      });
    }
  });

  // Get filename duplicate scan progress/results
  app.get('/api/filename-duplicates/progress', isAuthenticated, async (req, res) => {
    try {
      const progress = filenameDuplicateService.getProgress();
      res.json(progress);
    } catch (error) {
      console.error('[FILENAME-DUP-API] Error getting progress:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get progress' 
      });
    }
  });

  // Clean up duplicate filename records
  app.post('/api/filename-duplicates/cleanup', isAuthenticated, async (req, res) => {
    try {
      const { filenames, batchSize } = req.body;
      
      // Start cleanup in background
      filenameDuplicateService.cleanupDuplicateFilenames(filenames, batchSize || 5000)
        .then(result => {
          console.log('[FILENAME-DUP-API] Cleanup complete:', result.deleted, 'records deleted');
        })
        .catch(err => {
          console.error('[FILENAME-DUP-API] Cleanup error:', err);
        });
      
      res.json({ 
        message: 'Filename duplicate cleanup started',
        progress: filenameDuplicateService.getProgress()
      });
    } catch (error) {
      console.error('[FILENAME-DUP-API] Error starting cleanup:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to start cleanup' 
      });
    }
  });

  // Stop filename duplicate cleanup
  app.post('/api/filename-duplicates/stop', isAuthenticated, async (req, res) => {
    try {
      filenameDuplicateService.stopCleanup();
      res.json({ 
        message: 'Stop requested',
        progress: filenameDuplicateService.getProgress()
      });
    } catch (error) {
      console.error('[FILENAME-DUP-API] Error stopping:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to stop' 
      });
    }
  });

  // Reset filename duplicate progress
  app.post('/api/filename-duplicates/reset', isAuthenticated, async (req, res) => {
    try {
      filenameDuplicateService.resetProgress();
      res.json({ 
        message: 'Progress reset',
        progress: filenameDuplicateService.getProgress()
      });
    } catch (error) {
      console.error('[FILENAME-DUP-API] Error resetting:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to reset' 
      });
    }
  });

  console.log('[TDDF-CLEANUP-API] Routes registered');
}
