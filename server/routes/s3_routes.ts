import { Request, Response, Express } from "express";
import fs from "fs";
import path from "path";
import { isAuthenticated } from "./auth_middleware";
import { s3Service } from "../backup/s3_service";

const S3_CONFIG_FILE = path.join(__dirname, "..", "config", "s3_config.json");
const DEFAULT_CONFIG = {
  enabled: false,
  region: "us-east-1",
  accessKeyId: "",
  secretAccessKey: "",
  bucket: "",
  useEnvCredentials: false
};

/**
 * Load S3 configuration from file or environment
 */
function loadS3Config() {
  try {
    if (fs.existsSync(S3_CONFIG_FILE)) {
      const configData = fs.readFileSync(S3_CONFIG_FILE, "utf8");
      const config = JSON.parse(configData);
      
      // If using environment variables, replace with actual values
      if (config.useEnvCredentials) {
        if (process.env.AWS_ACCESS_KEY_ID) {
          config.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        }
        if (process.env.AWS_SECRET_ACCESS_KEY) {
          config.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        }
        if (process.env.AWS_REGION) {
          config.region = process.env.AWS_REGION;
        }
        if (process.env.S3_BUCKET) {
          config.bucket = process.env.S3_BUCKET;
        }
      }
      
      return config;
    }
  } catch (error) {
    console.error("Error loading S3 config:", error);
  }
  
  // Return default config if no file exists or error occurs
  return DEFAULT_CONFIG;
}

/**
 * Save S3 configuration to file
 */
function saveS3Config(config: any) {
  try {
    // Create the directory if it doesn't exist
    const dir = path.dirname(S3_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Don't store actual credentials in the file if using env vars
    const configToSave = { ...config };
    if (configToSave.useEnvCredentials) {
      // Don't save actual credentials to file if using environment vars
      configToSave.accessKeyId = "";
      configToSave.secretAccessKey = "";
    }
    
    fs.writeFileSync(S3_CONFIG_FILE, JSON.stringify(configToSave, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving S3 config:", error);
    return false;
  }
}

/**
 * Initialize S3 service with configuration
 */
export async function initializeS3Service() {
  const config = loadS3Config();
  await s3Service.initialize(config);
  return config;
}

/**
 * Register S3 configuration routes
 */
export function registerS3Routes(app: Express) {
  // Get S3 configuration
  app.get("/api/settings/s3config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = loadS3Config();
      
      // Remove sensitive information for the frontend
      const safeConfig = {
        ...config,
        secretAccessKey: config.secretAccessKey ? "**********" : ""
      };
      
      res.json(safeConfig);
    } catch (error: any) {
      console.error("Error getting S3 config:", error);
      res.status(500).json({ error: error.message || "Failed to get S3 configuration" });
    }
  });

  // Update S3 configuration
  app.post("/api/settings/s3config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = req.body;
      
      // Validate required fields if enabled and not using env credentials
      if (config.enabled && !config.useEnvCredentials) {
        if (!config.accessKeyId || !config.secretAccessKey || !config.bucket) {
          return res.status(400).json({ 
            error: "Access key, secret key, and bucket are required when S3 is enabled" 
          });
        }
      }
      
      // Don't update secret if it's masked (meaning it wasn't changed)
      const currentConfig = loadS3Config();
      if (config.secretAccessKey === "**********") {
        config.secretAccessKey = currentConfig.secretAccessKey;
      }
      
      // Save the configuration
      const saved = saveS3Config(config);
      if (!saved) {
        return res.status(500).json({ error: "Failed to save S3 configuration" });
      }
      
      // Initialize S3 service with new configuration
      await s3Service.initialize(config);
      
      res.json({ success: true, message: "S3 configuration updated successfully" });
    } catch (error: any) {
      console.error("Error updating S3 config:", error);
      res.status(500).json({ error: error.message || "Failed to update S3 configuration" });
    }
  });

  // Test S3 connection
  app.post("/api/settings/s3config/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const testConfig = req.body;
      
      // Create a temporary S3Service instance for testing
      const tempS3Service = new s3Service.constructor();
      await tempS3Service.initialize(testConfig);
      
      // Test the connection
      const result = await tempS3Service.testConnection();
      
      res.json(result);
    } catch (error: any) {
      console.error("Error testing S3 connection:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to test S3 connection" 
      });
    }
  });
}