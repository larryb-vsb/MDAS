import { Express, Request, Response } from "express";
import { loadS3Config, saveS3Config, testS3Connection, S3Config } from "../backup/s3_config";
import { isAuthenticated } from "./auth_middleware";

/**
 * Register S3 configuration routes
 */
export function registerS3Routes(app: Express) {
  // Get S3 configuration
  app.get("/api/settings/s3config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = loadS3Config();
      
      // Don't send the secret access key back to the client for security
      const sanitizedConfig = {
        ...config,
        secretAccessKey: config.secretAccessKey ? "***********" : undefined
      };
      
      res.json(sanitizedConfig);
    } catch (error) {
      console.error("Error getting S3 configuration:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to get S3 configuration"
      });
    }
  });
  
  // Update S3 configuration
  app.post("/api/settings/s3config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const updatedConfig = req.body as S3Config;
      const currentConfig = loadS3Config();
      
      // If secret is masked (unchanged), keep the original value
      if (updatedConfig.secretAccessKey === "***********") {
        updatedConfig.secretAccessKey = currentConfig.secretAccessKey;
      }
      
      // Save the updated configuration
      saveS3Config(updatedConfig);
      
      // Return success
      res.json({ 
        success: true, 
        message: "S3 configuration updated successfully" 
      });
    } catch (error) {
      console.error("Error updating S3 configuration:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update S3 configuration"
      });
    }
  });
  
  // Test S3 connection
  app.post("/api/settings/s3config/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = req.body as S3Config;
      const currentConfig = loadS3Config();
      
      // If secret is masked (unchanged), use the original value for testing
      if (config.secretAccessKey === "***********") {
        config.secretAccessKey = currentConfig.secretAccessKey;
      }
      
      // Test the S3 connection
      const isConnected = await testS3Connection(config);
      
      if (isConnected) {
        res.json({ 
          success: true, 
          message: "Successfully connected to S3 storage" 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: "Failed to connect to S3 storage with the provided settings" 
        });
      }
    } catch (error) {
      console.error("Error testing S3 connection:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to test S3 connection"
      });
    }
  });
}