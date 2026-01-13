import { Router } from "express";
import { pool } from "../db";
import { systemLogs, securityLogs } from "@shared/schema";
import { db } from "../db";

const router = Router();

// Special test endpoint to generate and verify system logs
router.post("/api/logs/test/system", async (req, res) => {
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
      const createdLogs = [];
      
      for (let i = 0; i < 5; i++) {
        const level = levels[i];
        const source = sources[i];
        const message = `Test ${level} message from ${source}`;
        const details = JSON.stringify({ test: `detail ${i}`, timestamp: new Date().toISOString() });
        
        // Insert using direct SQL for reliability
        const insertResult = await client.query(
          'INSERT INTO system_logs (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [level, source, message, details, new Date()]
        );
        
        createdLogs.push(insertResult.rows[0]);
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
        totalLogs: systemLogsData.rowCount,
        sampleLogs: systemLogsData.rows.slice(0, 3) // First 3 logs for sample
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error testing system logs:", error);
    return res.status(500).json({ 
      error: "Failed to test system logs", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Special test endpoint to verify all log types at once
router.post("/api/logs/test/all", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Get counts of all log types to verify functionality
    const auditCount = await db.execute({
      text: 'SELECT COUNT(*) as count FROM audit_logs',
      values: []
    });
    
    const systemCount = await pool.query('SELECT COUNT(*) as count FROM system_logs');
    
    const securityCount = await pool.query('SELECT COUNT(*) as count FROM security_logs');

    // Create one sample of each log type for testing
    
    // 1. Create sample audit log
    const auditLog = await db.insert(securityLogs).values({
      username: "test-user",
      action: "test",
      notes: "Test log verification",
      userId: 1,
      ipAddress: "127.0.0.1",
      userAgent: "Test Agent",
      timestamp: new Date(),
      eventType: "test", 
      result: "success"
    }).returning();

    // 2. Create sample system log
    const systemLog = await pool.query(
      'INSERT INTO system_logs (level, source, message, details, timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      ['info', 'LogTester', 'Test verification log', JSON.stringify({ test: true }), new Date()]
    );

    // 3. Create sample security log
    const securityLog = await db.insert(securityLogs).values({
      username: "test-user",
      action: "verify",
      notes: "Test log verification",
      userId: 1,
      ipAddress: "127.0.0.1",
      userAgent: "Test Agent",
      timestamp: new Date(),
      eventType: "test", 
      result: "success"
    }).returning();

    return res.json({
      success: true,
      message: 'Log system verification complete',
      counts: {
        audit: parseInt(auditCount[0]?.count) || 0,
        system: parseInt(systemCount.rows[0]?.count) || 0,
        security: parseInt(securityCount.rows[0]?.count) || 0
      },
      samplesCreated: {
        audit: auditLog[0] || null,
        system: systemLog.rows[0] || null,
        security: securityLog[0] || null
      }
    });
  } catch (error) {
    console.error("Error testing logs:", error);
    return res.status(500).json({ 
      error: "Failed to verify logs", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

export default router;