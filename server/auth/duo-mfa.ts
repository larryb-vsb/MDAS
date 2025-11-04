import { Client } from "@duosecurity/duo_universal";
import type { Request, Response } from "express";
import { logger } from "../../shared/logger";

/**
 * Duo Universal Prompt Integration
 * Provides two-factor authentication for Microsoft OAuth users
 */

interface DuoConfig {
  clientId: string;
  clientSecret: string;
  apiHost: string;
  redirectUri: string;
}

export class DuoMFAService {
  private duoClient: Client | null = null;
  private config: DuoConfig | null = null;

  /**
   * Initialize Duo MFA with credentials from environment
   */
  async initialize(): Promise<boolean> {
    try {
      const clientId = process.env.DUO_CLIENT_ID;
      const clientSecret = process.env.DUO_CLIENT_SECRET;
      const apiHost = process.env.DUO_API_HOST;

      if (!clientId || !clientSecret || !apiHost) {
        logger.warn('[DUO-MFA] Duo credentials not configured - MFA disabled');
        return false;
      }

      // Build redirect URI based on environment
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : 'http://localhost:5000';
      const redirectUri = `${baseUrl}/auth/duo/callback`;

      this.config = {
        clientId,
        clientSecret,
        apiHost,
        redirectUri
      };

      this.duoClient = new Client({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        apiHost: this.config.apiHost,
        redirectUri: this.config.redirectUri,
      });

      // Health check
      const healthCheck = await this.duoClient.healthCheck();
      
      if (healthCheck) {
        logger.info('[DUO-MFA] ✅ Initialized and health check passed');
        logger.info(`[DUO-MFA] Redirect URI: ${redirectUri}`);
        return true;
      } else {
        logger.error('[DUO-MFA] ❌ Health check failed - Duo service unavailable');
        return false;
      }
    } catch (error) {
      logger.error('[DUO-MFA] ❌ Initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if Duo MFA is enabled and configured
   */
  isEnabled(): boolean {
    return this.duoClient !== null && this.config !== null;
  }

  /**
   * Generate Duo authentication URL for user
   * @param username - User's email or username
   * @param sessionId - Session ID for state management
   */
  async createAuthUrl(username: string, sessionId: string): Promise<string | null> {
    if (!this.duoClient) {
      logger.error('[DUO-MFA] Not initialized - cannot create auth URL');
      return null;
    }

    try {
      logger.info(`[DUO-MFA] Creating auth URL for user: ${username}`);
      const authUrl = await this.duoClient.createAuthUrl(username, sessionId);
      logger.info('[DUO-MFA] ✅ Auth URL created successfully');
      return authUrl;
    } catch (error) {
      logger.error('[DUO-MFA] ❌ Failed to create auth URL:', error);
      return null;
    }
  }

  /**
   * Exchange Duo code for authentication result
   * @param duoCode - Code returned from Duo callback
   * @param username - Expected username for verification
   */
  async exchangeAuthorizationCode(duoCode: string, username: string): Promise<boolean> {
    if (!this.duoClient) {
      logger.error('[DUO-MFA] Not initialized - cannot exchange code');
      return false;
    }

    try {
      logger.info(`[DUO-MFA] Exchanging authorization code for user: ${username}`);
      const decodedToken = await this.duoClient.exchangeAuthorizationCodeFor2FAResult(
        duoCode,
        username
      );

      if (decodedToken && decodedToken.preferred_username === username) {
        logger.info(`[DUO-MFA] ✅ MFA successful for user: ${username}`);
        return true;
      } else {
        logger.error(`[DUO-MFA] ❌ Username mismatch - expected: ${username}, got: ${decodedToken?.preferred_username}`);
        return false;
      }
    } catch (error) {
      logger.error('[DUO-MFA] ❌ Code exchange failed:', error);
      return false;
    }
  }

  /**
   * Middleware to check if Duo MFA is completed for the session
   */
  requireDuoMFA(req: Request, res: Response, next: Function) {
    const user = req.user as any;

    if (!user) {
      logger.warn('[DUO-MFA] No user in session - redirecting to login');
      return res.redirect('/');
    }

    if (!user.msftAuthenticated) {
      logger.warn('[DUO-MFA] User not Microsoft authenticated - redirecting to Microsoft login');
      return res.redirect('/auth/microsoft');
    }

    if (!user.duoAuthenticated) {
      logger.warn('[DUO-MFA] Duo MFA not completed - redirecting to Duo');
      return res.redirect('/auth/duo');
    }

    // Both Microsoft OAuth and Duo MFA are complete
    next();
  }
}

// Singleton instance
export const duoMFA = new DuoMFAService();
