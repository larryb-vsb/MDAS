import { Router } from "express";
import { storage } from "../storage";
import { db, pool } from "../db";
import { securityLogs, systemLogs } from "@shared/schema";
import { desc } from "drizzle-orm";
import { generateTestLogs } from "../test-logs";
import { getTableName } from "../table-config";
import { SystemLogger } from "../system-logger";

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
    const sortBy = (req.query.sortBy as string) || "timestamp";
    const sortOrder = (req.query.sortOrder as string) || "desc";
    
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
    
    let responseData: any = {
      logs: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: limit
      }
    };
    
    // Get logs based on type
    switch (logType) {
      case "all":
        try {
          // Get environment-specific table names
          const systemLogsTableName = getTableName('system_logs');
          const securityLogsTableName = getTableName('security_logs');
          
          // Calculate pagination offset
          const pageNum = params.page || 1;
          const limitNum = params.limit || 10;
          const offset = (pageNum - 1) * limitNum;
          
          // Get all logs from all tables with UNION (using correct column names)
          const queryResult = await pool.query(`
            SELECT 'system' as log_type, id, timestamp, level as log_action, source, message as notes, details::text as details_json, 'System' as username, 'system' as entity_type, CONCAT('SYS-', id) as entity_id, ip_address
            FROM ${systemLogsTableName}
            UNION ALL
            SELECT 'security' as log_type, id, timestamp, CONCAT(event_type, ':', severity) as log_action, 'Security' as source, message as notes, details::text as details_json, username, 'security' as entity_type, CONCAT('SEC-', id) as entity_id, ip_address
            FROM ${securityLogsTableName}
            UNION ALL
            SELECT 'audit' as log_type, id, timestamp, action as log_action, entity_type as source, notes, '{}' as details_json, username, entity_type, entity_id, ip_address
            FROM ${getTableName('audit_logs')}
            ORDER BY ${sortBy === 'username' ? 'username' : 'timestamp'} ${sortOrder.toUpperCase()}
            LIMIT $1 OFFSET $2
          `, [limitNum, offset]);
          
          // Get total count from all tables
          const countResult = await pool.query(`
            SELECT 
              (SELECT COUNT(*) FROM ${systemLogsTableName}) + 
              (SELECT COUNT(*) FROM ${securityLogsTableName}) + 
              (SELECT COUNT(*) FROM ${getTableName('audit_logs')}) as total_count
          `);
          
          const totalCount = parseInt(countResult.rows[0].total_count);
          
          // Format the combined logs
          const formattedLogs = queryResult.rows.map((log: any) => ({
            id: `${log.log_type}-${log.id}`,
            timestamp: log.timestamp,
            action: log.log_action,
            source: log.source,
            notes: log.notes || '',
            username: log.username || 'System',
            entityType: log.entity_type,
            entityId: log.entity_id,
            logType: log.log_type,
            ipAddress: log.ip_address
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
          
          console.log(`All logs formatted: ${formattedLogs.length} logs from all sources`);
        } catch (error) {
          console.error("Error fetching all logs:", error);
        }
        break;
      case "system":
        try {
          // Get environment-specific table name
          const systemLogsTableName = getTableName('system_logs');
          
          // Get the total count for pagination (exclude Application events)
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${systemLogsTableName} WHERE source != 'Application' OR source IS NULL`);
          const totalCount = parseInt(countResult.rows[0].count);
          
          // Calculate pagination offset
          const pageNum = params.page || 1;
          const limitNum = params.limit || 10;
          const offset = (pageNum - 1) * limitNum;
          
          // Use direct pool query which is more reliable, with pagination (exclude Application events for System tab)
          const orderColumn = sortBy === 'username' ? 'source' : sortBy === 'action' ? 'level' : 'timestamp';
          const queryResult = await pool.query(
            `SELECT * FROM ${systemLogsTableName} WHERE source != 'Application' OR source IS NULL ORDER BY ${orderColumn} ${sortOrder.toUpperCase()} LIMIT $1 OFFSET $2`,
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
        }
        break;
      case "application":
        try {
          // Get application events from system logs table where source = 'Application'
          const systemLogsTableName = getTableName('system_logs');
          
          // Calculate pagination offset
          const pageNum = params.page || 1;
          const limitNum = params.limit || 10;
          const offset = (pageNum - 1) * limitNum;
          
          // Use direct pool query to get application events only
          const orderColumn = sortBy === 'username' ? 'source' : sortBy === 'action' ? 'level' : 'timestamp';
          const queryResult = await pool.query(
            `SELECT * FROM ${systemLogsTableName} WHERE source = 'Application' ORDER BY ${orderColumn} ${sortOrder.toUpperCase()} LIMIT $1 OFFSET $2`,
            [limitNum, offset]
          );
          
          // Get total count for pagination
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${systemLogsTableName} WHERE source = 'Application'`);
          
          const totalCount = parseInt(countResult.rows[0].count);
          
          console.log(`Retrieved ${queryResult.rowCount} application logs directly`);
          
          // Format the logs for client-side display
          const formattedLogs = queryResult.rows.map((log: any) => ({
            id: log.id,
            timestamp: log.timestamp,
            level: log.level || 'info',
            source: log.source || 'Application',
            message: log.message || '',
            details: log.details || {},
            username: "System",
            entityType: "application",
            entityId: `APP-${log.id}`,
            action: log.level || 'info'
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
          
          console.log(`Application logs formatted: ${formattedLogs.length} logs`);
        } catch (error) {
          console.error("Error fetching application logs:", error);
        }
        break;
      case "security":
        try {
          // Get environment-specific table name and use direct query like system logs
          const securityLogsTableName = getTableName('security_logs');
          
          // Calculate pagination offset
          const pageNum = params.page || 1;
          const limitNum = params.limit || 10;
          const offset = (pageNum - 1) * limitNum;
          
          // Use direct pool query for consistency with system logs
          const orderColumn = sortBy === 'username' ? 'username' : sortBy === 'action' ? 'event_type' : 'timestamp';
          const queryResult = await pool.query(
            `SELECT * FROM ${securityLogsTableName} ORDER BY ${orderColumn} ${sortOrder.toUpperCase()} LIMIT $1 OFFSET $2`,
            [limitNum, offset]
          );
          
          // Get total count for pagination
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${securityLogsTableName}`);
          
          const totalCount = parseInt(countResult.rows[0].count);
            
          console.log(`Retrieved ${queryResult.rowCount} security logs directly`);
          
          // Format the logs for client-side display
          const formattedLogs = queryResult.rows.map((log: any) => ({
            id: log.id,
            timestamp: log.timestamp,
            eventType: log.event_type,
            username: log.username,
            ipAddress: log.ip_address,
            userAgent: log.user_agent,
            action: log.action,
            result: log.result,
            notes: log.notes,
            // Add additional fields needed for UI consistency
            entityType: "security",
            entityId: `SEC-${log.id}`
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
          
          console.log(`Security logs formatted: ${formattedLogs.length} logs`);
        } catch (error) {
          console.error("Error fetching security logs:", error);
        }
        break;
      case "audit":
      default:
        try {
          // Add sorting parameters to audit logs params
          const auditParams = {
            ...params,
            sortBy,
            sortOrder
          };
          const auditLogsResult = await storage.getAuditLogs(auditParams);
          if (auditLogsResult && typeof auditLogsResult === 'object') {
            responseData = auditLogsResult;
          }
        } catch (error) {
          console.error("Error fetching audit logs:", error);
        }
        break;
    }
    
    // Return the logs data
    return res.json(responseData);
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
    
    let logsData: any[] = [];
    let filename = "logs.csv";
    
    // Get logs based on type
    switch (logType) {
      case "system":
        // Use direct database query for system logs
        try {
          const result = await pool.query('SELECT * FROM system_logs ORDER BY timestamp DESC');
          logsData = result.rows.map((log: any) => ({
            id: log.id,
            timestamp: log.timestamp,
            level: log.level,
            source: log.source,
            message: log.message
          }));
        } catch (err) {
          console.error("Error exporting system logs:", err);
        }
        filename = "system_logs.csv";
        break;
      case "security":
        // Use direct database query for security logs
        try {
          const securityLogsData = await db
            .select()
            .from(securityLogs)
            .orderBy(desc(securityLogs.timestamp));
          
          logsData = securityLogsData;
        } catch (err) {
          console.error("Error exporting security logs:", err);
        }
        filename = "security_logs.csv";
        break;
      case "audit":
      default:
        try {
          const auditLogsResult = await storage.getAuditLogs(params);
          if (auditLogsResult && auditLogsResult.logs) {
            logsData = auditLogsResult.logs;
          } else if (Array.isArray(auditLogsResult)) {
            logsData = auditLogsResult;
          }
        } catch (err) {
          console.error("Error exporting audit logs:", err);
        }
        filename = "audit_logs.csv";
        break;
    }
    
    // Format logs to CSV
    let csv = "";
    
    if (logsData && logsData.length > 0) {
      // Get headers from first log
      const headers = Object.keys(logsData[0]);
      csv = headers.join(',') + '\n';
      
      // Add data rows
      logsData.forEach((log: any) => {
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

// Test endpoint for generating application events specifically
router.post("/api/logs/test-application", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const systemLogger = SystemLogger.getInstance();
    
    // Generate some test application events
    await systemLogger.info('Application', 'Test application startup event', {
      version: '1.0.0',
      environment: 'development',
      testEvent: true
    });
    
    await systemLogger.info('Application', 'Test file processing initialization', {
      processorType: 'CSV',
      maxConcurrency: 5,
      testEvent: true
    });
    
    await systemLogger.info('Application', 'Test database migration completed', {
      migrationsRun: 3,
      tablesUpdated: ['merchants', 'transactions', 'terminals'],
      testEvent: true
    });
    
    await systemLogger.warn('Application', 'Test application warning', {
      warningType: 'performance',
      message: 'High memory usage detected',
      testEvent: true
    });

    res.json({ success: true, message: "Generated test application events" });
  } catch (error) {
    console.error("Error generating application test events:", error);
    res.json({ success: false, error: error.message });
  }
});

export default router;