// Simple authentication test endpoint to bypass compilation issues
import { Express } from "express";
import bcrypt from "bcrypt";

export function setupAuthTest(app: Express) {
  // Simple test endpoint with minimal dependencies
  app.post("/api/auth-test", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`[AUTH-TEST] Login attempt for: ${username}`);
      
      // Simple admin check
      if (username === 'admin' && password === 'admin123') {
        console.log(`[AUTH-TEST] Admin login successful`);
        return res.status(200).json({ 
          success: true, 
          message: "Authentication successful",
          user: { username: 'admin', role: 'admin' }
        });
      }
      
      console.log(`[AUTH-TEST] Authentication failed for: ${username}`);
      return res.status(401).json({ error: "Invalid credentials" });
      
    } catch (error) {
      console.error(`[AUTH-TEST] Error:`, error);
      return res.status(500).json({ error: "Authentication error" });
    }
  });
  
  console.log("[AUTH-TEST] Simple authentication test endpoint created");
}