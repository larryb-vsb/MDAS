import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const S3_CONFIG_FILE = path.join(__dirname, "..", "config", "s3_config.json");

// Default S3 configuration
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
export function loadS3Config() {
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
export function saveS3Config(config: any) {
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