import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../routes";
import { z } from "zod";

// Schema for log query parameters
const logQuerySchema = z.object({
  page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 20)),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  username: z.string().optional(),
  level: z.string().optional(),
  eventType: z.string().optional(),
  source: z.string().optional(),
  result: z.string().optional()
});

type LogQueryParams = z.infer<typeof logQuerySchema>;

export function registerLogRoutes(app: Express) {
  // Get audit logs with pagination and filtering
  app.get("/api/logs/audit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const queryParams = logQuerySchema.parse(req.query);
      const logs = await storage.getAuditLogs(queryParams);
      const totalCount = await storage.getAuditLogsCount(queryParams);
      
      res.json({
        logs,
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          totalCount,
          totalPages: Math.ceil(totalCount / queryParams.limit)
        }
      });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Get system logs with pagination and filtering
  app.get("/api/logs/system", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const queryParams = logQuerySchema.parse(req.query);
      const logs = await storage.getSystemLogs(queryParams);
      const totalCount = await storage.getSystemLogsCount(queryParams);
      
      res.json({
        logs,
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          totalCount,
          totalPages: Math.ceil(totalCount / queryParams.limit)
        }
      });
    } catch (error) {
      console.error("Error fetching system logs:", error);
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  // Get security logs with pagination and filtering
  app.get("/api/logs/security", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const queryParams = logQuerySchema.parse(req.query);
      const logs = await storage.getSecurityLogs(queryParams);
      const totalCount = await storage.getSecurityLogsCount(queryParams);
      
      res.json({
        logs,
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          totalCount,
          totalPages: Math.ceil(totalCount / queryParams.limit)
        }
      });
    } catch (error) {
      console.error("Error fetching security logs:", error);
      res.status(500).json({ error: "Failed to fetch security logs" });
    }
  });

  // Get log statistics - counts by type and recent activity
  app.get("/api/logs/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const auditCount = await storage.getAuditLogsCount({});
      const systemCount = await storage.getSystemLogsCount({});
      const securityCount = await storage.getSecurityLogsCount({});
      
      // Get counts for last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString();
      
      const recentAuditCount = await storage.getAuditLogsCount({ startDate: yesterdayStr });
      const recentSystemCount = await storage.getSystemLogsCount({ startDate: yesterdayStr });
      const recentSecurityCount = await storage.getSecurityLogsCount({ startDate: yesterdayStr });
      
      res.json({
        totalCounts: {
          audit: auditCount,
          system: systemCount,
          security: securityCount,
          total: auditCount + systemCount + securityCount
        },
        recentCounts: {
          audit: recentAuditCount,
          system: recentSystemCount,
          security: recentSecurityCount,
          total: recentAuditCount + recentSystemCount + recentSecurityCount
        }
      });
    } catch (error) {
      console.error("Error fetching log statistics:", error);
      res.status(500).json({ error: "Failed to fetch log statistics" });
    }
  });

  // Export logs as CSV
  app.get("/api/logs/export/:type", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const queryParams = logQuerySchema.parse(req.query);
      
      // Remove pagination for exports
      delete queryParams.page;
      delete queryParams.limit;
      
      let logs: any[] = [];
      
      if (type === "audit") {
        logs = await storage.getAuditLogs(queryParams);
      } else if (type === "system") {
        logs = await storage.getSystemLogs(queryParams);
      } else if (type === "security") {
        logs = await storage.getSecurityLogs(queryParams);
      } else {
        return res.status(400).json({ error: "Invalid log type" });
      }
      
      // Format data as CSV
      const filename = `${type}_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      
      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      
      // Convert JSON objects to CSV
      if (logs.length === 0) {
        return res.send("No data available");
      }
      
      // Format the logs as CSV
      const csvData = storage.formatLogsToCSV(logs);
      
      res.send(csvData);
    } catch (error) {
      console.error(`Error exporting ${req.params.type} logs:`, error);
      res.status(500).json({ error: `Failed to export ${req.params.type} logs` });
    }
  });
}