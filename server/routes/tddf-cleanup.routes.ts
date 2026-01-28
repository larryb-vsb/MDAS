/**
 * TDDF Duplicate Cleanup API Routes
 */

import type { Express } from 'express';
import { isAuthenticated } from './middleware';
import { tddfDuplicateCleanupService } from '../services/tddf-duplicate-cleanup';

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
  
  console.log('[TDDF-CLEANUP-API] Routes registered');
}
