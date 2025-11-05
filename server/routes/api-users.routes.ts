import type { Express } from "express";
import { storage } from "../storage";

export function registerApiUserRoutes(app: Express) {
  // API User management endpoints
  app.get("/api/api-users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUsers = await storage.getApiUsers();
      res.json(apiUsers);
    } catch (error) {
      console.error("Error fetching API users:", error);
      res.status(500).json({ error: "Failed to fetch API users" });
    }
  });

  app.post("/api/api-users", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUser = await storage.createApiUser({
        ...req.body,
        createdBy: req.user?.username || "System"
      });
      
      res.status(201).json(apiUser);
    } catch (error) {
      console.error("Error creating API user:", error);
      res.status(500).json({ error: "Failed to create API user" });
    }
  });

  app.put("/api/api-users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUserId = parseInt(req.params.id);
      const updatedApiUser = await storage.updateApiUser(apiUserId, req.body);
      
      res.json(updatedApiUser);
    } catch (error) {
      console.error("Error updating API user:", error);
      res.status(500).json({ error: "Failed to update API user" });
    }
  });

  app.delete("/api/api-users/:id", async (req, res) => {
    try {
      // Check if user is authenticated and is admin
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUserId = parseInt(req.params.id);
      await storage.deleteApiUser(apiUserId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting API user:", error);
      res.status(500).json({ error: "Failed to delete API user" });
    }
  });

  // Alias routes for TDDF API Keys (same as API Users but with /tddf-api/keys path)
  app.get("/api/tddf-api/keys", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUsers = await storage.getApiUsers();
      
      // Map backend fields to frontend-compatible format
      const formattedKeys = apiUsers.map(user => ({
        ...user,
        keyName: user.username,
        keyPrefix: user.apiKey?.substring(0, 8) || 'mms_',
        apiKey: user.apiKey,
        requestCount: user.requestCount || 0,
        rateLimitPerMinute: 100 // Default value for now
      }));
      
      res.json(formattedKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/tddf-api/keys", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      // Map frontend fields to database schema fields
      const apiUser = await storage.createApiUser({
        username: req.body.keyName || req.body.username,
        description: req.body.description || null,
        permissions: req.body.permissions || ['read'],
        isActive: req.body.isActive !== undefined ? req.body.isActive : true
      });
      
      // Return with frontend-compatible field names
      res.status(201).json({
        ...apiUser,
        keyName: apiUser.username,
        keyPrefix: apiUser.apiKey?.substring(0, 8) || 'mms_',
        key: apiUser.apiKey,
        rateLimitPerMinute: 100 // Default value
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.delete("/api/tddf-api/keys/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUserId = parseInt(req.params.id);
      await storage.deleteApiUser(apiUserId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });
}
