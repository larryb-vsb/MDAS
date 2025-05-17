import { storage } from "./storage";

/**
 * Generate test log entries to demonstrate the logging system
 */
export async function generateTestLogs() {
  try {
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

    // Create test system logs
    for (let i = 0; i < 5; i++) {
      await storage.logSystemError(
        `Test system error ${i}`,
        { details: `Error details ${i}` },
        `TestComponent${i}`,
        "admin"
      );
    }

    // Create test security logs
    for (let i = 0; i < 5; i++) {
      await storage.createSecurityLog({
        username: "admin",
        action: i % 2 === 0 ? "login" : "logout",
        notes: `Test security log ${i}`,
        userId: 1,
        ipAddress: "127.0.0.1",
        userAgent: "Test Agent"
      });
    }

    console.log("Successfully generated test logs");
    return { success: true, message: "Generated test logs successfully" };
  } catch (error) {
    console.error("Error generating test logs:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}