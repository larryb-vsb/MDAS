import type { Express } from "express";
import multer from "multer";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import { sql } from "drizzle-orm";
import { pool } from "../db";
import { getTableName } from "../table-config";

// Set up multer for file uploads with memory storage for buffer access
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for large TDDF files
});

export function registerUploadsRoutes(app: Express) {
  // Initialize upload - creates an upload record before file transfer
  app.post("/api/uploads/initialize", isAuthenticated, async (req, res) => {
    try {
      const { filename, fileType, fileSize } = req.body;
      
      if (!filename || !fileType) {
        return res.status(400).json({ error: "Missing required fields: filename, fileType" });
      }
      
      // Generate unique upload ID
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create upload record in database
      const uploadsTableName = getTableName('uploaded_files');
      await pool.query(
        `INSERT INTO ${uploadsTableName} (id, filename, file_type, file_size, upload_status, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [uploadId, filename, fileType, fileSize || 0, 'initialized']
      );
      
      res.json({
        uploadId,
        status: 'initialized',
        message: 'Upload initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing upload:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to initialize upload" 
      });
    }
  });

  // Upload multiple files (array)
  app.post("/api/uploads", isAuthenticated, upload.array('files', 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }
      
      const uploadResults = [];
      const uploadsTableName = getTableName('uploaded_files');
      
      for (const file of files) {
        const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create upload record
        await pool.query(
          `INSERT INTO ${uploadsTableName} (id, filename, file_type, file_size, upload_status, file_content, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [uploadId, file.originalname, file.mimetype, file.size, 'completed', file.buffer]
        );
        
        uploadResults.push({
          uploadId,
          filename: file.originalname,
          size: file.size,
          status: 'completed'
        });
      }
      
      res.json({
        success: true,
        uploads: uploadResults,
        count: uploadResults.length
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload files" 
      });
    }
  });

  // Upload single file
  app.post("/api/upload", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const uploadsTableName = getTableName('uploaded_files');
      
      // Create upload record
      await pool.query(
        `INSERT INTO ${uploadsTableName} (id, filename, file_type, file_size, upload_status, file_content, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [uploadId, file.originalname, file.mimetype, file.size, 'completed', file.buffer]
      );
      
      res.json({
        success: true,
        uploadId,
        filename: file.originalname,
        size: file.size,
        status: 'completed'
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload file" 
      });
    }
  });

  // Get upload queue status
  app.get("/api/uploads/queue-status", isAuthenticated, async (req, res) => {
    try {
      const uploadsTableName = getTableName('uploaded_files');
      
      // Get queue statistics
      const queueStats = await pool.query(`
        SELECT 
          upload_status,
          COUNT(*) as count
        FROM ${uploadsTableName}
        WHERE upload_status IN ('initialized', 'uploading', 'queued', 'processing')
        GROUP BY upload_status
      `);
      
      // Get pending uploads
      const pendingUploads = await pool.query(`
        SELECT id, filename, file_type, file_size, upload_status, created_at
        FROM ${uploadsTableName}
        WHERE upload_status IN ('initialized', 'uploading', 'queued', 'processing')
        ORDER BY created_at DESC
        LIMIT 50
      `);
      
      const stats = queueStats.rows.reduce((acc, row) => {
        acc[row.upload_status] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);
      
      res.json({
        queueStats: {
          initialized: stats.initialized || 0,
          uploading: stats.uploading || 0,
          queued: stats.queued || 0,
          processing: stats.processing || 0,
          total: (Object.values(stats) as number[]).reduce((sum, count) => sum + count, 0)
        },
        pendingUploads: pendingUploads.rows
      });
    } catch (error) {
      console.error('Error fetching queue status:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch queue status" 
      });
    }
  });

  // Process queued uploads
  app.post("/api/process-uploads", isAuthenticated, async (req, res) => {
    try {
      const { uploadIds } = req.body;
      
      if (!uploadIds || !Array.isArray(uploadIds) || uploadIds.length === 0) {
        return res.status(400).json({ error: "No upload IDs provided" });
      }
      
      const uploadsTableName = getTableName('uploaded_files');
      const processedUploads = [];
      
      for (const uploadId of uploadIds) {
        // Update upload status to processing
        await pool.query(
          `UPDATE ${uploadsTableName} 
           SET upload_status = $1, processing_started_at = NOW() 
           WHERE id = $2`,
          ['processing', uploadId]
        );
        
        processedUploads.push({
          uploadId,
          status: 'processing'
        });
      }
      
      res.json({
        success: true,
        processedCount: processedUploads.length,
        uploads: processedUploads
      });
    } catch (error) {
      console.error('Error processing uploads:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process uploads" 
      });
    }
  });
}
