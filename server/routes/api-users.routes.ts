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
      
      // Map backend fields (snake_case from DB) to frontend-compatible format (camelCase)
      const formattedKeys = apiUsers.map(user => ({
        ...user,
        keyName: user.username,
        keyPrefix: user.api_key?.substring(0, 8) || 'mms_',  // Database column is api_key
        apiKey: user.api_key,  // Provide camelCase for frontend
        isActive: user.is_active,  // Map is_active to isActive for frontend
        requestCount: user.request_count || 0,  // Database column is request_count
        lastUsed: user.last_used,  // Map last_used to lastUsed for frontend
        lastUsedIp: user.last_used_ip,  // Map last_used_ip to lastUsedIp for frontend
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
      
      // Database returns snake_case columns, map to frontend-compatible field names (camelCase)
      res.status(201).json({
        ...apiUser,
        keyName: apiUser.username,
        keyPrefix: apiUser.api_key?.substring(0, 8) || 'mms_',
        key: apiUser.api_key,  // Database column is api_key (snake_case)
        apiKey: apiUser.api_key,  // Also provide camelCase for consistency
        isActive: apiUser.is_active,  // Map is_active to isActive for frontend
        requestCount: apiUser.request_count || 0,  // Map request_count to requestCount
        lastUsed: apiUser.last_used,  // Map last_used to lastUsed for frontend
        lastUsedIp: apiUser.last_used_ip,  // Map last_used_ip to lastUsedIp for frontend
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

  // Get last API connection details for monitoring
  app.get("/api/tddf-api/monitoring/last-connection", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      
      const apiUsers = await storage.getApiUsers();
      
      // Filter to only API keys that have been used at least once
      const usedKeys = apiUsers.filter(user => user.last_used != null);
      
      if (usedKeys.length === 0) {
        return res.json({ hasConnection: false });
      }
      
      // Find the most recently used API key
      const lastUsedKey = usedKeys.reduce((latest, current) => {
        const latestTime = latest.last_used ? new Date(latest.last_used).getTime() : 0;
        const currentTime = current.last_used ? new Date(current.last_used).getTime() : 0;
        return currentTime > latestTime ? current : latest;
      });
      
      res.json({
        hasConnection: true,
        keyName: lastUsedKey.username,
        keyPrefix: lastUsedKey.api_key?.substring(0, 15) + '...' || 'mms_...',
        lastUsed: lastUsedKey.last_used,
        lastUsedIp: lastUsedKey.last_used_ip || 'Unknown',
        requestCount: lastUsedKey.request_count || 0
      });
    } catch (error) {
      console.error("Error fetching last connection:", error);
      res.status(500).json({ error: "Failed to fetch last connection" });
    }
  });

  // Get host list (unique IPs with stats)
  app.get("/api/tddf-api/monitoring/hosts", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      const hosts = await storage.getConnectionHosts();
      res.json(hosts);
    } catch (error) {
      console.error("Error fetching connection hosts:", error);
      res.status(500).json({ error: "Failed to fetch connection hosts" });
    }
  });

  // Get connection log
  app.get("/api/tddf-api/monitoring/connections", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const connections = await storage.getConnectionLog(limit);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching connection log:", error);
      res.status(500).json({ error: "Failed to fetch connection log" });
    }
  });

  // Get all host approvals
  app.get("/api/tddf-api/monitoring/host-approvals", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      const approvals = await storage.getHostApprovals();
      res.json(approvals);
    } catch (error) {
      console.error("Error fetching host approvals:", error);
      res.status(500).json({ error: "Failed to fetch host approvals" });
    }
  });

  // Update host approval status
  app.put("/api/tddf-api/monitoring/host-approvals/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated() || req.user?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      const id = parseInt(req.params.id);
      const { status, notes } = req.body;
      const reviewedBy = req.user?.username || "Unknown";

      if (!['approved', 'denied'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'denied'" });
      }

      const updated = await storage.updateHostApprovalStatus(id, status, reviewedBy, notes);
      res.json(updated);
    } catch (error) {
      console.error("Error updating host approval:", error);
      res.status(500).json({ error: "Failed to update host approval" });
    }
  });
}
