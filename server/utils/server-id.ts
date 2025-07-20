import os from 'os';
import { randomUUID } from 'crypto';

/**
 * Generate a unique server identifier for multi-node deployments
 * Format: hostname-pid-startupTime or fallback to environment variable
 */
export function getServerId(): string {
  // Check for explicit NODE_ID environment variable first
  if (process.env.NODE_ID) {
    return process.env.NODE_ID;
  }
  
  // Generate unique ID based on server characteristics
  const hostname = os.hostname();
  const pid = process.pid;
  const startupTime = Date.now();
  
  // For production, use hostname-based ID for consistency
  if (process.env.NODE_ENV === 'production') {
    return `${hostname}-${pid}`;
  }
  
  // For development, include startup time for uniqueness across restarts
  return `${hostname}-${pid}-${startupTime}`;
}

/**
 * Get a short server identifier for display purposes
 */
export function getShortServerId(): string {
  const fullId = getServerId();
  
  // If it's a UUID from NODE_ID, take first 8 characters
  if (fullId.includes('-') && fullId.length > 20) {
    return fullId.split('-')[0].substring(0, 8);
  }
  
  return fullId;
}

// Cache the server ID to avoid regeneration
let cachedServerId: string | null = null;

export function getCachedServerId(): string {
  if (!cachedServerId) {
    cachedServerId = getServerId();
  }
  return cachedServerId;
}