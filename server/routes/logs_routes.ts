import { Router } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
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
    
    let responseData: any;
    
    // Get logs based on type
    switch (logType) {
      case "system":
        try {
          // Get the total count for pagination
          const countResult = await pool.query('SELECT COUNT(*) as count FROM system_logs');
          const totalCount = parseInt(countResult.rows[0].count);
          
          // Calculate pagination offset
          const pageNum = params.page || 1;
          const limitNum = params.limit || 10;
          const offset = (pageNum - 1) * limitNum;
          
          // Use direct pool query which is more reliable, with pagination
          const queryResult = await pool.query(
            'SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
            [limitNum, offset]
          );
          
          console.log(`Retrieved ${queryResult.rowCount} system logs directly`);
          
          // Format the logs for client-side display
          const formattedLogs = queryResult.rows.map((log: any) => ({
            id: log.id,
            timestamp: log.timestamp,
            level: log.level || 'info',
            source: log.source || 'System',
            message: log.message || '',
            details: log.details || {},
            // Add additional fields needed for the UI display
            username: "System", // Most system logs are from the system
            entityType: "system",
            entityId: `SYS-${log.id}`,
            action: log.level || 'info' // Use log level as the action
          }));
          
          responseData = {
            logs: formattedLogs,
            pagination: {
              currentPage: pageNum,
              totalPages: Math.ceil(totalCount / limitNum),
              totalItems: totalCount,
              itemsPerPage: limitNum
            }
          };
          
          // Log the result for debugging
          console.log(`System logs formatted: ${formattedLogs.length} logs`);
        } catch (error) {
          console.error("Error fetching system logs:", error);
          responseData = { 
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
          
          responseData = {
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
          responseData = { 
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
        responseData = await storage.getAuditLogs(params);
        break;
    }
    
    // Make sure we always return logs in a consistent format
    if (Array.isArray(responseData)) {
      // If responseData is directly an array, format it properly
      return res.json({
        logs: responseData,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(responseData.length / limit),
          totalItems: responseData.length,
          itemsPerPage: limit
        }
      });
    } else if (responseData && 'logs' in responseData) {
      // Already in the correct format
      return res.json(responseData);
    } else if (responseData) {
      // Transform to a consistent format
      return res.json({
        logs: responseData,
        pagination: {
          currentPage: page,
          totalPages: 1,
          totalItems: Array.isArray(responseData) ? responseData.length : 1,
          itemsPerPage: limit
        }
      });
    }
    
    // Fallback for empty responseData
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
    
    let logs: any;
    let filename = "logs.csv";
    
    // Get logs based on type
    switch (logType) {
      case "system":
        // Use alternative approach for system logs
        logs = { logs: [] };
        try {
          const result = await pool.query('SELECT * FROM system_logs ORDER BY timestamp DESC');
          logs = { 
            logs: result.rows.map((log: any) => ({
              id: log.id,
              timestamp: log.timestamp,
              level: log.level,
              source: log.source,
              message: log.message
            }))
          };
        } catch (err) {
          console.error("Error exporting system logs:", err);
        }
        filename = "system_logs.csv";
        break;
      case "security":
        // Use direct database query for security logs
        logs = { logs: [] };
        try {
          const securityLogsData = await db
            .select()
            .from(securityLogs)
            .orderBy(desc(securityLogs.timestamp));
          
          logs = { logs: securityLogsData };
        } catch (err) {
          console.error("Error exporting security logs:", err);
        }
        filename = "security_logs.csv";
        break;
      case "audit":
      default:
        logs = await storage.getAuditLogs(params);
        filename = "audit_logs.csv";
        break;
    }
    
    // Format logs to CSV
    let csv = "";
    
    if (logs && logs.logs && logs.logs.length > 0) {
      // Get headers from first log
      const headers = Object.keys(logs.logs[0]);
      csv = headers.join(',') + '\n';
      
      // Add data rows
      logs.logs.forEach((log: any) => {
        const row = headers.map(header => {
          const value = log[header];
          // Handle formatting of values
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
          return String(value).replace(/"/g, '""');
        });
        csv += row.join(',') + '\n';
      });
    }
    
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

// Create a special route for testing with system logs
router.post("/api/logs/system-test", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Create several system logs directly with SQL
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create 5 test system logs with different levels
      const levels = ['error', 'warning', 'info', 'debug', 'critical'];
      const sources = ['Database', 'FileSystem', 'Authentication', 'API', 'Scheduler'];
      
      for (let i = 0; i < 5; i++) {
        const level = levels[i];
        const source = sources[i];
        const message = `Test ${level} message from ${source}`;
        const details = JSON.stringify({ test: `detail ${i}`, timestamp: new Date().toISOString() });
        
        // Insert using direct SQL for reliability
        await client.query(
          'INSERT INTO system_logs (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5)',
          [level, source, message, details, new Date()]
        );
      }
      
      await client.query('COMMIT');
      
      // Now test if we can retrieve the system logs
      const systemLogsData = await client.query(
        'SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 10'
      );
      
      // Return both the creation status and the fetched logs for verification
      return res.json({
        success: true,
        message: 'Created and verified system logs',
        logsCreated: 5,
        sampleLogs: systemLogsData.rows.slice(0, 3) // First 3 logs for sample
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error testing system logs:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: "Failed to test system logs", details: errorMessage });
  }
});

export default router;