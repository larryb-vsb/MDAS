import type { Express } from "express";
import { pool, db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { getTableName } from "../table-config";
import { isAuthenticated } from "./middleware";
import { z } from "zod";
import fs from "fs";

export function registerMerchantRoutes(app: Express) {
  // Get merchants with pagination and filters
  app.get("/api/merchants", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string || "All";
      const lastUpload = req.query.lastUpload as string || "Any time";
      const search = req.query.search as string || "";
      const merchantType = req.query.merchantType as string || "All";
      const sortBy = req.query.sortBy as string || "name";
      const sortOrder = (req.query.sortOrder as string || "asc").toLowerCase() as "asc" | "desc";

      const result = await storage.getMerchants(page, limit, status, lastUpload, search, merchantType, sortBy, sortOrder);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch merchants" });
    }
  });

  // Get merchant lookup map for TDDF viewer (account_number -> dba_name)
  app.get("/api/merchants/lookup-map", async (req, res) => {
    try {
      const merchantsTableName = getTableName('merchants');
      
      const result = await pool.query(`
        SELECT account_number, dba_name 
        FROM ${merchantsTableName}
        WHERE account_number IS NOT NULL 
          AND account_number != ''
      `);
      
      // Create lookup map: account_number -> dba_name
      const lookupMap: Record<string, string> = {};
      result.rows.forEach(row => {
        lookupMap[row.account_number] = row.dba_name || 'Unknown';
      });
      
      res.json(lookupMap);
    } catch (error) {
      console.error("Error fetching merchant lookup map:", error);
      res.status(500).json({ error: "Failed to fetch merchant lookup map" });
    }
  });

  // Export endpoints for the dedicated Exports page
  app.get("/api/exports/merchants/download", async (req, res) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      
      const csvFilePath = await storage.exportMerchantsToCSV(startDate, endDate);
      
      // Track the export in audit log
      await storage.createAuditLog({
        userId: req.user?.id || null,
        username: req.user?.username || 'unknown',
        action: 'export_merchants',
        entityType: 'merchants',
        entityId: `export_${Date.now()}`,
        notes: `Merchants export${startDate ? ` from ${startDate}` : ''}${endDate ? ` to ${endDate}` : ''}`
      });
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `merchants_export_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting merchants:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to export merchants" 
      });
    }
  });

  // Export all merchants for a specific date
  app.get("/api/exports/merchants-all/download", async (req, res) => {
    try {
      const targetDate = req.query.targetDate as string;
      
      if (!targetDate) {
        return res.status(400).json({ error: "Target date is required" });
      }
      
      const csvFilePath = await storage.exportAllMerchantsForDateToCSV(targetDate);
      
      // Track the export in audit log
      await storage.createAuditLog({
        userId: req.user?.id || null,
        username: req.user?.username || 'unknown',
        action: 'export_merchants_all',
        entityType: 'merchants',
        entityId: `export_all_${Date.now()}`,
        notes: `All merchants export for date ${targetDate}`
      });
      
      // Set download headers
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `merchants_all_${targetDate.replace(/[:.]/g, '-')}_${timestamp}.csv`;
      
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      
      // Stream the file to client
      const fileStream = fs.createReadStream(csvFilePath);
      fileStream.pipe(res);
      
      // Clean up the file after sending
      fileStream.on('end', () => {
        fs.unlink(csvFilePath, (err) => {
          if (err) console.error(`Error deleting temporary CSV file: ${csvFilePath}`, err);
        });
      });
    } catch (error) {
      console.error("Error exporting all merchants:", error);
      res.status(500).json({
        error: "Failed to export all merchants to CSV"
      });
    }
  });

  // Download merchant demographics export
  app.get("/api/export/merchants", async (req, res) => {
    try {
      const filePath = await storage.generateMerchantsExport();
      res.download(filePath, "merchant_demographics.csv");
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate export" 
      });
    }
  });
  
  // Get merchant details by ID
  app.get("/api/merchants/:id", async (req, res) => {
    try {
      const merchantId = req.params.id;
      
      // Use the proper storage method which provides complete analytics including revenue trend data
      const merchantDetails = await storage.getMerchantById(merchantId);
      
      if (!merchantDetails) {
        return res.status(404).json({ error: `Merchant with ID ${merchantId} not found` });
      }
      
      res.json(merchantDetails);
    } catch (error) {
      console.error("Error fetching merchant details:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch merchant details" 
      });
    }
  });
  
  // Create a new merchant
  app.post("/api/merchants", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1, { message: "Name is required" }),
        clientMID: z.string().nullable().optional(),
        status: z.string().optional(),
        merchantType: z.string().nullable().optional(),
        salesChannel: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        category: z.string().nullable().optional()
      });
      
      const merchantData = schema.parse(req.body);
      
      // Set the updatedBy field to the logged-in user's username
      let updatedBy = "System";
      
      // Debug: Log user information
      console.log('[MERCHANT CREATE] User info:', {
        hasUser: !!req.user,
        username: req.user?.username,
        userId: req.user?.id,
        role: req.user?.role
      });
      
      // If a user is logged in, use their username
      if (req.user && req.user.username) {
        updatedBy = req.user.username;
        console.log('[MERCHANT CREATE] Setting updatedBy to:', updatedBy);
      } else {
        console.log('[MERCHANT CREATE] No user found, using System');
      }
      
      // Auto-generate merchant ID for manual creation (user-friendly approach)
      // CSV imports use authentic IDs, manual creation gets auto-generated IDs
      let merchantId = (merchantData as any).id;
      if (!merchantId) {
        // Generate a timestamp-based merchant ID for manual creation
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        merchantId = `MMS${timestamp}${randomSuffix}`;
        console.log(`[MANUAL MERCHANT] Auto-generated ID: ${merchantId} for merchant: ${merchantData.name}`);
      }
      
      const newMerchant = await storage.createMerchant({
        ...merchantData,
        id: merchantId,
        createdAt: new Date(),
        editDate: new Date(),
        lastUploadDate: null,
        updatedBy: updatedBy
      });
      
      res.status(201).json({ 
        success: true, 
        merchant: newMerchant
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create merchant" 
      });
    }
  });
  
  // Update merchant details
  app.put("/api/merchants/:id", isAuthenticated, async (req, res) => {
    try {
      const merchantId = req.params.id;
      
      const schema = z.object({
        name: z.string().optional(),
        clientMID: z.string().nullable().optional(),
        status: z.string().optional(),
        merchantType: z.string().nullable().optional(),
        salesChannel: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        category: z.string().nullable().optional()
      });
      
      const merchantData = schema.parse(req.body);
      
      // Set the updatedBy field to the logged-in user's username
      let updatedBy = "System";
      
      // If a user is logged in, use their username
      if (req.user && req.user.username) {
        updatedBy = req.user.username;
      }
      
      // Check if this is from a file upload by checking referrer or headers
      const referrer = req.get('Referrer') || '';
      if (referrer.includes('/uploads') || req.get('X-File-Upload')) {
        updatedBy = "System-Uploader";
      }
      
      // Map frontend field names to database column names
      const fieldMapping = {
        clientMID: 'client_mid',
        merchantType: 'merchant_type', 
        salesChannel: 'sales_channel',
        zipCode: 'zip_code'
      };
      
      // Transform the merchant data to use correct database column names
      const mappedData: any = {};
      Object.keys(merchantData).forEach(key => {
        const dbColumnName = fieldMapping[key as keyof typeof fieldMapping] || key;
        mappedData[dbColumnName] = merchantData[key as keyof typeof merchantData];
      });
      
      // Always update the edit date and updatedBy when merchant details are changed
      const updatedMerchantData: any = {
        ...mappedData,
        edit_date: new Date(),
        updated_by: updatedBy
      };
      
      const updatedMerchant = await storage.updateMerchant(merchantId, updatedMerchantData);
      
      res.json({ 
        success: true, 
        merchant: updatedMerchant 
      });
    } catch (error) {
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update merchant" 
      });
    }
  });
  
  // Add transaction for a merchant
  app.post("/api/merchants/:id/transactions", async (req, res) => {
    try {
      const { id } = req.params;
      const transactionSchema = z.object({
        amount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
          message: "Amount must be a valid positive number"
        }),
        type: z.string(),
        date: z.string().refine(val => !isNaN(Date.parse(val)), {
          message: "Date must be valid"
        })
      });
      
      const transactionData = transactionSchema.parse(req.body);
      const newTransaction = await storage.addTransaction(id, transactionData);
      
      res.status(201).json(newTransaction);
    } catch (error) {
      console.error('Error adding transaction:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to add transaction" 
      });
    }
  });
  
  // Delete transactions
  app.post("/api/merchants/:id/transactions/delete", async (req, res) => {
    try {
      const schema = z.object({
        transactionIds: z.array(z.string())
      });
      
      const { transactionIds } = schema.parse(req.body);
      
      if (transactionIds.length === 0) {
        return res.status(400).json({ error: "No transaction IDs provided" });
      }
      
      await storage.deleteTransactions(transactionIds);
      
      res.json({ 
        success: true, 
        message: `${transactionIds.length} transaction(s) deleted successfully` 
      });
    } catch (error) {
      console.error('Error deleting transactions:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete transactions" 
      });
    }
  });
  
  // Delete multiple merchants (POST route for backward compatibility)
  app.post("/api/merchants/delete", async (req, res) => {
    try {
      const { merchantIds } = req.body;
      
      if (!merchantIds || !Array.isArray(merchantIds) || merchantIds.length === 0) {
        return res.status(400).json({ error: "Invalid request: merchantIds must be a non-empty array" });
      }
      
      await storage.deleteMerchants(merchantIds);
      res.json({ success: true, message: `Successfully deleted ${merchantIds.length} merchants` });
    } catch (error) {
      console.error('Error deleting merchants:', error);
      res.status(500).json({ error: "Failed to delete merchants" });
    }
  });

  // Delete multiple merchants (DELETE route)
  app.delete("/api/merchants", isAuthenticated, async (req, res) => {
    try {
      console.log(`[DELETE MERCHANTS API] Received DELETE request for merchants`);
      console.log(`[DELETE MERCHANTS API] Request body:`, req.body);
      console.log(`[DELETE MERCHANTS API] User authenticated:`, req.isAuthenticated());
      
      const { merchantIds } = req.body;
      
      if (!merchantIds || !Array.isArray(merchantIds) || merchantIds.length === 0) {
        console.log(`[DELETE MERCHANTS API] Invalid request: merchantIds must be a non-empty array`);
        return res.status(400).json({ error: "Invalid request: merchantIds must be a non-empty array" });
      }
      
      console.log(`[DELETE MERCHANTS API] Attempting to delete ${merchantIds.length} merchants:`, merchantIds);
      
      await storage.deleteMerchants(merchantIds);
      
      console.log(`[DELETE MERCHANTS API] Successfully deleted ${merchantIds.length} merchants`);
      res.json({ success: true, message: `Successfully deleted ${merchantIds.length} merchants` });
    } catch (error) {
      console.error('[DELETE MERCHANTS API] Error deleting merchants:', error);
      res.status(500).json({ error: "Failed to delete merchants" });
    }
  });

  // Merge merchants endpoint
  // Function to process merge logs after response is sent
  async function processPostMergeLogs(targetMerchantId: string, sourceMerchantIds: string[], result: any, username: string) {
    try {
      // Create audit log entries for each merged merchant
      for (const sourceMerchantId of sourceMerchantIds) {
        // @ENVIRONMENT-CRITICAL - Merchant merge source lookup with environment-aware table naming
        // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
        const merchantsTableName = getTableName('merchants'); 
        
        // Get the source merchant directly from database since it's been removed (using raw SQL)
        const sourceMerchantResult = await pool.query(`
          SELECT * FROM ${merchantsTableName} WHERE id = $1
        `, [sourceMerchantId]);
        const sourceMerchant = sourceMerchantResult.rows[0];
        if (sourceMerchant) {
          const auditLogData = {
            entityType: 'merchant',
            entityId: targetMerchantId,
            action: 'merge',
            userId: null,
            username,
            oldValues: sourceMerchant,
            newValues: result.targetMerchant,
            changedFields: ['transactions'],
            notes: `Merged merchant "${sourceMerchant.name}" (${sourceMerchantId}) into "${result.targetMerchant.name}" (${targetMerchantId}). Transferred ${result.transactionsTransferred} transactions.`
          };
          
          // @ENVIRONMENT-CRITICAL - Audit log creation with environment-aware table naming
          // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
          const auditLogsTableName = getTableName('audit_logs');
          
          console.log('[POST-MERGE LOGGING] Creating audit log entry:', auditLogData);
          
          // Create audit log using raw SQL with environment-aware table name
          const auditLogColumns = Object.keys(auditLogData).join(', ');
          const auditLogPlaceholders = Object.keys(auditLogData).map((_, i) => `$${i + 1}`).join(', ');
          const auditLogValues = Object.values(auditLogData).map(val => 
            typeof val === 'object' ? JSON.stringify(val) : val
          );
          
          const auditLogResult = await pool.query(`
            INSERT INTO ${auditLogsTableName} (${auditLogColumns}) VALUES (${auditLogPlaceholders}) RETURNING id
          `, auditLogValues);
          console.log('[POST-MERGE LOGGING] Audit log created successfully with ID:', auditLogResult.rows[0]?.id);
          
          // Verify the audit log was actually inserted using environment-aware table name
          const verifyAudit = await pool.query(`
            SELECT id FROM ${auditLogsTableName} WHERE id = $1
          `, [auditLogResult.rows[0]?.id]);
          console.log('[POST-MERGE LOGGING] Audit log verification:', verifyAudit.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
        }
      }
      
      // Create upload log entry
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substr(2, 9);
      const mergeLogData: any = {
        id: `merge_${timestamp}_${randomId}`,
        originalFilename: `Merchant Merge Operation: ${result.targetMerchant.name}`,
        storagePath: `/logs/merge_${targetMerchantId}_${timestamp}.log`,
        fileType: 'merchant',
        uploadedAt: new Date(),
        processed: true,
        processingErrors: null,
        deleted: false,
        fileContent: '',
        fileSize: 0,
        mimeType: 'application/octet-stream',
        processingStatus: 'completed'
      };
      
      console.log('[POST-MERGE LOGGING] Creating upload log entry:', mergeLogData);
      const uploadLogResult = await db.execute(sql`
        INSERT INTO uploaded_files (
          id, 
          original_filename, 
          storage_path, 
          file_type, 
          uploaded_at, 
          processed, 
          deleted,
          file_content,
          file_size,
          mime_type,
          processing_status
        ) VALUES (
          ${mergeLogData.id},
          ${mergeLogData.originalFilename},
          ${mergeLogData.storagePath},
          ${mergeLogData.fileType},
          ${mergeLogData.uploadedAt},
          ${mergeLogData.processed},
          ${mergeLogData.deleted},
          ${mergeLogData.fileContent || ''},
          ${mergeLogData.fileSize || 0},
          ${mergeLogData.mimeType || 'application/octet-stream'},
          ${mergeLogData.processingStatus || 'completed'}
        )
        RETURNING id
      `);
      const logId = (uploadLogResult.rows[0] as any)?.id;
      console.log('[POST-MERGE LOGGING] Upload log created successfully with ID:', uploadLogResult?.id);
      
      // @ENVIRONMENT-CRITICAL - Upload log verification with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Verify the upload log was actually inserted using environment-aware table name
      const verifyResult = await pool.query(`
        SELECT id FROM ${uploadedFilesTableName} WHERE id = $1
      `, [logId]);
      console.log('[POST-MERGE LOGGING] Upload log verification:', verifyResult.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
      
      // Create system log entry for the merge operation
      const systemLogData = {
        level: 'info',
        source: 'MerchantMerge',
        message: `Merchant merge completed successfully: ${result.merchantsRemoved} merchants merged into ${result.targetMerchant.name}`,
        details: {
          targetMerchantId,
          sourceMerchantIds,
          transactionsTransferred: result.transactionsTransferred,
          merchantsRemoved: result.merchantsRemoved,
          targetMerchantName: result.targetMerchant.name,
          performedBy: username,
          timestamp: new Date().toISOString()
        }
      };
      // @ENVIRONMENT-CRITICAL - System log creation with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const systemLogsTableName = getTableName('system_logs');
      
      console.log('[POST-MERGE LOGGING] Creating system log entry:', systemLogData);
      
      // Create system log using raw SQL with environment-aware table name
      const systemLogColumns = Object.keys(systemLogData).join(', ');
      const systemLogPlaceholders = Object.keys(systemLogData).map((_, i) => `$${i + 1}`).join(', ');
      const systemLogValues = Object.values(systemLogData).map(val => 
        typeof val === 'object' ? JSON.stringify(val) : val
      );
      
      const systemLogResult = await pool.query(`
        INSERT INTO ${systemLogsTableName} (${systemLogColumns}) VALUES (${systemLogPlaceholders}) RETURNING id
      `, systemLogValues);
      console.log('[POST-MERGE LOGGING] System log created successfully with ID:', systemLogResult.rows[0]?.id);
      
      // Verify the system log was actually inserted using environment-aware table name
      const verifySystem = await pool.query(`
        SELECT id FROM ${systemLogsTableName} WHERE id = $1
      `, [systemLogResult.rows[0]?.id]);
      console.log('[POST-MERGE LOGGING] System log verification:', verifySystem.rows.length > 0 ? 'FOUND' : 'NOT FOUND');
    } catch (error) {
      console.error('[POST-MERGE LOGGING] Failed to create logs:', error);
    }
  }

  app.post("/api/merchants/merge", isAuthenticated, async (req, res) => {
    try {
      console.log('[MERGE REQUEST] Received merge request:', { 
        targetMerchantId: req.body.targetMerchantId, 
        sourceMerchantIds: req.body.sourceMerchantIds 
      });
      
      const { targetMerchantId, sourceMerchantIds } = req.body;
      
      if (!targetMerchantId || !sourceMerchantIds || !Array.isArray(sourceMerchantIds) || sourceMerchantIds.length === 0) {
        console.log('[MERGE ERROR] Invalid request parameters:', { targetMerchantId, sourceMerchantIds });
        return res.status(400).json({ 
          error: "Invalid request: targetMerchantId and sourceMerchantIds array required" 
        });
      }
      
      const username = req.user?.username || 'System';
      console.log('[MERGE START] Starting merge process with user:', username);
      
      const result = await storage.mergeMerchants(targetMerchantId, sourceMerchantIds, username);
      
      console.log('[MERGE SUCCESS] Merge completed successfully:', result);
      
      // Logging is now handled directly in storage.ts within the merge transaction
      console.log('[MERGE LOGGING] Logs created within merge transaction');
      
      // Send response after logs are created
      res.json({
        message: `Successfully merged ${result.merchantsRemoved} merchants into ${result.targetMerchant.name}`,
        ...result
      });
    } catch (error) {
      console.error('[MERGE ERROR] Error merging merchants:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to merge merchants" 
      });
    }
  });
}
