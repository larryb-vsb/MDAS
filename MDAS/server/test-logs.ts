import { storage } from "./storage";
import { db, pool } from "./db";
import { securityLogs } from "@shared/schema";
import { getTableName } from "./table-config";

/**
 * Generate test log entries to demonstrate the logging system
 * @param logType - Type of logs to generate (audit, system, security)
 */
export async function generateTestLogs(logType: string = "all") {
  try {
    if (logType === "all" || logType === "audit") {
      // Create test audit logs
      for (let i = 0; i < 5; i++) {
        await storage.createAuditLog({
          username: "admin",
          entityType: "merchant",
          entityId: `MERCH${i}`,
          action: i % 2 === 0 ? "create" : "update",
          notes: `Test audit log ${i}`,
          userId: 1,
          oldValues: { status: "pending" },
          newValues: { status: "active" },
          changedFields: ["status"],
          ipAddress: "127.0.0.1",
          userAgent: "Test Agent"
        });
      }
      console.log("Generated 5 audit logs");
    }

    if (logType === "all" || logType === "system") {
      // Create test system logs
      for (let i = 0; i < 5; i++) {
        await storage.logSystemError(
          `Test system error ${i}`,
          { details: `Error details ${i}` },
          `TestComponent${i}`,
          "admin"
        );
      }
      console.log("Generated 5 system logs");
    }

    if (logType === "all" || logType === "security") {
      // Create test security logs directly using raw SQL to match actual table structure
      const eventTypes = ["login", "logout", "access_denied", "permission_change", "data_access"];
      const severities = ["info", "warning", "error", "critical"];
      const results = ["success", "failure"];
      
      for (let i = 0; i < 5; i++) {
        const eventType = eventTypes[i % eventTypes.length];
        const severity = severities[i % severities.length];
        const result = results[i % results.length];
        const message = `Test security event: ${eventType} ${result}`;
        
        // Use direct SQL with pool to match actual table structure
        const tableName = getTableName("security_logs");
        await pool.query(`
          INSERT INTO ${tableName} (
            event_type, severity, message, timestamp, user_id, username, 
            ip_address, user_agent, details
          ) VALUES (
            $1, $2, $3, NOW(), $4, $5, $6, $7, $8
          )
        `, [
          eventType,
          severity,
          message,
          1, // user_id for admin
          "admin",
          "127.0.0.1", 
          "Test Agent",
          JSON.stringify({
            testEvent: true,
            eventIndex: i,
            description: `Test security log ${i}`
          })
        ]);
      }
      console.log("Generated 5 security logs");
    }

    console.log(`Successfully generated test logs for ${logType} logs`);
    return { success: true, message: `Generated test logs for ${logType} logs successfully` };
  } catch (error) {
    console.error("Error generating test logs:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}