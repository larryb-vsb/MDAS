import { z } from "zod";
import fs from "fs";
import path from "path";

// Define a schema for S3 backup configuration
export const s3ConfigSchema = z.object({
  enabled: z.boolean().default(false),
  region: z.string().optional(),
  bucket: z.string().optional(),
  endpoint: z.string().optional(), // For custom S3-compatible services
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  useEnvCredentials: z.boolean().default(false), // Use AWS SDK credential chain
});

// Define types
export type S3Config = z.infer<typeof s3ConfigSchema>;

// Default configuration
const DEFAULT_CONFIG: S3Config = {
  enabled: false,
  region: "us-east-1",
  bucket: "",
  endpoint: undefined,
  accessKeyId: "",
  secretAccessKey: "",
  useEnvCredentials: false,
};

// Config file path
const CONFIG_DIR = path.join(process.cwd(), "server", "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "s3_config.json");

/**
 * Load S3 configuration
 */
export function loadS3Config(): S3Config {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // If config file doesn't exist, create it with default values
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
      return DEFAULT_CONFIG;
    }
    
    // Read and parse config
    const configFile = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(configFile);
    
    // Validate config
    const result = s3ConfigSchema.safeParse(config);
    if (result.success) {
      return result.data;
    } else {
      console.error("Invalid S3 configuration:", result.error);
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error("Error loading S3 configuration:", error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save S3 configuration
 */
export function saveS3Config(config: S3Config): void {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Validate config before saving
    const result = s3ConfigSchema.safeParse(config);
    if (result.success) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(result.data, null, 2));
    } else {
      throw new Error(`Invalid S3 configuration: ${result.error.message}`);
    }
  } catch (error) {
    console.error("Error saving S3 configuration:", error);
    throw error;
  }
}

/**
 * Test S3 connection with provided configuration
 */
export async function testS3Connection(config: S3Config): Promise<boolean> {
  // Import S3 client dynamically to avoid loading it if not used
  const { S3Client, ListBucketsCommand } = await import("@aws-sdk/client-s3");
  
  try {
    // Create S3 client with provided configuration
    const clientOptions: any = {
      region: config.region || 'us-east-1'
    };
    
    // Use custom endpoint if provided (for S3-compatible services)
    if (config.endpoint) {
      clientOptions.endpoint = config.endpoint;
    }
    
    // Add credentials if not using environment variables
    if (!config.useEnvCredentials) {
      clientOptions.credentials = {
        accessKeyId: config.accessKeyId || '',
        secretAccessKey: config.secretAccessKey || ''
      };
    }
    
    const s3Client = new S3Client(clientOptions);
    
    // Try a simple operation to verify connection
    const command = new ListBucketsCommand({});
    await s3Client.send(command);
    
    return true;
  } catch (error) {
    console.error("Error testing S3 connection:", error);
    return false;
  }
}