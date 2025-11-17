import { Express } from "express";
import { pool, db } from "../db";
import { isAuthenticated } from "./middleware";
import { SchemaVersionManager, CURRENT_SCHEMA_VERSION, getCurrentFileVersion } from "../schema_version";

export function registerSchemaRoutes(app: Express) {
  // Import current schema content into database
  app.post("/api/schema/import", async (req, res) => {
    try {
      const fs = await import('fs');
      const crypto = await import('crypto');
      const path = await import('path');
      
      // Read current schema file
      const schemaPath = path.join(process.cwd(), 'shared', 'schema.ts');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const contentHash = crypto.createHash('sha256').update(schemaContent).digest('hex');
      
      // Check if this content already exists
      const existing = await pool.query(`
        SELECT id, version FROM schema_content 
        WHERE content_hash = $1
      `, [contentHash]);
      
      if (existing.rows.length > 0) {
        return res.json({ 
          message: 'Schema content already exists in database',
          version: existing.rows[0].version,
          existing: true
        });
      }
      
      // Extract version from file header
      const versionMatch = schemaContent.match(/Version: ([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : '1.3.0';
      
      // Insert schema content
      const result = await pool.query(`
        INSERT INTO schema_content (
          version, content, file_name, stored_by, content_hash, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, version, stored_at
      `, [
        version,
        schemaContent,
        'schema.ts',
        req.user?.username || 'Alex-ReplitAgent',
        contentHash,
        `MMS-Master-Schema import: Complete schema file content for version ${version}`
      ]);
      
      const record = result.rows[0];
      console.log(`📦 Schema imported: Version ${version} (${schemaContent.length} chars)`);
      
      res.status(201).json({
        message: 'Schema content imported successfully',
        version: version,
        id: record.id,
        contentLength: schemaContent.length,
        storedAt: record.stored_at
      });
      
    } catch (error: any) {
      console.error('Schema import error:', error);
      res.status(500).json({ 
        error: 'Failed to import schema content', 
        details: error.message 
      });
    }
  });

  // Get schema content from database (replaces file system access)
  app.get("/api/schema/raw", async (req, res) => {
    try {
      const { version } = req.query;
      
      let query = `
        SELECT content, version, stored_at 
        FROM schema_content`;
      let params: any[] = [];
      
      if (version && version !== 'current') {
        query += ` WHERE version = $1`;
        params.push(version);
      }
      
      query += ` ORDER BY stored_at DESC LIMIT 1`;
      
      const result = await pool.query(query, params);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'No schema content found', 
          suggestion: 'Import schema content first using POST /api/schema/import' 
        });
      }
      
      const schemaRecord = result.rows[0];
      console.log(`📖 Serving schema content: Version ${schemaRecord.version} (${schemaRecord.content.length} chars)`);
      
      res.setHeader('Content-Type', 'text/plain');
      res.send(schemaRecord.content);
      
    } catch (error: any) {
      console.error('Schema retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve schema content', details: error.message });
    }
  });

  // Get available schema versions for selector
  app.get("/api/schema/versions-list", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT version, stored_at, stored_by, file_name, 
               LENGTH(content) as content_size, notes
        FROM schema_content 
        ORDER BY stored_at DESC
      `);
      
      const versions = result.rows.map(row => ({
        version: row.version,
        storedAt: row.stored_at,
        storedBy: row.stored_by,
        fileName: row.file_name,
        contentSize: row.content_size,
        notes: row.notes
      }));
      
      // Get current file version dynamically
      const currentFileVersion = getCurrentFileVersion();
      
      res.json({ 
        versions,
        currentFileVersion: currentFileVersion
      });
      
    } catch (error: any) {
      console.error('Schema versions list error:', error);
      res.status(500).json({ error: 'Failed to retrieve schema versions', details: error.message });
    }
  });

  app.get("/api/schema/versions", async (req, res) => {
    try {
      const versions = await SchemaVersionManager.getAllVersions();
      const currentVersion = await SchemaVersionManager.getCurrentVersion();
      
      // Get schema generation and sync tracking info - ALWAYS return both dev and prod
      let schemaTracking = null;
      try {
        const NODE_ENV = process.env.NODE_ENV || 'development';
        const isProd = NODE_ENV === 'production';
        
        // Get dev schema version from SchemaWatch (auto-tracked via event triggers)
        let devTracking = null;
        try {
          const devVersionResult = await pool.query(`
            SELECT version FROM schema_watch.current_version_mat
          `);
          
          const devLogResult = await pool.query(`
            SELECT event_time, command_tag 
            FROM schema_watch.log 
            ORDER BY log_id DESC 
            LIMIT 1
          `);
          
          if (devVersionResult.rows.length > 0) {
            devTracking = {
              timestamp: devLogResult.rows[0]?.event_time || new Date().toISOString(),
              version: devVersionResult.rows[0].version.toString(),
              notes: devLogResult.rows[0]?.command_tag || 'Auto-tracked by SchemaWatch'
            };
          }
        } catch (devErr) {
          console.log('Could not fetch dev schema tracking from SchemaWatch:', devErr);
        }
        
        // Get production sync event (always try to fetch)
        let prodTracking = null;
        try {
          const syncResult = await pool.query(`
            SELECT timestamp, notes, version
            FROM schema_dump_tracking
            WHERE action = 'production_synced'
            ORDER BY timestamp DESC 
            LIMIT 1
          `);
          if (syncResult.rows.length > 0) {
            prodTracking = {
              timestamp: syncResult.rows[0].timestamp,
              version: syncResult.rows[0].version || currentVersion?.version || '2.9.0',
              notes: syncResult.rows[0].notes
            };
          }
        } catch (prodErr) {
          console.log('Could not fetch prod schema tracking:', prodErr);
        }
        
        schemaTracking = {
          dev: devTracking,
          prod: prodTracking,
          environment: isProd ? 'production' : 'development'
        };
      } catch (trackingError) {
        console.warn('Could not fetch schema tracking info:', trackingError);
      }
      
      res.json({
        versions,
        currentVersion,
        expectedVersion: CURRENT_SCHEMA_VERSION,
        tracking: schemaTracking
      });
    } catch (error) {
      console.error("Error getting schema versions:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to retrieve schema versions" 
      });
    }
  });
  
  // Update schema version to the latest version
  app.post("/api/schema/update", isAuthenticated, async (req, res) => {
    try {
      const currentFileVersion = getCurrentFileVersion();
      
      if (!currentFileVersion) {
        return res.status(404).json({ error: "Current file version could not be determined" });
      }
      
      const newVersion = await SchemaVersionManager.addVersion({
        version: currentFileVersion,
        description: `Updated to schema version ${currentFileVersion}`,
        changes: [`Updated database schema to match file version ${currentFileVersion}`],
        appliedBy: req.user ? req.user.username : 'Alex-ReplitAgent',
      });
      
      res.json({
        success: true,
        version: newVersion,
        updatedTo: currentFileVersion
      });
    } catch (error) {
      console.error("Error updating schema version:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update schema version" 
      });
    }
  });
}
