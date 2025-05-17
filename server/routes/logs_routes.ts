import { Router } from "express";
import { storage } from "../storage";
import { generateTestLogs } from "../test-logs";

const router = Router();

// Endpoint to get logs with pagination and filtering
router.get("/api/logs", async (req, res) => {
  try {
    // Check if user is authenticated and is an admin
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Get query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const logType = (req.query.logType as string) || "audit";
    
    // Optional filtering params
    const entityType = req.query.entityType as string;
    const entityId = req.query.entityId as string;
    const action = req.query.action as string;
    const username = req.query.username as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    // Build filter params object
    const params: any = {
      page,
      limit,
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(action && { action }),
      ...(username && { username }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate })
    };
    
    let result;
    
    // Get logs based on type
    switch (logType) {
      case "system":
        result = await storage.getSystemLogs(params);
        // Log the result for debugging
        console.log("System logs result:", JSON.stringify(result).substring(0, 200) + "...");
        break;
      case "security":
        result = await storage.getSecurityLogs(params);
        // Log the result for debugging
        console.log("Security logs result:", JSON.stringify(result).substring(0, 200) + "...");
        break;
      case "audit":
      default:
        result = await storage.getAuditLogs(params);
        break;
    }
    
    // Make sure we always return logs in a consistent format
    if (Array.isArray(result)) {
      // If result is directly an array, format it properly
      return res.json({
        logs: result,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(result.length / limit),
          totalItems: result.length,
          itemsPerPage: limit
        }
      });
    } else if (result && result.logs) {
      // Already in the correct format
      return res.json(result);
    } else if (result) {
      // Transform to a consistent format
      return res.json({
        logs: result,
        pagination: {
          currentPage: page,
          totalPages: 1,
          totalItems: Array.isArray(result) ? result.length : 1,
          itemsPerPage: limit
        }
      });
    }
    
    // Fallback for empty result
    return res.json({
      logs: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error("Error getting logs:", error);
    return res.status(500).json({ error: "Failed to retrieve logs" });
  }
});

// Export logs to CSV
router.get("/api/logs/export", async (req, res) => {
  try {
    // Check if user is authenticated and is an admin
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Get query parameters
    const logType = (req.query.logType as string) || "audit";
    
    // Optional filtering params
    const entityType = req.query.entityType as string;
    const entityId = req.query.entityId as string;
    const action = req.query.action as string;
    const username = req.query.username as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    // Build filter params object without pagination
    const params: any = {
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(action && { action }),
      ...(username && { username }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate })
    };
    
    let logs;
    let filename;
    
    // Get logs based on type
    switch (logType) {
      case "system":
        logs = await storage.getSystemLogs(params);
        filename = "system_logs.csv";
        break;
      case "security":
        logs = await storage.getSecurityLogs(params);
        filename = "security_logs.csv";
        break;
      case "audit":
      default:
        logs = await storage.getAuditLogs(params);
        filename = "audit_logs.csv";
        break;
    }
    
    // Generate CSV from logs
    const csv = storage.formatLogsToCSV(logs.logs);
    
    // Set response headers for CSV download
    res.header('Content-Type', 'text/csv');
    res.attachment(filename);
    
    // Send CSV data
    return res.send(csv);
  } catch (error) {
    console.error("Error exporting logs:", error);
    return res.status(500).json({ error: "Failed to export logs" });
  }
});

// Generate test logs for demonstration purposes
router.post("/api/logs/generate", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { logType = "audit" } = req.body;
    
    // Generate test logs
    const result = await generateTestLogs(logType);
    
    return res.json(result);
  } catch (error) {
    console.error("Error generating test logs:", error);
    return res.status(500).json({ error: "Failed to generate test logs" });
  }
});

export default router;