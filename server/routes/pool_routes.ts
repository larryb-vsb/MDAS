import { Router } from "express";
import { getPoolStats, checkPoolHealth } from "../db";

const router = Router();

// Get connection pool statistics
router.get("/stats", async (req, res) => {
  try {
    const stats = await getPoolStats();
    res.json({
      success: true,
      pools: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting pool stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve pool statistics"
    });
  }
});

// Get connection pool health status
router.get("/health", async (req, res) => {
  try {
    const health = await checkPoolHealth();
    res.json({
      success: true,
      ...health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking pool health:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check pool health",
      healthy: false,
      issues: ["Health check failed"]
    });
  }
});

// Get combined pool information
router.get("/info", async (req, res) => {
  try {
    const [stats, health] = await Promise.all([
      getPoolStats(),
      checkPoolHealth()
    ]);
    
    res.json({
      success: true,
      pools: stats,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error getting pool info:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve pool information"
    });
  }
});

export default router;