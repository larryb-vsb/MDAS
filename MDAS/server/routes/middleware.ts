import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { logger } from "../../shared/logger";

// Helper function to extract client IP address
export function getClientIp(req: Request): string {
  // Check X-Forwarded-For header (set by proxies)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  
  // Check X-Real-IP header
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp.trim();
  }
  
  // Fall back to req.ip (direct connection)
  return req.ip || 'unknown';
}

// Authentication middleware
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  logger.auth(`Checking authentication for ${req.method} ${req.path}`);
  
  // For TDDF API routes, bypass auth only in development environment
  if ((req.path.startsWith('/api/tddf-api/') || req.path.includes('/jsonb-data') || req.path.includes('/re-encode') || req.path.includes('/uploader/uploader_') || req.path.includes('/global-merchant-search')) && process.env.NODE_ENV === 'development') {
    logger.auth(`TDDF API route - bypassing auth for development testing`);
    // Set a mock user for the request
    (req as any).user = { username: 'test-user' };
    return next();
  }
  
  if (req.isAuthenticated()) {
    logger.auth(`User authenticated: ${(req.user as any)?.username}`);
    return next();
  }
  logger.auth(`Authentication failed for ${req.method} ${req.path}`);
  res.status(401).json({ error: "Not authenticated" });
}

// API key authentication middleware
export async function isApiKeyAuthenticated(req: Request, res: Response, next: NextFunction) {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ error: "API key required in X-API-Key header" });
    }
    
    // Verify API key with storage
    const apiUser = await storage.getApiUserByKey(apiKey);
    
    if (!apiUser) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    
    if (!apiUser.is_active) {
      return res.status(403).json({ error: "API key is inactive" });
    }
    
    // Check permissions for TDDF upload
    if (!apiUser.permissions.includes('tddf:upload')) {
      return res.status(403).json({ error: "Insufficient permissions for TDDF upload" });
    }
    
    // Update last used timestamp, request count, and IP address
    const clientIp = getClientIp(req);
    await storage.updateApiUserUsage(apiUser.id, clientIp);
    
    // Add API user to request for logging
    (req as any).apiUser = apiUser;
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: "Authentication error" });
  }
}

// Flexible authentication middleware - accepts either session or API key
export async function isAuthenticatedOrApiKey(req: Request, res: Response, next: NextFunction) {
  logger.auth(`Checking flexible authentication for ${req.method} ${req.path}`);
  
  // Check for API key first
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    try {
      const apiUser = await storage.getApiUserByKey(apiKey);
      if (apiUser && apiUser.is_active) {
        // Update last used timestamp, request count, and IP address
        const clientIp = getClientIp(req);
        await storage.updateApiUserUsage(apiUser.id, clientIp);
        // Add API user to request for logging
        (req as any).apiUser = apiUser;
        (req as any).user = { username: apiUser.username }; // Mock user for compatibility
        logger.auth(`API key authenticated: ${apiUser.username}`);
        return next();
      }
    } catch (error) {
      console.error('API key validation error:', error);
    }
  }
  
  // Fall back to session authentication
  if (req.isAuthenticated()) {
    logger.auth(`Session authenticated: ${(req.user as any)?.username}`);
    return next();
  }
  
  logger.auth(`Authentication failed - no valid session or API key`);
  res.status(401).json({ error: "Authentication required (session or API key)" });
}

// Host approval middleware - checks if hostname + API key combination is approved
export async function isHostApproved(req: Request, res: Response, next: NextFunction) {
  // Only check for API key users (session users bypass this check)
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    // Session authenticated - allow through
    return next();
  }
  
  try {
    // Extract hostname from User-Agent (e.g., "MMS-BatchUploader/1.1.3 (Python; VSB-L-LARRY)")
    const userAgent = req.headers['user-agent'] || '';
    const hostnameMatch = userAgent.match(/\((?:[^;]+;\s*)?([^)]+)\)/);
    const hostname = hostnameMatch ? hostnameMatch[1].trim() : null;
    
    if (!hostname) {
      return res.status(403).json({ 
        error: "Host approval required",
        message: "Unable to determine hostname from User-Agent. Please ensure your client sends hostname information."
      });
    }
    
    // Check host approval status
    const apiKeyPrefix = apiKey.substring(0, 20);
    const approval = await storage.getHostApproval(hostname, apiKeyPrefix);
    
    if (!approval) {
      return res.status(403).json({ 
        error: "Host approval required",
        message: `Host "${hostname}" with this API key is not registered. Contact administrator for approval.`,
        hostname: hostname,
        status: "not_registered"
      });
    }
    
    if (approval.status === 'pending') {
      return res.status(403).json({ 
        error: "Host approval pending",
        message: `Host "${hostname}" with this API key is pending approval. Contact administrator.`,
        hostname: hostname,
        status: "pending"
      });
    }
    
    if (approval.status === 'denied') {
      return res.status(403).json({ 
        error: "Host approval denied",
        message: `Host "${hostname}" with this API key has been denied access. Contact administrator.`,
        hostname: hostname,
        status: "denied"
      });
    }
    
    if (approval.status === 'approved') {
      // Approved - allow through
      return next();
    }
    
    // Unknown status
    return res.status(500).json({ 
      error: "Unknown approval status",
      message: "Contact administrator"
    });
    
  } catch (error) {
    console.error('Host approval check error:', error);
    res.status(500).json({ error: "Host approval check failed" });
  }
}

// Global processing pause state
let processingPaused = false;

export function isProcessingPaused(): boolean {
  return processingPaused;
}

export function setProcessingPaused(paused: boolean): void {
  processingPaused = paused;
}
