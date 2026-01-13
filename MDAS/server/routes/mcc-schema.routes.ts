import { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

export function registerMccSchemaRoutes(app: Express) {
  // Get all MCC schema fields
  app.get("/api/mcc-schema", isAuthenticated, async (req, res) => {
    try {
      const fields = await storage.getMccSchemaFields();
      res.json(fields);
    } catch (error) {
      console.error('[MCC SCHEMA] Error fetching fields:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch MCC schema fields" 
      });
    }
  });

  // Upload and process CSV to populate/update MCC schema fields
  app.post("/api/mcc-schema/upload-csv", isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileContent = req.file.buffer.toString('utf-8');
      const lines = fileContent.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Find required column indices
      const positionIdx = headers.indexOf('position');
      const fieldNameIdx = headers.findIndex(h => h.includes('field') && h.includes('name'));
      const fieldLengthIdx = headers.findIndex(h => h.includes('field') && h.includes('length'));
      const formatIdx = headers.indexOf('format');
      const descriptionIdx = headers.findIndex(h => h.includes('description'));
      const mmsIdx = headers.indexOf('mms');
      const keyIdx = headers.indexOf('key');
      const tabPositionIdx = headers.findIndex(h => h.includes('tab') && (h.includes('position') || h === 'tab'));

      if (positionIdx === -1) {
        return res.status(400).json({ error: "CSV must contain a 'position' column" });
      }

      const fields: any[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',').map(v => v.trim());
        
        if (values.length > positionIdx && values[positionIdx]) {
          const field = {
            position: values[positionIdx],
            fieldName: fieldNameIdx !== -1 ? values[fieldNameIdx] : '',
            fieldLength: fieldLengthIdx !== -1 ? parseInt(values[fieldLengthIdx]) || 0 : 0,
            format: formatIdx !== -1 ? values[formatIdx] : '',
            description: descriptionIdx !== -1 ? values[descriptionIdx] : null,
            mmsEnabled: mmsIdx !== -1 ? parseInt(values[mmsIdx]) || 0 : 0,
            key: keyIdx !== -1 ? (values[keyIdx] || null) : null,
            tabPosition: tabPositionIdx !== -1 ? (values[tabPositionIdx] || null) : null
          };
          
          if (field.fieldName && field.format) {
            fields.push(field);
          }
        }
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "No valid fields found in CSV" });
      }

      const result = await storage.bulkUpsertMccSchemaFields(fields);
      
      res.json({
        success: true,
        message: `Processed ${fields.length} fields`,
        inserted: result.inserted,
        updated: result.updated
      });
    } catch (error) {
      console.error('[MCC SCHEMA] Error uploading CSV:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload CSV" 
      });
    }
  });

  // Update a single MCC schema field
  app.patch("/api/mcc-schema/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid field ID" });
      }
      
      const updatedField = await storage.updateMccSchemaField(id, updates);
      res.json(updatedField);
    } catch (error) {
      console.error('[MCC SCHEMA] Error updating field:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update field" 
      });
    }
  });

  // Delete MCC schema fields (single or bulk)
  app.delete("/api/mcc-schema", isAuthenticated, async (req, res) => {
    try {
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      
      await storage.deleteMccSchemaFields(ids);
      
      res.json({
        success: true,
        deletedCount: ids.length,
        message: `Successfully deleted ${ids.length} field(s)`
      });
    } catch (error) {
      console.error('[MCC SCHEMA] Error deleting fields:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete fields" 
      });
    }
  });
}
