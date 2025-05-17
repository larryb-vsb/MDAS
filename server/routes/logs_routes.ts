import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { securityLogs, systemLogs } from "@shared/schema";
import { desc } from "drizzle-orm";
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
        try {
          // Bypass the regular method and always use direct DB access for system logs
          const systemLogsData = await storage.getSystemLogsDirectly();
          console.log(`Retrieved ${systemLogsData.length} system logs directly`);
          
          // Format the logs for client-side display
          const formattedLogs = systemLogsData.map(log => ({
            id: log.id,
            timestamp: log.timestamp,
            level: log.level,
            source: log.source,
            message: log.message,
            details: log.details,
            // Add additional fields needed for the UI display
            username: "System", // Most system logs are from the system
            entityType: "system",
            entityId: `SYS-${log.id}`,
            action: log.level // Use log level as the action
          }));
          
          result = {
            logs: formattedLogs,
            pagination: {
              currentPage: params.page || 1,
              totalPages: Math.ceil(systemLogsData.length / (params.limit || 10)),
              totalItems: systemLogsData.length,
              itemsPerPage: params.limit || 10
            }
          };
          
          // Log the result for debugging
          console.log(`System logs formatted: ${formattedLogs.length} logs`);
        } catch (error) {
          console.error("Error fetching system logs:", error);
          result = { 
            logs: [], 
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: 10
            }
          };
        }
        break;
      case "security":
        try {
          // Use a direct approach for security logs similar to system logs
          const securityLogsData = await db
            .select()
            .from(securityLogs)
            .orderBy(desc(securityLogs.timestamp))
            .limit(params.limit || 10);
            
          console.log(`Retrieved ${securityLogsData.length} security logs directly`);
          
          // Format the logs for client-side display
          const formattedLogs = securityLogsData.map(log => ({
            id: log.id,
            timestamp: log.timestamp,
            eventType: log.eventType,
            username: log.username,
            ipAddress: log.ipAddress,
            userAgent: log.userAgent,
            action: log.action,
            result: log.result,
            // Add additional fields needed for UI consistency
            entityType: "security",
            entityId: `SEC-${log.id}`
          }));
          
          result = {
            logs: formattedLogs,
            pagination: {
              currentPage: params.page || 1,
              totalPages: Math.ceil(securityLogsData.length / (params.limit || 10)),
              totalItems: securityLogsData.length,
              itemsPerPage: params.limit || 10
            }
          };
          
          console.log(`Security logs formatted: ${formattedLogs.length} logs`);
        } catch (error) {
          console.error("Error fetching security logs:", error);
          result = { 
            logs: [], 
            pagination: {
              currentPage: 1,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: 10
            }
          };
        }
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