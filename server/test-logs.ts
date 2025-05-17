import { storage } from "./storage";
import { db } from "./db";
import { securityLogs } from "@shared/schema";

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
      // Create test security logs directly using the database
      // Since the interface doesn't have createSecurityLog method
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        await db.insert(securityLogs).values({
          username: "admin",
          action: i % 2 === 0 ? "login" : "logout",
          notes: `Test security log ${i}`,
          userId: 1,
          ipAddress: "127.0.0.1",
          userAgent: "Test Agent",
          timestamp: now
        });
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