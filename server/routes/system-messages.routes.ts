import { Express, Request, Response } from "express";
import { pool } from "../db";
import { getTableName } from "../table-config";

export function registerSystemMessagesRoutes(app: Express) {
  const tableName = getTableName("system_messages");

  // Ensure table exists on startup
  async function ensureTableExists() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT 'blue',
          is_active BOOLEAN NOT NULL DEFAULT true,
          show_popup BOOLEAN NOT NULL DEFAULT false,
          created_by TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${tableName}_is_active_idx ON ${tableName}(is_active)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${tableName}_created_at_idx ON ${tableName}(created_at)`);
      console.log(`[SYSTEM-MESSAGES] Table ${tableName} ready`);
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error creating table:", error);
    }
  }
  ensureTableExists();

  // Get all system messages (history)
  app.get("/api/system-messages", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT id, title, message, color, is_active, show_popup, created_by, created_at, updated_at
        FROM ${tableName}
        ORDER BY created_at DESC
        LIMIT 100
      `);
      
      res.json({
        messages: result.rows.map(row => ({
          id: row.id,
          title: row.title,
          message: row.message,
          color: row.color,
          isActive: row.is_active,
          showPopup: row.show_popup,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch system messages" });
    }
  });

  // Get active message for dashboard
  app.get("/api/system-messages/active", async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT id, title, message, color, is_active, show_popup, created_by, created_at, updated_at
        FROM ${tableName}
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (result.rows.length === 0) {
        return res.json({ message: null });
      }
      
      const row = result.rows[0];
      res.json({
        message: {
          id: row.id,
          title: row.title,
          message: row.message,
          color: row.color,
          isActive: row.is_active,
          showPopup: row.show_popup,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error fetching active message:", error);
      res.status(500).json({ error: "Failed to fetch active message" });
    }
  });

  // Create new system message
  app.post("/api/system-messages", async (req: Request, res: Response) => {
    try {
      const { title, message, color, isActive, showPopup } = req.body;
      const createdBy = (req as any).user?.username || "system";
      
      if (!title || !message) {
        return res.status(400).json({ error: "Title and message are required" });
      }
      
      // If setting as active, deactivate other messages first
      if (isActive) {
        await pool.query(`UPDATE ${tableName} SET is_active = false, updated_at = NOW()`);
      }
      
      const result = await pool.query(`
        INSERT INTO ${tableName} (title, message, color, is_active, show_popup, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, title, message, color, is_active, show_popup, created_by, created_at, updated_at
      `, [title, message, color || 'blue', isActive !== false, showPopup || false, createdBy]);
      
      const row = result.rows[0];
      res.json({
        message: {
          id: row.id,
          title: row.title,
          message: row.message,
          color: row.color,
          isActive: row.is_active,
          showPopup: row.show_popup,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error creating message:", error);
      res.status(500).json({ error: "Failed to create system message" });
    }
  });

  // Update system message
  app.put("/api/system-messages/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, message, color, isActive, showPopup } = req.body;
      
      // If setting as active, deactivate other messages first
      if (isActive) {
        await pool.query(`UPDATE ${tableName} SET is_active = false, updated_at = NOW() WHERE id != $1`, [id]);
      }
      
      const result = await pool.query(`
        UPDATE ${tableName}
        SET title = COALESCE($1, title),
            message = COALESCE($2, message),
            color = COALESCE($3, color),
            is_active = COALESCE($4, is_active),
            show_popup = COALESCE($5, show_popup),
            updated_at = NOW()
        WHERE id = $6
        RETURNING id, title, message, color, is_active, show_popup, created_by, created_at, updated_at
      `, [title, message, color, isActive, showPopup, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      const row = result.rows[0];
      res.json({
        message: {
          id: row.id,
          title: row.title,
          message: row.message,
          color: row.color,
          isActive: row.is_active,
          showPopup: row.show_popup,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error updating message:", error);
      res.status(500).json({ error: "Failed to update system message" });
    }
  });

  // Delete system message
  app.delete("/api/system-messages/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      res.json({ success: true, deletedId: parseInt(id) });
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error deleting message:", error);
      res.status(500).json({ error: "Failed to delete system message" });
    }
  });

  // Toggle message active status
  app.post("/api/system-messages/:id/toggle", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      
      // If activating, deactivate others first
      if (isActive) {
        await pool.query(`UPDATE ${tableName} SET is_active = false, updated_at = NOW() WHERE id != $1`, [id]);
      }
      
      const result = await pool.query(`
        UPDATE ${tableName}
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, title, message, color, is_active, show_popup, created_by, created_at, updated_at
      `, [isActive, id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      const row = result.rows[0];
      res.json({
        message: {
          id: row.id,
          title: row.title,
          message: row.message,
          color: row.color,
          isActive: row.is_active,
          showPopup: row.show_popup,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } catch (error) {
      console.error("[SYSTEM-MESSAGES] Error toggling message:", error);
      res.status(500).json({ error: "Failed to toggle system message" });
    }
  });

  console.log("[INFO] [SYSTEM-MESSAGES] Routes registered");
}
